// Website → planner handoff consumption (master plan §6.3-6.4).
//
// Two read paths:
// 1. PUBLIC (homeowner /wizard): tokenized retrieval through the
//    `get-planner-handoff` edge function — the browser never reads the table.
// 2. STAFF (trade JobEditor): direct table read, permitted by RLS only for
//    explicit staff/admin roles (`is_bower_staff`).
//
// Mutations NEVER happen from the browser: consumption/linking runs inside
// `submit_planner_enquiry_v1` (homeowner) or `link_trade_handoff_v1` (trade,
// via the `link-trade-handoff` function). The old on-load consume is gone.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RoomCaptureDraftV1, RoomScanV1 } from '@/lib/roomScan/contract';

/** Contract shared with the website repo — the canonical schema lives in
 *  src/lib/roomScan/contract.ts (websitePlannerHandoffV1Schema). Legacy v0
 *  payloads (no handoffSchemaVersion) remain readable via the tolerant
 *  parser. */
export interface WebsitePlannerHandoff {
  handoffSchemaVersion?: 1;
  source: 'website' | 'design_scope_builder' | 'flat-lay' | 'quote' | 'scanner' | 'showroom';
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
  roomScan?: RoomScanV1;
  roomCaptureDraft?: RoomCaptureDraftV1;
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
  };
};

/** STAFF path: direct read (RLS: is_bower_staff only). Trade JobEditor. */
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

export interface TokenizedHandoff {
  payload: WebsitePlannerHandoff;
  leadName: string | null;
  consumedAt: string | null;
  expiresAt: string | null;
}

/** PUBLIC path: tokenized retrieval via edge function. Never consumes. */
export function useTokenizedPlannerHandoff(handoffId: string | null, token: string | null) {
  return useQuery({
    queryKey: ['planner-handoff-tokenized', handoffId ?? 'none'],
    enabled: Boolean(handoffId && token),
    staleTime: Infinity,
    retry: 1,
    queryFn: async (): Promise<TokenizedHandoff | null> => {
      const { data, error } = await supabase.functions.invoke('get-planner-handoff', {
        body: { handoffId, token },
      });
      if (error || !data) return null;
      return data as TokenizedHandoff;
    },
  });
}

/** Read the one-shot #handoffToken fragment, stash it in session storage for
 *  refresh recovery, and scrub it from the URL (master plan §6.3 step 4). */
export function captureHandoffToken(handoffId: string | null): string | null {
  if (!handoffId || typeof window === 'undefined') return null;
  const storageKey = `bower.handoffToken.${handoffId}`;
  const match = window.location.hash.match(/handoffToken=([A-Za-z0-9_-]{32,128})/);
  if (match) {
    try {
      sessionStorage.setItem(storageKey, match[1]);
    } catch {
      // Session storage unavailable — the in-memory value still works this load.
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return match[1];
  }
  try {
    return sessionStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

/** Trade path: link + consume AFTER the job exists. Non-fatal on failure —
 *  the job still works; admin just won't see the lead link. */
export async function linkTradeHandoff(handoffId: string, jobId: string): Promise<void> {
  try {
    await supabase.functions.invoke('link-trade-handoff', { body: { handoffId, jobId } });
  } catch {
    // Non-fatal by design.
  }
}
