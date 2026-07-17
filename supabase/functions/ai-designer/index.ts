/**
 * ai-designer — AI kitchen designer harness.
 *
 * POST /functions/v1/ai-designer
 * Body: {
 *   mode: 'generate' | 'refine' | 'style',
 *   brief: DesignBrief,                    // room + household + appliances…
 *   shape: 'single-wall'|'l-shape'|'u-shape'|'galley',
 *   currentSpec?: KitchenSpec,             // refine/style modes
 *   message?: string,                      // user chat turn (refine/style)
 *   history?: { role: 'user'|'assistant', content: string }[],
 * }
 * Returns: { options: { name, spec, items, priceBand, violations, rationale }[],
 *            changeSummary?, unchanged? }
 *
 * The model only ever DECIDES (KitchenSpec DSL); the deterministic engine in
 * ../_shared/layout compiles, validates, and prices. Invalid tool payloads are
 * bounced back to the model with the violation list. Specs are compiled
 * server-side — the client never trusts raw model output.
 *
 * Env: OPENAI_API_KEY (required), OPENAI_MODEL (default gpt-5.6-terra)
 *
 * Homeowner safety: price output is a rounded band only — never cost lines.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  compileSpec, defaultSpecFor, priceDesign, validate,
  kitchenSpecSchema, roomSpecSchema, aiDesignerRequestSchema, finalizeSelectionSchema,
  proposedRoomPatchSchema, RequestProposalRegistry, ROLE_PRODUCTS,
  type AiDesignerRequestInput, type KitchenSpecInput, type ProposedRoomPatchInput,
} from '../_shared/layout/index.ts';
import { fingerprintV1 } from '../_shared/roomScan/fingerprint.ts';
import {
  errorResponse,
  gate,
  generateToken,
  ipKey,
  jsonResponse,
  logOutcome,
  newRequestId,
  rateLimited,
  readJsonBody,
  sha256Hex,
} from '../_shared/roomScan/security.ts';
// Material catalogs live in the merged core module (src/types.ts + constants.ts),
// which index.ts does not re-export — import them directly to avoid a boot crash.
import { FINISH_OPTIONS, BENCHTOP_OPTIONS, HANDLE_OPTIONS } from '../_shared/layout/core.ts';

const API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5.6-terra';
const MAX_TOOL_ROUNDS = 8;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const ENGINE_VERSION = 'layout-v1.1';
const CATALOG_VERSION = 'role-map-v1-provisional';
const PRICING_VERSION = 'price-band-v1';
const PROMPT_VERSION = 'ai-designer-v2.1';

// ── catalog / style summary given to the model ──
function catalogSummary() {
  return {
    roles: Object.entries(ROLE_PRODUCTS).map(([role, p]) => ({ role, widthsMm: p.widths })),
    finishes: FINISH_OPTIONS.map(f => ({ id: f.id, name: f.name })),
    benchtops: BENCHTOP_OPTIONS.map(b => ({ id: b.id, name: b.name })),
    handles: HANDLE_OPTIONS.map(h => ({ id: h.id, name: h.name })),
  };
}

function compileAndScore(spec: unknown, room: unknown, brief: unknown) {
  const parsed = kitchenSpecSchema.safeParse(spec);
  if (!parsed.success) {
    return { ok: false as const, error: `Invalid KitchenSpec: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  }
  // deno-lint-ignore no-explicit-any
  const design = compileSpec(parsed.data as any, room as any);
  // deno-lint-ignore no-explicit-any
  const violations = validate(design, room as any, brief as any);
  const band = priceDesign(design.items, parsed.data.style);
  return {
    ok: true as const,
    spec: parsed.data,
    items: design.items,
    notes: design.notes,
    violations,
    priceBand: { lowAud: band.lowAud, highAud: band.highAud },
  };
}

// ── tool definitions (OpenAI function-calling format) ──
type ServiceClient = ReturnType<typeof createClient>;

interface PersistenceContext {
  sessionId: string;
  briefRevisionId: string;
  briefRevision: number;
  designRevision: number;
  briefFingerprint: string;
  roomFingerprint: string;
  publicToken?: string;
}

interface PersistableOption {
  proposalId: string;
  name: string;
  spec: KitchenSpecInput;
  items: unknown[];
  priceBand: { lowAud: number; highAud: number };
  violations: Array<{ code: string; severity: 'error' | 'warn' | 'info'; message: string; itemIds?: string[] }>;
  rationale: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function preparePersistenceContext(
  service: ServiceClient,
  request: AiDesignerRequestInput,
): Promise<PersistenceContext> {
  const briefFingerprint = await fingerprintV1(request.brief);
  const roomFingerprint = await fingerprintV1(request.brief.room);

  if (request.mode === 'generate') {
    const publicToken = generateToken();
    const tokenHash = await sha256Hex(publicToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const { data, error } = await service.rpc('create_ai_designer_session_v1', {
      p_token_hash: tokenHash,
      p_brief: request.brief,
      p_brief_fingerprint: briefFingerprint,
      p_room_fingerprint: roomFingerprint,
      p_expires_at: expiresAt,
      p_source: 'homeowner',
    });
    if (error || !isRecord(data)
      || typeof data.sessionId !== 'string'
      || typeof data.briefRevisionId !== 'string') {
      throw new Error('designer_persistence_unavailable');
    }
    return {
      sessionId: data.sessionId,
      briefRevisionId: data.briefRevisionId,
      briefRevision: Number(data.briefRevision ?? 1),
      designRevision: Number(data.designRevision ?? 0),
      briefFingerprint,
      roomFingerprint,
      publicToken,
    };
  }

  const supplied = request.session!;
  const tokenHash = await sha256Hex(supplied.token);
  const { data: session, error: sessionError } = await service
    .from('ai_designer_sessions')
    .select('id,status,expires_at,brief_revision,design_revision')
    .eq('id', supplied.id)
    .eq('public_token_hash', tokenHash)
    .maybeSingle();
  if (sessionError || !session || session.status !== 'active'
    || new Date(session.expires_at).getTime() <= Date.now()) {
    throw new Error('invalid_ai_session');
  }
  if (session.design_revision !== supplied.designRevision) {
    throw new Error('stale_design_revision');
  }

  const { data: briefRevision, error: briefError } = await service
    .from('ai_design_brief_revisions')
    .select('id,revision,brief_fingerprint,room_fingerprint')
    .eq('session_id', session.id)
    .eq('revision', session.brief_revision)
    .maybeSingle();
  if (briefError || !briefRevision
    || briefRevision.brief_fingerprint !== briefFingerprint
    || briefRevision.room_fingerprint !== roomFingerprint) {
    throw new Error('stale_brief_revision');
  }

  const { data: currentProposal, error: proposalError } = await service
    .from('ai_design_proposals')
    .select('id,status')
    .eq('id', request.currentProposalId!)
    .eq('session_id', session.id)
    .in('status', ['validated', 'selected'])
    .maybeSingle();
  if (proposalError || !currentProposal) throw new Error('invalid_parent_proposal');

  return {
    sessionId: session.id,
    briefRevisionId: briefRevision.id,
    briefRevision: briefRevision.revision,
    designRevision: session.design_revision,
    briefFingerprint,
    roomFingerprint,
  };
}

async function persistValidatedOptions(
  service: ServiceClient,
  context: PersistenceContext,
  request: AiDesignerRequestInput,
  options: PersistableOption[],
): Promise<{ options: PersistableOption[]; designRevision: number }> {
  const persisted = await Promise.all(options.map(async option => {
    const id = crypto.randomUUID();
    const stableRuleResults = option.violations
      .map(violation => ({
        ruleId: violation.code,
        severity: violation.severity,
        outcome: violation.severity === 'error' ? 'blocked' : 'warning',
        message: violation.message,
        itemIds: violation.itemIds ?? [],
      }))
      .sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.message.localeCompare(b.message));
    const ruleResultsFingerprint = await fingerprintV1(stableRuleResults);
    const storedViolations = await Promise.all(option.violations.map(async violation => ({
      ...violation,
      resultFingerprint: await fingerprintV1({
        ruleId: violation.code,
        severity: violation.severity,
        message: violation.message,
        itemIds: violation.itemIds ?? [],
      }),
    })));
    const proposalFingerprint = await fingerprintV1({
      briefFingerprint: context.briefFingerprint,
      roomFingerprint: context.roomFingerprint,
      spec: option.spec,
      compiledItems: option.items,
      priceBand: option.priceBand,
      engineVersion: ENGINE_VERSION,
      catalogVersion: CATALOG_VERSION,
      pricingVersion: PRICING_VERSION,
    });
    return {
      id,
      requestProposalId: option.proposalId,
      mode: request.mode,
      name: option.name,
      spec: option.spec,
      compiledItems: option.items,
      priceBand: option.priceBand,
      violations: storedViolations,
      rationale: option.rationale,
      proposalFingerprint,
      ruleResultsFingerprint,
      engineVersion: ENGINE_VERSION,
      catalogVersion: CATALOG_VERSION,
      pricingVersion: PRICING_VERSION,
      promptVersion: PROMPT_VERSION,
      modelProvider: 'openai',
      modelId: MODEL,
      catalogSnapshot: catalogSummary(),
      pricingSnapshot: {
        version: PRICING_VERSION,
        currency: 'AUD',
        output: 'rounded-band',
        includesCostLines: false,
      },
      quoteReady: false,
    };
  }));

  const { data, error } = await service.rpc('persist_ai_designer_proposals_v1', {
    p_session_id: context.sessionId,
    p_expected_design_revision: context.designRevision,
    p_brief_revision_id: context.briefRevisionId,
    p_parent_proposal_id: request.currentProposalId ?? null,
    p_proposals: persisted,
  });
  if (error) {
    if (error.message?.includes('stale_design_revision')) throw new Error('stale_design_revision');
    throw new Error('designer_persistence_failed');
  }
  const designRevision = isRecord(data) ? Number(data.designRevision) : NaN;
  if (!Number.isInteger(designRevision) || designRevision <= context.designRevision) {
    throw new Error('designer_persistence_failed');
  }

  return {
    designRevision,
    options: options.map((option, index) => ({ ...option, proposalId: persisted[index].id })),
  };
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'propose_layout',
      description: 'Compile and validate a KitchenSpec. Returns a proposalId only when there are zero error-severity violations. Finalize using that ID, never by repeating the spec.',
      parameters: {
        type: 'object',
        properties: { spec: { type: 'object', description: 'KitchenSpec JSON' } },
        required: ['spec'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_room_patch',
      description: 'Propose a room-fact change for the user to review and reconfirm. This never changes the room used by the current design request.',
      parameters: {
        type: 'object',
        properties: {
          width: { type: 'number' }, depth: { type: 'number' }, height: { type: 'number' },
          shape: { type: 'string', enum: ['Rectangle', 'LShape'] },
          cutoutWidth: { type: 'number' }, cutoutDepth: { type: 'number' },
          openings: { type: 'array', items: { type: 'object' } },
          services: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finalize',
      description: 'Select server-validated proposal IDs. Generate mode requires exactly 3 distinct IDs; refine/style requires exactly 1.',
      parameters: {
        type: 'object',
        properties: {
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, proposalId: { type: 'string' } },
              required: ['name', 'proposalId'],
            },
          },
          changeSummary: { type: 'string', description: 'refine mode: one line describing what changed' },
          unchanged: { type: 'boolean', description: 'refine mode: true when the user asked a question and no change was made' },
        },
        required: ['options'],
      },
    },
  },
];

function systemPrompt(mode: string, brief: unknown, shape: string): string {
  const base = `You are an expert Australian kitchen designer working inside a constrained design harness.
You express designs ONLY as KitchenSpec JSON:
{ runs: [{ wall: 'N'|'E'|'S'|'W', segments: [{kind:'cabinet', role, widthMm?}...], wallCabinets: boolean, fromEnd?: boolean }],
  island?: { lengthMm, depthMm, features: [] }, style: { finishId, benchtopId, handleId }, rationale: string }
Roles: sink, cooktop, dishwasher, drawers, doors, pantry, oven-tower, fridge-gap, corner.
Rules: side runs meeting another run start with a 'corner' segment (W wall runs also set fromEnd:true when they meet the N wall).
Sink near existing plumbing (drain service point), dishwasher beside sink, cooktop with bench both sides, fridge-gap at a run end near a door.
Use ONLY the finish/benchtop/handle ids from the catalog summary. ALWAYS test with propose_layout and fix every error-severity violation. A successful test returns a proposalId; finalize using only those IDs. Address warnings when reasonable; explain unavoidable ones in the rationale.
The rationale is shown to the homeowner: plain English, warm, no jargon.
CLIENT SELECTIONS: if the brief includes styleWords, they describe the look and the exact finishes the client already chose on the website (flat-lay / inspiration board). Treat them as a STRONG preference — pick the catalog finishId / benchtopId / handleId that best matches each stated selection, and keep the overall style consistent with the inspiration words. Only deviate if a selection genuinely cannot be honoured, and say why in the rationale.
Catalog: ${JSON.stringify(catalogSummary())}
Room+brief: ${JSON.stringify(brief)}
Kitchen shape: ${shape}`;

  if (mode === 'generate') {
    return base + `
Task: produce 3 DISTINCT named options (vary layout strategy — e.g. work-triangle optimised, storage maximised, entertainer/social — not just colours). finalize with all 3.`;
  }
  if (mode === 'style') {
    return base + `
Task: the user describes a look. Change ONLY the style ids of the current spec (and rationale). finalize with 1 option.`;
  }
  return base + `
Task: chat-driven plan editing. Apply layout, functionality or style requests to the current spec. For room facts, call propose_room_patch; the current room remains unchanged until the user reviews and reconfirms it. If they only asked a question, validate the current spec with propose_layout and finalize its proposalId with {unchanged:true, changeSummary: answer}. Otherwise finalize 1 validated proposalId + changeSummary.`;
}

serve(async (req) => {
  const started = Date.now();
  const requestId = newRequestId();
  const gated = gate(req);
  if (gated) return gated;
  const json = (body: unknown, status = 200) => jsonResponse(req, status, body);

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!apiKey || !supabaseUrl || !serviceKey) {
      logOutcome('ai-designer', requestId, 'not_configured', started);
      return errorResponse(req, 500, 'designer_not_configured');
    }

    const service = createClient(supabaseUrl, serviceKey);

    // Durable shared rate limit (fixed hourly window in Postgres) with the
    // per-instance limiter retained as a fast path / fallback. The key is the
    // day-salted pseudonymous IP hash — raw IPs never leave the function.
    const rateKey = `ai-designer:${await ipKey(req)}`;
    let throttled = rateLimited(rateKey, 20);
    if (!throttled) {
      const { data: allowed, error: rateError } = await service
        .rpc('bump_edge_rate_limit_v1', { p_key: rateKey, p_limit: 20, p_window_seconds: 3600 });
      if (rateError) {
        // Fail open to the in-memory limiter, but record the degradation.
        console.error('[ai-designer] durable rate limit unavailable', rateError.message);
      } else if (allowed === false) {
        throttled = true;
      }
    }
    if (throttled) {
      logOutcome('ai-designer', requestId, 'throttled', started);
      return errorResponse(req, 429, 'rate_limited');
    }

    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    const requestParsed = aiDesignerRequestSchema.safeParse(body);
    if (!requestParsed.success) {
      logOutcome('ai-designer', requestId, 'invalid_request', started);
      return errorResponse(req, 400, 'invalid_designer_request');
    }
    const request = requestParsed.data;
    const { mode, shape, currentSpec, message, history, brief } = request;
    const persistence = await preparePersistenceContext(service, request);

    // Conversation state. The confirmed room remains immutable for the entire
    // request. Room edits are returned as proposals for user reconfirmation.
    const messages: unknown[] = [
      { role: 'system', content: systemPrompt(mode, brief, shape) },
      ...history.slice(-6),
      {
        role: 'user',
        content: mode === 'generate'
          ? 'Design my kitchen. Produce the 3 options.'
          : `Current design spec: ${JSON.stringify(currentSpec ?? defaultSpecFor(brief as never, shape))}\n\nUser request: ${message ?? ''}`,
      },
    ];

    const proposals = new RequestProposalRegistry<KitchenSpecInput>();
    let proposedRoomPatch: ProposedRoomPatchInput | null = null;
    let finalized: {
      options: { name: string; proposalId: string; spec: KitchenSpecInput }[];
      changeSummary?: string;
      unchanged?: boolean;
    } | null = null;

    for (let round = 0; round < MAX_TOOL_ROUNDS && !finalized; round++) {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_completion_tokens: 8000,
          tools: TOOLS,
          tool_choice: 'required',
          parallel_tool_calls: false,
          // gpt-5.6 models reject function tools on /v1/chat/completions
          // unless reasoning is disabled (verified live 2026-07-16). Remove
          // when the §8.3 Responses-API migration lands.
          reasoning_effort: 'none',
          messages,
        }),
      });
      if (!resp.ok) {
        console.error('[ai-designer] provider request failed', { requestId, status: resp.status });
        return errorResponse(req, 502, 'designer_provider_failed');
      }
      const data = await resp.json();

      const assistant = data.choices?.[0]?.message as
        { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } | undefined;
      if (!assistant) return errorResponse(req, 502, 'designer_provider_failed');

      // Echo the assistant turn back verbatim so tool_call_ids line up.
      messages.push(assistant);
      const toolCalls = assistant.tool_calls ?? [];

      if (toolCalls.length === 0) {
        // model answered without a tool call — treat text as a Q&A answer in refine mode
        const text = assistant.content ?? '';
        if (mode === 'refine' && currentSpec) {
          const current = compileAndScore(currentSpec, brief.room, brief);
          if (!current.ok) return json({ error: 'Current design is invalid', detail: current.error }, 409);
          const hardErrors = current.violations.filter(v => v.severity === 'error');
          if (hardErrors.length > 0) {
            return json({ error: 'Current design has blocking validation errors', violations: hardErrors }, 409);
          }
          const registered = proposals.register(current.spec);
          finalized = {
            options: [{ name: 'Current design', proposalId: registered.proposalId, spec: registered.spec }],
            changeSummary: text,
            unchanged: true,
          };
          break;
        }
        return json({ error: 'Model did not produce a design', detail: text }, 502);
      }

      for (const tc of toolCalls) {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.function.arguments || '{}'); } catch { /* leave empty */ }
        let content: string;
        if (tc.function.name === 'propose_layout') {
          const r = compileAndScore(input.spec, brief.room, brief);
          if (!r.ok) {
            content = JSON.stringify({ error: r.error });
          } else {
            const hardErrors = r.violations.filter(v => v.severity === 'error');
            const registered = hardErrors.length === 0 ? proposals.register(r.spec) : null;
            content = JSON.stringify({
              proposalId: registered?.proposalId ?? null,
              violations: r.violations,
              notes: r.notes,
              itemCount: r.items.length,
              priceBand: r.priceBand,
              ...(hardErrors.length > 0
                ? { error: 'Proposal has blocking validation errors; repair and call propose_layout again' }
                : {}),
            });
          }
        } else if (tc.function.name === 'propose_room_patch') {
          const parsedPatch = proposedRoomPatchSchema.safeParse(input);
          if (!parsedPatch.success) {
            content = JSON.stringify({
              error: 'Invalid room patch',
              issues: parsedPatch.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
            });
          } else {
            const mergedPatch = { ...(proposedRoomPatch ?? {}), ...parsedPatch.data };
            const candidateRoom = roomSpecSchema.safeParse({ ...brief.room, ...mergedPatch });
            if (!candidateRoom.success) {
              content = JSON.stringify({
                error: 'Room patch is not valid when applied to the confirmed room',
                issues: candidateRoom.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
              });
            } else {
              proposedRoomPatch = mergedPatch;
              content = JSON.stringify({
                status: 'requires-user-confirmation',
                proposedRoomPatch,
                roomUsedForThisDesign: brief.room,
                instruction: 'Do not redesign against this patch until the user accepts and reconfirms the room.',
              });
            }
          }
        } else if (tc.function.name === 'finalize') {
          const parsedFinalize = finalizeSelectionSchema.safeParse(input);
          if (!parsedFinalize.success) {
            content = JSON.stringify({
              error: 'Invalid finalize payload',
              issues: parsedFinalize.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
            });
          } else {
            const selected = proposals.select(parsedFinalize.data.options, mode === 'generate' ? 3 : 1);
            if (!selected.ok) {
              content = JSON.stringify({ error: selected.error });
            } else {
              finalized = {
                options: selected.options,
                changeSummary: parsedFinalize.data.changeSummary,
                unchanged: parsedFinalize.data.unchanged,
              };
              content = JSON.stringify({ status: 'accepted' });
            }
          }
        } else {
          content = JSON.stringify({ error: 'unknown tool' });
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content });
      }
    }

    // A room-fact request cannot also change the design. Return the validated
    // current design unchanged and let the user review/reconfirm the patch in
    // the canonical Room step before generating again.
    if (proposedRoomPatch && mode === 'refine' && currentSpec) {
      const current = compileAndScore(currentSpec, brief.room, brief);
      if (!current.ok) return json({ error: 'Current design is invalid', detail: current.error }, 409);
      const hardErrors = current.violations.filter(v => v.severity === 'error');
      if (hardErrors.length > 0) {
        return json({ error: 'Current design has blocking validation errors', violations: hardErrors }, 409);
      }
      const registered = proposals.register(current.spec);
      finalized = {
        options: [{ name: 'Current design', proposalId: registered.proposalId, spec: registered.spec }],
        changeSummary: 'Room changes need to be reviewed in the Room step before the kitchen is redesigned.',
        unchanged: true,
      };
    }

    if (!finalized) return json({ error: 'Design did not converge — try again' }, 502);

    // Compile server-side; never trust raw model output.
    const options: PersistableOption[] = [];
    for (const opt of finalized.options.slice(0, 3)) {
      const r = compileAndScore(opt.spec, brief.room, brief);
      if (!r.ok) continue;
      if (r.violations.some(v => v.severity === 'error')) continue;
      options.push({
        proposalId: opt.proposalId,
        name: opt.name,
        spec: r.spec,
        items: r.items,
        priceBand: r.priceBand,
        violations: r.violations,
        rationale: r.spec.rationale,
      });
    }
    if (options.length === 0) return json({ error: 'No valid design produced' }, 502);

    let responseOptions = options;
    let designRevision = persistence.designRevision;
    if (finalized.unchanged && request.currentProposalId) {
      responseOptions = options.map(option => ({ ...option, proposalId: request.currentProposalId! }));
    } else {
      const saved = await persistValidatedOptions(service, persistence, request, options);
      responseOptions = saved.options;
      designRevision = saved.designRevision;
    }

    logOutcome('ai-designer', requestId, 'ok', started);
    return json({
      options: responseOptions,
      changeSummary: finalized.changeSummary,
      unchanged: finalized.unchanged ?? false,
      proposedRoomPatch,
      session: {
        id: persistence.sessionId,
        ...(persistence.publicToken ? { token: persistence.publicToken } : {}),
        briefRevision: persistence.briefRevision,
        designRevision,
      },
      modelTrace: {
        provider: 'openai',
        modelId: MODEL,
        promptVersion: PROMPT_VERSION,
        engineVersion: ENGINE_VERSION,
      },
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : 'designer_failed';
    const known: Record<string, number> = {
      invalid_ai_session: 401,
      invalid_parent_proposal: 409,
      stale_design_revision: 409,
      stale_brief_revision: 409,
      designer_persistence_unavailable: 503,
      designer_persistence_failed: 503,
    };
    logOutcome('ai-designer', requestId, known[code] ? code : 'failed', started);
    if (!known[code]) console.error('[ai-designer]', err);
    return errorResponse(req, known[code] ?? 500, known[code] ? code : 'designer_failed');
  }
});
