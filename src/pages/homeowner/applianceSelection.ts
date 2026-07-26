/**
 * Wizard-side helpers for the homeowner appliance catalog (Stage 3).
 *
 * The wizard keeps a simple map of chosen appliance product IDs by category
 * (`sink`, `tap`, `dishwasher`, `oven`, `cooktop`, `rangehood`, `fridge`,
 * `microwave`). Two things need to happen with that map:
 *
 *  1. Compiled layout items get enriched with an `applianceProductId` +
 *     `applianceSnapshot` so the planner's real 3D/GLB path renders the
 *     customer's actual product (this only fires for appliances the engine
 *     places as visible items — dishwashers, fridges, rangehoods).
 *  2. A quote-ready appliance line list is derived from the SAME map, so
 *     appliances that don't correspond to a visible item (sinks, taps,
 *     ovens/cooktops/microwaves buried inside cabinets) still price
 *     correctly in the customer's estimate.
 *
 * This is purely additive — a wizard state with no chosen appliances yields
 * an empty enrichment (items unchanged) and an empty line-item list.
 */
import type { PlacedItem } from '@/types';
import type {
  ApplianceLineItem,
  ApplianceProductRecord,
} from '@/lib/pricing/types';

/** Category keys used by the wizard's chosen-appliance map. */
export const APPLIANCE_CATEGORY_ORDER = [
  'sink',
  'tap',
  'dishwasher',
  'oven',
  'cooktop',
  'rangehood',
  'fridge',
  'microwave',
] as const;

export type ApplianceCategory = (typeof APPLIANCE_CATEGORY_ORDER)[number];

/** Plain-English headings shown to customers on the wizard step. */
export const APPLIANCE_CATEGORY_LABELS: Record<ApplianceCategory, { plural: string; singular: string }> = {
  sink: { plural: 'Sinks', singular: 'sink' },
  tap: { plural: 'Taps', singular: 'tap' },
  dishwasher: { plural: 'Dishwashers', singular: 'dishwasher' },
  oven: { plural: 'Ovens', singular: 'oven' },
  cooktop: { plural: 'Cooktops', singular: 'cooktop' },
  rangehood: { plural: 'Rangehoods', singular: 'rangehood' },
  fridge: { plural: 'Fridges', singular: 'fridge' },
  microwave: { plural: 'Microwaves', singular: 'microwave' },
};

/**
 * Normalise a product's category string to one of the wizard's category
 * keys. The seed data uses lowercase singulars already; this guards against
 * variants like "Dishwashers", "range hood", etc.
 */
export function normaliseApplianceCategory(raw: string | null | undefined): ApplianceCategory | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (s.startsWith('sink')) return 'sink';
  if (s.startsWith('tap') || s.startsWith('mixer') || s.startsWith('faucet')) return 'tap';
  if (s.startsWith('dishwasher')) return 'dishwasher';
  if (s.startsWith('oven')) return 'oven';
  if (s.startsWith('cooktop') || s.startsWith('hob')) return 'cooktop';
  if (s.startsWith('rangehood') || s.startsWith('hood')) return 'rangehood';
  if (s.startsWith('fridge') || s.startsWith('refrigerator')) return 'fridge';
  if (s.startsWith('microwave')) return 'microwave';
  return null;
}

/** Best display price for a customer-facing card. */
export function applianceDisplayPrice(p: ApplianceProductRecord): number {
  return Number(p.installed_price ?? p.sell_price ?? p.rrp ?? 0) || 0;
}

/** Group active products by wizard category, dropping ones with no category. */
export function groupAppliancesByCategory(
  products: ApplianceProductRecord[] | undefined,
): Record<ApplianceCategory, ApplianceProductRecord[]> {
  const out: Record<ApplianceCategory, ApplianceProductRecord[]> = {
    sink: [], tap: [], dishwasher: [], oven: [],
    cooktop: [], rangehood: [], fridge: [], microwave: [],
  };
  for (const p of products ?? []) {
    const key = normaliseApplianceCategory(p.category);
    if (!key) continue;
    out[key].push(p);
  }
  return out;
}

