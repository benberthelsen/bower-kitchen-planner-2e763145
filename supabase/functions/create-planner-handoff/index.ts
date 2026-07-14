/**
 * create-planner-handoff — public capability creation (master plan §6.3).
 * POST { payload: WebsitePlannerHandoffV1, lead?: { name?, email?, phone? } }
 * → { id, token }. Stores only the token HASH; token travels once in the
 * response and then lives in the /wizard URL fragment.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseWebsitePlannerHandoff } from '../_shared/roomScan/contract.ts';
import {
  errorResponse,
  gate,
  generateToken,
  ipKey,
  jsonResponse,
  logOutcome,
  newRequestId,
  rateLimited,
  readJsonBody,
  sha256Hex,
} from '../_shared/roomScan/security.ts';

const EXPIRY_DAYS = 7;

serve(async (req) => {
  const started = Date.now();
  const rid = newRequestId();
  const gated = gate(req);
  if (gated) return gated;

  if (rateLimited(`create:${await ipKey(req)}`, 20)) {
    logOutcome('create-planner-handoff', rid, 'throttled', started);
    return errorResponse(req, 429, 'rate_limited');
  }

  const body = await readJsonBody(req);
  if (body instanceof Response) return body;
  const { payload, lead } = (body ?? {}) as { payload?: unknown; lead?: Record<string, unknown> };

  const parsed = parseWebsitePlannerHandoff(payload);
  if (!parsed.ok) {
    logOutcome('create-planner-handoff', rid, 'invalid_payload', started);
    return errorResponse(req, 400, 'invalid_payload');
  }

  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86_400_000).toISOString();

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await service
    .from('planner_handoffs')
    .insert({
      source: parsed.handoff.source,
      payload: parsed.handoff,
      lead_name: typeof lead?.name === 'string' ? lead.name.slice(0, 200) : null,
      lead_email: typeof lead?.email === 'string' ? lead.email.slice(0, 200) : null,
      lead_phone: typeof lead?.phone === 'string' ? lead.phone.slice(0, 50) : null,
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
