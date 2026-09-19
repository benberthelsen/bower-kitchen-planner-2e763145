/**
 * Price a cabinet schedule and shape the result for Build Flow.
 *
 * This is the ONE place a Microvellum-style schedule (what cabinets, what
 * sizes, which room) becomes priced quote lines. The CLI
 * (scripts/price-kitchen.mjs) and the `price-quote` edge function both call
 * it, so Build Flow prices with the real engine and the live catalogue rather
 * than a copy of either. Pure: no I/O, no Supabase — callers fetch the
 * catalogue and pass it in.
 *
 * Output lines carry Build Flow's QuoteItem field names so the result drops
 * straight through its existing import path.
 */
import { generateQuoteBOM } from './bomGenerator';
import type { PricingData } from './types';
import { isRobeDoorProduct } from './cabinetPartMapping';
import type { PlacedItem, GlobalDimensions, HardwareOptions } from '@/types';
import { calculateWorkshopCost, type SupplyMode, type WorkshopCost, type WorkshopLine } from './workshopModel';
import {
  priceRobeOpenings,
  type RobeBlockedRow,
  type RobeSpec,
  type RobeSpecNormalised,
} from './robeSliderDoors';
import type { SliderScGeometry } from './robeGeometry';
import {
  priceLaminatedBenchtops,
  type BenchtopCutouts,
  type BenchtopKind,
  type BenchtopPiece,
  type LaminatedBenchtopSheet,
} from './benchtopLaminate';

export interface ScheduleItem {
  /** Microvellum product name, e.g. "Base 3 Drawer". Drives the part mapping. */
  name: string;
  qty?: number;
  w: number;
  h: number;
  d: number;
  room?: string | null;
  /** Source quote's sell figure, when known — passes through for items the cabinet engine does not price (stone). */
  mv_total?: number;
  /** Optional per-line material overrides. */
  carcaseMaterialId?: string;
  exteriorMaterialId?: string;
  edgeId?: string;

  // ---- laminated benchtop rows (name matches /countertop|benchtop/i) --------
  // A benchtop row is ENGINE-PRICED only when it resolves to a priced sheet
  // (this field, else selections.benchtopMaterialId). Without one it passes
  // through at mv_total exactly as before.
  /** material_pricing.id or item_code of the SHEET the top is laminated from, e.g. 'MEGM12HACS3607'. */
  benchtopMaterialId?: string;
  /**
   * 'blank' = a PRE-MADE laminate benchtop blank (EGGER 38 mm worktop): whole
   * blanks as bought, one layer, cut to length, cut ends edged, no solid-surface
   * lamination / polishing / glued joins. 'laminated' = fabricated solid surface
   * (today's pricing). Omitted: inferred from the catalogue row - see
   * isBenchtopBlankSheet in benchtopLaminate.ts, which Build Flow mirrors.
   */
  benchtopKind?: BenchtopKind;
  /** Finished thickness, mm. Default selections.benchtopThickness ?? dimensions.benchtopThickness ?? 24. A blank is always its own thickness. */
  benchtopThickness?: number;
  /** Blanks only: exposed CUT ends per unit that need an edging strip. Default one per piece, warned. */
  benchtopExposedEnds?: number;
  /** Blank sizes per unit, mm, when w x d is not the top (L-shape arms, waterfall legs). Default [{ l: w, w: d }]. */
  benchtopPieces?: BenchtopPiece[];
  /** Each end adds a leg { l: h - thickness, w: d } and one join — only when benchtopPieces is absent. */
  benchtopWaterfallEnds?: number;
  /** Mitres / field joins per unit. Joins forced by stock size are added automatically. */
  benchtopJoins?: number;
  /** Cut-out counts per unit. */
  benchtopCutouts?: BenchtopCutouts;

  // ---- Hafele Slider SC robe openings ---------------------------------------
  /**
   * A row WITH this block is priced by the robe module (robeSliderDoors.ts) whatever its name. A robe-named row
   * WITHOUT it keeps the guard: carried at mv_total with a ROBE NOT PRICED warning. Contract: docs/PRICING_ENGINE.md.
   */
  robe?: RobeSpec;
}

export interface QuoteSelections {
  carcaseMaterialId: string;
  exteriorMaterialId: string;
  edgeId: string;
  hingeType: string;
  drawerType: string;
  handleId?: string;
  cabinetTop?: 'rail' | 'top';
  adjustableLegs?: boolean;
  /** Default sheet for benchtop rows that carry no benchtopMaterialId of their own. */
  benchtopMaterialId?: string;
  /** Default finished thickness (mm) for benchtop rows. */
  benchtopThickness?: number;
}

/** One engine-priced laminated benchtop row — the working behind its PricedLine. */
export interface PricedBenchtop {
  /** Position in the input schedule. */
  index: number;
  name: string;
  sheet: LaminatedBenchtopSheet;
  /** 'blank' = pre-made laminate blank bought whole; 'laminated' = fabricated solid surface. */
  kind: BenchtopKind;
  /** Whole blanks bought for every row sharing this blank. Only when kind is 'blank'. */
  blanks?: number;
  /** Blanks only: crosscuts to length, and exposed cut ends that get an edging strip. */
  cuts: number;
  exposedEnds: number;
  layers: number;
  /** layers x sheet.thickness, mm. */
  nominalThickness: number;
  /** Requested finished thickness, mm. */
  thickness: number;
  pieces: BenchtopPiece[];
  areaSqm: number;
  edgeLm: number;
  benchtopLm: number;
  /** Declared mitres/field joins + joins forced by stock size (stockJoins), x layers for the latter. */
  joins: number;
  stockJoins: number;
  cutouts: { sink: number; cooktop: number; tapHole: number };
  /** Fractional share of jobSheets attributed to this row. */
  sheetsShare: number;
  /** Whole sheets bought for every benchtop row sharing this sheet. */
  jobSheets: number;
  /** Sheet share + adhesive — what the line's materialCost carries. */
  materialCost: number;
  sheetCost: number;
  adhesiveCartridges: number;
  adhesiveCost: number;
  /** Row share of the benchtop shop stations (install is in the job install line). */
  laborCost: number;
  /** Shop minutes for this row alone. */
  laborMinutes: number;
  installMinutes: number;
  costPrice: number;
  /** Sell ex GST after uplift. */
  total: number;
  warnings: string[];
}

