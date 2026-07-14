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

export interface AiDesignOption {
  proposalId: string;
  name: string;
  spec: KitchenSpec;
  items: PlacedItem[];
  priceBand: { lowAud: number; highAud: number };
  violations: Violation[];
  rationale: string;
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
    provider: 'openai';
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

export function useAiDesigner() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<AuthorizedDesignSession | null>(null);

  const call = useCallback(async (body: Record<string, unknown>): Promise<AiDesignResult | null> => {
    setLoading(true);
    setError(null);
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
        if (token) sessionRef.current = { ...result.session, token };
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI designer unavailable';
      console.error('[ai-designer] request failed:', msg);
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const generate = useCallback(
    (brief: DesignBrief, shape: LayoutShape) =>
      call({ mode: 'generate', brief, shape }),
    [call],
  );

  const refine = useCallback(
    (
      brief: DesignBrief,
      shape: LayoutShape,
      currentSpec: KitchenSpec,
      currentProposalId: string,
      message: string,
      history: ChatTurn[] = [],
    ) => call({
      mode: 'refine',
      brief,
      shape,
      currentSpec,
      currentProposalId,
      session: sessionRef.current,
      message,
      history,
    }),
    [call],
  );

  const restyle = useCallback(
    (brief: DesignBrief, shape: LayoutShape, currentSpec: KitchenSpec, currentProposalId: string, message: string) =>
      call({ mode: 'style', brief, shape, currentSpec, currentProposalId, session: sessionRef.current, message }),
    [call],
  );

  return { generate, refine, restyle, loading, error };
}
