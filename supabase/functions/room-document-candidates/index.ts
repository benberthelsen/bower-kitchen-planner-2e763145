/** Deterministic preliminary wall-run suggestions for a RoomDocument.
 * This public endpoint reads no job or capture and persists nothing. The
 * browser uses the same generated layout code for immediate previews. */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { evaluateRoomDocumentCandidateRequest } from '../_shared/layout/roomDocumentCandidateApi.ts';
import {
  errorResponse, gate, ipKey, jsonResponse, logOutcome, newRequestId,
  rateLimited, readJsonBody,
} from '../_shared/roomScan/security.ts';

serve(async (req) => {
  const started = Date.now();
  const requestId = newRequestId();
  const gated = gate(req);
  if (gated) return gated;
  if (rateLimited(`room-document-candidates:${await ipKey(req)}`, 60)) {
    logOutcome('room-document-candidates', requestId, 'throttled', started);
    return errorResponse(req, 429, 'rate_limited');
  }
  const body = await readJsonBody(req);
  if (body instanceof Response) return body;
  const result = evaluateRoomDocumentCandidateRequest(body);
  logOutcome('room-document-candidates', requestId, result.ok ? 'ok' : result.error, started);
  return result.ok
    ? jsonResponse(req, 200, result)
    : errorResponse(req, 400, result.error);
});
