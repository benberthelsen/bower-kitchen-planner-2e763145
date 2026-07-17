/**
 * promote-ai-design — staff-only promotion of an AI wizard lead into an
 * editable TradeRoom (implementation plan §11.2).
 *
 * POST /functions/v1/promote-ai-design
 * Headers: Authorization: Bearer <staff user JWT>
 * Body: { jobId: string }
 * Returns: { jobId, tradeRoomId, cabinetCount, readiness, quoteWarnings,
 *            priceBand, storedPriceBand, alreadyPromoted }
 *
 * Replaces the old lead conversion that only flipped jobs.status. The server:
 *   1. authenticates the caller and requires public.is_bower_staff;
 *   2. loads the enquiry job and its CONFIRMED room scan (full Zod re-check);
 *   3. when the lead carries AI lineage (design_data.aiProposalId), loads the
 *      stored proposal row and verifies the submitted spec's fingerprint
 *      matches the server-persisted spec — the stored proposal wins;
 *   4. recompiles and validates the spec server-side; error-severity
 *      violations (concept blockers) stop promotion;
 *   5. converts via the shared proposalToTradeRoom adapter (§11.1) — the same
 *      code the client round-trip tests exercise;
 *   6. reprices with current pricing and records the diff against the price
 *      band the customer saw (product/price drift never rewrites the
 *      accepted proposal);
 *   7. writes design_data.tradeRooms + readiness + lineage atomically through
 *      the restricted promote_ai_design_v1 RPC and sets the job to draft.
 *
 * Quote readiness is recorded as PENDING, never pass: the current catalogue
 * role map is provisional and exact appliance/sink models are not yet
 * confirmed (§7.5). Quote blockers ride into the trade workspace; they do not
 * block promotion. Never trust a browser-supplied TradeRoom.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  compileSpec, priceDesign, validate, kitchenSpecSchema,
} from '../_shared/layout/index.ts';
import { proposalToTradeRoom } from '../_shared/trade/proposalToTradeRoom.ts';
import { confirmedRoomScanV1Schema } from '../_shared/roomScan/contract.ts';
import { fingerprintV1 } from '../_shared/roomScan/fingerprint.ts';
import {
  errorResponse,
  gate,
  ipKey,
  jsonResponse,
  logOutcome,
  newRequestId,
  rateLimited,
  readJsonBody,
} from '../_shared/roomScan/security.ts';

// Keep in lockstep with ai-designer/index.ts until these move to one module.
const ENGINE_VERSION = 'layout-v1.1';
const CATALOG_VERSION = 'role-map-v1-provisional';
const PRICING_VERSION = 'price-band-v1';
const PROMOTER_VERSION = 'promote-ai-design-v1';

/** Bower's current planner defaults — identical to the trade-adapter smoke
 *  fixture so promotion output matches what the round-trip tests prove. */
