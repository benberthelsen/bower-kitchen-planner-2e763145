import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { publishBuildFlowLead } from '../_shared/buildFlow/leadIntake.ts';
import {
  errorResponse,
  gate,
  isUuid,
  jsonResponse,
  readJsonBody,
} from '../_shared/roomScan/security.ts';

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
    'id,name,customer_id,status,notes,design_data,cost_incl_tax',
  ).eq('id', jobId).maybeSingle();
  if (jobError || !job) return errorResponse(req, 404, 'job_not_found');

  let authorised = job.customer_id === authData.user.id;
  if (!authorised) {
    const { data: adminRole } = await service.from('user_roles').select('role')
      .eq('user_id', authData.user.id).eq('role', 'admin').maybeSingle();
    authorised = Boolean(adminRole);
  }
  if (!authorised) return errorResponse(req, 403, 'forbidden');

  const notes = typeof job.notes === 'string' ? job.notes : '';
  const grab = (label: string) =>
    notes.match(new RegExp(`^${label}: (.+)$`, 'm'))?.[1]?.trim() ?? '';
  const designData = typeof job.design_data === 'object' && job.design_data !== null
    ? job.design_data as Record<string, unknown>
    : {};
  const priceBand = typeof designData.priceBand === 'object' && designData.priceBand !== null
    ? designData.priceBand as Record<string, unknown>
    : {};
  const low = typeof priceBand.low === 'number' ? priceBand.low : null;
  const high = typeof priceBand.high === 'number' ? priceBand.high : null;
  const budgetRange = low !== null && high !== null
    ? `$${low.toLocaleString('en-AU')} - $${high.toLocaleString('en-AU')} AUD`
    : null;

  const result = await publishBuildFlowLead({
    idempotencyKey: `planner-lead:${job.id}`,
    name: grab('Contact') || job.name,
    email: grab('Email') || authData.user.email || null,
    phone: grab('Phone') || null,
    source: job.status === 'enquiry' ? '3D Kitchen Designer' : 'Trade Planner',
    jobType: 'Kitchen',
    budgetRange,
    notes,
    plannerJobId: job.id,
    estimateTotal: typeof job.cost_incl_tax === 'number' ? job.cost_incl_tax : null,
  });

  const { error: updateError } = await service.from('jobs').update({
    buildflow_status: result.ok ? 'published' : 'failed',
    buildflow_lead_id: result.leadId ?? null,
    buildflow_published_at: result.ok ? new Date().toISOString() : null,
    buildflow_error: result.ok ? null : (result.error ?? 'Build Flow lead intake failed').slice(0, 500),
  }).eq('id', job.id);
  if (updateError) {
    console.error('[sync-buildflow-lead] delivery state update failed', updateError.message);
  }

  if (!result.ok) {
    console.error('[sync-buildflow-lead] delivery failed', result.error);
    return jsonResponse(req, 502, { error: 'buildflow_delivery_failed' });
  }
  return jsonResponse(req, 200, {
    ok: true,
    leadId: result.leadId ?? null,
    duplicate: result.duplicate === true,
  });
});
