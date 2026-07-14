/**
 * link-trade-handoff — authenticated trade/staff linking (master plan §6.4).
 * POST { handoffId, jobId } with the caller's Authorization header.
 * Replaces the browser's direct planner_handoffs UPDATE (removed by RLS).
 * Links/consumes only AFTER the trade job exists — never on page load.
 * Authorization lives in the RPC: caller must be Bower staff or own the job.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  errorResponse,
  gate,
  isUuid,
  jsonResponse,
  logOutcome,
  newRequestId,
  readJsonBody,
} from '../_shared/roomScan/security.ts';

serve(async (req) => {
  const started = Date.now();
  const rid = newRequestId();
  const gated = gate(req);
  if (gated) return gated;

  const auth = req.headers.get('Authorization');
  if (!auth) return errorResponse(req, 401, 'not_authorized');

  const body = await readJsonBody(req);
  if (body instanceof Response) return body;
  const { handoffId, jobId } = (body ?? {}) as Record<string, unknown>;
  if (!isUuid(handoffId) || !isUuid(jobId)) return errorResponse(req, 400, 'invalid_request');

  // Run as the CALLER (anon key + their JWT) so auth.uid() drives the RPC's
  // staff/ownership check.
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await asCaller.rpc('link_trade_handoff_v1', {
    p_handoff_id: handoffId,
    p_job_id: jobId,
  });

  if (error) {
    const msg = error.message ?? '';
    const outcome = msg.includes('not_authorized')
      ? 'not_authorized'
      : msg.includes('invalid_job') || msg.includes('invalid_handoff')
        ? 'invalid_request'
        : 'link_failed';
    logOutcome('link-trade-handoff', rid, outcome, started);
    return errorResponse(req, outcome === 'not_authorized' ? 403 : outcome === 'invalid_request' ? 400 : 500, outcome);
  }

  logOutcome('link-trade-handoff', rid, 'ok', started);
  return jsonResponse(req, 200, data);
});
