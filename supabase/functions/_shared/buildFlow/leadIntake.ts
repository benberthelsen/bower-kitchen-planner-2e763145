/**
 * One product line on a lead — the shape Build Flow's bf-lead-intake validates
 * as `items[]` (the website sends the same). Prices are inc GST because that
 * is what the customer saw.
 */
export type BuildFlowLeadItem = {
  article: string;
  name: string;
  brand: string | null;
  qty: number;
  listed_price_inc_gst: number | null;
  category: string | null;
};

/**
 * The appliance lines a homeowner opted into in the wizard
 * (design_data.applianceItems, see ApplianceLineItem in src/lib/pricing/types.ts)
 * as Build Flow lead items. Planner unit prices are ex GST with margin applied,
 * so they are grossed up here. Returns [] when there are none.
 */
export function applianceItemsToLeadItems(designData: unknown): BuildFlowLeadItem[] {
  const dd = typeof designData === 'object' && designData !== null
    ? designData as Record<string, unknown>
    : {};
  const raw = Array.isArray(dd.applianceItems) ? dd.applianceItems : [];
  const items: BuildFlowLeadItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const a = entry as Record<string, unknown>;
    const name = typeof a.name === 'string' ? a.name.trim().slice(0, 200) : '';
    const code = typeof a.itemCode === 'string' && a.itemCode.trim()
      ? a.itemCode.trim()
      : typeof a.productId === 'string' ? a.productId.trim() : '';
    const qtyRaw = typeof a.quantity === 'number' ? a.quantity : Number(a.quantity);
    const qty = Number.isInteger(qtyRaw) && qtyRaw >= 1 ? Math.min(qtyRaw, 99) : 1;
    const unit = typeof a.unitPrice === 'number' && Number.isFinite(a.unitPrice) && a.unitPrice > 0
      ? Math.round(a.unitPrice * 1.1 * 100) / 100
      : null;
    if (!name || !code) continue;
    items.push({
      article: code.slice(0, 40),
      name,
      brand: null,
      qty,
      listed_price_inc_gst: a.isPlaceholderPrice === true ? null : unit,
      category: typeof a.category === 'string' ? a.category.slice(0, 40) : null,
    });
    if (items.length >= 50) break;
  }
  return items;
}

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
  items?: BuildFlowLeadItem[];
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
        ...(input.items && input.items.length ? { items: input.items } : {}),
      }),
    });

    const text = await response.text().catch(() => '');
    let body: {
      ok?: boolean;
      lead_id?: string;
      duplicate?: boolean;
      result_id?: string;
      status?: string;
      error?: string;
      message?: string;
    } = {};
    try { body = JSON.parse(text); } catch { /* non-JSON error text is kept below */ }
    // A replay Build Flow already applied is success, not failure (contract rule 3).
    if ((response.ok && body.ok === true) || body.duplicate === true) {
      return {
        ok: true,
        leadId: body.lead_id ?? body.result_id,
        duplicate: body.duplicate === true,
      };
    }

    // Keep Build Flow's own reason: "422 Build Flow lead intake failed" told
    // staff nothing about which field was rejected.
    const detail = (body.error ?? body.message ?? text).toString().trim().slice(0, 300);
    return { ok: false, error: `${response.status} Build Flow lead intake failed${detail ? `: ${detail}` : ''}` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    };
  }
}