const TRADE_ROOM_DEFAULTS = {
  dimensions: {
    baseHeight: 720, baseDepth: 560, wallHeight: 720, wallDepth: 300,
    tallHeight: 2100, tallDepth: 560, benchtopThickness: 33, kickHeight: 130,
  },
  materialDefaults: {
    exteriorFinish: 'do-designer-white', carcaseFinish: 'white-melamine',
    doorStyle: 'slab', edgeBanding: 'matching',
  },
  hardwareDefaults: {
    handleType: 'handle-bar-ss', handleColor: 'stainless', hingeType: 'soft-close',
    drawerType: 'standard', softClose: true, supplyHardware: true, adjustableLegs: true,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

serve(async (req) => {
  const started = Date.now();
  const requestId = newRequestId();
  const gated = gate(req);
  if (gated) return gated;
  const json = (body: unknown, status = 200) => jsonResponse(req, status, body);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      logOutcome('promote-ai-design', requestId, 'not_configured', started);
      return errorResponse(req, 500, 'not_configured');
    }

    if (rateLimited(`promote:${await ipKey(req)}`, 60)) {
      logOutcome('promote-ai-design', requestId, 'throttled', started);
      return errorResponse(req, 429, 'rate_limited');
    }

    // ── staff authentication (object-level authz happens in the RPC too) ──
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!jwt) {
      logOutcome('promote-ai-design', requestId, 'no_auth', started);
      return errorResponse(req, 401, 'not_authorized');
    }
    const service = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userError } = await service.auth.getUser(jwt);
    const user = userData?.user;
    if (userError || !user) {
      logOutcome('promote-ai-design', requestId, 'bad_auth', started);
      return errorResponse(req, 401, 'not_authorized');
    }
    const { data: isStaff, error: staffError } = await service
      .rpc('is_bower_staff', { p_user: user.id });
    if (staffError || isStaff !== true) {
      logOutcome('promote-ai-design', requestId, 'not_staff', started);
      return errorResponse(req, 403, 'not_authorized');
    }

    // ── request ──
    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    const { jobId } = (body ?? {}) as Record<string, unknown>;
    if (!isUuid(jobId)) return errorResponse(req, 400, 'invalid_request');

    // ── load the lead ──
    const { data: job, error: jobError } = await service
      .from('jobs')
      .select('id, name, status, design_data')
      .eq('id', jobId)
      .maybeSingle();
    if (jobError) return errorResponse(req, 500, 'promote_failed');
    if (!job) return errorResponse(req, 404, 'invalid_job');

    const designData = isRecord(job.design_data) ? job.design_data : {};

    // Idempotent replay — surface the existing room instead of failing.
    if (isRecord(designData.aiPromotion)) {
      const rooms = Array.isArray(designData.tradeRooms) ? designData.tradeRooms : [];
      const first = isRecord(rooms[0]) ? rooms[0] : null;
      logOutcome('promote-ai-design', requestId, 'already_promoted', started);
      return json({
        jobId: job.id,
        tradeRoomId: first?.id ?? null,
        cabinetCount: Array.isArray(first?.cabinets) ? first.cabinets.length : null,
        alreadyPromoted: true,
      });
    }
    if (job.status !== 'enquiry') {
      logOutcome('promote-ai-design', requestId, 'invalid_job_status', started);
      return errorResponse(req, 409, 'invalid_job_status');
    }

    // ── confirmed room (never trust a bare room object) ──
    const scanParse = confirmedRoomScanV1Schema.safeParse(designData.roomScan);
    if (!scanParse.success) {
      logOutcome('promote-ai-design', requestId, 'unconfirmed_room', started);
      return errorResponse(req, 409, 'unconfirmed_room');
    }
    const scan = scanParse.data;
    const room = scan.room;

    // ── the spec to promote ──
    const specParse = kitchenSpecSchema.safeParse(designData.spec);
    if (!specParse.success) {
      logOutcome('promote-ai-design', requestId, 'invalid_spec', started);
      return errorResponse(req, 409, 'invalid_spec');
    }
    let spec = specParse.data;

    // AI lineage: the server-persisted proposal is authoritative when present.
    let proposalRow: {
      id: string; session_id: string; spec: unknown; status: string;
      proposal_fingerprint: string; engine_version: string; catalog_version: string;
    } | null = null;
    if (isUuid(designData.aiProposalId)) {
      const { data: proposal, error: proposalError } = await service
        .from('ai_design_proposals')
        .select('id, session_id, spec, status, proposal_fingerprint, engine_version, catalog_version')
        .eq('id', designData.aiProposalId)
        .maybeSingle();
      if (proposalError) return errorResponse(req, 500, 'promote_failed');
      if (!proposal || !['validated', 'selected'].includes(proposal.status)) {
        logOutcome('promote-ai-design', requestId, 'proposal_mismatch', started);
        return errorResponse(req, 409, 'proposal_mismatch');
      }
      const storedSpecParse = kitchenSpecSchema.safeParse(proposal.spec);
      if (!storedSpecParse.success) return errorResponse(req, 500, 'promote_failed');
      // The submitted spec must BE the stored proposal (style edits included in
      // both) — canonical fingerprints make key order irrelevant.
      const [submittedFp, storedFp] = await Promise.all([
        fingerprintV1(spec),
        fingerprintV1(storedSpecParse.data),
      ]);
      if (submittedFp !== storedFp) {
        logOutcome('promote-ai-design', requestId, 'proposal_mismatch', started);
        return errorResponse(req, 409, 'proposal_mismatch');
      }
      spec = storedSpecParse.data;
      proposalRow = proposal as typeof proposalRow;
    }

    // ── recompile + validate server-side (concept gate, §7.5) ──
    // deno-lint-ignore no-explicit-any
    const compiled = compileSpec(spec as any, room as any);
    // deno-lint-ignore no-explicit-any
    const violations = validate(compiled, room as any);
    const conceptBlockers = violations.filter(v => v.severity === 'error');
    if (conceptBlockers.length > 0) {
      logOutcome('promote-ai-design', requestId, 'concept_blockers', started);
      return json({ error: 'concept_blockers', violations: conceptBlockers }, 409);
    }
    const warnings = violations.filter(v => v.severity === 'warn');

    // ── current pricing + drift against what the customer saw ──
    const band = priceDesign(compiled.items, spec.style);
    const storedBand = isRecord(designData.priceBand) ? designData.priceBand : null;

    // ── convert through the single §11.1 adapter ──
    const designName = typeof designData.designName === 'string'
      ? designData.designName
      : 'AI design';
    const tradeRoom = proposalToTradeRoom(
      {
        name: designName,
        spec,
        items: compiled.items,
        room,
        lineage: {
          proposalId: proposalRow?.id ?? `wizard-submission:${job.id}`,
          proposalFingerprint: proposalRow?.proposal_fingerprint,
          sessionId: proposalRow?.session_id,
          roomRevision: scan.roomRevision,
          engineVersion: proposalRow?.engine_version ?? ENGINE_VERSION,
          catalogVersion: proposalRow?.catalog_version ?? CATALOG_VERSION,
        },
      },
      TRADE_ROOM_DEFAULTS,
    );

    // ── readiness record (§6.5): quote/production stay pending, never pass ──
    const evaluatedAt = new Date().toISOString();
    const warningRuleIds = [...new Set(warnings.map(v => v.code))];
    const readiness = {
      concept: {
        stage: 'concept', status: 'pass', evaluatedAt,
        evaluatorVersion: `${PROMOTER_VERSION}/${ENGINE_VERSION}`,
        blockerRuleIds: [], warningRuleIds,
      },
      quote: {
        stage: 'quote', status: 'pending', evaluatedAt,
        evaluatorVersion: `${PROMOTER_VERSION}/${ENGINE_VERSION}`,
        blockerRuleIds: ['catalog-approval-pending', 'appliance-details-pending'],
        warningRuleIds,
      },
      production: {
        stage: 'production', status: 'pending', evaluatedAt,
        evaluatorVersion: `${PROMOTER_VERSION}/${ENGINE_VERSION}`,
        blockerRuleIds: ['check-measure-pending', 'staff-approval-pending'],
        warningRuleIds: [],
      },
    };

    const promotion = {
      promoterVersion: PROMOTER_VERSION,
      engineVersion: ENGINE_VERSION,
      catalogVersion: proposalRow?.catalog_version ?? CATALOG_VERSION,
      pricingVersion: PRICING_VERSION,
      source: proposalRow ? 'ai-proposal' : 'wizard-design-data',
      proposalId: proposalRow?.id ?? null,
      proposalFingerprint: proposalRow?.proposal_fingerprint ?? null,
      sessionId: proposalRow?.session_id ?? null,
      roomRevision: scan.roomRevision,
      readiness,
      warnings: warnings.map(v => ({ code: v.code, message: v.message })),
      // §11.2 step 9: the customer's original band is retained (design_data
      // keeps its priceBand untouched); this is the promotion-time repricing.
      repricedBand: { lowAud: band.lowAud, highAud: band.highAud },
      customerPriceBand: storedBand,
      normalizationWarnings: scan.normalizationWarnings ?? [],
    };

    // ── atomic write; the RPC re-verifies staff + status under a row lock ──
    const { data: result, error: promoteError } = await service.rpc('promote_ai_design_v1', {
      p_job_id: job.id,
      p_staff_user_id: user.id,
      p_trade_room: tradeRoom,
      p_promotion: promotion,
      p_proposal_id: proposalRow?.id ?? null,
    });
    if (promoteError) {
      const msg = promoteError.message ?? '';
      const known: Record<string, number> = {
        not_authorized: 403,
        invalid_job: 404,
        invalid_job_status: 409,
        invalid_promotion: 400,
      };
      for (const [code, status] of Object.entries(known)) {
        if (msg.includes(code)) {
          logOutcome('promote-ai-design', requestId, code, started);
          return errorResponse(req, status, code);
        }
      }
      logOutcome('promote-ai-design', requestId, 'rpc_failed', started);
      return errorResponse(req, 500, 'promote_failed');
    }

    logOutcome('promote-ai-design', requestId, 'ok', started);
    return json({
      jobId: job.id,
      tradeRoomId: tradeRoom.id,
      cabinetCount: tradeRoom.cabinets.length,
      readiness,
      quoteWarnings: warnings.map(v => v.message),
      priceBand: { lowAud: band.lowAud, highAud: band.highAud },
      storedPriceBand: storedBand,
      alreadyPromoted: isRecord(result) ? result.alreadyPromoted === true : false,
    });
  } catch (err) {
    console.error('[promote-ai-design]', err);
    logOutcome('promote-ai-design', requestId, 'failed', started);
    return errorResponse(req, 500, 'promote_failed');
  }
});
