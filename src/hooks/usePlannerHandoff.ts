// WS5 Phase 3: consume a website → planner starter-design handoff.
// The website saves the visitor's Design Scope Builder selections as a
// planner_handoffs row and opens the planner with ?handoff=<id>. This hook
// fetches the row so JobEditor can pre-fill the Room Setup Wizard.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Contract shared with the website repo — keep identical to
 *  bower-cabinet-web-site/docs/kitchen-planner-integration-plan.md */
export interface WebsitePlannerHandoff {
  source: 'website' | 'design_scope_builder';
  leadId?: string;
  roomType: 'kitchen' | 'laundry' | 'wardrobe' | 'bathroom' | 'other';
  dimensions?: {
    widthMm?: number;
    depthMm?: number;
    heightMm?: number;
  };
  styleTags: string[];
  materials: {
    mainCabinet?: string;
    secondaryFinish?: string;
    benchtop?: string;
    splashback?: string;
    hardware?: string;
  };
  notes?: string;
}

export interface PlannerHandoffRow {
  id: string;
  created_at: string;
  source: string;
  payload: WebsitePlannerHandoff;
  lead_name: string | null;
  lead_email: string | null;
  lead_phone: string | null;
  consumed_at: string | null;
  job_id: string | null;
}

// planner_handoffs is newer than the generated supabase types — untyped access.
const sb = supabase as unknown as {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): { maybeSingle(): Promise<{ data: unknown; error: unknown }> };
    };
    update(patch: Record<string, unknown>): {
      eq(col: string, v: string): PromiseLike<{ error: unknown }>;
    };
  };
};

export function usePlannerHandoff(handoffId: string | null) {
  return useQuery({
    queryKey: ['planner-handoff', handoffId ?? 'none'],
    enabled: Boolean(handoffId),
    staleTime: Infinity,
    queryFn: async (): Promise<PlannerHandoffRow | null> => {
      const { data, error } = await sb
        .from('planner_handoffs')
        .select('*')
        .eq('id', handoffId!)
        .maybeSingle();
      if (error || !data) return null;
      return data as PlannerHandoffRow;
    },
  });
}

/** Stamp the handoff consumed; link the created job when available. */
export async function markHandoffConsumed(id: string, jobId?: string) {
  const patch: Record<string, unknown> = { consumed_at: new Date().toISOString() };
  if (jobId) patch.job_id = jobId;
  try {
    await sb.from('planner_handoffs').update(patch).eq('id', id);
  } catch {
    // Non-fatal: the wizard still works; admin just won't see the lead link.
  }
}