export interface QuoteCommercial {
  /** Fraction, e.g. 0.40. From client_markup_settings — never a hardcoded guess. */
  markupPct: number;
  overheadPct?: number;
  supplyMode?: SupplyMode;
  /** Names where the markup came from, printed in the summary. */
  markupSource: string;
  /** Per-job drafting / CNC minimums. Default true (a whole quote); send false when pricing one room on its own. */
  jobMinimums?: boolean;
}

export interface PricedLine {
  description: string;
  quantity: number;
  unit: 'ea';
  unitPrice: number;
  total: number;
  costPrice: number;
  materialCost: number;
  laborCost: number;
  marginPercent: number;
  category: 'cabinetry' | 'general';
  roomName: string | null;
  /** 'bower' = priced by the engine; 'passthrough' = carried from the source quote (stone, buyouts). */
  source: 'bower' | 'passthrough';
  /**
   * Present (true) only on a line BowerOS did not price at all - today a robe opening / sliding robe door, carried
   * at the row's mv_total. When that total is 0 (a Build Flow work-order line has no price) the line is on the
   * quote at $0.00: a caller applying lines should confirm those exactly like the rows it did not send.
   */
  unpriced?: true;
}

/**
 * One Hafele Slider SC robe opening row priced by BowerOS - the working behind its PricedLine (one line per row;
 * quantity = openings). Install is NOT in `total`: like every product it is billed at cost on the job's
 * "Installation — onsite" line; `minutes.install` says how much of that line is this row.
 */
export interface PricedRobeOpening {
  /** Position in the input schedule. */
  index: number;
  name: string;
  room: string;
  /** identical openings on this row */
  qty: number;
  spec: RobeSpecNormalised;
  geometry: {
    icw: number;
    ih: number;
    /** Hafele DW - the FINISHED infill panel width */
    doorWidth: number;
    doorHeight: number;
    /** finished leaf: panel + vertical profiles */
    leafWidth: number;
    closureError: number;
    trackCut: number;
    verticalProfileCut: number;
    horizontalProfileCut: number;
    /**
     * Saw size of one infill panel. A board panel is edged on all four sides, so it is cut one edge thickness in
     * from each side (cut = finished - 2 x edge); a mirror panel is cut at its finished size.
     */
    panelCut: { w: number; h: number };
    /** Finished infill panel, what the profile channel holds: doorWidth x doorHeight. */
    panelFinished: { w: number; h: number };
    kitLength: number;
    profileAllowance: number;
    softCloseSetback: number;
    tracks: SliderScGeometry['tracks'];
    /** per opening */
    verticalProfiles: number;
    horizontalProfiles: number;
  };
  kit: {
    item_code: string;
    name: string;
    /** per kit, ex GST */
    price: number;
    unconfirmed: boolean;
    priceSource: 'hafele_capture' | 'catalogue_unconfirmed';
    priceBasis: string;
    quantity: number;
    cost: number;
  };
  /** material null / sheets 0 / fitOk null for a mirror opening */
  boards: {
    material: string | null;
    materialId: string | null;
    itemCode: string | null;
    thickness: number | null;
    sheetLength: number | null;
    sheetWidth: number | null;
    /** whole sheets bought for every robe row on this board */
    sheets: number;
    sheetsShare: number;
    fitOk: boolean | null;
    panels: number;
    cost: number;
  };
  /** metres of edge tape applied (all four sides of every board panel) */
  edgeMetres: number;
  edge: { edgeType: string; name: string; cost: number } | null;
  dampers: { inKit: number; needed: number; extra: number; priced: false };
  mirror: { required: boolean; priced: false; panels: number; panelCut: { w: number; h: number } | null };
  /** estimated kg per leaf */
  leafMassKg: number;
  /** Ben's minutes (17 Sep 2026) for this row under the supply mode */
  minutes: { setUp: number; leaves: number; install: number };
  /** this row's share of the robe shop minutes (stations + per-part + any job-minimum top-up) */
  shopMinutes: number;
  kitCost: number;
  boardCost: number;
  edgeCost: number;
  /** kit + boards + edge */
  materialCost: number;
  /** this row's share of the robe shop cost */
  laborCost: number;
  costPrice: number;
  /** sell ex GST after uplift (no install) */
  total: number;
  /** items the line needs that have no price (mirror glass, extra dampers) */
  unpricedItems: string[];
  warnings: string[];
}

/** A row with robe fields the robe module refused - carried like a guard row, reasons given. */
export interface RobeNotPriced {
  index: number;
  name: string;
  room: string;
  qty: number;
  reasons: string[];
  geometry: SliderScGeometry | null;
}

/**
 * Build Flow's `MVWorkshopCosting` shape — what its Microvellum import writes to
 * quote_mv_workshop_costing and what the schedule (time allowances), budget and
 * purchase-order views read. Emitting it from the engine means "Price with
 * BowerOS" feeds every downstream consumer the MV import does, with better
 * data: real consolidated sheets, edge metres, hardware quantities and
 * per-station minutes rather than a PDF re-read.
 */
export interface WorkshopCosting {
  sheetStock: Array<{ material: string; thickness?: number; wastePercent: number; markupPercent: number; units: number; unitCost: number; markupCost: number; cost: number }>;
  solidStock: Array<{ material: string; thickness?: number; wastePercent: number; markupPercent: number; units: number; unitCost: number; markupCost: number; cost: number }>;
  edgebanding: Array<{ color: string; width: number; thickness?: number; linearMeters: number; unitCost: number; cost: number }>;
  hardware: Array<{ code: string; description: string; quantity: number; unitCost: number; markupCost: number; cost: number; category: 'hinge' | 'runner' | 'handle' | 'screw' | 'bracket' | 'other' }>;
  labor: Array<{ category: string; hours: number; rate: number; cost: number }>;
  laborMinutes: { drafting: number; machining: number; edgebanding: number; assembly: number; finishing: number; productHandling: number; installation: number; total: number };
  fileName: string;
  projectName?: string;
  cabinetCount: number;
  roomCount: number;
  partCount: number;
  hasStone: boolean;
  hasLaminex: boolean;
  hasTwoPack: boolean;
  hasBuyout: boolean;
  buyoutItems: string[];
  sheetStockTotal: number;
  solidStockTotal: number;
  edgebandingTotal: number;
  hardwareTotal: number;
  totalMaterials: number;
  shopLaborTotal: number;
  onsiteLaborTotal: number;
  totalLabor: number;
  markupPercent: number;
  markupAmount: number;
  overheadPercent: number;
  overheadAmount: number;
  totalProjectPrice: number;
  totalProjectPriceExGst: number;
  totalCost: number;
}

