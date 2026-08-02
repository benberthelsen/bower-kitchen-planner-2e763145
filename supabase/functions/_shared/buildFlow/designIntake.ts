/**
 * Build Flow design intake client. Mirrors `leadIntake.ts`.
 *
 * Reuses BUILDFLOW_INTAKE_SECRET — no second secret is introduced. The URL is
 * BUILDFLOW_DESIGN_INTAKE_URL when set, otherwise derived from
 * BUILDFLOW_LEAD_INTAKE_URL by swapping `bf-lead-intake` → `bf-design-intake`.
 */

export type BuildFlowClientDetails = {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  suburb: string | null;
  postcode: string | null;
};

export type BuildFlowDesignInput = {
  idempotencyKey: string;
  plannerDesignId: string;
  designVersion: number;
  engineVersion?: string | null;
  client: BuildFlowClientDetails;
  roomType?: string | null;
  jobType?: string | null;
  totalIncGst: number;
  /** Sent verbatim — never recomputed or rounded. */
  quoteSnapshot: unknown;
  plannerUrl?: string | null;
  notes?: string | null;
};

export type BuildFlowDesignResult = {
  ok: boolean;
  designId?: string;
  jobId?: string;
  duplicate?: boolean;
  error?: string;
};

const bounded = (value: unknown, max = 2_000): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

export function resolveDesignIntakeUrl(): string | null {
  const direct = Deno.env.get('BUILDFLOW_DESIGN_INTAKE_URL')?.trim();
  if (direct) return direct;
  const lead = Deno.env.get('BUILDFLOW_LEAD_INTAKE_URL')?.trim();
  if (lead && lead.includes('bf-lead-intake')) {
    return lead.replace('bf-lead-intake', 'bf-design-intake');
  }
  return null;
}

/** SHA-256 hex of the exact snapshot + total being sent. */
export async function designHash(quoteSnapshot: unknown, totalIncGst: number): Promise<string> {
  const payload = JSON.stringify({ quote_snapshot: quoteSnapshot ?? null, total_inc_gst: totalIncGst });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function publishBuildFlowDesign(
  input: BuildFlowDesignInput,
): Promise<BuildFlowDesignResult> {
  const intakeUrl = resolveDesignIntakeUrl();
  const intakeSecret = Deno.env.get('BUILDFLOW_INTAKE_SECRET') ?? '';
  if (!intakeUrl || !intakeSecret) {
    return { ok: false, error: 'Build Flow design intake is not configured' };
  }
  if (input.quoteSnapshot === undefined || input.quoteSnapshot === null) {
    return { ok: false, error: 'Design has no quote snapshot to send' };
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
        planner_design_id: input.plannerDesignId,
        design_version: input.designVersion,
        engine_version: bounded(input.engineVersion, 100),
        client: {
          name: bounded(input.client.name, 200),
          email: bounded(input.client.email, 200),
          phone: bounded(input.client.phone, 50),
          address: bounded(input.client.address, 300),
          suburb: bounded(input.client.suburb, 200),
          postcode: bounded(input.client.postcode, 20),
        },
        room_type: bounded(input.roomType, 100),
        job_type: bounded(input.jobType, 100),
        total_inc_gst: input.totalIncGst,
        quote_snapshot: input.quoteSnapshot,
        planner_url: bounded(input.plannerUrl, 500),
        notes: bounded(input.notes, 5_000),
      }),
    });

    const body = await response.json().catch(() => ({})) as {
      ok?: boolean;
      design_id?: string;
      job_id?: string;
      duplicate?: boolean;
    };

    if (response.ok && body.ok === true) {
      return {
        ok: true,
        designId: body.design_id,
        jobId: body.job_id,
        duplicate: body.duplicate === true,
      };
    }

    return { ok: false, error: `${response.status} Build Flow design intake failed` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    };
  }
}
