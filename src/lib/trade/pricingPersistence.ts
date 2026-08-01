import type { QuoteSnapshot } from '@/types/trade';
import { normalizePricingTotals, roundMoney } from '@/lib/pricing/money';

export { normalizePricingTotals, roundMoney } from '@/lib/pricing/money';

export interface PersistedPricingTotals {
  subtotal?: number;
  tax?: number;
  total?: number;
  updatedAt: string;
}

export interface PersistedPricingState {
  quoteSnapshot?: QuoteSnapshot;
  quoteSnapshotsByRoom?: Record<string, QuoteSnapshot>;
  jobTotals?: PersistedPricingTotals;
}

export interface PricingTotalsInput {
  subtotal?: number;
  tax?: number;
  total?: number;
  updatedAt?: string;
}

/**
 * Build the pricing portion of design_data in one operation.
 *
 * The room planner used to save quoteSnapshot and jobTotals with two parallel
 * jobs-table upserts. Both writes started from the same cached design_data, so
 * the last response could silently restore an older snapshot or older totals.
 * Keeping the merge pure also makes the invariant easy to regression-test.
 */
export function mergePersistedPricingState(
  existing: PersistedPricingState,
  snapshot: QuoteSnapshot,
  totals: PricingTotalsInput,
): PersistedPricingState {
  const normalized = normalizePricingTotals(totals);
  return {
    quoteSnapshot: snapshot,
    quoteSnapshotsByRoom: {
      ...(existing.quoteSnapshotsByRoom ?? {}),
      [snapshot.roomId]: snapshot,
    },
    jobTotals: {
      subtotal: normalized.subtotal,
      tax: normalized.tax,
      total: normalized.total,
      updatedAt: totals.updatedAt ?? new Date().toISOString(),
    },
  };
}

export function getPersistedRoomTotal(snapshot?: QuoteSnapshot | null): number | null {
  if (!snapshot) return null;

  const grandTotal = snapshot.bomSummary?.grandTotal;
  if (grandTotal && typeof grandTotal === 'object') {
    const total = (grandTotal as { total?: unknown }).total;
    if (typeof total === 'number' && Number.isFinite(total)) return total;
  }

  return Number.isFinite(snapshot.roomTotal) ? snapshot.roomTotal : null;
}

/** Allocate a quoted total across cabinet cost weights and reconcile cents. */
export function allocateQuotedTotal(
  weights: Record<string, number>,
  quotedTotal: number,
): Record<string, number> {
  const entries = Object.entries(weights).filter(([, value]) => Number.isFinite(value) && value > 0);
  const weightTotal = entries.reduce((sum, [, value]) => sum + value, 0);
  if (entries.length === 0 || weightTotal <= 0 || quotedTotal <= 0) return {};

  const targetCents = Math.round(quotedTotal * 100);
  let allocatedCents = 0;

  return entries.reduce<Record<string, number>>((result, [id, weight], index) => {
    const cents = index === entries.length - 1
      ? targetCents - allocatedCents
      : Math.round(targetCents * (weight / weightTotal));
    allocatedCents += cents;
    result[id] = roundMoney(cents / 100);
    return result;
  }, {});
}