export interface PricedQuote {
  /** For quote_mv_workshop_costing — schedule time allowances, budget, POs. */
  workshopCosting: WorkshopCosting;
  lines: PricedLine[];
  /** Engine-priced laminated benchtop rows. Passthrough rows are not listed here (see warnings). */
  benchtops: PricedBenchtop[];
  /** Engine-priced Hafele Slider SC robe openings (rows with robe fields). */
  robes: PricedRobeOpening[];
  /** Rows with robe fields that could not be priced (carried at mv_total), with the reasons. */
  robesNotPriced: RobeNotPriced[];
  totals: {
    cabinetCost: number;
    installCost: number;
    sellExGst: number;
    gst: number;
    sellIncGst: number;
    markupPct: number;
    markupSource: string;
    supplyMode: SupplyMode;
  };
  cost: {
    materials: number;
    edging: number;
    hardware: number;
    labor: number;
    processing: number;
  };
  workshop: { shopMinutes: number; installMinutes: number; stations: Array<{ station: string; minutes: number; cost: number }> } | null;
  warnings: string[];
}

const BENCHTOP_RE = /countertop|benchtop/i;
/** Robe warnings that say a price is missing or unconfirmed - listed before the robe rows' working. */
const ROBE_LOUD_RE = /^(ROBE NOT PRICED BY BOWEROS|POSSIBLE DOUBLE CHARGE|KIT PRICE UNCONFIRMED|MIRROR NOT PRICED|SOFT-CLOSE DAMPERS NOT PRICED):/;
const g0 = (n: number | undefined) => n ?? 0;
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const DEFAULT_DIMENSIONS: GlobalDimensions = {
  toeKickHeight: 135, shelfSetback: 5, baseHeight: 880, baseDepth: 555,
  wallHeight: 879, wallDepth: 330, tallHeight: 2400, tallDepth: 580,
  benchtopThickness: 24, benchtopOverhang: 25, splashbackHeight: 600,
  doorGap: 2, drawerGap: 2, leftGap: 1.5, rightGap: 1.5,
  topMargin: 0, bottomMargin: 0, wallGap: 10,
  boardThickness: 16, backPanelSetback: 16, topReveal: 3, sideReveal: 2, handleDrillSpacing: 32,
} as GlobalDimensions;

/**
 * The warning for a robe row carried at its source figure (see isRobeDoorProduct). Shared with
 * scripts/price-kitchen.mjs so the CLI and the price-quote function say the same thing.
 */
export function robeNotPricedWarning(
  r: Pick<ScheduleItem, 'name' | 'w' | 'h' | 'd'>, room: string, qty: number, total: number,
): string {
  const what = `ROBE NOT PRICED BY BOWEROS: "${r.name}" (${room}, qty ${qty}, ${r.w} x ${r.h} x ${r.d}) is a robe opening / sliding robe door with no robe fields, so BowerOS cannot price it. Send it as a Hafele Slider SC opening (robe fields - in Build Flow, Price with BowerOS > Robe openings) to have it priced.`;
  return total > 0
    ? `${what} It is carried at the source quote's own figure, $${total.toFixed(2)}, with no board, hinges, plates, shelf pins, edge tape, workshop or install minutes added for it - check that figure covers the door kit, panels and fitting.`
    : `${what} This row carries NO source price (mv_total missing or $0), so it is on the quote at $0.00 - price it by hand before the quote goes out.`;
}

/** The warning for a row WITH robe fields the robe module refused. Same prefix as robeNotPricedWarning. */
export function robeBlockedWarning(
  r: Pick<ScheduleItem, 'name'>, room: string, qty: number, total: number, reasons: string[],
): string {
  const what = `ROBE NOT PRICED BY BOWEROS: "${r.name}" (${room}, qty ${qty}) has Hafele Slider SC robe fields but cannot be priced: ${reasons.join('; ')}.`;
  return total > 0
    ? `${what} It is carried at the source quote's own figure, $${total.toFixed(2)}, with nothing added for it - fix the opening or check that figure.`
    : `${what} This row carries NO source price (mv_total missing or $0), so it is on the quote at $0.00 - fix the opening or price it by hand before the quote goes out.`;
}

/** A schedule row that carries the robe contract block (any object - the robe module validates it). */
export const hasRobeSpec = (r: Pick<ScheduleItem, 'robe'>): boolean => r.robe != null && typeof r.robe === 'object';

/** Microvellum leaves the first product's room blank; it belongs with the main run. */
function roomOf(item: ScheduleItem, fallback: string): string {
  const raw = String(item.room ?? '').trim();
  return !raw || /^\(?unnamed\)?$/i.test(raw) ? fallback : raw;
}

/**
 * Merge two station lists by station name (cabinet workshop + benchtop
 * workshop). Returns `a` untouched when there is nothing to merge so a
 * cabinet-only job is byte-identical.
 */
function mergeStations(a: WorkshopLine[], b: WorkshopLine[]): WorkshopLine[] {
  if (b.length === 0) return a;
  const out = a.map((l) => ({ ...l }));
  for (const l of b) {
    const hit = out.find((x) => x.station === l.station);
    if (hit) {
      hit.units += l.units;
      hit.minutes += l.minutes;
      hit.hours += l.hours;
      hit.cost += l.cost;
    } else {
      out.push({ ...l });
    }
  }
  return out;
}

