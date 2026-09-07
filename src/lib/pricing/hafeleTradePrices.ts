import { fetchAllPricingRows } from '@/lib/pricing/fetchAllPricingRows';

/**
 * Häfele price book — the single source of hardware COST.
 *
 * `hafele_trade_prices` holds one row per Häfele article number, captured from
 * Bower's trade login: the published RRP and Bower's own buy price, both
 * excluding GST. `hardware_pricing` remains the catalogue of what can be
 * selected; where one of its rows has no usable cost, the buy price here is
 * used instead so a cabinet is never priced on a hardcoded guess.
 *
 * Article numbers appear in two shapes — dotted on our catalogue rows
 * ("155.02.201") and plain on Häfele's own pages ("15502201") — so every
 * lookup is keyed on both.
 */
export interface HafeleTradePrice {
  article_code: string;
  name: string | null;
  variant_label: string | null;
  product_type: string | null;
  rrp_ex_gst: number | null;
  trade_cost_ex_gst: number | null;
}

export type HafeleTradePriceIndex = Map<string, HafeleTradePrice>;

/** Both the dotted and undotted form of an article number. */
export function articleKeys(code: string | null | undefined): string[] {
  const raw = String(code ?? '').trim();
  if (!raw) return [];
  const digits = raw.replace(/\D/g, '');
  const keys = new Set<string>([raw, raw.toUpperCase()]);
  if (digits.length === 8) {
    keys.add(digits);
    keys.add(`${digits.slice(0, 3)}.${digits.slice(3, 5)}.${digits.slice(5)}`);
  }
  return [...keys];
}

export async function fetchHafeleTradePrices(): Promise<HafeleTradePriceIndex> {
  const index: HafeleTradePriceIndex = new Map();
  let rows: HafeleTradePrice[] = [];
  try {
    rows = await fetchAllPricingRows<HafeleTradePrice>('hafele_trade_prices');
  } catch {
    // The price book is a fallback, never a hard dependency: if it cannot be
    // read (offline, or the table not yet deployed), pricing carries on with
    // whatever hardware_pricing provides.
    return index;
  }
  for (const row of rows) {
    for (const key of articleKeys(row.article_code)) {
      if (!index.has(key)) index.set(key, row);
    }
  }
  return index;
}

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Fill in the cost of any hardware row that has none, from the price book.
 * Rows that already carry a cost are left exactly as they are — the catalogue
 * still wins when it has a real number.
 */
export function applyHafeleTradeCost<T extends { item_code?: string | null; unit_cost?: number | null }>(
  hardware: T[],
  index: HafeleTradePriceIndex,
): T[] {
  if (index.size === 0) return hardware;
  return hardware.map((row) => {
    if (positive(row.unit_cost)) return row;
    for (const key of articleKeys(row.item_code)) {
      const match = index.get(key);
      if (match && positive(match.trade_cost_ex_gst)) {
        return { ...row, unit_cost: match.trade_cost_ex_gst };
      }
    }
    return row;
  });
}
