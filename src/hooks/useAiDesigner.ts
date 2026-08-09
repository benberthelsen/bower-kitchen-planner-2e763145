/**
 * useAiDesigner — client for the ai-designer edge function.
 *
 * const { generate, refine, restyle, loading, error } = useAiDesigner();
 * const res = await generate(brief, 'l-shape');          // 3 options
 * const res = await refine(brief, shape, spec, proposalId, 'move the sink under the window');
 * const res = await restyle(brief, shape, spec, proposalId, 'warm coastal, oak + white');
 *
 * All results are compiled+validated server-side; items render directly in
 * UnifiedScene. On failure callers should fall back to defaultSpecFor()
 * (see src/lib/layout) — the wizard must never dead-end on AI errors.
 */

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { PlacedItem } from '@/types';
import type { DesignBrief, KitchenSpec, ProposedRoomPatch, Violation } from '@/lib/layout';
import type { LayoutShape } from '@/lib/layout';
import { featureFlags } from '@/lib/featureFlags';

export interface AiDesignOption {
  proposalId: string;
  name: string;
  spec: KitchenSpec;
  items: PlacedItem[];
  priceBand: { lowAud: number; highAud: number };
  violations: Violation[];
  rationale: string;
  /** Present for deterministic client-side alternatives used when the online
   * AI explanation/ranking service is unavailable. */
  source?: 'ai' | 'planner';
  /** Deterministic planner metadata exposed to the ranker, never geometry. */
  engineScore?: number;
  layoutFamily?: LayoutShape;
  emphasis?: 'workflow' | 'storage' | 'social';
}

export interface AiDesignResult {
  options: AiDesignOption[];
  changeSummary?: string;
  unchanged?: boolean;
  proposedRoomPatch?: ProposedRoomPatch | null;
  session?: {
    id: string;
    token?: string;
    briefRevision: number;
    designRevision: number;
  };
  modelTrace?: {
    provider: 'openai' | 'local-openai' | 'local-simulator';
    modelId: string;
    promptVersion?: string;
    engineVersion?: string;
  };
}

interface AuthorizedDesignSession {
  id: string;
  token: string;
  briefRevision: number;
  designRevision: number;
}

interface ChatTurn { role: 'user' | 'assistant'; content: string }

interface LocalRankerResponse {
  choices: { candidateId: string; name: string; rationale: string }[];
  provider: 'openai' | 'simulator';
  modelId: string;
  error?: string;
  detail?: string;
}

function compactCandidate(option: AiDesignOption, index: number) {
  return {
    candidateId: option.proposalId,
    existingName: option.name,
    existingRationale: option.rationale,
    layoutFamily: option.layoutFamily ?? option.proposalId.split(':').pop()?.split('/')[0] ?? '',
    emphasis: option.emphasis ?? '',
    engineScore: option.engineScore ?? 100 - index,
    cabinetRoles: option.spec.runs.flatMap(run => run.segments.flatMap(segment =>
      segment.kind === 'cabinet' ? [`${run.wall}:${segment.role}`] : [])),
    upperPlans: option.spec.runs.map(run =>
      `${run.wall}:${run.upperPlan?.coverage ?? (run.wallCabinets ? 'full' : 'none')}`),
    islandFeatures: option.spec.island?.features ?? [],
    warnings: option.violations.filter(violation => violation.severity === 'warn').map(violation => violation.message),
    priceBand: option.priceBand,
  };
}

/**
 * The edge function validates `session` with a **strict** zod object of exactly
 * { id, token, designRevision }. Its *response* carries an extra `briefRevision`,
 * and spreading that response straight back into the next request made zod
 * reject every refine/style call with `invalid_designer_request` (400) before
 * the model was ever called — which surfaced to customers as the useless
 * "Sorry — I couldn't apply that just now."
 *
 * Send only the three keys the server accepts. `briefRevision` is still kept in
 * the ref because callers display it; it just must not go back over the wire.
 */