/** Match a compiled `PlacedItem` to a chosen appliance category (or null). */
function itemCategory(item: PlacedItem): ApplianceCategory | null {
  if (item.itemType !== 'Appliance') return null;
  const id = (item.definitionId || '').toLowerCase();
  if (id.includes('dishwasher')) return 'dishwasher';
  if (id.includes('fridge')) return 'fridge';
  if (id.includes('rangehood') || id.includes('hood')) return 'rangehood';
  // Cooktops are rendered as base cabinets by the wizard engine, not standalone
  // appliance items — ovens/microwaves likewise. No attempt to match here; they
  // still price via the line-item list below.
  return null;
}

/** Build a snapshot from a catalog row (mirrors the trade planner's shape). */
export function snapshotFromProduct(p: ApplianceProductRecord): NonNullable<PlacedItem['applianceSnapshot']> {
  return {
    itemCode: p.item_code ?? null,
    name: p.brand ? `${p.brand} ${p.name}` : p.name,
    category: p.category,
    unitPrice: applianceDisplayPrice(p),
    isPlaceholderPrice: !!p.price_is_placeholder,
    modelUrl: p.model_url ?? null,
    modelIosUrl: p.model_ios_url ?? null,
    finish: p.finish ?? null,
  };
}

/**
 * Return a new items array with visible catalog appliances stamped onto the
 * matching engine-placed slots. Only touches items whose category we can
 * render (dishwasher / fridge / rangehood).
 */
export function enrichItemsWithChosenAppliances(
  items: PlacedItem[],
  chosen: Record<string, string>,
  products: ApplianceProductRecord[] | undefined,
): PlacedItem[] {
  if (!chosen || !products?.length) return items;
  const byId = new Map(products.map(p => [p.id, p]));
  // For each visible category, find the chosen product row.
  const chosenByCat: Partial<Record<ApplianceCategory, ApplianceProductRecord>> = {};
  for (const cat of ['dishwasher', 'fridge', 'rangehood'] as const) {
    const id = chosen[cat];
    if (id && byId.has(id)) chosenByCat[cat] = byId.get(id)!;
  }
  if (Object.keys(chosenByCat).length === 0) return items;
  // One snapshot per category — same product placed once. If the engine happens
  // to place two slots of the same category (e.g. two rangehoods, unusual),
  // both get the same snapshot; that's the user's chosen product either way.
  return items.map(it => {
    const cat = itemCategory(it);
    if (!cat) return it;
    const product = chosenByCat[cat];
    if (!product) return it;
    return {
      ...it,
      applianceProductId: product.id,
      applianceSnapshot: snapshotFromProduct(product),
      supplyWithOrder: it.supplyWithOrder ?? true,
    };
  });
}

/**
 * Build ApplianceLineItem[] directly from the chosen map — independent of
 * whether the item was placed. This is what feeds the customer's estimate
 * appliance section and the enquiry payload.
 */
export function buildApplianceLineItems(
  chosen: Record<string, string>,
  products: ApplianceProductRecord[] | undefined,
): ApplianceLineItem[] {
  if (!chosen || !products?.length) return [];
  const byId = new Map(products.map(p => [p.id, p]));
  const out: ApplianceLineItem[] = [];
  for (const cat of APPLIANCE_CATEGORY_ORDER) {
    const id = chosen[cat];
    if (!id) continue;
    const p = byId.get(id);
    if (!p) continue;
    const unitPrice = applianceDisplayPrice(p);
    // Even placeholder-priced items go into the list — the customer sees them
    // with an "indicative" note. Zero-priced items still list, so the client
    // has a record of what they picked (line total 0 is fine).
    out.push({
      productId: p.id,
      itemCode: p.item_code ?? null,
      name: p.brand ? `${p.brand} ${p.name}` : p.name,
      category: p.category,
      quantity: 1,
      unitPrice,
      lineTotal: unitPrice,
      isPlaceholderPrice: !!p.price_is_placeholder,
    });
  }
  return out;
}

export function appliancesTotal(items: ApplianceLineItem[]): number {
  return items.reduce((s, l) => s + l.lineTotal, 0);
}

export function anyPlaceholderPrices(items: ApplianceLineItem[]): boolean {
  return items.some(l => l.isPlaceholderPrice);
}
