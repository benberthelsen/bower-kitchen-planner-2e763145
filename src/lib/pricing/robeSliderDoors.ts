/**
 * Hafele Slider SC robe openings, priced from a schedule row that carries `robe` fields.
 *
 * Ben's standalone robe program priced an opening by panel AREA x 1.1 waste, a flat $90/h for the shop and install,
 * and a 30% markup. BowerOS prices it the way everything else is priced (Ben, 17 Sep 2026):
 *
 *   - ONE Hafele kit per opening (944.02.0xx, hardware_pricing.hardware_type 'robe_kit', selected by
 *     robe_profile / robe_leaves / robe_finish / robe_track_length_mm). Rollers, guides, the 4 dampers, both tracks
 *     and the profile stock are inside the kit and are never costed again. The kit price is the Hafele trade-price
 *     capture (hafele_trade_prices, Bower's buy price ex GST) when there is one; until then the catalogue unit_cost
 *     (Ben's 31 Aug 2026 account Net price) flagged "unconfirmed - pending Hafele capture" - GST basis unknown.
 *   - Board infill in WHOLE SHEETS as bought, from a real part-fits-sheet nest (never area / yield: one leaf is
 *     nearly a whole board, so an area count under-buys). A leaf that cannot be cut from its board is a hard stop.
 *   - Edge tape on ALL FOUR sides of every board panel, through edgeCalculator, bought under the job's 20 m minimum
 *     then by the metre (counting the metres the rest of the job already buys of the same tape).
 *   - Mirror infill: Ben wants it charged as a whole sheet, but no mirror sheet size, price or supplier exists in the
 *     catalogue - so everything else is priced and the mirror is a loud NOT PRICED warning. Never invented.
 *   - Dampers: every kit has 4 (2-door and 3-door alike). Soft close on all leaves (Ben: default) needs 2 per leaf,
 *     so a 3-leaf opening needs 2 more. No part number or price exists - counted and warned, never priced.
 *   - Stations: 30 min set-up per opening + 30 min per leaf (assembly rate), install 45 min per opening, board panels
 *     through drafting / cutting / labelling / handling, leaves loaded as loose panels - see workshopModel.ts. The
 *     markup is the catalogue default like every other line; install is billed at cost on the job install line.
 *
 * Pure: schedule rows + catalogue in, priced rows + fabrication quantities out. quoteFromSchedule runs the stations.
 */
import { packWholeSheetCuts } from './benchtopCalculator';
import { calculateEdgeTape, edgeOrderMetres } from './edgeCalculator';
import { articleKeys } from './hafeleArticleKeys';
import { partFitsSheet, SHEET_TRIM_MM } from './sheetOptimizer';
import type { EdgePricingRecord, EdgeTapeAllocation, HardwarePricingRecord, MaterialPricingRecord, PartDimension } from './types';
import {
  DEFAULT_WORKSHOP_RATES,
  EMPTY_ROBE_FABRICATION,
  sumRobeFabrication,
  type RobeFabricationInputs,
  type SupplyMode,
} from './workshopModel';
import {
  SLIDER_SC_KIT_DAMPERS,
  SLIDER_SC_MASS_DEFAULTS,
  SLIDER_SC_MAX_INSERT_MM,
  SLIDER_SC_MAX_LEAF_KG,
  SLIDER_SC_MIN_INSERT_MM,
  normaliseSliderScFinish,
  normaliseSliderScProfile,
  sliderScGeometry,
  sliderScLeafMassKg,
  type SliderScFinish,
  type SliderScGeometry,
  type SliderScProfile,
} from './robeGeometry';

export type RobeInfill = 'board' | 'mirror';

/** The `robe` block of a schedule row - the engine <-> Build Flow contract (docs/PRICING_ENGINE.md). */
export interface RobeSpec {
  kind: 'hafele_slider_sc';
  profile: SliderScProfile;
  leaves: 2 | 3;
  finish: SliderScFinish;
  /** measured opening, mm */
  openingWidth: number;
  openingHeight: number;
  /** positive deductions, mm, default 0 */
  allowances?: { left?: number; right?: number; top?: number; bottom?: number };
  infill: RobeInfill;
  /** board infill: material_pricing id or item_code. Default: the row's / job's exterior material, warned. */
  infillMaterialId?: string;
  /**
   * mm, 16-18 (outside it the opening is NOT priced). Board infill: checked against the board bought. Mirror infill:
   * the glass + backer build-up, used for the leaf-mass estimate (4 mm glass assumed, the rest backer). Default 16.
   */
  infillThickness?: number;
  /** default true (Ben, 17 Sep 2026) */
  softCloseAllLeaves?: boolean;
}

export interface RobeSpecNormalised {
  kind: 'hafele_slider_sc';
  profile: SliderScProfile;
  leaves: 2 | 3;
  finish: SliderScFinish;
  openingWidth: number;
  openingHeight: number;
  allowances: { left: number; right: number; top: number; bottom: number };
  infill: RobeInfill;
  infillMaterialId: string | null;
  infillThickness: number | null;
  softCloseAllLeaves: boolean;
}

