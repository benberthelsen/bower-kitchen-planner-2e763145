/**
 * Helpers for rendering homeowner wizard ENQUIRY jobs in the admin job page.
 * Wizard enquiries (submit-planner-enquiry) store `design_data` in the wizard
 * shape — wizardVersion/items/priceBand — not the trade `tradeRooms` shape.
 */

export interface WizardPriceBand {
  low: number;
  high: number;
}

const num = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** True when design_data came from the homeowner wizard rather than the trade planner. */
export function isWizardEnquiry(designData: Record<string, unknown>): boolean {
  const version = num(designData.wizardVersion);
  if (version !== null && version >= 2) return true;
  return Array.isArray(designData.items) && !Array.isArray(designData.tradeRooms);
}

/** Price band stored by the wizard, when both ends are finite numbers. */
export function readPriceBand(designData: Record<string, unknown>): WizardPriceBand | null {
  const band = (designData.priceBand ?? {}) as Record<string, unknown>;
  const low = num(band.low ?? band.lowAud);
  const high = num(band.high ?? band.highAud);
  if (low === null || high === null) return null;
  return { low, high };
}

/**
 * A design can be sent to Build Flow once it carries a price: the trade job
 * total, the persisted job cost, or the wizard's estimate band.
 */
export function designIsPricedFor(
  designData: Record<string, unknown>,
  costInclTax?: number | string | null,
): boolean {
  const totals = (designData.jobTotals ?? {}) as Record<string, unknown>;
  if (num(totals.total) !== null) return true;
  const cost = num(costInclTax);
  if (cost !== null && cost > 0) return true;
  return readPriceBand(designData) !== null;
}

export interface NotesContact {
  name: string | null;
  email: string | null;
  phone: string | null;
}

/** Same `notes` line grabber the Build Flow edge functions use. */
export function parseContactFromNotes(notes: string | null | undefined): NotesContact {
  const text = typeof notes === 'string' ? notes : '';
  const grab = (label: string) =>
    text.match(new RegExp(`^${label}: (.+)$`, 'm'))?.[1]?.trim() || null;
  return { name: grab('Contact'), email: grab('Email'), phone: grab('Phone') };
}
