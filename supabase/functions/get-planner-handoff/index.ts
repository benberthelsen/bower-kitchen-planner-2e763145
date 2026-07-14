/**
 * get-planner-handoff — tokenized public retrieval (master plan §6.3).
 * POST { handoffId, token } → { payload, leadName, consumedAt, expiresAt }.
 * ID/token travel in the POST body only. Invalid capability responses never
 * reveal whether the handoff exists. Retrieval NEVER consumes.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  errorResponse,
  gate,
  ipKey,
  isToken,
  isUuid,
  jsonResponse,
  logOutcome,
  newRequestId,
  rateLimited,
  readJsonBody,
  sha256Hex,
} from '../_shared/roomScan/security.ts';

serve(async (req) => {
  const started = Date.now();
  const rid = newRequestId();
  const gated = gate(req);
  if (gated) return gated;

  if (rateLimited(`get:${await ipKey(req)}`, 60)) {
    logOutcome('get-planner-handoff', rid, 'throttled', started);
    return errorResponse(req, 429, 'rate_limited');
  }

  const body = await readJsonBody(req);
  if (body instanceof Response) return body;
  const { handoffId, token } = (body ?? {}) as { handoffId?: unknown; token?: unknown };
  if (!isUuid(handoffId) || !isToken(token)) {
    logOutcome('get-planner-handoff', rid, 'bad_request', started);
    return errorResponse(req, 400, 'invalid_capability');
  }

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: row } = await service
    .from('planner_handoffs')
    .select('id, payload, lead_name, consumed_at, expires_at, public_token_hash')
    .eq('id', handoffId)
    .maybeSingle();

  // Unknown id and wrong token return the SAME generic error.
  const tokenHash = await sha256Hex(token);
  if (!row || !row.public_token_hash || row.public_token_hash !== tokenHash) {
    logOutcome('get-planner-handoff', rid, 'invalid_capability', started);
    return errorResponse(req, 404, 'invalid_capability');
  }

  // Expiry detail is only returned to a VALID capability.
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) {
    logOutcome('get-planner-handoff', rid, 'expired', started);
    return errorResponse(req, 410, 'expired_handoff');
  }

  logOutcome('get-planner-handoff', rid, 'ok', started);
  return jsonResponse(req, 200, {
    payload: row.payload,
    leadName: row.lead_name,
    consumedAt: row.consumed_at,
    expiresAt: row.expires_at,
  });
});
