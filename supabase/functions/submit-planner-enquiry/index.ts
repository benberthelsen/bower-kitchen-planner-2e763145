/**
 * submit-planner-enquiry — atomic homeowner enquiry submission (master plan
 * §6.4). POST { submissionKey, handoffId?, token?, job } → { jobId,
 * idempotentReplay }. The handoff is OPTIONAL (organic /wizard visitors
 * submit with only a submissionKey). This function validates strictly and
 * computes the versioned JCS fingerprint; the restricted PostgreSQL RPC owns
 * locks, uniqueness and the transaction. Any attached room scan must satisfy
 * ConfirmedRoomScanV1 — drafts and unconfirmed scans are rejected even when
 * the browser bypasses the wizard UI.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { confirmedRoomScanV1Schema } from '../_shared/roomScan/contract.ts';
import { fingerprintV1 } from '../_shared/roomScan/fingerprint.ts';
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

type JobInput = {
  name: string;
  notes?: string;
  design_data?: Record<string, unknown>;
  cost_excl_tax?: number;
  cost_incl_tax?: number;
  status?: string;
  delivery_method?: string;
};

function validateJob(input: unknown): JobInput | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const j = input as Record<string, unknown>;
  if (typeof j.name !== 'string' || !j.name.trim() || j.name.length > 200) return null;
  if (j.notes !== undefined && (typeof j.notes !== 'string' || j.notes.length > 10_000)) return null;
  if (j.design_data !== undefined && (typeof j.design_data !== 'object' || j.design_data === null)) return null;
  for (const key of ['cost_excl_tax', 'cost_incl_tax'] as const) {
    const v = j[key];
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10_000_000)) return null;
  }
  if (j.status !== undefined && j.status !== 'enquiry') return null;
  if (j.delivery_method !== undefined && !['pickup', 'delivery'].includes(String(j.delivery_method))) return null;
  return j as JobInput;
}

serve(async (req) => {
  const started = Date.now();
  const rid = newRequestId();
  const gated = gate(req);
  if (gated) return gated;

  if (rateLimited(`submit:${await ipKey(req)}`, 20)) {
    logOutcome('submit-planner-enquiry', rid, 'throttled', started);
    return errorResponse(req, 429, 'rate_limited');
  }

  const body = await readJsonBody(req);
  if (body instanceof Response) return body;
  const { submissionKey, handoffId, token, job } = (body ?? {}) as Record<string, unknown>;

  if (!isUuid(submissionKey)) return errorResponse(req, 400, 'invalid_submission');
  if (handoffId !== undefined && !isUuid(handoffId)) return errorResponse(req, 400, 'invalid_submission');
  if (handoffId !== undefined && !isToken(token)) return errorResponse(req, 400, 'invalid_capability');

  const validJob = validateJob(job);
  if (!validJob) {
    logOutcome('submit-planner-enquiry', rid, 'invalid_job', started);
    return errorResponse(req, 400, 'invalid_submission');
  }

  // Confirmed-scan boundary check (full Zod schema, server-side).
  const scan = validJob.design_data?.roomScan;
  if (scan !== undefined && scan !== null) {
    const parsed = confirmedRoomScanV1Schema.safeParse(scan);
    if (!parsed.success) {
      logOutcome('submit-planner-enquiry', rid, 'unconfirmed_scan', started);
      return errorResponse(req, 400, 'unconfirmed_scan');
    }
  }

  const fingerprint = await fingerprintV1({ job: validJob, handoffId: (handoffId as string) ?? null });
  const tokenHash = typeof token === 'string' ? await sha256Hex(token) : null;

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await service.rpc('submit_planner_enquiry_v1', {
    p_submission_key: submissionKey,
    p_fingerprint: fingerprint,
    p_job: validJob,
    p_handoff_id: (handoffId as string) ?? null,
    p_token_hash: tokenHash,
  });

  if (error) {
    const msg = error.message ?? '';
    const known: Record<string, number> = {
      invalid_handoff: 404,
      expired_handoff: 410,
      consumed_handoff: 409,
      key_reuse: 409,
      unconfirmed_scan: 400,
      invalid_submission: 400,
    };
    for (const [code, status] of Object.entries(known)) {
      if (msg.includes(code)) {
        logOutcome('submit-planner-enquiry', rid, code, started);
        return errorResponse(req, status, code);
      }
    }
    logOutcome('submit-planner-enquiry', rid, 'rpc_failed', started);
    return errorResponse(req, 500, 'submit_failed');
  }

  logOutcome('submit-planner-enquiry', rid, 'ok', started);
  return jsonResponse(req, 200, data);
});
