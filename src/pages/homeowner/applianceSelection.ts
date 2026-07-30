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

/** Match a compiled `PlacedItem` to a chosen appliance category (or null).
 *  Driven by the explicit `layoutRole` compileSpec stamps on every item — we
 *  never reverse-engineer intent from the definitionId SKU string. */
function itemCategory(item: PlacedItem): ApplianceCategory | null {
  if (item.itemType !== 'Appliance') return null;
  switch (item.layoutRole) {
    case 'dishwasher': return 'dishwasher';
    case 'fridge-gap': return 'fridge';
    case 'rangehood': return 'rangehood';
    default: return null;
  }
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
    // The supplier elevation, so the 3D preview shows the customer's actual
    // appliance rather than a correctly-sized grey box. Dimension and mounting
    // drawings are screened out at the renderer — see applianceImage.ts.
    imageUrl: p.image_url ?? null,
    bowlCount: p.bowl_count ?? null,
    bowlSizes: p.bowl_sizes ?? null,
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

/* ── Matching the catalog to the "How you cook" answers ────────────────────
 *
 * The Appliances step showed the whole catalog regardless of what the customer
 * had just told us: a dishwasher offered to someone who said they didn't want
 * one, a 900 mm oven to someone who chose 600, both gas and induction cooktops
 * to someone who had already picked. The answers were sitting in wizard state
 * and simply never reached the step.
 *
 * Filtering is deliberately conservative. If a filter would empty a category
 * we show that category unfiltered instead — a customer who can't see any sink
 * is worse off than one who sees a slightly wider choice. Callers surface a
 * "show everything" escape hatch on top of this.
 */

export interface CookingAnswers {
  oven?: '600' | '900';
  cooktop?: 'gas' | 'induction';
  dishwasher?: boolean;
  fridgeWidthMm?: number;
}

/** Categories the customer has ruled out entirely on the Cooking step. */
export function excludedCategories(answers: CookingAnswers | undefined): ApplianceCategory[] {
  if (!answers) return [];
  const out: ApplianceCategory[] = [];
  // An explicit "no dishwasher" is an answer, not an absence of one.
  if (answers.dishwasher === false) out.push('dishwasher');
  return out;
}

function matchesCooking(
  p: ApplianceProductRecord,
  cat: ApplianceCategory,
  answers: CookingAnswers,
): boolean {
  const hay = `${p.subcategory ?? ''} ${p.name ?? ''} ${p.description ?? ''}`.toLowerCase();
  if (cat === 'cooktop' && answers.cooktop) {
    // Induction and electric-ceramic both satisfy "induction" loosely; gas is
    // gas. Anything that names neither stays in — it might be a dual fuel.
    const isGas = /\bgas\b/.test(hay);
    const isInduction = /induction|ceramic|electric/.test(hay);
    if (!isGas && !isInduction) return true;
    return answers.cooktop === 'gas' ? isGas : isInduction;
  }
  if (cat === 'oven' && answers.oven) {
    const wanted = Number(answers.oven);
    if (!p.width_mm) return true;             // dimensionless rows stay
    return Math.abs(p.width_mm - wanted) <= 60;
  }
  return true;
}

/**
 * Narrow each category to the products that match the Cooking answers, and
 * drop categories the customer ruled out. Never returns an empty category that
 * had products before filtering.
 */
export function filterCatalogToCooking(
  grouped: Record<ApplianceCategory, ApplianceProductRecord[]>,
  answers: CookingAnswers | undefined,
): { filtered: Record<ApplianceCategory, ApplianceProductRecord[]>; hiddenCount: number } {
  if (!answers) return { filtered: grouped, hiddenCount: 0 };
  const excluded = new Set(excludedCategories(answers));
  const filtered = {} as Record<ApplianceCategory, ApplianceProductRecord[]>;
  let hiddenCount = 0;

  for (const cat of APPLIANCE_CATEGORY_ORDER) {
    const all = grouped[cat] ?? [];
    if (excluded.has(cat)) {
      hiddenCount += all.length;
      filtered[cat] = [];
      continue;
    }
    const keep = all.filter(p => matchesCooking(p, cat, answers));
    // An over-strict filter that empties a category is worse than no filter.
    if (keep.length === 0) {
      filtered[cat] = all;
      continue;
    }
    hiddenCount += all.length - keep.length;
    filtered[cat] = keep;
  }
  return { filtered, hiddenCount };
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

/** How far a dropped-in cooktop's glass stands above the stone (mm). */
const COOKTOP_PROUD_MM = 4;

/**
 * Roles the engine exposes that we can hang a chosen product on, in the order
 * they are placed. `fallbackRole` is used when the primary role is absent:
 *
 *  - Oven: prefers the tall oven tower. With no tower it drops under the bench
 *    beside/below the cooktop, which is the convention the trade planner
 *    already uses for an under-bench oven (base-at-`y`, sitting on the cabinet
 *    floor above the kick) — no second convention is invented here.
 *  - Microwave: only ever placed IN a tower. With no tower it is deliberately
 *    NOT drawn — see `undrawnApplianceCategories` — because guessing a spot on
 *    the bench is worse than telling the customer we'll confirm placement.
 */
const OVERLAY_SLOTS = [
  { category: 'sink' as const, role: 'sink' as const, fallbackRole: null },
  { category: 'cooktop' as const, role: 'cooktop' as const, fallbackRole: null },
  { category: 'oven' as const, role: 'oven-tower' as const, fallbackRole: 'cooktop' as const },
  { category: 'microwave' as const, role: 'oven-tower' as const, fallbackRole: null },
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
    const host = compiled.rolePositions[slot.role]
      ?? (slot.fallbackRole ? compiled.rolePositions[slot.fallbackRole] : undefined);
    if (!host) continue;
    const inTower = !!compiled.rolePositions[slot.role];

    const cab = host.item;
    // There is no benchtop-height constant in this codebase; it is always
    // derived. With the wizard's defaults this is 730 + 33 = 763 mm.
    const benchtopTopMm = cab.y + cab.height + dims.benchtopThickness;

    // Fall back to the host cabinet's footprint when the product row has no
    // dimensions (some sink and tap rows are dimensionless). Ovens and
    // microwaves get sensible appliance-sized defaults so the procedural
    // fallback still draws something the right shape when a row is bare.
    const defaultHeight = slot.category === 'oven' ? 595 : slot.category === 'microwave' ? 455 : 200;
    const width = product.width_mm ?? Math.min(cab.width, 600);
    const depth = product.depth_mm ?? Math.min(cab.depth, 500);
    const height = product.height_mm ?? defaultHeight;

    let y: number;
    if (slot.category === 'sink') {
      // Undermount: `y` is the item's CENTRE for benchtop-inset appliances
      // (see applianceClassification.ts), so put the top of the bowl flush
      // with the benchtop and let the rest hang below it.
      y = benchtopTopMm - height / 2;
    } else if (slot.category === 'cooktop') {
      // A cooktop drops INTO a cut-out: only the glass edge stands proud of the
      // stone and the body hangs below, inside the cabinet. This used to read
      // `benchtopTopMm + height / 2`, which put the item's centre at the stone
      // and so lifted the entire appliance above it — a 60 mm paver sitting on
      // the bench. The comment already said "just proud of the stone"; the
      // arithmetic disagreed with it.
      //
      // Same centre convention as the sink, so the top lands at
      // benchtop + COOKTOP_PROUD_MM.
      y = benchtopTopMm + COOKTOP_PROUD_MM - height / 2;
    } else if (slot.category === 'microwave') {
      // Tower only (no fallback role), stacked above the oven aperture.
      y = Math.max(0, cab.y + 1500);
    } else if (inTower) {
      // Oven in its tall tower: standard base-at-`y` convention.
      y = Math.max(0, cab.y + 300);
    } else {
      // Under-bench oven beneath the cooktop run: base-at-`y`, sitting on the
      // cabinet floor just above the kick, and never poking through the stone.
      y = Math.max(0, Math.min(cab.y + 100, benchtopTopMm - dims.benchtopThickness - height));
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

/** A chosen category counts as "not shown" when neither an engine-placed slot
 *  nor a synthesised overlay carries that product. The customer is told about
 *  these in the build notes rather than being shown a wrong placement. */
export function undrawnApplianceCategories(
  chosen: Record<string, string>,
  products: ApplianceProductRecord[] | undefined,
  drawnItems: PlacedItem[],
): ApplianceCategory[] {
  if (!chosen || !products?.length) return [];
  const byId = new Map(products.map(p => [p.id, p]));
  const drawn = new Set(
    drawnItems
      .filter(it => !!it.applianceProductId)
      .map(it => it.applianceProductId as string),
  );
  const out: ApplianceCategory[] = [];
  for (const cat of APPLIANCE_CATEGORY_ORDER) {
    // The tap has no item of its own — it rides on the sink — so it is
    // "drawn" whenever the sink overlay exists.
    if (cat === 'tap') continue;
    const id = chosen[cat];
    if (!id || !byId.has(id)) continue;
    if (!drawn.has(id)) out.push(cat);
  }
  return out;
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