function sessionPayload(s: AuthorizedDesignSession | null) {
  if (!s) return undefined;
  return { id: s.id, token: s.token, designRevision: s.designRevision };
}

/**
 * The session lived only in a ref, so it died on page reload — while the chosen
 * design (and its `proposalId`) survived in wizard state. A customer who
 * generated options, looked around, and came back therefore had a design the UI
 * happily offered to edit and a session the server had never heard of. The
 * request went out with no `session` at all, zod's superRefine rejected it, and
 * the customer got the same opaque "couldn't apply that" as every other cause.
 *
 * sessionStorage is same-origin and dies with the tab, which matches the
 * server-side TTL closely enough. A restored session that has since expired
 * comes back as `invalid_ai_session` and is cleared below.
 */
const SESSION_STORAGE_KEY = 'bower.aiDesignerSession';

function readStoredSession(): AuthorizedDesignSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<AuthorizedDesignSession>;
    if (typeof s?.id !== 'string' || typeof s?.token !== 'string') return null;
    return {
      id: s.id,
      token: s.token,
      briefRevision: Number(s.briefRevision ?? 1),
      designRevision: Number(s.designRevision ?? 0),
    };
  } catch {
    return null; // private mode, blocked storage, corrupt JSON — all non-fatal
  }
}

function writeStoredSession(s: AuthorizedDesignSession | null): void {
  try {
    if (s) sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch { /* storage blocked — the in-memory ref still works for this page */ }
}

/** Server errors that mean the stored session is no longer usable. */
const SESSION_DEAD = ['invalid_ai_session', 'stale_design_revision', 'stale_brief_revision', 'invalid_parent_proposal'];

export function useAiDesigner() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<AuthorizedDesignSession | null>(null);
  const restoredRef = useRef(false);
  if (!restoredRef.current) {
    restoredRef.current = true;
    sessionRef.current = readStoredSession();
  }
  const [hasActiveSession, setHasActiveSession] = useState(() => readStoredSession() !== null);
  // `error` is React state, so it is NOT readable by a caller immediately after
  // `await refine(...)` returns — the render hasn't happened yet. Callers that
  // need to branch on *why* a call failed read this ref instead, which is
  // written synchronously in the catch below.
  const lastErrorRef = useRef<string | null>(null);

  const call = useCallback(async (body: Record<string, unknown>): Promise<AiDesignResult | null> => {
    setLoading(true);
    setError(null);
    lastErrorRef.current = null;
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-designer', { body });
      if (fnError) {
        // supabase-js wraps the HTTP failure; the function's real message
        // ({ error, detail }) is in the Response body on fnError.context.
        let detail = fnError.message;
        try {
          const ctx = (fnError as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.clone().json();
            if (body?.error) detail = body.detail ? `${body.error} — ${body.detail}` : body.error;
          }
        } catch { /* keep the wrapped message */ }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      const result = data as AiDesignResult;
      if (result.session) {
        const token = result.session.token ?? sessionRef.current?.token;
        if (token) {
          sessionRef.current = { ...result.session, token };
          writeStoredSession(sessionRef.current);
          setHasActiveSession(true);
        }
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI designer unavailable';
      console.error('[ai-designer] request failed:', msg);
      lastErrorRef.current = msg;
      setError(msg);
      // A session the server has rejected will keep failing. Drop it so the UI
      // can stop offering edits that cannot work and ask for a fresh generate.
      if (SESSION_DEAD.some(code => msg.includes(code))) {
        sessionRef.current = null;
        writeStoredSession(null);
        setHasActiveSession(false);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const callLocal = useCallback(async (input: {
    mode: 'generate' | 'refine';
    brief: DesignBrief;
    shape: LayoutShape;
    candidates: readonly AiDesignOption[];
    currentCandidateId?: string;
    instruction?: string;
  }): Promise<AiDesignResult | null> => {
    setLoading(true);
    setError(null);
    lastErrorRef.current = null;
    try {
      if (input.candidates.length === 0) throw new Error('local_ai_requires_approved_candidates');
      const response = await fetch('/__bower/local-ai-designer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: input.mode,
          instruction: input.instruction,
          currentCandidateId: input.currentCandidateId,
          style: {
            familyId: input.brief.styleIds?.familyId,
            styleWords: input.brief.styleWords,
          },
          room: {
            shape: input.shape,
            widthMm: input.brief.room.width,
            depthMm: input.brief.room.depth,
            selectedWalls: input.brief.allowedWalls ?? [],
          },
          candidates: input.candidates.map(compactCandidate),
        }),
      });
      const payload = await response.json() as LocalRankerResponse;
      if (!response.ok || payload.error) {
        throw new Error(payload.detail ? `${payload.error} — ${payload.detail}` : payload.error || 'local_ai_failed');
      }
      const byId = new Map(input.candidates.map(candidate => [candidate.proposalId, candidate]));
      const options = payload.choices.flatMap(choice => {
        const approved = byId.get(choice.candidateId);
        if (!approved) return [];
        return [{ ...approved, name: choice.name, rationale: choice.rationale, source: 'ai' as const }];
      });
      if (options.length === 0) throw new Error('local_ai_returned_no_approved_ids');

      const localSession: AuthorizedDesignSession = {
        id: `local-${Date.now()}`,
        token: 'local-preview-session-not-server-authority',
        briefRevision: 1,
        designRevision: input.mode === 'refine' ? 1 : 0,
      };
      sessionRef.current = localSession;
      setHasActiveSession(true);
      const unchanged = input.mode === 'refine' && options[0]?.proposalId === input.currentCandidateId;
      return {
        options,
        unchanged,
        changeSummary: input.mode === 'refine'
          ? (unchanged
              ? 'The current checked layout is still the best fit for that request.'
              : `I re-ranked the checked layouts for “${input.instruction ?? 'your request'}”.`)
          : undefined,
        session: localSession,
        modelTrace: {
          provider: payload.provider === 'openai' ? 'local-openai' : 'local-simulator',
          modelId: payload.modelId,
          promptVersion: 'local-approved-candidate-ranker-v1',
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Local AI designer unavailable';
      console.error('[local-ai-designer] request failed:', msg);
      lastErrorRef.current = msg;
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const generate = useCallback(
    (brief: DesignBrief, shape: LayoutShape, approvedCandidates: readonly AiDesignOption[] = []) =>
      featureFlags.localAiDesigner
        ? callLocal({ mode: 'generate', brief, shape, candidates: approvedCandidates })
        : call({ mode: 'generate', brief, shape }),
    [call, callLocal],
  );

  const refine = useCallback(
    (
      brief: DesignBrief,
      shape: LayoutShape,
      currentSpec: KitchenSpec,
      currentProposalId: string,
      message: string,
      history: ChatTurn[] = [],
      approvedCandidates: readonly AiDesignOption[] = [],
    ) => featureFlags.localAiDesigner
      ? callLocal({
          mode: 'refine',
          brief,
          shape,
          candidates: approvedCandidates,
          currentCandidateId: currentProposalId,
          instruction: message,
        })
      : call({
          mode: 'refine',
          brief,
          shape,
          currentSpec,
          currentProposalId,
          session: sessionPayload(sessionRef.current),
          message,
          history,
        }),
    [call, callLocal],
  );

  const restyle = useCallback(
    (brief: DesignBrief, shape: LayoutShape, currentSpec: KitchenSpec, currentProposalId: string, message: string) =>
      call({ mode: 'style', brief, shape, currentSpec, currentProposalId, session: sessionRef.current, message }),
    [call],
  );

  /**
   * The reason the last call failed, readable synchronously right after the
   * awaited call resolves to `null`. Returns `null` when nothing has failed.
   */
  const lastError = useCallback(() => lastErrorRef.current, []);

  return { generate, refine, restyle, loading, error, lastError, hasActiveSession };
}