export interface RobeRowInput {
  /** position in the caller's schedule */
  index: number;
  name: string;
  qty?: number;
  robe: unknown;
  /** row edge override (else opts.defaultEdgeId) */
  edgeId?: string;
  /** row exterior override - the infill default when robe.infillMaterialId is absent */
  exteriorMaterialId?: string;
}

/** hardware_pricing plus the robe kit columns added by 20260917120000_slider_sc_robe_kits.sql. */
export interface RobeKitRecord extends HardwarePricingRecord {
  robe_profile?: string | null;
  robe_leaves?: number | string | null;
  robe_finish?: string | null;
  robe_track_length_mm?: number | string | null;
  price_basis?: string | null;
  source_url?: string | null;
}

/** hafele_trade_prices: Bower's captured buy price ex GST. */
export interface HafeleTradePriceRow {
  article_code: string;
  trade_cost_ex_gst: number | string | null;
  captured_at?: string | null;
}

export interface PriceRobeOptions {
  materials: MaterialPricingRecord[];
  edges: EdgePricingRecord[];
  hardware: HardwarePricingRecord[];
  hafeleTradePrices?: HafeleTradePriceRow[];
  /** QuoteSelections.exteriorMaterialId */
  defaultInfillMaterialId?: string;
  /** QuoteSelections.edgeId */
  defaultEdgeId?: string;
  supplyMode?: SupplyMode;
  /** Metres of each edge type (edgeCalculator key) the rest of the job already buys - the 20 m minimum is per job. */
  jobEdgeMetres?: Record<string, number>;
  /** Loose-panel thresholds (default DEFAULT_WORKSHOP_RATES). */
  largeLooseLongestSideMm?: number;
  largeLooseAreaSqm?: number;
}

export interface RobeKitPrice {
  id: string;
  item_code: string;
  name: string;
  trackLength: number;
  /** per kit, ex GST */
  price: number;
  /** true until hafele_trade_prices holds a captured buy price for this article */
  unconfirmed: boolean;
  /** 'hafele_capture' | 'catalogue_unconfirmed' */
  priceSource: 'hafele_capture' | 'catalogue_unconfirmed';
  priceBasis: string;
  quantity: number;
  cost: number;
}

export interface RobeBoardUse {
  material: string;
  materialId: string;
  itemCode: string;
  thickness: number;
  sheetLength: number;
  sheetWidth: number;
  areaCost: number;
  /** panels this row cuts (leaves x qty) */
  panels: number;
  /** always true on a priced row - a leaf that does not fit its board is a hard stop */
  fitOk: boolean;
  /** whole sheets bought for EVERY robe row sharing this board */
  sheets: number;
  /** this row's share of those sheets, by panel area */
  sheetsShare: number;
  cost: number;
}

export interface RobeEdgeUse {
  edgeType: string;
  name: string;
  metres: number;
  cost: number;
  fallbackPrice: boolean;
}

export interface RobeOpeningRow {
  index: number;
  name: string;
  qty: number;
  spec: RobeSpecNormalised;
  /** geometry.panelCut is the FINISHED panel (what the profile holds) - see panelFinished / panelCut below */
  geometry: SliderScGeometry;
  /** finished infill panel per leaf, mm (Hafele DW x door height) */
  panelFinished: { w: number; h: number };
  /**
   * saw size per leaf, mm: a board panel is edged on all four sides, so it is cut the edge thickness smaller on each
   * side (Bower / Microvellum: cut = finished - 2 x edge). A mirror panel, or a board with no edge thickness, is cut
   * at its finished size.
   */
  panelCut: { w: number; h: number };
  kit: RobeKitPrice;
  board: RobeBoardUse | null;
  edge: RobeEdgeUse | null;
  /** metres of edge tape applied: all four sides of every board panel */
  edgeMetres: number;
  dampers: { inKit: number; needed: number; extra: number; priced: false };
  mirror: { required: boolean; priced: false; panels: number; panelCut: { w: number; h: number } | null };
  /** estimated, kg per leaf */
  leafMassKg: number;
  fabrication: RobeFabricationInputs;
  kitCost: number;
  boardCost: number;
  edgeCost: number;
  /** kit + board + edge */
  materialCost: number;
  /** Ben's minutes for this row under the supply mode (install only when installed) */
  minutes: { setUp: number; leaves: number; install: number };
  /** Items this row needs that have no price: mirror sheets, extra dampers. */
  unpricedItems: string[];
  warnings: string[];
}

export interface RobeBlockedRow {
  index: number;
  name: string;
  qty: number;
  reasons: string[];
  geometry: SliderScGeometry | null;
}

export interface RobeSheetUse {
  materialId: string;
  itemCode: string;
  name: string;
  thickness: number;
  sheetLength: number;
  sheetWidth: number;
  areaCost: number;
  rows: number[];
  panels: number;
  panelAreaSqm: number;
  sheets: number;
  chargedSqm: number;
  cost: number;
}

export interface RobeEdgeGroup {
  edgeType: string;
  name: string;
  thickness: number;
  costPerMeter: number;
  /** metres applied on robe panels */
  metres: number;
  /** metres the rest of the job already buys of this tape */
  jobMetres: number;
  /** extra metres bought because of the robes: order(job + robe) - order(job) */
  boughtMetres: number;
  applicationCost: number;
  handlingCost: number;
  cost: number;
  applicationPriced: boolean;
}

