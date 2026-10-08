/** Authenticated, job-scoped bridge to the private scanner Sites gateway.
 * The Sites access credential is a Supabase Edge secret and never reaches a
 * browser, RoomDocument, URL, or log. Scanner capability tokens remain a
 * separate second check performed by the scanner Worker. */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  corsHeaders, errorResponse, gate, ipKey, jsonResponse, logOutcome,
  newRequestId, rateLimited,
} from '../_shared/roomScan/security.ts';
import {
  bridgeOrigins, parseScannerBridgeInput, readBoundedBytes, savedRoomMatchesCapture,
  scannerBridgePath, scannerUpstreamFailure, validScannerManifest,
  validScannerPhotoBytes,
} from '../_shared/roomScan/scannerPrivateBridge.ts';

// SCANNER_ORIGIN (the private Sites gateway) and PLANNER_ORIGIN (the planner
// the scanner's PLANNER_TRADE_URL points at) are Edge secrets; the private
// preview pair is used when they are unset. See docs/ROOM-GEOMETRY-RELEASE.md.
const MAX_REQUEST_BYTES = 4096;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

serve(async (req) => {
  const started = Date.now();
  const rid = newRequestId();
  const gated = gate(req);
  if (gated) return gated;
  const fail = (status: number, code: string): Response => {
    logOutcome('scanner-private-bridge', rid, code, started);
    return errorResponse(req, status, code);
  };

  const auth = req.headers.get('Authorization');
  const jwt = auth?.match(/^Bearer ([A-Za-z0-9._-]{20,8192})$/)?.[1];
  if (!jwt) return fail(401, 'not_authorized');
  if (Number(req.headers.get('content-length') ?? '0') > MAX_REQUEST_BYTES)
    return fail(413, 'body_too_large');
  if (rateLimited(`private:${await ipKey(req)}`, 300)) return fail(429, 'rate_limited');

  const requestBytes = await readBoundedBytes(req, MAX_REQUEST_BYTES);
  if (!requestBytes) return fail(413, 'body_too_large');
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(requestBytes)); }
  catch { return fail(400, 'invalid_json'); }
  const input = parseScannerBridgeInput(body);
  if (!input) return fail(400, 'invalid_request');

  // Query as the caller: jobs RLS is the first access check. The explicit
  // customer_id test is the second, including when staff/admin RLS can see
  // other people's jobs. Never accept a client-supplied room document here.
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth! } },
  });
  const { data: identity, error: identityError } = await asCaller.auth.getUser(jwt);
  if (identityError || !identity.user) return fail(401, 'not_authorized');
  const { data: job, error: jobError } = await asCaller.from('jobs')
    .select('customer_id, design_data').eq('id', input.jobId).maybeSingle();
  if (jobError || !job || job.customer_id !== identity.user.id
    || !savedRoomMatchesCapture(job.design_data, input)) return fail(403, 'not_authorized');

  const siteToken = Deno.env.get('SCANNER_SITES_ACCESS_TOKEN');
  const origins = bridgeOrigins((name) => Deno.env.get(name));
  if (!siteToken || !origins) return fail(503, 'scanner_unavailable');
  const upstreamHeaders: Record<string, string> = {
    'OAI-Sites-Authorization': `Bearer ${siteToken}`,
    Origin: origins.planner,
    'Cache-Control': 'no-store',
  };
  if (input.action === 'link') upstreamHeaders['Content-Type'] = 'application/json';
  else upstreamHeaders.Authorization = `Bearer ${input.token}`;

  let upstream: Response;
  try {
    upstream = await fetch(`${origins.scanner}${scannerBridgePath(input)}`, {
      method: input.action === 'link' ? 'POST' : 'GET',
      headers: upstreamHeaders,
      ...(input.action === 'link' ? { body: JSON.stringify({
        jobId: input.jobId, roomId: input.roomId, sourceRevision: input.sourceRevision,
        linkToken: input.token,
      }) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
  } catch { return fail(502, 'scanner_unavailable'); }

  const upstreamFailure = scannerUpstreamFailure(upstream.status);
  if (upstreamFailure) {
    // The upstream status is a number, never private data; it tells an
    // origin misconfiguration apart from an outage in the function logs.
    logOutcome('scanner-private-bridge', rid, `${upstreamFailure.code}:${upstream.status}`, started);
    return errorResponse(req, upstreamFailure.status, upstreamFailure.code);
  }
  const expectedType = input.action === 'photo' ? 'image/jpeg' : 'application/json';
  if (upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== expectedType)
    return fail(502, 'scanner_invalid_response');
  const bytes = await readBoundedBytes(upstream, input.action === 'photo' ? MAX_IMAGE_BYTES : 64 * 1024);
  if (!bytes) return fail(502, 'scanner_invalid_response');

  if (input.action === 'photo') {
    if (!validScannerPhotoBytes(bytes))
      return fail(502, 'scanner_invalid_response');
    logOutcome('scanner-private-bridge', rid, 'photo_ok', started);
    return new Response(bytes, { status: 200, headers: {
      ...corsHeaders(req), 'Content-Type': 'image/jpeg',
    } });
  }

  let data: unknown;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return fail(502, 'scanner_invalid_response'); }
  if (input.action === 'manifest') {
    if (!validScannerManifest(data, input)) return fail(502, 'scanner_invalid_response');
    logOutcome('scanner-private-bridge', rid, 'manifest_ok', started);
    return jsonResponse(req, 200, data);
  }
  const linked = (data as { linked?: unknown })?.linked;
  if (!linked || typeof linked !== 'object'
    || (linked as { jobId?: unknown }).jobId !== input.jobId
    || (linked as { roomId?: unknown }).roomId !== input.roomId
    || (linked as { sourceRevision?: unknown }).sourceRevision !== input.sourceRevision)
    return fail(502, 'scanner_invalid_response');
  logOutcome('scanner-private-bridge', rid, 'link_ok', started);
  return jsonResponse(req, 200, { linked: {
    jobId: input.jobId, roomId: input.roomId, captureId: input.captureId,
    sourceRevision: input.sourceRevision,
  } });
});
