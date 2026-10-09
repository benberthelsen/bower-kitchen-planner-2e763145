/**
 * get-planner-handoff — tokenized public retrieval (master plan §6.3).
 * POST { handoffId, token } → { payload, leadName, consumedAt, expiresAt }.
 * ID/token travel in the POST body only. Invalid capability responses never
 * reveal whether the handoff exists. Retrieval NEVER consumes.
 * A scanner handoff also needs a Bower staff JWT in Authorization while the
 * scanner admits only its owner; website handoffs need the token alone.
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

async function callerIsStaff(req: Request, service: ReturnType<typeof createClient>): Promise<boolean> {
  const jwt = req.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9._-]{20,8192})$/)?.[1];
  if (!jwt) return false;
  try {
    const { data: identity, error } = await service.auth.getUser(jwt);
    if (error || !identity.user) return false;
    const { data: isStaff, error: staffError } = await service
      .rpc('is_bower_staff', { p_user: identity.user.id });
    return !staffError && isStaff === true;
  } catch {
    return false;
  }
}

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
    .select('id, source, payload, lead_name, consumed_at, expires_at, public_token_hash')
    .eq('id', handoffId)
    .maybeSingle();

  // Unknown id and wrong token return the SAME generic error.
  const tokenHash = await sha256Hex(token);
  if (!row || !row.public_token_hash || row.public_token_hash !== tokenHash) {
    logOutcome('get-planner-handoff', rid, 'invalid_capability', started);
    return errorResponse(req, 404, 'invalid_capability');
  }

  // Checked after the token and before expiry, with the same generic error,
  // so a caller who is not staff cannot tell a scanner handoff exists.
  if (row.source === 'scanner' && !(await callerIsStaff(req, service))) {
    logOutcome('get-planner-handoff', rid, 'scanner_not_staff', started);
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
