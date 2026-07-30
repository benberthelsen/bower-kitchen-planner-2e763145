/**
 * R5: Funnel analytics — lightweight event tracking for the homeowner wizard.
 * Uses the main Supabase project so data lives alongside job/lead data.
 * Never throws — analytics are non-critical and must not break the wizard.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { sanitizeAnalyticsMetadata } from '@/lib/analyticsPrivacy';

export type FunnelEventType =
  | 'wizard_started'
  | 'step_complete'
  | 'quote_requested'
  | 'job_approved'
  // Homeowner design step (WS10) events — funnel_events.event_type is free text.
  | 'style_preset_applied'
  | 'ai_generate_requested'
  | 'ai_generate_failed'
  | 'ai_generate_succeeded'
  | 'ai_option_selected'
  | 'ai_refine_used'
  // Records WHY a refine failed. Without this, a designer that rejects every
  // edit stays invisible in the funnel — it only surfaces in the customer's
  // browser console, where nobody is looking.
  | 'ai_refine_failed'
  | 'ai_fix_warning_used'
  | 'ar_view_requested'
  | 'ar_payload_stored'
  | 'ar_view_started'
  | 'ar_kitchen_placed'
  | 'ar_view_failed'
  | 'lead_captured'
  | 'shared_design_opened';

function getSessionId(): string {
  const KEY = '_bwr_sid';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

export async function trackEvent(
  type: FunnelEventType,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { error } = await (supabase as any).from('funnel_events').insert({
      session_id: getSessionId(),
      event_type: type,
      metadata: sanitizeAnalyticsMetadata(metadata) as Json,
    });
    if (error) console.warn('[analytics] event insert failed', error.code);
  } catch {
    // Silently swallow — analytics must not crash the app
  }
}
