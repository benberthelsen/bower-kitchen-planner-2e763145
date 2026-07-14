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
 * Env: OPENAI_API_KEY (required), OPENAI_MODEL (default gpt-4o)
 *
 * Homeowner safety: price output is a rounded band only — never cost lines.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  compileSpec, defaultSpecFor, priceDesign, validate,
  kitchenSpecSchema, designBriefSchema, ROLE_PRODUCTS,
} from '../_shared/layout/index.ts';
// Material catalogs live in the merged core module (src/types.ts + constants.ts),
// which index.ts does not re-export — import them directly to avoid a boot crash.
import { FINISH_OPTIONS, BENCHTOP_OPTIONS, HANDLE_OPTIONS } from '../_shared/layout/core.ts';

const API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o';
const MAX_TOOL_ROUNDS = 8;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── simple per-IP rate limit (best-effort, resets on cold start) ──
const hits = new Map<string, { count: number; ts: number }>();
function rateLimited(ip: string, limit = 20, windowMs = 3600_000): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.ts > windowMs) { hits.set(ip, { count: 1, ts: now }); return false; }
  h.count++;
  return h.count > limit;
}

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
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'propose_layout',
      description: 'Compile and validate a KitchenSpec. Returns violations (fix all "error" severity before finalize), item count and price band.',
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
      name: 'patch_room',
      description: 'Update room facts the user stated in chat (openings, services, dimensions). Merge-patch: only send changed fields.',
      parameters: {
        type: 'object',
        properties: {
          width: { type: 'number' }, depth: { type: 'number' },
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
      description: 'Return the final design option(s). generate mode: exactly 3 distinct named options. refine/style: exactly 1. Every spec must have passed propose_layout with zero error-severity violations.',
      parameters: {
        type: 'object',
        properties: {
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, spec: { type: 'object' } },
              required: ['name', 'spec'],
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
Use ONLY the finish/benchtop/handle ids from the catalog summary. ALWAYS test with propose_layout and fix every error-severity violation before finalize. Address warnings when reasonable; explain unavoidable ones in the rationale.
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
Task: chat-driven plan editing. Apply the user's request to the current spec (layout, functionality, room facts via patch_room, or style). If they only asked a question, answer via finalize {unchanged:true, changeSummary: answer} with the unmodified spec. Otherwise finalize 1 updated option + changeSummary.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json({ error: 'OPENAI_API_KEY not configured' }, 500);

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
    if (rateLimited(ip)) return json({ error: 'Rate limit exceeded — try again later' }, 429);

    const body = await req.json();
    const { mode = 'generate', shape = 'l-shape', currentSpec, message, history = [] } = body;

    const briefParsed = designBriefSchema.safeParse(body.brief);
    if (!briefParsed.success) return json({ error: 'Invalid brief', issues: briefParsed.error.issues }, 400);
    let brief = briefParsed.data;

    // Conversation state. OpenAI takes the system prompt as the first message
    // (Anthropic used a separate `system` field). It's recomputed each round in
    // case patch_room mutates the brief.
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

    let finalized: { options: { name: string; spec: unknown }[]; changeSummary?: string; unchanged?: boolean } | null = null;

    for (let round = 0; round < MAX_TOOL_ROUNDS && !finalized; round++) {
      // Keep the system prompt current in case patch_room mutated the brief.
      messages[0] = { role: 'system', content: systemPrompt(mode, brief, shape) };

      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 8000,
          tools: TOOLS,
          // 'required' forces a tool call every turn — gpt-4o otherwise often
          // replies with plain text first, which the loop below would treat as
          // "no design produced". The model ends the loop by calling finalize.
          tool_choice: 'required',
          messages,
        }),
      });
      if (!resp.ok) return json({ error: `OpenAI API ${resp.status}: ${await resp.text()}` }, 502);
      const data = await resp.json();

      const assistant = data.choices?.[0]?.message as
        { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } | undefined;
      if (!assistant) return json({ error: 'OpenAI returned no message', detail: JSON.stringify(data).slice(0, 500) }, 502);

      // Echo the assistant turn back verbatim so tool_call_ids line up.
      messages.push(assistant);
      const toolCalls = assistant.tool_calls ?? [];

      if (toolCalls.length === 0) {
        // model answered without a tool call — treat text as a Q&A answer in refine mode
        const text = assistant.content ?? '';
        if (mode === 'refine' && currentSpec) {
          finalized = { options: [{ name: 'Current design', spec: currentSpec }], changeSummary: text, unchanged: true };
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
          content = JSON.stringify(r.ok
            ? { violations: r.violations, notes: r.notes, itemCount: r.items.length, priceBand: r.priceBand }
            : { error: r.error });
        } else if (tc.function.name === 'patch_room') {
          brief = { ...brief, room: { ...brief.room, ...input } } as typeof brief;
          content = JSON.stringify({ room: brief.room });
        } else if (tc.function.name === 'finalize') {
          finalized = input as typeof finalized;
          content = 'ok';
        } else {
          content = JSON.stringify({ error: 'unknown tool' });
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content });
      }
    }

    if (!finalized) return json({ error: 'Design did not converge — try again' }, 502);

    // Compile server-side; never trust raw model output.
    const options = [];
    for (const opt of finalized.options.slice(0, 3)) {
      const r = compileAndScore(opt.spec, brief.room, brief);
      if (!r.ok) continue;
      options.push({
        name: opt.name,
        spec: r.spec,
        items: r.items,
        priceBand: r.priceBand,
        violations: r.violations,
        rationale: r.spec.rationale,
      });
    }
    if (options.length === 0) return json({ error: 'No valid design produced' }, 502);

    return json({
      options,
      changeSummary: finalized.changeSummary,
      unchanged: finalized.unchanged ?? false,
      room: brief.room, // may have been patched in refine mode
    });
  } catch (err) {
    console.error('[ai-designer]', err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, 500);
  }
});