export interface RobeKitLine {
  code: string;
  name: string;
  quantity: number;
  unitCost: number;
  cost: number;
  unconfirmed: boolean;
}

export interface PriceRobeResult {
  rows: RobeOpeningRow[];
  blocked: RobeBlockedRow[];
  sheets: RobeSheetUse[];
  edges: RobeEdgeGroup[];
  kits: RobeKitLine[];
  fabrication: RobeFabricationInputs;
  /** true when the robe edge tape already carries an application cost (skip the Edgebanding station) */
  edgeApplicationPriced: boolean;
  warnings: string[];
}

/**
 * mm left between two leaves on a sheet in the nest, on top of the SHEET_TRIM_MM off the sheet edges. An ASSUMED
 * router path, not calibrated: a leaf is placed as (length + 10) x (width + 10) on the nominal sheet, which is the
 * same as partFitsSheet's 10 mm trim for one leaf and leaves 10 mm between neighbours.
 */
export const ROBE_NEST_SPACING_MM = 10;
/** Soft close on every leaf needs a damper at each end of its travel - what the 2-door kit's 4 dampers imply. */
export const ROBE_DAMPERS_PER_LEAF = 2;

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const toNum = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : NaN;
};
const pos = (v: unknown): number => {
  const n = toNum(v);
  return n > 0 ? n : 0;
};
const fmt = (n: number) => `$${money(n).toFixed(2)}`;
const mm = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const UNCONFIRMED_KIT_BASIS = 'unconfirmed - pending Hafele capture';

function resolveMaterial(id: string, materials: MaterialPricingRecord[]): MaterialPricingRecord | undefined {
  const key = id.trim();
  if (!key) return undefined;
  const lower = key.toLowerCase();
  return materials.find((m) => m.id === key) ?? materials.find((m) => String(m.item_code ?? '').toLowerCase() === lower);
}

function isVisible(h: { visibility_status?: string | null }): boolean {
  const v = String(h.visibility_status ?? 'Available').trim().toLowerCase();
  return v === '' || v === 'available';
}

/** hardware_type 'robe_kit' (any case / spacing). */
export function isRobeKitRow(h: { hardware_type?: string | null }): boolean {
  return /^robe[\s_-]*kit$/i.test(String(h.hardware_type ?? '').trim());
}

function normaliseSpec(raw: unknown, reasons: string[]): RobeSpecNormalised | null {
  if (!raw || typeof raw !== 'object') {
    reasons.push('the robe block is not an object');
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'hafele_slider_sc') reasons.push(`robe.kind "${String(r.kind)}" is not "hafele_slider_sc" - no other robe system is priced`);
  const profile = normaliseSliderScProfile(r.profile);
  if (!profile) reasons.push(`robe.profile "${String(r.profile)}" must be handle or slimline`);
  const leaves = toNum(r.leaves);
  if (leaves !== 2 && leaves !== 3) reasons.push(`robe.leaves "${String(r.leaves)}" must be 2 or 3`);
  const finish = normaliseSliderScFinish(r.finish);
  if (!finish) reasons.push(`robe.finish "${String(r.finish)}" must be silver or black`);
  const infillRaw = String(r.infill ?? '').trim().toLowerCase();
  const infill: RobeInfill | null = infillRaw === 'board' ? 'board' : infillRaw === 'mirror' ? 'mirror' : null;
  if (!infill) reasons.push(`robe.infill "${String(r.infill)}" must be board or mirror`);
  const openingWidth = toNum(r.openingWidth);
  const openingHeight = toNum(r.openingHeight);
  if (!(openingWidth > 0) || !(openingHeight > 0)) {
    reasons.push(`robe.openingWidth x openingHeight ${String(r.openingWidth)} x ${String(r.openingHeight)} must be positive measured sizes (mm)`);
  }
  const al = (r.allowances && typeof r.allowances === 'object' ? r.allowances : {}) as Record<string, unknown>;
  const allowance = (k: string) => {
    if (al[k] === undefined || al[k] === null) return 0;
    const n = toNum(al[k]);
    if (!Number.isFinite(n)) {
      reasons.push(`robe.allowances.${k} "${String(al[k])}" is not a number`);
      return 0;
    }
    return n;
  };
  const allowances = { left: allowance('left'), right: allowance('right'), top: allowance('top'), bottom: allowance('bottom') };
  const t = r.infillThickness === undefined || r.infillThickness === null ? null : toNum(r.infillThickness);
  if (t !== null && !Number.isFinite(t)) reasons.push(`robe.infillThickness "${String(r.infillThickness)}" is not a number`);
  if (!profile || (leaves !== 2 && leaves !== 3) || !finish || !infill) return null;
  return {
    kind: 'hafele_slider_sc',
    profile,
    leaves: leaves as 2 | 3,
    finish,
    openingWidth,
    openingHeight,
    allowances,
    infill,
    infillMaterialId: typeof r.infillMaterialId === 'string' && r.infillMaterialId.trim() ? r.infillMaterialId.trim() : null,
    infillThickness: t !== null && Number.isFinite(t) ? t : null,
    softCloseAllLeaves: r.softCloseAllLeaves !== false,
  };
}

