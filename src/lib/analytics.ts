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
  | 'job_approved';

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