export function quoteFromSchedule(
  schedule: ScheduleItem[],
  pricing: PricingData,
  selections: QuoteSelections,
  commercial: QuoteCommercial,
  opts: { dimensions?: GlobalDimensions; defaultRoom?: string } = {},
): PricedQuote {
  const dims = opts.dimensions ?? DEFAULT_DIMENSIONS;
  const defaultRoom = opts.defaultRoom ?? 'Kitchen';
  const supplyMode: SupplyMode = commercial.supplyMode ?? 'assembled_installed';
  const uplift = (1 + (commercial.overheadPct ?? 0)) * (1 + commercial.markupPct);

  // Robe openings / sliding robe doors are split off FIRST, before the cabinet / benchtop split and so before the
  // part mapping's fronts / opening / carcase rules ever see them. A row carrying robe fields is priced by the robe
  // module (robeSpecRows). A robe-NAMED row without them keeps the guard (robeRows): carried at its own mv_total with
  // a loud warning, no board, hardware, edge tape, workshop or install minutes. See isRobeDoorProduct for exactly
  // which names are caught (never by room).
  const robeSpecRows = schedule
    .map((r, index) => ({ r, index }))
    .filter(({ r }) => hasRobeSpec(r));
  const robeRows = schedule
    .map((r, index) => ({ r, index }))
    .filter(({ r }) => !hasRobeSpec(r) && isRobeDoorProduct(r.name));
  const robeIndexes = new Set([...robeSpecRows, ...robeRows].map(({ index }) => index));
  const cabinetRows = schedule.filter((r, index) => !robeIndexes.has(index) && !BENCHTOP_RE.test(r.name));
  const benchtopRows = schedule
    .map((r, index) => ({ r, index }))
    .filter(({ r, index }) => !robeIndexes.has(index) && BENCHTOP_RE.test(r.name));

  // One PlacedItem per unit so a qty-3 line prices as three cabinets.
  const items: PlacedItem[] = [];
  const originOf: number[] = [];
  cabinetRows.forEach((r, idx) => {
    const qty = Math.max(1, Math.round(r.qty ?? 1));
    for (let n = 0; n < qty; n++) {
      originOf.push(idx);
      items.push({
        instanceId: `line-${idx}-${n}`,
        definitionId: r.name,
        itemType: 'Cabinet',
        productName: r.name,
        cabinetNumber: `C${String(items.length + 1).padStart(2, '0')}`,
        x: 0, y: 0, z: 0, rotation: 0,
        width: r.w, height: r.h, depth: r.d,
        carcaseMaterialId: r.carcaseMaterialId ?? selections.carcaseMaterialId,
        exteriorMaterialId: r.exteriorMaterialId ?? selections.exteriorMaterialId,
        edgeId: r.edgeId ?? selections.edgeId,
      } as PlacedItem);
    }
  });

  const hardwareOptions = {
    hingeType: selections.hingeType,
    drawerType: selections.drawerType,
    handleId: selections.handleId,
    cabinetTop: selections.cabinetTop ?? 'rail',
    supplyHardware: true,
    // A schedule is a Microvellum job (an MV export, or quote lines imported from one). Bower's MV jobs stand on
    // Toe Kick Base ladder bases listed as their own rows, and MV lists no adjustable legs in any room - so legs
    // (and inferred kick runs) are off here unless the caller asks for them. Deciding it from a Toe Kick Base row
    // in the same request failed when Build Flow priced one room: a bathroom or robe without kick rows got legs.
    adjustableLegs: selections.adjustableLegs ?? false,
  } as unknown as HardwareOptions;

  // The whole-quote path applies the per-job drafting / CNC minimums unless told not to (a room priced on its own).
  const bom = generateQuoteBOM(items, dims, hardwareOptions, pricing, { supplyMode, jobMinimums: commercial.jobMinimums ?? true });
  const scheduleWarnings: string[] = [];
  if (!hardwareOptions.adjustableLegs && !cabinetRows.some((r) => /kick/i.test(r.name))
      && cabinetRows.some((r) => /^(base|tall|pantry|sink|corner|drawer)/i.test(r.name.trim())
        && !/panel|filler|applied|scribe|end\b|pelmet|shelf|faces?\s*only/i.test(r.name))) {
    scheduleWarnings.push('No toe kick in this schedule and no adjustable legs - no kick board or legs are priced. Add the Toe Kick Base rows, or send adjustableLegs: true for a job on legs.');
  }

  // Fold per-unit costs back onto their schedule line.
  const lineCost = new Array(cabinetRows.length).fill(0) as number[];
  const lineSplit = cabinetRows.map(() => ({ material: 0, labor: 0 }));
  bom.cabinets.forEach((c, i) => {
    const idx = originOf[i];
    lineCost[idx] += c.totalCost ?? 0;
    lineSplit[idx].material += c.subtotals.materials + c.subtotals.edging + c.subtotals.hardware;
    lineSplit[idx].labor += c.subtotals.labor + c.subtotals.handling + c.subtotals.machining + c.subtotals.assembly;
  });

  // ---- laminated benchtops --------------------------------------------------
  // Rows that resolve to a priced sheet are engine-priced: whole-sheet nest
  // across every row sharing the sheet, plus the benchtop stations through the
  // SAME workshop model as the cabinets. They run as a second workshop call
  // rather than inside generateQuoteBOM so their labour lands on the benchtop
  // lines, not spread pro-rata over the cabinets.
  const lam = priceLaminatedBenchtops(
    benchtopRows.map(({ r, index }) => ({
      index, name: r.name, qty: r.qty, w: r.w, h: r.h, d: r.d, mv_total: r.mv_total,
      benchtopMaterialId: r.benchtopMaterialId,
      benchtopKind: r.benchtopKind,
      benchtopThickness: r.benchtopThickness,
      benchtopPieces: r.benchtopPieces,
      benchtopWaterfallEnds: r.benchtopWaterfallEnds,
      benchtopJoins: r.benchtopJoins,
      benchtopExposedEnds: r.benchtopExposedEnds,
      benchtopCutouts: r.benchtopCutouts,
    })),
    pricing.materials,
    {
      defaultMaterialId: selections.benchtopMaterialId,
      defaultThickness: selections.benchtopThickness ?? dims.benchtopThickness ?? 24,
    },
  );
  const btWorkshop: WorkshopCost | null = lam.rows.length
    ? calculateWorkshopCost([], { mode: supplyMode, benchtops: lam.fabrication })
    : null;
  // Row labour = row share of the job's benchtop shop cost, weighted by what
  // the same model says each row costs on its own (linear, so shares are exact
  // up to per-line rounding; the last row takes the remainder).
  const btRowWorkshop = lam.rows.map((row) => calculateWorkshopCost([], { mode: supplyMode, benchtops: row.fabrication }));
  const btWeightTotal = btRowWorkshop.reduce((s, w) => s + w.shopCost, 0);
  const btShopCost = btWorkshop?.shopCost ?? 0;
  let btLaborAssigned = 0;
  const pricedBenchtops: PricedBenchtop[] = lam.rows.map((row, i) => {
    const isLast = i === lam.rows.length - 1;
    const share = btWeightTotal > 0 ? btRowWorkshop[i].shopCost / btWeightTotal : 1 / lam.rows.length;
    const laborCost = isLast ? money(btShopCost - btLaborAssigned) : money(btShopCost * share);
    btLaborAssigned = money(btLaborAssigned + laborCost);
    const materialCost = money(row.materialCost + row.adhesiveCost);
    const costPrice = money(materialCost + laborCost);
    return {
      index: row.index,
      name: row.name,
      sheet: row.sheet,
      kind: row.kind,
      ...(row.kind === 'blank' ? { blanks: row.blanks ?? row.jobSheets } : {}),
      cuts: row.cuts,
      exposedEnds: row.exposedEnds,
      layers: row.layers,
      nominalThickness: row.nominalThickness,
      thickness: row.thickness,
      pieces: row.pieces,
      areaSqm: row.areaSqm,
      edgeLm: row.edgeLm,
      benchtopLm: row.benchtopLm,
      joins: row.joins,
      stockJoins: row.stockJoins,
      cutouts: row.cutouts,
      sheetsShare: row.sheetsShare,
      jobSheets: row.jobSheets,
      materialCost,
      sheetCost: row.materialCost,
      adhesiveCartridges: row.adhesiveCartridges,
      adhesiveCost: row.adhesiveCost,
      laborCost,
      laborMinutes: btRowWorkshop[i].shopMinutes,
      installMinutes: btRowWorkshop[i].installMinutes,
      costPrice,
      total: money(costPrice * uplift),
      warnings: row.warnings,
    };
  });
  const benchtopByIndex = new Map(pricedBenchtops.map((b) => [b.index, b]));
  const passthroughRows = benchtopRows.filter(({ index }) => !benchtopByIndex.has(index));
  const benchtopCost = pricedBenchtops.reduce((s, b) => s + b.costPrice, 0);
  const benchtopMaterial = lam.sheets.reduce((s, sh) => s + sh.materialCost, 0);

  // ---- Hafele Slider SC robe openings ---------------------------------------
  // Priced like the benchtops: their own module, then a separate workshop call so the robe minutes land on the robe
  // lines, not spread over the kitchen. Edge tape counts what the cabinets already buy of the same tape (one 20 m
  // minimum per job), and the job minimums count what the other calls already drafted and machined.
  const jobEdgeMetres: Record<string, number> = {};
  for (const e of bom.consolidatedEdgeTape) jobEdgeMetres[e.edgeType] = (jobEdgeMetres[e.edgeType] ?? 0) + e.linearMeters;
  const robe = priceRobeOpenings(
    robeSpecRows.map(({ r, index }) => ({
      index, name: r.name, qty: r.qty, robe: r.robe, edgeId: r.edgeId, exteriorMaterialId: r.exteriorMaterialId,
    })),
    {
      materials: pricing.materials,
      edges: pricing.edges,
      hardware: pricing.hardware,
      hafeleTradePrices: pricing.hafeleTradePrices,
      defaultInfillMaterialId: selections.exteriorMaterialId,
      defaultEdgeId: selections.edgeId,
      supplyMode,
      jobEdgeMetres,
    },
  );
  const priorLines = [...(bom.workshop?.lines ?? []), ...(btWorkshop?.lines ?? [])];
  const priorMinutes = (re: RegExp) => priorLines.filter((l) => re.test(l.station)).reduce((s, l) => s + l.minutes, 0);
  const robeWorkshop: WorkshopCost | null = robe.rows.length
    ? calculateWorkshopCost([], {
        mode: supplyMode,
        robes: robe.fabrication,
        edgeApplicationAlreadyPriced: robe.edgeApplicationPriced,
        jobMinimums: commercial.jobMinimums ?? true,
        // real minutes and top-up minutes apart: a top-up an earlier call already charged is shared with the robe,
        // so the robe's own minutes use it up rather than being charged on top of it
        jobMinimumCredit: {
          draftingMin: priorMinutes(/^Drafting$/),
          draftingTopUpMin: priorMinutes(/^Drafting \(job minimum top-up\)$/),
          machiningMin: priorMinutes(/^(Panel lead-in \/ lead-out|Panel cutting|Vertical drilling|Part labelling)$/),
          machiningTopUpMin: priorMinutes(/^Panel cutting - CNC set-up \(job minimum top-up\)$/),
        },
      })
    : null;
  // Row labour = row share of the robe shop cost, weighted by what the same model says each row costs on its own
  // (the job-minimum top-up, when there is one, is spread the same way); the last row takes the remainder.
  const robeRowWorkshop = robe.rows.map((row) => calculateWorkshopCost([], {
    mode: supplyMode, robes: row.fabrication, edgeApplicationAlreadyPriced: robe.edgeApplicationPriced,
  }));
  const robeWeightTotal = robeRowWorkshop.reduce((s, w) => s + w.shopCost, 0);
  const robeShopCost = robeWorkshop?.shopCost ?? 0;
  const robeShopMinutes = robeWorkshop?.shopMinutes ?? 0;
  let robeLaborAssigned = 0;
  let robeMinutesAssigned = 0;
  const pricedRobes: PricedRobeOpening[] = robe.rows.map((row, i) => {
    const isLast = i === robe.rows.length - 1;
    const share = robeWeightTotal > 0 ? robeRowWorkshop[i].shopCost / robeWeightTotal : 1 / robe.rows.length;
    const laborCost = isLast ? money(robeShopCost - robeLaborAssigned) : money(robeShopCost * share);
    robeLaborAssigned = money(robeLaborAssigned + laborCost);
    const shopMinutes = isLast ? money(robeShopMinutes - robeMinutesAssigned) : money(robeShopMinutes * share);
    robeMinutesAssigned = money(robeMinutesAssigned + shopMinutes);
    const costPrice = money(row.materialCost + laborCost);
    const g = row.geometry;
    const b = row.board;
    return {
      index: row.index,
      name: row.name,
      room: roomOf(schedule[row.index], defaultRoom),
      qty: row.qty,
      spec: row.spec,
      geometry: {
        icw: g.icw, ih: g.ih, doorWidth: g.doorWidth, doorHeight: g.doorHeight, leafWidth: g.leafWidth,
        closureError: Math.round(g.closureError * 1e6) / 1e6,
        trackCut: g.trackCut, verticalProfileCut: g.verticalProfileCut, horizontalProfileCut: g.horizontalProfileCut,
        panelCut: { ...row.panelCut }, panelFinished: { ...row.panelFinished }, kitLength: g.kitLength, profileAllowance: g.profileAllowance,
        softCloseSetback: g.softCloseSetback, tracks: [...g.tracks],
        verticalProfiles: g.verticalProfiles, horizontalProfiles: g.horizontalProfiles,
      },
      kit: {
        item_code: row.kit.item_code, name: row.kit.name, price: row.kit.price, unconfirmed: row.kit.unconfirmed,
        priceSource: row.kit.priceSource, priceBasis: row.kit.priceBasis, quantity: row.kit.quantity, cost: row.kit.cost,
      },
      boards: b
        ? {
            material: b.material, materialId: b.materialId, itemCode: b.itemCode, thickness: b.thickness,
            sheetLength: b.sheetLength, sheetWidth: b.sheetWidth, sheets: b.sheets, sheetsShare: b.sheetsShare,
            fitOk: b.fitOk, panels: b.panels, cost: b.cost,
          }
        : { material: null, materialId: null, itemCode: null, thickness: null, sheetLength: null, sheetWidth: null, sheets: 0, sheetsShare: 0, fitOk: null, panels: 0, cost: 0 },
      edgeMetres: row.edgeMetres,
      edge: row.edge ? { edgeType: row.edge.edgeType, name: row.edge.name, cost: row.edge.cost } : null,
      dampers: row.dampers,
      mirror: row.mirror,
      leafMassKg: row.leafMassKg,
      minutes: row.minutes,
      shopMinutes,
      kitCost: row.kitCost,
      boardCost: row.boardCost,
      edgeCost: row.edgeCost,
      materialCost: row.materialCost,
      laborCost,
      costPrice,
      total: money(costPrice * uplift),
      unpricedItems: row.unpricedItems,
      warnings: row.warnings,
    };
  });
  const robeByIndex = new Map(pricedRobes.map((x) => [x.index, x]));
  const robeBlockedByIndex = new Map<number, RobeBlockedRow>(robe.blocked.map((x) => [x.index, x]));
  const robeCost = pricedRobes.reduce((s, x) => s + x.costPrice, 0);
  const robeBoardCost = robe.sheets.reduce((s, x) => s + x.cost, 0);
  const robeEdgeCost = robe.edges.reduce((s, x) => s + x.cost, 0);
  const robeKitCost = robe.kits.reduce((s, x) => s + x.cost, 0);

  const installCost = (bom.workshop?.installCost ?? 0) + (btWorkshop?.installCost ?? 0) + (robeWorkshop?.installCost ?? 0);
  const cabinetCost = lineCost.reduce((a, b) => a + b, 0) + benchtopCost + robeCost;
  const marginPercent = money(commercial.markupPct * 100);

  const lines: PricedLine[] = cabinetRows.map((r, idx) => {
    const qty = Math.max(1, Math.round(r.qty ?? 1));
    const total = money(lineCost[idx] * uplift);
    return {
      description: r.name,
      quantity: qty,
      unit: 'ea',
      unitPrice: money(total / qty),
      total,
      costPrice: money(lineCost[idx]),
      materialCost: money(lineSplit[idx].material),
      laborCost: money(lineSplit[idx].labor),
      marginPercent,
      category: 'cabinetry',
      roomName: roomOf(r, defaultRoom),
      source: 'bower',
    };
  });

  // Benchtop rows, in schedule order. Engine-priced rows get a 'bower' line
  // with the uplift applied like a cabinet; anything the engine could not
  // price (no sheet, or an unpriced one) passes through at the source quote's
  // figure so nothing silently vanishes from the client's quote.
  for (const { r, index } of benchtopRows) {
    const b = benchtopByIndex.get(index);
    if (b) {
      const qty = Math.max(1, Math.round(r.qty ?? 1));
      lines.push({
        description: r.name,
        quantity: qty,
        unit: 'ea',
        unitPrice: money(b.total / qty),
        total: b.total,
        costPrice: b.costPrice,
        materialCost: b.materialCost,
        laborCost: b.laborCost,
        marginPercent,
        category: 'cabinetry',
        roomName: roomOf(r, defaultRoom),
        source: 'bower',
      });
      continue;
    }
    const total = money(r.mv_total ?? 0);
    if (total <= 0) continue;
    lines.push({
      description: r.name, quantity: 1, unit: 'ea', unitPrice: total, total,
      costPrice: total, materialCost: total, laborCost: 0, marginPercent: 0,
      category: 'cabinetry', roomName: roomOf(r, defaultRoom), source: 'passthrough',
    });
  }

  // Robe rows, in schedule order. A row the robe module priced gets a 'bower' line with the uplift applied like a
  // cabinet. Every other robe row - a robe-named row without robe fields, or one the module refused - is carried at
  // the source quote's own line figure. A row with no figure (or 0, which is what Build Flow sends for a work-order
  // line) still gets a $0 line (unlike a benchtop passthrough) so it stays visible on the quote; its warning says it
  // has no price and the line is marked unpriced.
  const robeWarnings: string[] = [];
  const robesNotPriced: RobeNotPriced[] = [];
  const allRobeRows = [...robeSpecRows, ...robeRows].sort((a, b) => a.index - b.index);
  for (const { r, index } of allRobeRows) {
    const qty = Math.max(1, Math.round(r.qty ?? 1));
    const room = roomOf(r, defaultRoom);
    const priced = robeByIndex.get(index);
    if (priced) {
      lines.push({
        description: r.name, quantity: priced.qty, unit: 'ea', unitPrice: money(priced.total / priced.qty), total: priced.total,
        costPrice: priced.costPrice, materialCost: priced.materialCost, laborCost: priced.laborCost, marginPercent,
        category: 'cabinetry', roomName: room, source: 'bower',
      });
      robeWarnings.push(...priced.warnings);
      continue;
    }
    const mv = Number(r.mv_total);
    const total = Number.isFinite(mv) && mv > 0 ? money(mv) : 0;
    lines.push({
      description: r.name, quantity: qty, unit: 'ea', unitPrice: money(total / qty), total,
      costPrice: total, materialCost: total, laborCost: 0, marginPercent: 0,
      category: 'cabinetry', roomName: room, source: 'passthrough', unpriced: true,
    });
    const blocked = robeBlockedByIndex.get(index);
    if (blocked) {
      robesNotPriced.push({ index, name: r.name, room, qty, reasons: blocked.reasons, geometry: blocked.geometry });
      robeWarnings.push(robeBlockedWarning(r, room, qty, total, blocked.reasons));
    } else {
      robeWarnings.push(robeNotPricedWarning(r, room, qty, total));
    }
  }
  // A robe row carried at its own figure (no robe fields) in the same room as a row WITH robe fields is most likely
  // the same robe on the quote twice - a Microvellum or hand-typed robe line beside the opening that replaces it.
  // Nothing is removed; the warning names both.
  const roomKey = (s: string) => s.trim().toLowerCase();
  for (const { r } of robeRows) {
    const room = roomOf(r, defaultRoom);
    const same = robeSpecRows.filter(({ r: s }) => roomKey(roomOf(s, defaultRoom)) === roomKey(room));
    if (!same.length) continue;
    const mv = Number(r.mv_total);
    const carried = Number.isFinite(mv) && mv > 0 ? money(mv) : 0;
    const others = same.map(({ r: s, index: si }) => {
      const p = robeByIndex.get(si);
      return p ? `"${s.name}" (priced by BowerOS at $${p.total.toFixed(2)})` : `"${s.name}" (Hafele Slider SC fields, not priced)`;
    });
    robeWarnings.push(`POSSIBLE DOUBLE CHARGE: "${r.name}" (${room}) is carried at $${carried.toFixed(2)} and ${others.join(' and ')} ${others.length === 1 ? 'is' : 'are'} in the same room - if they are the same robe, take one off the quote.`);
  }

  // Install is billed at cost: the engine adds it after the margin layer and
  // client_markup_settings carries no install category.
  if (installCost > 0) {
    const total = money(installCost);
    const mainRoom = lines.length
      ? [...lines.reduce((m, l) => m.set(l.roomName, (m.get(l.roomName) ?? 0) + 1), new Map<string | null, number>()).entries()]
          .sort((a, b) => b[1] - a[1])[0][0]
      : defaultRoom;
    lines.push({
      description: 'Installation — onsite', quantity: 1, unit: 'ea', unitPrice: total, total,
      costPrice: total, materialCost: 0, laborCost: total, marginPercent: 0,
      category: 'general', roomName: mainRoom, source: 'bower',
    });
  }

  const sellExGst = money(lines.reduce((s, l) => s + l.total, 0));

  // ---- workshop costing for Build Flow's downstream consumers ---------------
  const hwCategory = (t: string): WorkshopCosting['hardware'][number]['category'] => {
    const k = t.toLowerCase();
    if (/hinge/.test(k)) return 'hinge';
    if (/runner|slide|drawer/.test(k)) return 'runner';
    if (/handle|knob|pull/.test(k)) return 'handle';
    if (/screw|consumable/.test(k)) return 'screw';
    if (/bracket|leg|plate|pin/.test(k)) return 'bracket';
    return 'other';
  };
  const mk = commercial.markupPct;
  const sheetStock = bom.consolidatedSheets.map((sh) => ({
    material: sh.materialName,
    thickness: pricing.materials.find((m) => m.id === sh.materialId)?.thickness as number | undefined,
    wastePercent: money((1 - (sh.yieldFactor ?? 1)) * 100),
    markupPercent: money(mk * 100),
    units: money(sh.chargeableArea ?? sh.totalPartArea),
    unitCost: money(sh.areaCostPerSqm),
    markupCost: money(sh.totalMaterialCost * mk),
    cost: money(sh.totalMaterialCost),
  }));
  // Benchtop sheets: whole sheets bought in m2 like the cabinet rows above, and whole
  // pre-made blanks in the lineal metres they are actually bought by (see blankPrice),
  // so units x unitCost is always the cost on the line.
  for (const sh of lam.sheets) {
    sheetStock.push({
      material: `${sh.sheet.name} (${sh.kind === 'blank' ? 'Benchtop blank' : 'Benchtop'}, ${sh.jobSheets} x ${sh.sheet.sheet_length}x${sh.sheet.sheet_width}${sh.priceUnit === 'lm' ? ', per lm' : ''})`,
      thickness: sh.sheet.thickness,
      wastePercent: money(sh.wasteFactor * 100),
      markupPercent: money(mk * 100),
      units: money(sh.chargedUnits),
      unitCost: money(sh.unitCost),
      markupCost: money(sh.materialCost * mk),
      cost: money(sh.materialCost),
    });
  }
  // Robe board sheets: whole sheets from the leaf nest, bought in m2 like the cabinet rows.
  for (const sh of robe.sheets) {
    sheetStock.push({
      material: `${sh.name} (Robe infill, ${sh.sheets} x ${sh.sheetLength}x${sh.sheetWidth})`,
      thickness: sh.thickness,
      wastePercent: 0,
      markupPercent: money(mk * 100),
      units: money(sh.chargedSqm),
      unitCost: money(sh.areaCost),
      markupCost: money(sh.cost * mk),
      cost: money(sh.cost),
    });
  }
  const edgebanding = bom.consolidatedEdgeTape.map((e) => ({
    color: e.edgeName,
    width: 22,
    thickness: e.thickness,
    linearMeters: money(e.linearMeters),
    unitCost: money(e.costPerMeter),
    cost: money(e.totalCost),
  }));
  // Robe edge tape: the same tape as the cabinets is ONE purchase - fold into its row; a different tape gets its own.
  for (const e of robe.edges) {
    const at = bom.consolidatedEdgeTape.findIndex((c) => c.edgeType === e.edgeType);
    if (at >= 0) {
      const c = bom.consolidatedEdgeTape[at];
      edgebanding[at].linearMeters = money(c.linearMeters + e.metres);
      edgebanding[at].cost = money(c.totalCost + e.cost);
    } else {
      edgebanding.push({ color: e.name, width: 22, thickness: e.thickness, linearMeters: money(e.metres), unitCost: money(e.costPerMeter), cost: money(e.cost) });
    }
  }
  const hardware = bom.consolidatedHardware.map((h) => ({
    code: h.itemCode,
    description: h.name,
    quantity: h.quantity,
    unitCost: money(h.unitCost),
    markupCost: money(h.totalCost * mk),
    cost: money(h.totalCost),
    category: hwCategory(h.hardwareType ?? ''),
  }));
  // One Hafele kit line per kit code - the rollers, guides, dampers, tracks and profiles inside it are never listed.
  for (const k of robe.kits) {
    hardware.push({
      code: k.code,
      description: k.unconfirmed ? `${k.name} (price unconfirmed - pending Hafele capture)` : k.name,
      quantity: k.quantity,
      unitCost: money(k.unitCost),
      markupCost: money(k.cost * mk),
      cost: money(k.cost),
      category: 'other',
    });
  }
  if (lam.adhesive.quantity > 0) {
    hardware.push({
      code: lam.adhesive.code,
      description: lam.adhesive.name,
      quantity: lam.adhesive.quantity,
      unitCost: money(lam.adhesive.unitCost),
      markupCost: money(lam.adhesive.cost * mk),
      cost: money(lam.adhesive.cost),
      category: 'other',
    });
  }
  const merged = mergeStations(mergeStations(bom.workshop?.lines ?? [], btWorkshop?.lines ?? []), robeWorkshop?.lines ?? []);
  // A robe whose own minutes used up the whole of the kitchen's job-minimum top-up leaves that top-up line at 0 min.
  const st = robeWorkshop ? merged.filter((l) => !(/job minimum top-up/.test(l.station) && Math.abs(l.minutes) < 0.005)) : merged;
  const minutesOf = (re: RegExp) => money(st.filter((l) => re.test(l.station)).reduce((a, l) => a + l.minutes, 0));
  const installMinutes = (bom.workshop?.installMinutes ?? 0) + (btWorkshop?.installMinutes ?? 0) + (robeWorkshop?.installMinutes ?? 0);
  const installHours = (bom.workshop?.installHours ?? 0) + (btWorkshop?.installHours ?? 0) + (robeWorkshop?.installHours ?? 0);
  const laborMinutes = {
    drafting: minutesOf(/draft/i),
    machining: minutesOf(/lead|cutting|drill|label/i),
    edgebanding: minutesOf(/edge/i),
    assembly: minutesOf(/assembly/i),
    // benchtop lamination / build-up / joins / polishing / cut-outs
    finishing: minutesOf(/lamination|polish|build-up|joins?|cut-?outs?/i),
    // 'Hardware pick & box' (flat_pack_hw_loose) had no bucket, so its minutes never reached Build Flow's schedule
    productHandling: minutesOf(/handling|packag|loading|pick/i),
    installation: money(installMinutes),
    total: 0,
  };
  laborMinutes.total = money(Object.entries(laborMinutes).filter(([k]) => k !== 'total').reduce((a, [, v]) => a + (v as number), 0));
  const labor = st.map((l) => ({ category: l.station, hours: money(l.hours), rate: l.rate, cost: money(l.cost) }));
  if (bom.workshop || btWorkshop || robeWorkshop) labor.push({ category: 'Installation (onsite)', hours: money(installHours), rate: 0, cost: money(installCost) });
  const shopLaborTotal = money((bom.workshop?.shopCost ?? g0(bom.grandTotal.labor)) + btShopCost + robeShopCost);
  const totalMaterials = money(bom.grandTotal.materials + bom.grandTotal.edging + bom.grandTotal.hardware + benchtopMaterial + lam.adhesive.cost
    + robeBoardCost + robeEdgeCost + robeKitCost);
  // Parts of a robe opening that have no price (mirror glass, extra dampers) are bought outside the catalogue.
  const robeUnpriced = pricedRobes.flatMap((x) => x.unpricedItems);
  const rooms = new Set(lines.map((l) => l.roomName ?? defaultRoom));
  const workshopCosting: WorkshopCosting = {
    sheetStock, solidStock: [], edgebanding, hardware, labor, laborMinutes,
    fileName: 'BowerOS pricing engine',
    cabinetCount: items.length,
    roomCount: rooms.size,
    partCount: bom.cabinets.reduce((a, c) => a + c.parts.reduce((b, p) => b + Math.max(1, p.quantity ?? 1), 0), 0) + lam.fabrication.parts
      + robe.fabrication.boardParts + robe.fabrication.boughtParts,
    // Any benchtop row flags stone; only rows still carried from the source
    // quote are buyouts.
    hasStone: benchtopRows.length > 0,
    hasLaminex: false, hasTwoPack: false,
    // Robe rows not priced by the robe module are carried from the source quote too, and a priced opening's
    // unpriced parts (mirror glass, extra dampers) still have to be bought.
    hasBuyout: passthroughRows.length + robeRows.length + robesNotPriced.length + robeUnpriced.length > 0,
    buyoutItems: [
      ...passthroughRows.map(({ r }) => r.name), ...robeRows.map(({ r }) => r.name),
      ...robesNotPriced.map((x) => x.name), ...robeUnpriced,
    ],
    sheetStockTotal: money(sheetStock.reduce((a, x) => a + x.cost, 0)),
    solidStockTotal: 0,
    edgebandingTotal: money(edgebanding.reduce((a, x) => a + x.cost, 0)),
    hardwareTotal: money(hardware.reduce((a, x) => a + x.cost, 0)),
    totalMaterials,
    shopLaborTotal,
    onsiteLaborTotal: money(installCost),
    totalLabor: money(shopLaborTotal + installCost),
    markupPercent: money(mk * 100),
    markupAmount: money(cabinetCost * mk),
    overheadPercent: money((commercial.overheadPct ?? 0) * 100),
    overheadAmount: money(cabinetCost * (commercial.overheadPct ?? 0)),
    totalProjectPrice: money(sellExGst * 1.1),
    totalProjectPriceExGst: sellExGst,
    totalCost: money(cabinetCost + installCost),
  };
  const gst = money(sellExGst * 0.1);
  const g = bom.grandTotal;
  const shopMinutes = (bom.workshop?.shopMinutes ?? 0) + (btWorkshop?.shopMinutes ?? 0) + robeShopMinutes;

  return {
    workshopCosting,
    lines,
    benchtops: pricedBenchtops,
    robes: pricedRobes,
    robesNotPriced,
    totals: {
      cabinetCost: money(cabinetCost),
      installCost: money(installCost),
      sellExGst,
      gst,
      sellIncGst: money(sellExGst + gst),
      markupPct: commercial.markupPct,
      markupSource: commercial.markupSource,
      supplyMode,
    },
    cost: {
      materials: money(g.materials + benchtopMaterial + robeBoardCost),
      edging: money(g.edging + robeEdgeCost),
      hardware: money(g.hardware + lam.adhesive.cost + robeKitCost),
      labor: money(g.labor + btShopCost + robeShopCost),
      processing: money(g.handling + g.machining + g.assembly),
    },
    workshop: bom.workshop || btWorkshop || robeWorkshop
      ? {
          shopMinutes: money(shopMinutes),
          installMinutes: money(installMinutes),
          stations: st.map((l) => ({ station: l.station, minutes: money(l.minutes), cost: money(l.cost) })),
        }
      : null,
    // Robe warnings first: lines BowerOS did not price, and the unpriced / unconfirmed parts of the ones it did
    // (the LOUD ones ahead of every robe row's working, each group in schedule order).
    warnings: [
      ...robeWarnings.filter((w) => ROBE_LOUD_RE.test(w)), ...robeWarnings.filter((w) => !ROBE_LOUD_RE.test(w)),
      ...(bom.warnings ?? []), ...lam.warnings, ...scheduleWarnings,
    ],
  };
}