/** The one kit row for a profile / leaves / finish / track length, and its price. */
export function selectRobeKit(
  spec: { profile: SliderScProfile; leaves: number; finish: SliderScFinish },
  trackLength: number,
  hardware: HardwarePricingRecord[],
  capture: Map<string, HafeleTradePriceRow>,
): { kit: Omit<RobeKitPrice, 'quantity' | 'cost'> } | { reason: string } {
  const kits = (hardware as RobeKitRecord[]).filter((h) => isRobeKitRow(h) && isVisible(h));
  const label = `${cap(spec.profile)} ${spec.leaves}-leaf ${spec.finish} ${trackLength} mm`;
  if (kits.length === 0) {
    return { reason: `no hardware_pricing row has hardware_type robe_kit - the Slider SC kit seed (20260917120000_slider_sc_robe_kits.sql) is not applied, so no ${label} kit can be priced` };
  }
  const matches = kits.filter((h) =>
    normaliseSliderScProfile(h.robe_profile) === spec.profile
    && toNum(h.robe_leaves) === spec.leaves
    && normaliseSliderScFinish(h.robe_finish) === spec.finish
    && toNum(h.robe_track_length_mm) === trackLength);
  if (matches.length === 0) return { reason: `no robe_kit row in hardware_pricing is a ${label} Slider SC kit` };
  if (matches.length > 1) {
    return { reason: `${matches.length} robe_kit rows match ${label} (${matches.map((m) => m.item_code).join(', ')}) - the kit must map to exactly one row` };
  }
  const row = matches[0];
  let captured: number | null = null;
  for (const key of articleKeys(row.item_code)) {
    const hit = capture.get(key);
    const cost = hit ? toNum(hit.trade_cost_ex_gst) : NaN;
    if (cost > 0) {
      captured = cost;
      break;
    }
  }
  if (captured !== null) {
    return {
      kit: {
        id: row.id, item_code: row.item_code, name: row.name, trackLength, price: money(captured), unconfirmed: false,
        priceSource: 'hafele_capture', priceBasis: 'Hafele trade-price capture (Bower buy price ex GST, hafele_trade_prices)',
      },
    };
  }
  const unit = toNum(row.unit_cost);
  if (!(unit > 0)) {
    return { reason: `${row.item_code} (${label}) has no Hafele capture price and no unit_cost - kit not priced` };
  }
  const basis = String(row.price_basis ?? '').trim();
  return {
    kit: {
      id: row.id, item_code: row.item_code, name: row.name, trackLength, price: money(unit), unconfirmed: true,
      priceSource: 'catalogue_unconfirmed',
      priceBasis: basis ? (/^unconfirmed/i.test(basis) ? basis : `${UNCONFIRMED_KIT_BASIS} (${basis})`) : UNCONFIRMED_KIT_BASIS,
    },
  };
}

interface Prepared {
  input: RobeRowInput;
  qty: number;
  spec: RobeSpecNormalised;
  geometry: SliderScGeometry;
  kit: RobeKitPrice;
  material: MaterialPricingRecord | null;
  panels: number;
  edgeAlloc: EdgeTapeAllocation | null;
  leafMassKg: number;
  /** mirror infill: the build-up the mass estimate used (glass assumed 4 mm, the rest backer) */
  mirrorBuildUp: { totalMm: number; glassMm: number; backerMm: number; sent: boolean } | null;
  warnings: string[];
}

