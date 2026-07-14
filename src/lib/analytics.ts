/**
 * R5: Funnel analytics — lightweight event tracking for the homeowner wizard.
 * Uses the main Supabase project so data lives alongside job/lead data.
 * Never throws — analytics are non-critical and must not break the wizard.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

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
  | 'ai_refine_used';

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
    await supabase.from('funnel_events').insert({
      session_id: getSessionId(),
      event_type: type,
      metadata: metadata as Json,
    });
  } catch {
    // Silently swallow — analytics must not crash the app
  }
}
