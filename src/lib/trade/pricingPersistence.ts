import type { QuoteSnapshot } from '@/types/trade';

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
  return {
    quoteSnapshot: snapshot,
    quoteSnapshotsByRoom: {
      ...(existing.quoteSnapshotsByRoom ?? {}),
      [snapshot.roomId]: snapshot,
    },
    jobTotals: {
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
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
