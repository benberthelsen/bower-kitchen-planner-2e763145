import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { designHash, publishBuildFlowDesign } from '../_shared/buildFlow/designIntake.ts';
import {
  errorResponse,
  gate,
  isUuid,
  jsonResponse,
  readJsonBody,
} from '../_shared/roomScan/security.ts';

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};

serve(async (req) => {
  const gated = gate(req);
  if (gated) return gated;

  const authorization = req.headers.get('authorization') ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return errorResponse(req, 401, 'unauthorized');
  }

  const body = await readJsonBody(req);
  if (body instanceof Response) return body;
  const jobId = typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>).jobId
    : null;
  if (!isUuid(jobId)) return errorResponse(req, 400, 'invalid_job');

  const url = Deno.env.get('SUPABASE_URL')!;
  const authClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) return errorResponse(req, 401, 'unauthorized');

  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: job, error: jobError } = await service.from('jobs').select(
    'id,name,customer_id,status,notes,design_data,cost_incl_tax,buildflow_design_version,buildflow_design_hash',
  ).eq('id', jobId).maybeSingle();
  if (jobError || !job) return errorResponse(req, 404, 'job_not_found');

  let authorised = job.customer_id === authData.user.id;
  if (!authorised) {
    const { data: adminRole } = await service.from('user_roles').select('role')
      .eq('user_id', authData.user.id).eq('role', 'admin').maybeSingle();
    authorised = Boolean(adminRole);
  }
  if (!authorised) return errorResponse(req, 403, 'forbidden');

  const designData = asRecord(job.design_data);
  const jobTotals = asRecord(designData.jobTotals);
  const toNumber = (value: unknown): number => {
    const n = typeof value === 'string' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : NaN;
  };
  // Trade jobs carry design_data.jobTotals.total. Homeowner wizard enquiries
  // don't — fall back to the persisted job cost, then the estimate midpoint.
  let totalIncGst = toNumber(jobTotals.total);
  if (!Number.isFinite(totalIncGst)) {
    const cost = toNumber((job as Record<string, unknown>).cost_incl_tax);
    if (Number.isFinite(cost) && cost > 0) {
      totalIncGst = cost;
    } else {
      const band = asRecord(designData.priceBand);
      const low = toNumber(band.low ?? band.lowAud);
      const high = toNumber(band.high ?? band.highAud);
      if (Number.isFinite(low) && Number.isFinite(high)) totalIncGst = (low + high) / 2;
    }
  }
  if (!Number.isFinite(totalIncGst)) {
    return jsonResponse(req, 400, { error: 'design_not_priced' });
  }

  const quoteSnapshot = designData.quoteSnapshot ?? designData.quoteSnapshotsByRoom ?? designData;
  if (quoteSnapshot === undefined || quoteSnapshot === null) {
    return jsonResponse(req, 400, { error: 'missing_quote_snapshot' });
  }

  // Same `notes` line grabber the lead sync uses.
  const notes = typeof job.notes === 'string' ? job.notes : '';
  const grab = (label: string) =>
    notes.match(new RegExp(`^${label}: (.+)$`, 'm'))?.[1]?.trim() ?? '';

  const hash = await designHash(quoteSnapshot, totalIncGst);
  const storedVersion = typeof job.buildflow_design_version === 'number'
    ? job.buildflow_design_version
    : 0;
  const unchanged = Boolean(job.buildflow_design_hash) && job.buildflow_design_hash === hash;
  const designVersion = unchanged ? storedVersion : storedVersion + 1;

  const engineVersion = typeof designData.engineVersion === 'string'
    ? designData.engineVersion
    : typeof asRecord(designData.lineage).n === 'string'
      ? asRecord(designData.lineage).n as string
      : null;

  const origin = req.headers.get('origin') ?? 'https://planner.bowercabinets.com';

  const result = await publishBuildFlowDesign({
    idempotencyKey: `planner-design:${job.id}:v${designVersion}`,
    plannerDesignId: job.id,
    designVersion,
    engineVersion,
    client: {
      name: grab('Contact') || job.name,
      email: grab('Email') || authData.user.email || null,
      phone: grab('Phone') || null,
      address: grab('Address') || null,
      suburb: grab('Suburb') || null,
      postcode: grab('Postcode') || null,
    },
    roomType: typeof designData.roomType === 'string' ? designData.roomType : 'Kitchen',
    jobType: 'Kitchen',
    totalIncGst,
    quoteSnapshot,
    plannerUrl: `${origin}/admin/jobs/${job.id}`,
    notes,
  });

  const { error: updateError } = await service.from('jobs').update(
    result.ok
      ? {
        buildflow_status: 'design_sent',
        buildflow_error: null,
        buildflow_design_id: result.designId ?? null,
        buildflow_job_id: result.jobId ?? null,
        buildflow_design_version: designVersion,
        buildflow_design_hash: hash,
        buildflow_design_sent_at: new Date().toISOString(),
      }
      : {
        buildflow_status: 'design_failed',
        buildflow_error: (result.error ?? 'Build Flow design intake failed').slice(0, 500),
      },
  ).eq('id', job.id);
  if (updateError) {
    console.error('[sync-buildflow-design] delivery state update failed', updateError.message);
  }

  if (!result.ok) {
    console.error('[sync-buildflow-design] delivery failed', result.error);
    return jsonResponse(req, 502, { error: result.error ?? 'buildflow_design_delivery_failed' });
  }

  return jsonResponse(req, 200, {
    ok: true,
    designVersion,
    designId: result.designId ?? null,
    jobId: result.jobId ?? null,
    duplicate: result.duplicate === true || unchanged,
  });
});
