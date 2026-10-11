/**
 * create-planner-handoff — public capability creation (master plan §6.3).
 * POST { payload: WebsitePlannerHandoffV1 } → { id, token, expiresAt }.
 * Stores only the token HASH; token travels once in the response and then
 * lives in the /wizard URL fragment. Contact details are never taken here:
 * any `lead` in the body is ignored and the contact columns stay NULL.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseWebsitePlannerHandoff } from '../_shared/roomScan/contract.ts';
import {
  durableRateLimit,
  errorResponse,
  gate,
  generateToken,
  jsonResponse,
  logOutcome,
  newRequestId,
  rateKeys,
  rateLimitResponse,
  readJsonBody,
  sha256Hex,
} from '../_shared/roomScan/security.ts';

const EXPIRY_DAYS = 7;

serve(async (req) => {
  const started = Date.now();
  const rid = newRequestId();
  const gated = gate(req);
  if (gated) return gated;

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const limit = await durableRateLimit(service, await rateKeys(req, 'create-planner-handoff'), 20, {
    fn: 'create-planner-handoff',
  });
  if (limit !== 'allowed') {
    logOutcome('create-planner-handoff', rid, limit, started);
    return rateLimitResponse(req, limit);
  }

  const body = await readJsonBody(req);
  if (body instanceof Response) return body;
  const { payload } = (body ?? {}) as { payload?: unknown };

  const parsed = parseWebsitePlannerHandoff(payload);
  if (!parsed.ok) {
    logOutcome('create-planner-handoff', rid, 'invalid_payload', started);
    return errorResponse(req, 400, 'invalid_payload');
  }

  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86_400_000).toISOString();

  const { data, error } = await service
    .from('planner_handoffs')
    .insert({
      source: parsed.handoff.source,
      payload: parsed.handoff,
      lead_name: null,
      lead_email: null,
      lead_phone: null,
      public_token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (error || !data) {
    logOutcome('create-planner-handoff', rid, 'insert_failed', started);
    return errorResponse(req, 500, 'create_failed');
  }

  logOutcome('create-planner-handoff', rid, 'ok', started);
  return jsonResponse(req, 200, { id: data.id, token, expiresAt });
});
