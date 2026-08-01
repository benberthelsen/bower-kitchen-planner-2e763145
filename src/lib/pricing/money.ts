export interface PricingTotalsLike {
  subtotal?: number;
  tax?: number;
  total?: number;
}

export interface NormalizedPricingTotals {
  subtotal: number;
  tax: number;
  total: number;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Reconcile legacy or partial persisted totals to an exact cent contract.
 * An existing total is authoritative because it is the approved customer
 * amount; subtotal is the second preference and GST becomes the balancing
 * amount when older rows disagree by rounding or stale writes.
 */
export function normalizePricingTotals(
  input?: PricingTotalsLike | null,
  gstPct = 0.1,
): NormalizedPricingTotals {
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  const source = input ?? {};

  if (finite(source.total)) {
    const total = roundMoney(Math.max(0, source.total));
    if (finite(source.subtotal)) {
      const subtotal = roundMoney(Math.min(total, Math.max(0, source.subtotal)));
      return { subtotal, tax: roundMoney(total - subtotal), total };
    }
    if (finite(source.tax)) {
      const tax = roundMoney(Math.min(total, Math.max(0, source.tax)));
      return { subtotal: roundMoney(total - tax), tax, total };
    }
    const subtotal = roundMoney(total / (1 + Math.max(0, gstPct)));
    return { subtotal, tax: roundMoney(total - subtotal), total };
  }

  if (finite(source.subtotal)) {
    const subtotal = roundMoney(Math.max(0, source.subtotal));
    const tax = finite(source.tax)
      ? roundMoney(Math.max(0, source.tax))
      : roundMoney(subtotal * Math.max(0, gstPct));
    return { subtotal, tax, total: roundMoney(subtotal + tax) };
  }

  if (finite(source.tax) && gstPct > 0) {
    const tax = roundMoney(Math.max(0, source.tax));
    const subtotal = roundMoney(tax / gstPct);
    return { subtotal, tax, total: roundMoney(subtotal + tax) };
  }

  return { subtotal: 0, tax: 0, total: 0 };
}