export function priceRobeOpenings(rows: RobeRowInput[], opts: PriceRobeOptions): PriceRobeResult {
  const capture = new Map<string, HafeleTradePriceRow>();
  for (const t of opts.hafeleTradePrices ?? []) {
    for (const key of articleKeys(t.article_code)) if (!capture.has(key)) capture.set(key, t);
  }
  const largeSide = fin(opts.largeLooseLongestSideMm) ? opts.largeLooseLongestSideMm : DEFAULT_WORKSHOP_RATES.largeLooseLongestSideMm;
  const largeArea = fin(opts.largeLooseAreaSqm) ? opts.largeLooseAreaSqm : DEFAULT_WORKSHOP_RATES.largeLooseAreaSqm;
  const mode: SupplyMode = opts.supplyMode ?? 'assembled_installed';
  const assembles = mode === 'assembled' || mode === 'assembled_installed';
  const installs = mode === 'assembled_installed';

  const prepared: Prepared[] = [];
  const blocked: RobeBlockedRow[] = [];

  for (const input of rows) {
    const reasons: string[] = [];
    const warnings: string[] = [];
    const qty = Math.max(1, Math.round(pos(input.qty) || 1));
    const spec = normaliseSpec(input.robe, reasons);
    let geometry: SliderScGeometry | null = null;
    if (spec) {
      geometry = sliderScGeometry({
        profile: spec.profile, leaves: spec.leaves, openingWidth: spec.openingWidth, openingHeight: spec.openingHeight,
        allowances: spec.allowances,
      });
      reasons.push(...geometry.blocks);
      warnings.push(...geometry.warnings.map((w) => `${input.name}: ${w}`));
    }

    let kit: Omit<RobeKitPrice, 'quantity' | 'cost'> | null = null;
    if (spec && geometry && geometry.kitLength > 0) {
      const sel = selectRobeKit(spec, geometry.kitLength, opts.hardware, capture);
      if ('reason' in sel) reasons.push(sel.reason);
      else kit = sel.kit;
    }

    let material: MaterialPricingRecord | null = null;
    let leafMassKg = NaN;
    let edgeAlloc: EdgeTapeAllocation | null = null;
    let mirrorBuildUp: Prepared['mirrorBuildUp'] = null;
    if (spec && geometry && geometry.blocks.length === 0) {
      const { w: panelW, h: panelH } = geometry.panelCut;
      const panels = spec.leaves * qty;
      if (spec.infill === 'board') {
        const askedId = spec.infillMaterialId;
        const id = askedId ?? String(input.exteriorMaterialId ?? opts.defaultInfillMaterialId ?? '').trim();
        const m = id ? resolveMaterial(id, opts.materials) : undefined;
        if (!id) {
          reasons.push('board infill has no robe.infillMaterialId and the job has no exterior material to fall back on');
        } else if (!m) {
          reasons.push(`board infill "${id}" is not a material_pricing id or item_code`);
        } else {
          const missing = [
            !(pos(m.thickness) > 0) && 'thickness', !(pos(m.sheet_length) > 0) && 'sheet_length',
            !(pos(m.sheet_width) > 0) && 'sheet_width', !(pos(m.area_cost) > 0) && 'area_cost',
          ].filter(Boolean);
          if (missing.length) {
            reasons.push(`board infill "${m.name}" (${m.item_code}) has no ${missing.join(' / ')} in material_pricing`);
          } else {
            material = m;
            const t = pos(m.thickness);
            if (!askedId) {
              warnings.push(`${input.name}: no robe.infillMaterialId - the leaves are priced in the job's door finish ${m.name} (${m.item_code}); send the infill board if it is a different decor (both faces of a robe leaf show)`);
            }
            if (t < SLIDER_SC_MIN_INSERT_MM || t > SLIDER_SC_MAX_INSERT_MM) {
              reasons.push(`board infill ${m.name} (${m.item_code}) is ${t} mm - the Slider SC takes a 16-18 mm infill`);
            }
            const asked = spec.infillThickness;
            if (asked !== null) {
              if (asked < SLIDER_SC_MIN_INSERT_MM || asked > SLIDER_SC_MAX_INSERT_MM) {
                reasons.push(`robe.infillThickness ${asked} mm is outside the 16-18 mm the Slider SC takes`);
              } else if (Math.abs(asked - t) > 0.01) {
                warnings.push(`${input.name}: robe.infillThickness ${asked} mm but ${m.name} (${m.item_code}) is ${t} mm - priced as the ${t} mm board that is bought`);
              }
            }
            const sheetL = pos(m.sheet_length);
            const sheetW = pos(m.sheet_width);
            if (!partFitsSheet(panelH, panelW, sheetL, sheetW)) {
              const usable = `${Math.max(sheetL, sheetW) - SHEET_TRIM_MM} x ${Math.min(sheetL, sheetW) - SHEET_TRIM_MM}`;
              reasons.push(`the ${mm(panelW)} x ${mm(panelH)} mm leaf panel cannot be cut from ${m.name} (${m.item_code}), a ${sheetL} x ${sheetW} mm sheet (${usable} mm usable after the ${SHEET_TRIM_MM} mm trim), even turned 90 degrees - choose that decor on a 3600 x 1800 sheet, a narrower leaf (Handle instead of Slimline, or 3 leaves), or a lower door`);
            }
            leafMassKg = sliderScLeafMassKg({ panelW, panelH, infill: 'board', boardThicknessMm: t });
            if (leafMassKg >= SLIDER_SC_MAX_LEAF_KG) {
              reasons.push(`estimated leaf mass ${leafMassKg.toFixed(1)} kg is not under Hafele's 50 kg per door (installation page 3) - ${mm(panelW)} x ${mm(panelH)} x ${t} mm board at ${SLIDER_SC_MASS_DEFAULTS.boardDensityKgM3} kg/m3 plus ${SLIDER_SC_MASS_DEFAULTS.profileHardwareKg} kg of profiles and hardware (Ben's app estimate)`);
            }
            if (reasons.length === 0) {
              const edgeSel = String(input.edgeId ?? opts.defaultEdgeId ?? '').trim() || undefined;
              const part: PartDimension = {
                name: 'Robe door panel', partType: 'Robe door panel', length: panelH, width: panelW,
                area: (panelH * panelW) / 1e6, thickness: t, materialId: m.id, materialRole: 'exterior',
                edging: { len1: true, len2: true, wid1: true, wid2: true },
                quantity: panels, handlingCost: 0, machiningCost: 0, assemblyCost: 0,
              };
              edgeAlloc = calculateEdgeTape([part], opts.edges, edgeSel)[0] ?? null;
              if (edgeAlloc?.isFallbackPrice) {
                warnings.push(`${input.name}: edge "${edgeSel ?? '(none selected)'}" has no priced edge_pricing row - the tape is priced at the $2.50/m fallback`);
              }
            }
          }
        }
      } else {
        // The 16-18 mm rule has no mirror exception (build pack SC-17, Validation Test T09: 5 + 14 = 19 mm BLOCKS;
        // Ben 17 Sep: 16-18 accepted). infillThickness on a mirror opening is the glass + backer build-up.
        const d = SLIDER_SC_MASS_DEFAULTS;
        const asked = spec.infillThickness;
        if (asked !== null && (asked < SLIDER_SC_MIN_INSERT_MM || asked > SLIDER_SC_MAX_INSERT_MM)) {
          reasons.push(`robe.infillThickness ${asked} mm mirror build-up (glass + backer) is outside the 16-18 mm the Slider SC takes (build pack SC-17 / T09)`);
        }
        const totalMm = asked ?? d.mirrorThicknessMm + d.backerThicknessMm;
        // ASSUMED split: the glass stays Ben's app's 4 mm and the backer is the rest - nobody knows the real build-up
        const backerMm = Math.max(0, totalMm - d.mirrorThicknessMm);
        mirrorBuildUp = { totalMm, glassMm: d.mirrorThicknessMm, backerMm, sent: asked !== null };
        leafMassKg = sliderScLeafMassKg({ panelW, panelH, infill: 'mirror', backerThicknessMm: backerMm });
        if (spec.infillMaterialId) {
          warnings.push(`${input.name}: robe.infillMaterialId is for board infill and is ignored on a mirror opening`);
        }
      }
    }

    if (reasons.length || !spec || !geometry || !kit) {
      if (reasons.length === 0) reasons.push('the robe row could not be priced');
      blocked.push({ index: input.index, name: input.name, qty, reasons, geometry });
      continue;
    }
    prepared.push({
      input, qty, spec, geometry,
      kit: { ...kit, quantity: qty, cost: money(kit.price * qty) },
      material, panels: spec.leaves * qty, edgeAlloc, leafMassKg, mirrorBuildUp, warnings,
    });
  }

  // ---- whole sheets: a real nest of the leaves, per board, across every robe row on it ------------------------
  const sheets: RobeSheetUse[] = [];
  const boardByRow = new Map<Prepared, RobeBoardUse>();
  const byMaterial = new Map<string, Prepared[]>();
  for (const p of prepared) {
    if (!p.material) continue;
    const list = byMaterial.get(p.material.id) ?? [];
    list.push(p);
    byMaterial.set(p.material.id, list);
  }
  for (const group of byMaterial.values()) {
    const m = group[0].material!;
    const sheetL = pos(m.sheet_length);
    const sheetW = pos(m.sheet_width);
    const sheetLong = Math.max(sheetL, sheetW);
    const sheetShort = Math.min(sheetL, sheetW);
    const runs: Array<{ runLengthMm: number; depthMm: number }> = [];
    for (const p of group) {
      const { w, h } = p.geometry.panelCut;
      for (let i = 0; i < p.panels; i++) {
        // long side along the sheet's long side (grain along a tall leaf); every leaf already passed partFitsSheet
        runs.push({ runLengthMm: Math.max(w, h) + ROBE_NEST_SPACING_MM, depthMm: Math.min(w, h) + ROBE_NEST_SPACING_MM });
      }
    }
    const packed = packWholeSheetCuts(runs, sheetLong + ROBE_NEST_SPACING_MM - SHEET_TRIM_MM, sheetShort + ROBE_NEST_SPACING_MM - SHEET_TRIM_MM);
    const sheetCount = Math.max(1, packed.sheets.length);
    const sheetSqm = (sheetL / 1000) * (sheetW / 1000);
    const cost = money(sheetCount * sheetSqm * m.area_cost);
    const areaOf = (p: Prepared) => p.panels * (p.geometry.panelCut.w * p.geometry.panelCut.h) / 1e6;
    const totalArea = group.reduce((s, p) => s + areaOf(p), 0);
    let assigned = 0;
    group.forEach((p, gi) => {
      const share = totalArea > 0 ? areaOf(p) / totalArea : 1 / group.length;
      const rowCost = gi === group.length - 1 ? money(cost - assigned) : money(cost * share);
      assigned = money(assigned + rowCost);
      boardByRow.set(p, {
        material: m.name, materialId: m.id, itemCode: m.item_code, thickness: pos(m.thickness),
        sheetLength: sheetL, sheetWidth: sheetW, areaCost: m.area_cost, panels: p.panels, fitOk: true,
        sheets: sheetCount, sheetsShare: r3(sheetCount * share), cost: rowCost,
      });
    });
    sheets.push({
      materialId: m.id, itemCode: m.item_code, name: m.name, thickness: pos(m.thickness), sheetLength: sheetL, sheetWidth: sheetW,
      areaCost: m.area_cost, rows: group.map((p) => p.input.index), panels: group.reduce((s, p) => s + p.panels, 0),
      panelAreaSqm: r3(totalArea), sheets: sheetCount, chargedSqm: r3(sheetCount * sheetSqm), cost,
    });
  }

  // ---- edge tape: all four sides, one 20 m minimum per tape per JOB --------------------------------------------
  const edges: RobeEdgeGroup[] = [];
  const edgeByRow = new Map<Prepared, RobeEdgeUse>();
  const byEdge = new Map<string, Prepared[]>();
  for (const p of prepared) {
    if (!p.edgeAlloc) continue;
    const list = byEdge.get(p.edgeAlloc.edgeType) ?? [];
    list.push(p);
    byEdge.set(p.edgeAlloc.edgeType, list);
  }
  for (const [edgeType, group] of byEdge) {
    const t = group[0].edgeAlloc!;
    const metres = group.reduce((s, p) => s + p.edgeAlloc!.linearMeters, 0);
    const jobMetres = Math.max(0, toNum(opts.jobEdgeMetres?.[edgeType]) || 0);
    const boughtMetres = edgeOrderMetres(jobMetres + metres) - edgeOrderMetres(jobMetres);
    const material = boughtMetres * t.costPerMeter;
    const applicationCost = group.reduce((s, p) => s + p.edgeAlloc!.applicationCost, 0);
    const handlingCost = group.reduce((s, p) => s + p.edgeAlloc!.handlingCost, 0);
    const cost = money(material + applicationCost + handlingCost);
    let assigned = 0;
    group.forEach((p, gi) => {
      const a = p.edgeAlloc!;
      const rowCost = gi === group.length - 1
        ? money(cost - assigned)
        : money(a.applicationCost + a.handlingCost + (metres > 0 ? material * (a.linearMeters / metres) : 0));
      assigned = money(assigned + rowCost);
      edgeByRow.set(p, { edgeType, name: a.edgeName, metres: r3(a.linearMeters), cost: rowCost, fallbackPrice: Boolean(a.isFallbackPrice) });
    });
    edges.push({
      edgeType, name: t.edgeName, thickness: t.thickness, costPerMeter: t.costPerMeter, metres: r3(metres), jobMetres: r3(jobMetres),
      boughtMetres, applicationCost: money(applicationCost), handlingCost: money(handlingCost), cost,
      applicationPriced: group.some((p) => (p.edgeAlloc!.applicationCost ?? 0) > 0),
    });
  }

  // ---- per-row result ------------------------------------------------------------------------------------------
  const warnings: string[] = [];
  const out: RobeOpeningRow[] = prepared.map((p) => {
    const g = p.geometry;
    const board = boardByRow.get(p) ?? null;
    const edge = edgeByRow.get(p) ?? null;
    const isBoard = p.spec.infill === 'board';
    const { w: panelW, h: panelH } = g.panelCut;
    // edged on all four sides: the saw cut is one edge thickness in from each side
    const edgeT = isBoard && p.edgeAlloc && pos(p.edgeAlloc.thickness) > 0 ? pos(p.edgeAlloc.thickness) : 0;
    const panelFinished = { w: panelW, h: panelH };
    const panelSaw = { w: r3(panelW - 2 * edgeT), h: r3(panelH - 2 * edgeT) };
    const edgeMetres = edge ? edge.metres : 0;
    const inKit = SLIDER_SC_KIT_DAMPERS * p.qty;
    const neededPerOpening = p.spec.softCloseAllLeaves ? ROBE_DAMPERS_PER_LEAF * p.spec.leaves : SLIDER_SC_KIT_DAMPERS;
    const needed = Math.max(SLIDER_SC_KIT_DAMPERS, neededPerOpening) * p.qty;
    const extra = Math.max(0, needed - inKit);
    const large = Math.max(panelW, panelH) >= largeSide && (panelW * panelH) / 1e6 >= largeArea;
    const fabrication: RobeFabricationInputs = {
      ...EMPTY_ROBE_FABRICATION,
      openings: p.qty,
      leaves: p.panels,
      boardParts: isBoard ? p.panels : 0,
      cutLm: isBoard ? r3(p.panels * (2 * (panelW + panelH)) / 1000) : 0,
      boughtParts: isBoard ? 0 : p.panels,
      edgeLm: isBoard ? edgeMetres : 0,
      largeLooseParts: large ? p.panels : 0,
      looseParts: large ? 0 : p.panels,
    };
    const r = DEFAULT_WORKSHOP_RATES;
    const minutes = {
      setUp: assembles ? p.qty * r.robeOpeningSetupMin : 0,
      leaves: assembles ? p.panels * r.robeLeafAssemblyMin : 0,
      install: installs ? p.qty * r.installRobeOpeningMin : 0,
    };
    const kitCost = p.kit.cost;
    const boardCost = board?.cost ?? 0;
    const edgeCost = edge?.cost ?? 0;
    const unpricedItems: string[] = [];
    /** LOUD warnings (a price that is missing or unconfirmed) come before the row's working. */
    const loud: string[] = [];
    const info: string[] = [];
    const n = p.input.name;
    const opening = `${p.spec.leaves}-leaf ${cap(p.spec.profile)} ${p.spec.finish}`;

    info.push(
      `${n}: priced as ${p.qty} x Hafele Slider SC ${opening} opening${p.qty > 1 ? 's' : ''} - clear ${mm(g.icw)} x ${mm(g.ih)} mm, `
      + `${p.spec.leaves} leaves ${mm(g.leafWidth)} mm finished, panels ${mm(panelW)} x ${mm(panelH)} mm finished`
      + (edgeT > 0 ? ` (cut ${mm(panelSaw.w)} x ${mm(panelSaw.h)} mm before the ${mm(edgeT)} mm edge)` : '')
      + `, kit ${p.kit.item_code} (${g.kitLength} mm track) at ${fmt(p.kit.price)}`
      + (board ? `, ${board.panels} panel(s) in ${board.material} (${board.itemCode}) - ${board.sheets} whole ${board.sheetLength} x ${board.sheetWidth} sheet(s) nested across the robe rows on that board` : '')
      + (edge ? `, ${edgeMetres.toFixed(3)} m of ${edge.name} edge tape on all four sides` : '')
      + `; shop ${minutes.setUp} min set-up + ${minutes.leaves} min leaf assembly, install ${minutes.install} min (Ben, 17 Sep 2026)`,
    );
    if (p.kit.unconfirmed) {
      loud.push(`KIT PRICE UNCONFIRMED: ${n} - ${p.kit.item_code} ${p.kit.name} at ${fmt(p.kit.price)} is ${p.kit.priceBasis}. The GST basis of that Net price is not confirmed; the article is on the Hafele trade-price capture list and the captured ex GST buy price replaces it automatically.`);
    }
    if (!isBoard) {
      unpricedItems.push(`${n}: mirror glass ${p.panels} x ${mm(panelW)} x ${mm(panelH)} mm - NOT PRICED`);
      loud.push(`MIRROR NOT PRICED: ${n} needs ${p.panels} mirror panel(s) ${mm(panelW)} x ${mm(panelH)} mm. Mirror is charged as a whole sheet as bought, but no mirror sheet size, price or supplier is in the catalogue, so this line EXCLUDES the mirror (and any backer) - price it by hand before the quote goes out. Everything else on the opening is priced.`);
      const bu = p.mirrorBuildUp;
      const buText = bu
        ? `${bu.totalMm} mm build-up${bu.sent ? '' : ' (none sent - 16 mm assumed)'}, taken as ${bu.glassMm} mm glass + ${bu.backerMm} mm backer (the split is an ASSUMPTION)`
        : '4 mm glass + 12 mm backer';
      info.push(`${n}: Hafele does not specify a mirror infill for the Slider SC (build pack USR-01: supplier approval required). Ben's app estimates ${p.leafMassKg.toFixed(1)} kg a leaf for ${buText} - ${p.leafMassKg >= SLIDER_SC_MAX_LEAF_KG ? 'OVER' : 'under'} the 50 kg per door limit; the build-up is unconfirmed, so weigh it before production.`);
    }
    if (extra > 0) {
      unpricedItems.push(`${n}: ${extra} extra soft-close damper(s) - NOT PRICED`);
      loud.push(`SOFT-CLOSE DAMPERS NOT PRICED: ${n} has soft close on all ${p.spec.leaves} leaves, which needs ${needed} dampers (${ROBE_DAMPERS_PER_LEAF} a leaf) against the ${inKit} in the kit${p.qty > 1 ? 's' : ''} - ${extra} extra to buy. No damper part number or price is in the catalogue: add them by hand.`);
    } else if (p.spec.leaves === 3 && !p.spec.softCloseAllLeaves) {
      info.push(`${n}: soft close NOT on all leaves - the kit's 4 dampers cover 2 of the 3 leaves both ways; do not describe every leaf as soft close.`);
    }
    const rowWarnings = [...loud, ...info, ...p.warnings];
    warnings.push(...rowWarnings);

    return {
      index: p.input.index,
      name: n,
      qty: p.qty,
      spec: p.spec,
      geometry: g,
      panelFinished,
      panelCut: panelSaw,
      kit: p.kit,
      board,
      edge,
      edgeMetres,
      dampers: { inKit, needed, extra, priced: false },
      mirror: { required: !isBoard, priced: false, panels: isBoard ? 0 : p.panels, panelCut: isBoard ? null : { w: panelW, h: panelH } },
      leafMassKg: r3(p.leafMassKg),
      fabrication,
      kitCost,
      boardCost,
      edgeCost,
      materialCost: money(kitCost + boardCost + edgeCost),
      minutes,
      unpricedItems,
      warnings: rowWarnings,
    };
  });

  const kitLines = new Map<string, RobeKitLine>();
  for (const row of out) {
    const hit = kitLines.get(row.kit.item_code);
    if (hit) {
      hit.quantity += row.kit.quantity;
      hit.cost = money(hit.cost + row.kit.cost);
    } else {
      kitLines.set(row.kit.item_code, {
        code: row.kit.item_code, name: row.kit.name, quantity: row.kit.quantity, unitCost: row.kit.price, cost: row.kit.cost, unconfirmed: row.kit.unconfirmed,
      });
    }
  }

  return {
    rows: out,
    blocked,
    sheets,
    edges,
    kits: [...kitLines.values()],
    fabrication: sumRobeFabrication(out.map((r) => r.fabrication)),
    edgeApplicationPriced: edges.some((e) => e.applicationPriced),
    warnings,
  };
}
