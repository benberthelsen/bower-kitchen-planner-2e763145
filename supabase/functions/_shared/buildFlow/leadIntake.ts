export type BuildFlowLeadInput = {
  idempotencyKey: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  source: string;
  jobType?: string | null;
  suburb?: string | null;
  timeline?: string | null;
  budgetRange?: string | null;
  notes?: string | null;
  plannerJobId?: string | null;
  estimateTotal?: number | null;
};

export type BuildFlowLeadResult = {
  ok: boolean;
  leadId?: string;
  duplicate?: boolean;
  error?: string;
};

const bounded = (value: unknown, max = 2_000): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

export async function publishBuildFlowLead(input: BuildFlowLeadInput): Promise<BuildFlowLeadResult> {
  const intakeUrl = Deno.env.get('BUILDFLOW_LEAD_INTAKE_URL')?.trim();
  const intakeSecret = Deno.env.get('BUILDFLOW_INTAKE_SECRET') ?? '';
  if (!intakeUrl || !intakeSecret) {
    return { ok: false, error: 'Build Flow lead intake is not configured' };
  }

  try {
    const response = await fetch(intakeUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-intake-secret': intakeSecret,
      },
      body: JSON.stringify({
        idempotency_key: input.idempotencyKey,
        name: bounded(input.name, 200) ?? 'Planner enquiry',
        email: bounded(input.email, 200),
        phone: bounded(input.phone, 50),
        source: bounded(input.source, 100) ?? 'Kitchen Planner',
        job_type: bounded(input.jobType, 100),
        suburb: bounded(input.suburb, 200),
        timeframe: bounded(input.timeline, 100),
        budget_range: bounded(input.budgetRange, 200),
        notes: bounded(input.notes, 5_000),
        planner_job_id: input.plannerJobId ?? null,
        estimate_total: input.estimateTotal ?? null,
      }),
    });

    const body = await response.json().catch(() => ({})) as {
      ok?: boolean;
      lead_id?: string;
      duplicate?: boolean;
      result_id?: string;
      status?: string;
    };
    if (response.ok && body.ok === true) {
      return {
        ok: true,
        leadId: body.lead_id ?? body.result_id,
        duplicate: body.duplicate === true,
      };
    }

    return { ok: false, error: `${response.status} Build Flow lead intake failed` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    };
  }
}
