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
import type { GlobalDimensions, PlacedItem } from '@/types';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import type { CompiledDesign } from '@/lib/layout';
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

/* ── Overlay synthesis ─────────────────────────────────────────────────────
 *
 * `enrichItemsWithChosenAppliances` above can only stamp a product onto a slot
 * the engine already places as its own item — dishwashers, fridges,
 * rangehoods. Sinks, cooktops and ovens are *inside* cabinets: the engine
 * emits a `base_2_door` for the cooktop and a sink cabinet for the sink, both
 * as `itemType: 'Cabinet'`, and only `itemType === 'Appliance'` routes to the
 * appliance renderers. So a customer who chose a sink and a cooktop saw
 * neither of them — the whole point of the Appliances step.
 *
 * These overlays are separate items laid on top of the compiled design:
 *
 *  - They are synthesised AFTER `compileSpec`, and both pricing paths read
 *    `compiled.items`, so they never add a phantom cabinet charge. If anyone
 *    ever moves this inside `compileSpec`, give `appliance:` ids a 0 weight in
 *    `DEFN_WEIGHTS` or every overlay silently bills another $480.
 *  - Their `instanceId` uses an `appl-` prefix, not `ai-`. `rules.ts` detects
 *    islands via `instanceId.startsWith('ai-')` plus rotation and a z-band; an
 *    overlay picking up that prefix would be mistaken for island cabinetry.
 *  - Their `y` is non-zero, and the rules engine only inspects `y === 0` items
 *    for overlap and aisle widths. That is what lets a sink sit inside a
 *    cabinet's footprint without tripping a hard rule and blocking the design.
 */

/** Roles the engine exposes that we can hang a chosen product on. */
const OVERLAY_SLOTS = [
  { category: 'sink' as const, role: 'sink' as const },
  { category: 'cooktop' as const, role: 'cooktop' as const },
  { category: 'oven' as const, role: 'oven-tower' as const },
];

/** Map a tap product's finish to one of the built-in TAP_OPTIONS ids. */
export function tapOptionIdForFinish(finish: string | null | undefined): string | undefined {
  const f = (finish ?? '').toLowerCase();
  if (!f) return undefined;
  if (f.includes('chrome') || f.includes('polished')) return 'tap-chrome';
  if (f.includes('black')) return 'tap-goose-bk';
  if (f.includes('gunmetal') || f.includes('brushed') || f.includes('stainless')) return 'tap-goose-ss';
  return undefined;
}

/**
 * Build the appliance items that sit on or in the benchtop for the customer's
 * chosen products. Returns `[]` when nothing applies — no chosen products, no
 * catalog, or the engine placed no matching slot.
 *
 * Append the result to `compiled.items` for rendering, AR export and the
 * enquiry payload. Do not feed it back into the rules engine or pricing.
 */
export function synthesiseApplianceOverlays(
  compiled: Pick<CompiledDesign, 'rolePositions'> | null | undefined,
  chosen: Record<string, string>,
  products: ApplianceProductRecord[] | undefined,
  dims: GlobalDimensions = DEFAULT_GLOBAL_DIMENSIONS,
): PlacedItem[] {
  if (!compiled?.rolePositions || !chosen || !products?.length) return [];
  const byId = new Map(products.map(p => [p.id, p]));
  const out: PlacedItem[] = [];

  // The tap has no item of its own — the gooseneck is drawn inside
  // ApplianceMesh's sink branch — so the chosen tap rides on the sink item.
  const tapProduct = chosen.tap ? byId.get(chosen.tap) : undefined;
  const tapId = tapOptionIdForFinish(tapProduct?.finish);

  for (const slot of OVERLAY_SLOTS) {
    const productId = chosen[slot.category];
    if (!productId) continue;
    const product = byId.get(productId);
    if (!product) continue;
    const host = compiled.rolePositions[slot.role];
    if (!host) continue;

    const cab = host.item;
    // There is no benchtop-height constant in this codebase; it is always
    // derived. With the wizard's defaults this is 730 + 33 = 763 mm.
    const benchtopTopMm = cab.y + cab.height + dims.benchtopThickness;

    // Fall back to the host cabinet's footprint when the product row has no
    // dimensions (some sink and tap rows are dimensionless).
    const width = product.width_mm ?? Math.min(cab.width, 600);
    const depth = product.depth_mm ?? Math.min(cab.depth, 500);
    const height = product.height_mm ?? 200;

    let y: number;
    if (slot.category === 'sink') {
      // Undermount: `y` is the item's CENTRE for benchtop-inset appliances
      // (see applianceClassification.ts), so put the top of the bowl flush
      // with the benchtop and let the rest hang below it.
      y = benchtopTopMm - height / 2;
    } else if (slot.category === 'cooktop') {
      // Sits on the benchtop, glass just proud of the stone.
      y = benchtopTopMm + height / 2;
    } else {
      // Ovens use the standard base-at-`y` convention inside their tower.
      y = Math.max(0, cab.y + 300);
    }

    out.push({
      instanceId: `appl-${slot.category}`,
      // Must resolve in useCatalog or the procedural renderer draws nothing.
      // `appliance:<uuid>` is the catalog key for an appliance_products row.
      definitionId: `appliance:${product.id}`,
      itemType: 'Appliance',
      x: cab.x,
      y,
      z: cab.z,
      rotation: cab.rotation,
      width,
      height,
      depth,
      applianceProductId: product.id,
      applianceSnapshot: snapshotFromProduct(product),
      supplyWithOrder: true,
      ...(slot.category === 'sink' && tapId ? { tapId } : {}),
    } as PlacedItem);
  }

  return out;
}

/** True for items produced by `synthesiseApplianceOverlays`. */
export function isSynthesisedAppliance(item: PlacedItem): boolean {
  return item.instanceId.startsWith('appl-');
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
