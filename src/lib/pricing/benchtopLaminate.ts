/**
 * Laminated solid-surface benchtops, priced from a schedule row.
 *
 * A 24 mm Meganite top is not a 24 mm sheet: it is two 12 mm sheets glued
 * face to face (or one skin plus build-up strips), cut, joined, sanded and
 * polished in the shop. Microvellum models it as a fictional 24 mm sheet with
 * a placeholder cost and no fabrication labour, so its figure is not a
 * calibration target — BowerOS prices what the shop actually buys and does.
 *
 * Pure: takes schedule rows and the material_pricing catalogue, returns the
 * material working plus the fabrication quantities the workshop model turns
 * into station minutes (workshopModel.ts `benchtops`). No I/O.
 *
 * Material is nested whole-sheet across EVERY benchtop row that shares a
 * sheet id (the same rule calculateBenchtops uses for placed cabinets), so two
 * rows never each round up to a sheet they could have shared.
 */
import { packWholeSheetCuts } from './benchtopCalculator';
import type { MaterialPricingRecord } from './types';
import {
  EMPTY_BENCHTOP_FABRICATION,
  sumBenchtopFabrication,
  type BenchtopFabricationInputs,
} from './workshopModel';

export interface BenchtopPiece {
  /** length, mm */
  l: number;
  /** width (depth of the top), mm */
  w: number;
}

export interface BenchtopCutouts {
  sink?: number;
  cooktop?: number;
  tapHole?: number;
}

/**
 * What kind of top this row is.
 *
 * 'laminated'  a solid-surface sheet fabricated in the shop: slab, build-up
 *              strips, glued seams, sanded and polished (Meganite, HIMACS).
 * 'blank'      a PRE-MADE laminate benchtop blank bought finished by the metre
 *              (EGGER 38 mm postformed worktop): one layer, cut to length,
 *              cut ends edged. No lamination, no glued seams, NO polishing -
 *              the face and the front edge arrive finished.
 */
export type BenchtopKind = 'laminated' | 'blank';

/** The benchtop-relevant subset of a schedule row. */
export interface LaminatedBenchtopRowInput {
  /** Position in the caller's schedule, echoed back so lines can be matched. */
  index: number;
  name: string;
  qty?: number;
  w: number;
  h: number;
  d: number;
  /** Source quote's sell figure — the passthrough fallback when the row cannot be engine-priced. */
  mv_total?: number;
  /** material_pricing.id or item_code of the SHEET the top is laminated from. */
  benchtopMaterialId?: string;
  /**
   * 'blank' = a pre-made laminate benchtop blank, priced as whole blanks, one
   * layer, no lamination / polishing / glued joins. Omitted: inferred from the
   * catalogue row by isBenchtopBlankSheet, else 'laminated' (today's pricing).
   */
  benchtopKind?: BenchtopKind;
  /** Finished thickness, mm (12 / 24 / 36). A blank is always its own thickness. */
  benchtopThickness?: number;
  /**
   * Blanks only: exposed CUT ends per unit that need an edging strip. The
   * factory ends and the postformed front edge are already finished. Omitted:
   * one per piece, with a warning.
   */
  benchtopExposedEnds?: number;
  /** Blank sizes per unit when w x d is not the top (L-shape arms, waterfall legs). */
  benchtopPieces?: BenchtopPiece[];
  /** Each end adds a leg { l: h - thickness, w: d } and one join — only when benchtopPieces is absent. */
  benchtopWaterfallEnds?: number;
  /** Mitres / field joins per unit. Width joins forced by stock size are added automatically. */
  benchtopJoins?: number;
  /** Metres of EXPOSED edge that gets built up, per unit. Default: the front edge of each blank. */
  benchtopEdgeLm?: number;
  /** Build-up strip width, mm (default 50). The apron depth when the edge is mitred. */
  benchtopStripWidth?: number;
  /** Cut-out counts per unit. */
  benchtopCutouts?: BenchtopCutouts;
}

export interface LaminatedBenchtopSheet {
  id: string;
  item_code: string;
  name: string;
  thickness: number;
  sheet_length: number;
  sheet_width: number;
  area_cost: number;
}

export interface LaminatedBenchtopRow {
  index: number;
  name: string;
  qty: number;
  sheet: LaminatedBenchtopSheet;
  /** 'blank' = pre-made laminate blank; 'laminated' = fabricated solid surface. */
  kind: BenchtopKind;
  /** Blanks only: whole blanks bought for every row sharing this blank. */
  blanks?: number;
  /** Blanks only: crosscuts to length. */
  cuts: number;
  /** Blanks only: exposed cut ends that get an edging strip. */
  exposedEnds: number;
  /** Requested finished thickness, mm. */
  thickness: number;
  layers: number;
  /** layers x sheet.thickness — differs from `thickness` when it is not a multiple. */
  nominalThickness: number;
  /** Every blank across all units (qty expanded), before any stock-size split. */
  pieces: BenchtopPiece[];
  areaSqm: number;
  edgeLm: number;
  /** Sum of piece lengths, m — install scribing/fitting. */
  benchtopLm: number;
  /** All joins: declared mitres/field joins + stock-size splits x layers. */
  joins: number;
  /** The subset of `joins` forced by pieces larger than the stock sheet. */
  stockJoins: number;
  cutouts: { sink: number; cooktop: number; tapHole: number };
  /** Fractional share of the shared sheet count attributed to this row. */
  sheetsShare: number;
  /** Whole sheets bought for every row sharing this sheet id. */
  jobSheets: number;
  /** Sheet material only (row share of jobSheets x sheet area x area_cost). */
  materialCost: number;
  adhesiveCartridges: number;
  adhesiveCost: number;
  fabrication: BenchtopFabricationInputs;
  warnings: string[];
}

export interface LaminatedBenchtopSheetUse {
  sheet: LaminatedBenchtopSheet;
  /** How the rows on this sheet are priced. Blanks are bought whole, by length. */
  kind: BenchtopKind;
  /** The unit the stock is CHARGED in: 'lm' for a pre-made blank, 'm2' for a fabricated sheet. */
  priceUnit: 'lm' | 'm2';
  /** How many of that unit were bought (lineal metres of blank, or m2 of sheet). */
  chargedUnits: number;
  /** $ per charged unit — sheet.area_cost, read as $/lm on a blank (see blankPrice). */
  unitCost: number;
  /** schedule indexes of the rows cut from this sheet */
  rows: number[];
  sheetAreaSqm: number;
  /** sum(areaSqm x layers) over the rows */
  layeredAreaSqm: number;
  wasteFactor: number;
  /** whole-sheet nest result */
  packedSheets: number;
  /** ceil(layeredArea x (1 + waste) / sheetArea) */
  areaSheets: number;
  /** max(1, packedSheets, areaSheets) */
  jobSheets: number;
  materialCost: number;
}

export interface LaminatedBenchtopPassthrough {
  index: number;
  name: string;
  reason: string;
}

export interface LaminatedBenchtopResult {
  /** Engine-priced rows, in schedule order. */
  rows: LaminatedBenchtopRow[];
  /** Rows that could not be engine-priced; the caller carries them at mv_total. */
  passthrough: LaminatedBenchtopPassthrough[];
  sheets: LaminatedBenchtopSheetUse[];
  /** Job total handed to calculateWorkshopCost({ benchtops }). */
  fabrication: BenchtopFabricationInputs;
  adhesive: { code: string; name: string; quantity: number; unitCost: number; cost: number };
  warnings: string[];
}

export interface LaminatedBenchtopOptions {
  /** QuoteSelections.benchtopMaterialId — used when a row has none. */
  defaultMaterialId?: string;
  /** QuoteSelections.benchtopThickness ?? dimensions.benchtopThickness ?? 24. */
  defaultThickness?: number;
  /** Fraction of layered area added before the area-based sheet count. Default 0.05. */
  wasteFactor?: number;
  /** $ per adhesive cartridge. Default 35 (placeholder rate). */
  adhesiveUnitCost?: number;
  /** Blanks only: mm of blank length reserved per cut piece (squaring + kerf). Default 10. */
  blankTrimMm?: number;
}

export const BENCHTOP_ADHESIVE_CODE = 'SS-ADHESIVE';
export const DEFAULT_BENCHTOP_WASTE = 0.05;
/** mm of blank length reserved per cut piece: squaring the factory end + saw kerf. */
export const DEFAULT_BLANK_TRIM_MM = 10;
/**
 * Shape of a pre-made benchtop blank in material_pricing. Build Flow mirrors
 * this predicate in its sheet picker, so keep the two in step (the catalogue
 * response must carry thickness, sheet_width and material_type).
 *
 *   thickness 30-45 mm AND sheet_width <= 1000 AND not a solid-surface type.
 *
 * Checked against the live catalogue (16 Sep 2026): it selects exactly the 39
 * EGGER 38 mm worktops (3650 x 600 and 3650 x 920) and nothing else. Every
 * MEGANITE row is solid_surface_sheet at 6-20 mm; the thick Polytec boards
 * (32 / 33 / 38 mm, POLY52428 included) are 1200-1830 wide. A material_type
 * that says so outright ('benchtop_blank', 'laminate_worktop') wins outright,
 * so retyping the rows later needs no shape test.
 */
export const BLANK_MIN_THICKNESS_MM = 30;
export const BLANK_MAX_THICKNESS_MM = 45;
export const BLANK_MAX_WIDTH_MM = 1000;
const BLANK_TYPE_RE = /benchtop[\s_-]*blank|laminate[\s_-]*(?:bench|work)\s*top|worktop/i;
const FABRICATED_TYPE_RE = /solid[\s_-]*surface|stone|quartz|porcelain|slab/i;

export function isBenchtopBlankSheet(m: {
  material_type?: string | null;
  thickness?: number | string | null;
  sheet_width?: number | string | null;
}): boolean {
  const type = String(m.material_type ?? '');
  if (BLANK_TYPE_RE.test(type)) return true;
  if (FABRICATED_TYPE_RE.test(type)) return false;
  // PostgREST hands numerics back as strings, and so does a JSON catalogue.
  const num = (v: unknown): number => {
    const n = typeof v === 'string' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
  };
  const t = num(m.thickness);
  const w = num(m.sheet_width);
  return t >= BLANK_MIN_THICKNESS_MM && t <= BLANK_MAX_THICKNESS_MM && w > 0 && w <= BLANK_MAX_WIDTH_MM;
}

/**
 * Which pricing a row gets. An explicit row.benchtopKind always wins (the
 * dialog decides with the same predicate); otherwise the catalogue row decides.
 */
export function resolveBenchtopKind(
  asked: BenchtopKind | undefined,
  sheet: { material_type?: string | null; thickness?: number | null; sheet_width?: number | null },
): { kind: BenchtopKind; inferred: boolean; disagrees: boolean } {
  const looksBlank = isBenchtopBlankSheet(sheet);
  if (asked === 'blank' || asked === 'laminated') {
    return { kind: asked, inferred: false, disagrees: (asked === 'blank') !== looksBlank };
  }
  return { kind: looksBlank ? 'blank' : 'laminated', inferred: looksBlank, disagrees: false };
}
/** MEGANITE 50 mL joint adhesive inc 2 tips, fabricator price list 1 July 2024. */
export const DEFAULT_ADHESIVE_UNIT_COST = 15.9;
/** Metres of glue line one 50 mL cartridge covers. */
const ADHESIVE_STRIP_M_PER_CARTRIDGE = 2.5;

/**
 * A benchtop thicker than its sheet is NOT a stack of full slabs - the SHEET stays one layer and the
 * EDGE is built up with strips on the underside (HIMACS HM2120 "Drop Edges & Downturns" 2-1: "simply
 * stack layers on the underside of the sheet ... 2 layers (24mm) or 3 layers (36mm) stacking are
 * general"; the same technique across Meganite / Corian / Staron). Deeper than that and the edge is
 * a mitred / rebated apron (2-2, 2-3) carried on a substrate packer. So the extra over a plain top
 * is the strips, the substrate and the labour - never another slab of solid surface.
 */
export type BenchtopBuildUp = 'none' | 'stacked' | 'mitred';
/** Strips stack to this many layers before the edge becomes a mitred apron (HM2120 2-1: 24 and 36 mm). */
const MAX_STACKED_LAYERS = 3;
/** Build-up strip width, mm. HM2120 uses 50 mm blocks/strips for edge and corner build-up. */
const DEFAULT_STRIP_WIDTH_MM = 50;

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const pos = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

/**
 * What whole blanks cost. A pre-made benchtop blank is bought BY THE LINEAL METRE of its stock
 * width, not by the square metre: the supplier's list prices the 600 and the 920 deep worktop of
 * ONE decor differently ($76.70 and $123.79 a metre), which a genuine $/m2 rate never does.
 *
 * material_pricing carries that per-metre figure in `area_cost` and labels it price_unit 'm2'
 * (verified 16 Sep 2026: EGGPPRWS3606 $76.70 = benchtop_pricing.price_per_lm for Egger
 * 'Standard 600', pricing_method 'per_lm', stock 3650 x 600 x 38). Reading it as $/m2 charged
 * 2.19 m2 x $76.70 = $167.97 for a 3.65 m blank that costs $279.96 - 40% light on EVERY 600 wide
 * blank, and 8% on a 920. So a blank is charged on its length, and the row says so in a warning
 * with both figures, because the label in the catalogue still disagrees.
 */
function blankPrice(blanks: number, sheet: LaminatedBenchtopSheet) {
  const lm = r3(blanks * (sheet.sheet_length / 1000));
  const areaSqm = (sheet.sheet_length / 1000) * (sheet.sheet_width / 1000);
  return {
    unit: 'lm' as const,
    units: lm,
    unitCost: sheet.area_cost,
    cost: money(lm * sheet.area_cost),
    /** What the same blanks would cost if the rate really were $/m2 — quoted in the warning. */
    asArea: money(blanks * areaSqm * sheet.area_cost),
  };
}

function fmtMoney(n: number | undefined): string {
  return `$${money(n ?? 0).toFixed(2)}`;
}

/** Find the sheet by material_pricing.id, then by item_code (case-insensitive). */
export function resolveBenchtopSheet(
  id: string | undefined,
  materials: MaterialPricingRecord[],
): MaterialPricingRecord | undefined {
  const key = String(id ?? '').trim();
  if (!key) return undefined;
  const lower = key.toLowerCase();
  return materials.find((m) => m.id === key)
    ?? materials.find((m) => String(m.item_code ?? '').toLowerCase() === lower);
}

function toSheet(m: MaterialPricingRecord): LaminatedBenchtopSheet | { missing: string[] } {
  const missing: string[] = [];
  if (!(pos(m.thickness) > 0)) missing.push('thickness');
  if (!(pos(m.sheet_length) > 0)) missing.push('sheet_length');
  if (!(pos(m.sheet_width) > 0)) missing.push('sheet_width');
  if (!(pos(m.area_cost) > 0)) missing.push('area_cost');
  if (missing.length) return { missing };
  return {
    id: m.id,
    item_code: m.item_code,
    name: m.name,
    thickness: m.thickness as number,
    sheet_length: m.sheet_length as number,
    sheet_width: m.sheet_width as number,
    area_cost: m.area_cost,
  };
}

interface PreparedRow {
  input: LaminatedBenchtopRowInput;
  qty: number;
  sheet: LaminatedBenchtopSheet;
  kind: BenchtopKind;
  /** Blanks only: blank length consumed by each cut piece, mm (trim included). */
  segments: number[];
  /** Blanks only: crosscuts to length. */
  cuts: number;
  /** Blanks only: exposed cut ends to edge. */
  exposedEnds: number;
  /** Blanks only: mitre-bolt joins (declared + sections of an over-length piece). */
  blankJoins: number;
  thickness: number;
  layers: number;
  nominalThickness: number;
  buildUp: BenchtopBuildUp;
  /** Metres of edge that gets built up - the exposed run, not every blank's perimeter. */
  builtUpEdgeLm: number;
  /** Sheet the build-up strips consume: builtUpEdgeLm x strip width x (layers - 1), m2. */
  stripSqm: number;
  /** Substrate packer behind a mitred apron, m2 (0 for a stacked edge - the strips carry it). */
  substrateSqm: number;
  pieces: BenchtopPiece[];
  areaSqm: number;
  edgeLm: number;
  benchtopLm: number;
  declaredJoins: number;
  stockJoins: number;
  cutouts: { sink: number; cooktop: number; tapHole: number };
  warnings: string[];
}

function prepareRow(
  row: LaminatedBenchtopRowInput,
  sheet: LaminatedBenchtopSheet,
  defaultThickness: number,
): PreparedRow {
  const warnings: string[] = [];
  const qty = Math.max(1, Math.round(row.qty ?? 1));

  let thickness = pos(row.benchtopThickness);
  if (!thickness) {
    thickness = pos(defaultThickness) || 24;
    if (row.benchtopThickness !== undefined) {
      warnings.push(`${row.name}: benchtopThickness ${row.benchtopThickness} is not a positive number - ${thickness} mm used`);
    }
  }
  // Layers are the EDGE build-up, not the slab. 24 mm off a 12 mm sheet is one sheet with a
  // 12 mm strip stacked under the edge, so only the strip is extra material (HM2120 2-1).
  const layers = Math.max(1, Math.ceil(thickness / sheet.thickness - 1e-9));
  const nominalThickness = layers * sheet.thickness;
  const buildUp: BenchtopBuildUp =
    layers <= 1 ? 'none' : layers <= MAX_STACKED_LAYERS ? 'stacked' : 'mitred';
  if (Math.abs(nominalThickness - thickness) > 0.01 && buildUp === 'stacked') {
    warnings.push(`${row.name}: ${thickness} mm is not a multiple of the ${sheet.thickness} mm sheet - built up to ${nominalThickness} mm (${layers} layers of strip)`);
  }

  // Blanks per unit.
  const { unitPieces, waterfallJoins } = unitPiecesOf(row, thickness, warnings);

  const pieces: BenchtopPiece[] = [];
  for (let n = 0; n < qty; n++) pieces.push(...unitPieces.map((p) => ({ ...p })));

  const areaSqm = pieces.reduce((s, p) => s + (p.l * p.w) / 1e6, 0);
  const edgeLm = pieces.reduce((s, p) => s + (2 * (p.l + p.w)) / 1000, 0);
  const benchtopLm = pieces.reduce((s, p) => s + p.l / 1000, 0);

  // Stock-size splits: a piece larger than the sheet becomes a grid of stock
  // pieces; every extra piece in that grid is a join, in EVERY layer.
  let stockJoins = 0;
  const wideWarned = new Set<number>();
  for (const p of pieces) {
    const across = Math.ceil(p.w / sheet.sheet_width - 1e-9);
    const along = Math.ceil(p.l / sheet.sheet_length - 1e-9);
    const gridJoins = Math.max(0, across * along - 1);
    stockJoins += gridJoins * layers;
    if (across > 1 && !wideWarned.has(p.w)) {
      wideWarned.add(p.w);
      warnings.push(`${row.name}: ${p.w} mm deep exceeds the ${sheet.sheet_width} mm sheet - a ${p.w - sheet.sheet_width} mm width join per layer is included (${gridJoins * layers} joins on this piece)`);
    }
    if (along > 1) {
      warnings.push(`${row.name}: ${p.l} mm long exceeds the ${sheet.sheet_length} mm sheet - a length join per layer is included`);
    }
  }

  const declaredJoins = (Math.max(0, Math.round(row.benchtopJoins ?? 0)) + waterfallJoins) * qty;
  const c = row.benchtopCutouts ?? {};
  const cutouts = {
    sink: Math.max(0, Math.round(c.sink ?? 0)) * qty,
    cooktop: Math.max(0, Math.round(c.cooktop ?? 0)) * qty,
    tapHole: Math.max(0, Math.round(c.tapHole ?? 0)) * qty,
  };

  // The built-up run is the EXPOSED edge, not every blank's perimeter: a top's front edge and its
  // returns show, the wall edge does not. Default to the front edge of each blank; a job that knows
  // better passes benchtopEdgeLm.
  const givenEdge = pos(row.benchtopEdgeLm);
  const builtUpEdgeLm = buildUp === 'none' ? 0 : (givenEdge > 0 ? givenEdge * qty : benchtopLm);
  const stripWidthMm = pos(row.benchtopStripWidth) || DEFAULT_STRIP_WIDTH_MM;
  const stripSqm = buildUp === 'stacked'
    ? (builtUpEdgeLm * (stripWidthMm / 1000)) * (layers - 1)
    : buildUp === 'mitred'
      ? builtUpEdgeLm * (Math.max(thickness, stripWidthMm) / 1000)   // the apron face, folded down
      : 0;
  // A mitred apron is carried on a substrate packer; a stacked edge is solid strip and needs none.
  const substrateSqm = buildUp === 'mitred' ? builtUpEdgeLm * (thickness / 1000) : 0;
  if (buildUp === 'mitred') {
    warnings.push(`${row.name}: ${thickness} mm is deeper than ${MAX_STACKED_LAYERS} stacked layers of the ${sheet.thickness} mm sheet - priced as a mitred apron on a substrate packer, not as stacked strip`);
  }

  return {
    input: row, qty, sheet, kind: 'laminated', segments: [], cuts: 0, exposedEnds: 0, blankJoins: 0,
    thickness, layers, nominalThickness, buildUp,
    builtUpEdgeLm, stripSqm, substrateSqm, pieces,
    areaSqm, edgeLm, benchtopLm, declaredJoins, stockJoins, cutouts, warnings,
  };
}

/** Blank sizes per unit, shared by both kinds of top. */
function unitPiecesOf(
  row: LaminatedBenchtopRowInput,
  thickness: number,
  warnings: string[],
): { unitPieces: BenchtopPiece[]; waterfallJoins: number } {
  const given = (row.benchtopPieces ?? []).filter((p) => pos(p?.l) > 0 && pos(p?.w) > 0)
    .map((p) => ({ l: p.l, w: p.w }));
  if (given.length > 0) return { unitPieces: given, waterfallJoins: 0 };

  const unitPieces: BenchtopPiece[] = [];
  let waterfallJoins = 0;
  if (pos(row.w) > 0 && pos(row.d) > 0) unitPieces.push({ l: row.w, w: row.d });
  const ends = Math.max(0, Math.round(row.benchtopWaterfallEnds ?? 0));
  if (ends > 0) {
    const legL = row.h - thickness;
    if (legL > 0 && pos(row.d) > 0) {
      for (let i = 0; i < ends; i++) unitPieces.push({ l: legL, w: row.d });
      waterfallJoins = ends;
    } else {
      warnings.push(`${row.name}: ${ends} waterfall end(s) requested but h ${row.h} - ${thickness} mm leaves no leg - legs not priced`);
    }
  }
  if (unitPieces.length > 0) {
    warnings.push(`${row.name}: no benchtopPieces given - priced from w x d ${row.w} x ${row.d}${ends > 0 ? ` plus ${ends} waterfall leg(s) ${row.h - thickness} x ${row.d}` : ''}; L-shaped and waterfall tops need their blanks from the work order`);
  }
  return { unitPieces, waterfallJoins };
}

/**
 * A PRE-MADE laminate benchtop blank (EGGER 38 mm postformed worktop).
 *
 * Ben, 16 Sep 2026: a blank is bought whole, like a board - so the job buys the
 * blanks the pieces need off the blank LENGTH (whole blanks, no area waste
 * factor), one layer, and the shop only crosscuts it, edges the exposed cut
 * ends, bolts any join and cuts whatever cut-outs were asked for. It is NOT
 * laminated, glued or polished: the face and the postformed front edge arrive
 * finished.
 */
function prepareBlankRow(
  row: LaminatedBenchtopRowInput,
  sheet: LaminatedBenchtopSheet,
  trimMm: number,
): PreparedRow {
  const warnings: string[] = [];
  const qty = Math.max(1, Math.round(row.qty ?? 1));

  // A blank's finished thickness is the blank's own. The MV / dialog figure (39 mm
  // on a 38 mm blank) is a note, never a second layer.
  const thickness = sheet.thickness;
  const asked = pos(row.benchtopThickness);
  if (asked > 0 && Math.abs(asked - thickness) > 0.01) {
    warnings.push(`${row.name}: ${asked} mm asked - a pre-made blank is one layer, so it is priced at its own ${thickness} mm`);
  }

  const { unitPieces, waterfallJoins } = unitPiecesOf(row, thickness, warnings);
  if (waterfallJoins > 0) {
    warnings.push(`${row.name}: waterfall ends on a pre-made blank are a separate panel and a site joint - check the ends with the shop`);
  }
  const pieces: BenchtopPiece[] = [];
  for (let n = 0; n < qty; n++) pieces.push(...unitPieces.map((p) => ({ ...p })));

  const areaSqm = pieces.reduce((s, p) => s + (p.l * p.w) / 1e6, 0);
  const edgeLm = pieces.reduce((s, p) => s + (2 * (p.l + p.w)) / 1000, 0);
  const benchtopLm = pieces.reduce((s, p) => s + p.l / 1000, 0);

  // Blank length consumed per cut piece. A piece as long as the blank takes the
  // whole blank with no crosscut; anything shorter reserves the trim allowance.
  const segments: number[] = [];
  let cuts = 0;
  let lengthJoins = 0;
  const deepWarned = new Set<number>();
  const longWarned = new Set<number>();
  for (const p of pieces) {
    // Deeper than the blank: a postformed blank cannot be widened, so the top needs the deeper
    // blank. Until someone changes it, buy the blanks it would actually take side by side - a
    // 900 deep island used to cost exactly what a 600 deep one did, off a 600 blank.
    const widthPieces = Math.max(1, Math.ceil(p.w / sheet.sheet_width - 1e-9));
    if (widthPieces > 1 && !deepWarned.has(p.w)) {
      deepWarned.add(p.w);
      warnings.push(`${row.name}: ${p.w} mm deep is deeper than the ${sheet.sheet_width} mm blank - a postformed blank cannot be joined along its length; use the deeper blank or price it as a fabricated top. Charged as ${widthPieces} blanks side by side per section so the material is not under-bought`);
    }
    const sections = Math.max(1, Math.ceil(p.l / sheet.sheet_length - 1e-9));
    if (sections > 1 && !longWarned.has(p.l)) {
      longWarned.add(p.l);
      warnings.push(`${row.name}: ${p.l} mm long exceeds the ${sheet.sheet_length} mm blank - ${sections - 1} bolted join(s) per piece included`);
    }
    lengthJoins += sections - 1;
    let left = p.l;
    for (let s = 0; s < sections; s++) {
      const cut = Math.min(sheet.sheet_length, left);
      // the LENGTH reserved saturates at a whole blank; the crosscut is counted off the PIECE, or
      // a 3645 mm top off a 3650 mm blank was cut and edged for free because the 10 mm trim
      // allowance happened to fill the blank
      const consumed = Math.min(sheet.sheet_length, cut + trimMm);
      for (let n = 0; n < widthPieces; n++) {
        segments.push(consumed);
        if (cut < sheet.sheet_length - 1e-9) cuts += 1;
      }
      left -= cut;
    }
  }

  // Exposed CUT ends. The postformed front edge and the factory ends are finished;
  // only the ends the shop cuts need a strip, and only where they will be seen.
  const askedEnds = row.benchtopExposedEnds;
  let exposedEnds: number;
  if (typeof askedEnds === 'number' && Number.isFinite(askedEnds) && askedEnds >= 0) {
    exposedEnds = Math.round(askedEnds) * qty;
  } else {
    exposedEnds = Math.min(cuts, pieces.length);
    if (exposedEnds > 0) {
      warnings.push(`${row.name}: benchtopExposedEnds not given - ${exposedEnds} edged cut end(s) assumed (one per piece); send the count that is actually on show`);
    }
  }
  if (exposedEnds > 0) {
    // Ben, 16 Sep 2026: the matching end strip comes with the blank, so there is nothing to buy -
    // only the time to laminate and finish the end is charged.
    warnings.push(`${row.name}: ${exposedEnds} cut end(s) laminated and finished; the matching end strip comes with the blank, so no strip material is charged`);
  }

  const declaredJoins = Math.max(0, Math.round(row.benchtopJoins ?? 0)) * qty + waterfallJoins * qty;
  const c = row.benchtopCutouts ?? {};
  const cutouts = {
    sink: Math.max(0, Math.round(c.sink ?? 0)) * qty,
    cooktop: Math.max(0, Math.round(c.cooktop ?? 0)) * qty,
    tapHole: Math.max(0, Math.round(c.tapHole ?? 0)) * qty,
  };

  return {
    input: row, qty, sheet, kind: 'blank',
    segments, cuts, exposedEnds, blankJoins: declaredJoins + lengthJoins,
    thickness, layers: 1, nominalThickness: thickness, buildUp: 'none',
    builtUpEdgeLm: 0, stripSqm: 0, substrateSqm: 0, pieces,
    areaSqm, edgeLm, benchtopLm, declaredJoins, stockJoins: 0, cutouts, warnings,
  };
}

/**
 * Whole blanks for a set of cut lengths: first-fit decreasing into bins of one
 * blank length. Two rows on the same blank share the offcut, so neither rounds
 * up to a blank the other could have carried.
 */
function packBlankLengths(segments: number[], blankLengthMm: number): number {
  const bins: number[] = [];
  for (const len of [...segments].sort((a, b) => b - a)) {
    let placed = false;
    for (let i = 0; i < bins.length; i++) {
      if (bins[i] + len <= blankLengthMm + 1e-9) { bins[i] += len; placed = true; break; }
    }
    if (!placed) bins.push(Math.min(len, blankLengthMm));
  }
  return bins.length;
}

/**
 * Price laminated benchtop rows. Rows are engine-priced when they resolve to a
 * priced sheet (own benchtopMaterialId, else opts.defaultMaterialId); anything
 * else is returned in `passthrough` with the reason, for the caller to carry at
 * mv_total exactly as before.
 */
export function priceLaminatedBenchtops(
  rows: LaminatedBenchtopRowInput[],
  materials: MaterialPricingRecord[],
  opts: LaminatedBenchtopOptions = {},
): LaminatedBenchtopResult {
  const defaultThickness = pos(opts.defaultThickness) || 24;
  const wasteFactor = typeof opts.wasteFactor === 'number' && opts.wasteFactor >= 0 ? opts.wasteFactor : DEFAULT_BENCHTOP_WASTE;
  const adhesiveUnitCost = typeof opts.adhesiveUnitCost === 'number' && opts.adhesiveUnitCost >= 0 ? opts.adhesiveUnitCost : DEFAULT_ADHESIVE_UNIT_COST;
  const blankTrimMm = typeof opts.blankTrimMm === 'number' && opts.blankTrimMm >= 0 ? opts.blankTrimMm : DEFAULT_BLANK_TRIM_MM;

  const warnings: string[] = [];
  const passthrough: LaminatedBenchtopPassthrough[] = [];
  const prepared: PreparedRow[] = [];

  const carried = (row: LaminatedBenchtopRowInput) =>
    (row.mv_total ?? 0) > 0
      ? `carried at the Microvellum figure ${fmtMoney(row.mv_total)}`
      : 'has no Microvellum figure either - line dropped';

  for (const row of rows) {
    const id = String(row.benchtopMaterialId ?? opts.defaultMaterialId ?? '').trim();
    if (!id) {
      passthrough.push({ index: row.index, name: row.name, reason: `${row.name}: no benchtopMaterialId - ${carried(row)}` });
      continue;
    }
    const m = resolveBenchtopSheet(id, materials);
    if (!m) {
      passthrough.push({ index: row.index, name: row.name, reason: `${row.name}: "${id}" is not a priced sheet in material_pricing - ${carried(row)}` });
      continue;
    }
    const sheetOrMissing = toSheet(m);
    if ('missing' in sheetOrMissing) {
      passthrough.push({ index: row.index, name: row.name, reason: `${row.name}: sheet "${m.name}" (${m.item_code}) has no ${sheetOrMissing.missing.join(' / ')} in material_pricing - ${carried(row)}` });
      continue;
    }
    // A pre-made blank is priced as a bought blank, not as a fabricated slab.
    // The row may say so; otherwise the catalogue row's own shape decides.
    const k = resolveBenchtopKind(row.benchtopKind, m);
    const kindWarnings: string[] = [];
    if (k.inferred) {
      kindWarnings.push(`${row.name}: "${m.name}" (${m.item_code}) is ${m.thickness} mm on a ${m.sheet_width} mm wide sheet - priced as a PRE-MADE laminate benchtop blank (whole blanks, one layer, no lamination or polishing). Send benchtopKind to say so outright.`);
    }
    if (k.disagrees) {
      kindWarnings.push(`${row.name}: benchtopKind "${k.kind}" does not match the catalogue row "${m.name}" (${m.item_code}, ${m.material_type ?? 'no material_type'}, ${m.thickness} mm x ${m.sheet_width} mm) - priced as asked`);
    }
    const p = k.kind === 'blank'
      ? prepareBlankRow(row, sheetOrMissing, blankTrimMm)
      : prepareRow(row, sheetOrMissing, defaultThickness);
    p.warnings.unshift(...kindWarnings);
    if (p.pieces.length === 0) {
      passthrough.push({ index: row.index, name: row.name, reason: `${row.name}: no blank sizes (w x d ${row.w} x ${row.d}) - ${carried(row)}` });
      continue;
    }
    prepared.push(p);
  }
  for (const p of passthrough) warnings.push(p.reason);

  // ---- whole-sheet nest per sheet id, across every row sharing it ----------
  // Blanks and fabricated tops never share a group even on the same row id:
  // one is bought whole by length, the other nested by area.
  const bySheet = new Map<string, PreparedRow[]>();
  for (const p of prepared) {
    const key = `${p.sheet.id}|${p.kind}`;
    const list = bySheet.get(key) ?? [];
    list.push(p);
    bySheet.set(key, list);
  }

  const sheets: LaminatedBenchtopSheetUse[] = [];
  const rowMaterial = new Map<PreparedRow, { materialCost: number; sheetsShare: number; jobSheets: number; parts: number; sharedBy: number }>();

  for (const group of bySheet.values()) {
    const sheet = group[0].sheet;
    const sheetAreaSqm = (sheet.sheet_length / 1000) * (sheet.sheet_width / 1000);

    // ---- pre-made blanks: whole blanks off the blank LENGTH ----------------
    // Ben, 16 Sep 2026: a blank is bought whole like a board. No area waste
    // factor - the offcut is the offcut, and a 3600 mm top is one 3650 blank.
    if (group[0].kind === 'blank') {
      const allSegments = group.flatMap((p) => p.segments);
      const jobBlanks = Math.max(1, packBlankLengths(allSegments, sheet.sheet_length));
      // by the lineal metre of the blank, NOT by its area - see blankPrice
      const price = blankPrice(jobBlanks, sheet);
      const materialCost = price.cost;
      const basis = `${sheet.name} (${sheet.item_code}): a pre-made blank is bought by the lineal metre of its ${sheet.sheet_width} mm stock width - ${jobBlanks} x ${r3(sheet.sheet_length / 1000)} m at $${sheet.area_cost.toFixed(2)}/lm = ${fmtMoney(price.cost)}. material_pricing labels that rate "per m2"; read that way the same blanks would be ${fmtMoney(price.asArea)}. Check the blank rate against the supplier price list.`;
      for (const p of group) p.warnings.push(basis);
      const totalLen = group.reduce((s, p) => s + p.segments.reduce((a, b) => a + b, 0), 0);

      let assignedBlank = 0;
      group.forEach((p, gi) => {
        const share = totalLen > 0 ? p.segments.reduce((a, b) => a + b, 0) / totalLen : 1 / group.length;
        const cost = gi === group.length - 1 ? money(materialCost - assignedBlank) : money(materialCost * share);
        assignedBlank = money(assignedBlank + cost);
        rowMaterial.set(p, {
          materialCost: cost,
          sheetsShare: r3(jobBlanks * share),
          jobSheets: jobBlanks,
          parts: p.segments.length,
          sharedBy: group.length,
        });
      });

      sheets.push({
        sheet,
        kind: 'blank',
        priceUnit: price.unit,
        chargedUnits: price.units,
        unitCost: price.unitCost,
        rows: group.map((p) => p.input.index),
        sheetAreaSqm: r3(sheetAreaSqm),
        layeredAreaSqm: r3(group.reduce((s, p) => s + p.areaSqm, 0)),
        wasteFactor: 0,
        packedSheets: jobBlanks,
        areaSheets: 0,
        jobSheets: jobBlanks,
        materialCost,
      });
      continue;
    }

    // ONE run per blank - the slab is a single layer - plus the build-up strips, which are cut
    // from the same sheet but nest into the offcuts rather than needing a slab of their own.
    const runs: Array<{ runLengthMm: number; depthMm: number }> = [];
    const runRow: number[] = [];
    group.forEach((p, gi) => {
      for (const piece of p.pieces) {
        runs.push({ runLengthMm: piece.l, depthMm: piece.w });
        runRow.push(gi);
      }
      // strips: (layers - 1) runs of the built-up edge at strip width, or the apron face when mitred
      if (p.stripSqm > 0) {
        const stripW = Math.max(1, Math.round((p.stripSqm * 1e6) / Math.max(1, p.builtUpEdgeLm * 1000)));
        const count = p.buildUp === 'stacked' ? Math.max(1, p.layers - 1) : 1;
        const each = (p.builtUpEdgeLm * 1000) / count;
        for (let i = 0; i < count; i++) {
          runs.push({ runLengthMm: each, depthMm: stripW });
          runRow.push(gi);
        }
      }
    });
    const packed = packWholeSheetCuts(runs, sheet.sheet_length, sheet.sheet_width);
    const partsByRow = group.map(() => 0);
    packed.cutPieces.forEach((n, ri) => { partsByRow[runRow[ri]] += n; });

    // Sheet area wanted = one slab per blank + the strips. Never area x layers.
    const layeredAreaSqm = group.reduce((s, p) => s + p.areaSqm + p.stripSqm, 0);
    const packedSheets = packed.sheets.length;
    const areaSheets = Math.ceil((layeredAreaSqm * (1 + wasteFactor)) / sheetAreaSqm - 1e-9);
    const jobSheets = Math.max(1, packedSheets, areaSheets);
    const materialCost = money(jobSheets * sheetAreaSqm * sheet.area_cost);

    // Apportion by the area each row actually takes off the sheet; the last row takes the
    // rounding remainder so the row costs always sum to the sheet cost.
    let assigned = 0;
    group.forEach((p, gi) => {
      const share = layeredAreaSqm > 0 ? (p.areaSqm + p.stripSqm) / layeredAreaSqm : 1 / group.length;
      const cost = gi === group.length - 1 ? money(materialCost - assigned) : money(materialCost * share);
      assigned = money(assigned + cost);
      rowMaterial.set(p, { materialCost: cost, sheetsShare: r3(jobSheets * share), jobSheets, parts: partsByRow[gi], sharedBy: group.length });
    });

    sheets.push({
      sheet,
      kind: 'laminated',
      priceUnit: 'm2',
      chargedUnits: r3(jobSheets * sheetAreaSqm),
      unitCost: sheet.area_cost,
      rows: group.map((p) => p.input.index),
      sheetAreaSqm: r3(sheetAreaSqm),
      layeredAreaSqm: r3(layeredAreaSqm),
      wasteFactor,
      packedSheets,
      areaSheets,
      jobSheets,
      materialCost,
    });
  }

  // ---- per-row result --------------------------------------------------------
  const out: LaminatedBenchtopRow[] = prepared.map((p) => {
    const mat = rowMaterial.get(p)!;
    const isBlank = p.kind === 'blank';
    const joins = isBlank ? p.blankJoins : p.declaredJoins + p.stockJoins;
    // Glue line = the built-up edge, once per extra layer. Never the whole slab.
    const buildUpLm = p.buildUp === 'stacked'
      ? p.builtUpEdgeLm * (p.layers - 1)
      : p.buildUp === 'mitred' ? p.builtUpEdgeLm : 0;
    const laminateSqm = 0;   // a top is one slab; nothing is face-laminated
    const adhesiveCartridges = buildUpLm > 0
      ? Math.ceil(buildUpLm / ADHESIVE_STRIP_M_PER_CARTRIDGE - 1e-9)
      : 0;
    // A pre-made blank arrives finished: no glue-up, no strips, no substrate and
    // - the point of the whole exercise - no face or profile polishing. It is
    // crosscut to length, its cut ends are edged and any join is bolted.
    const fabrication: BenchtopFabricationInputs = isBlank
      ? {
          ...EMPTY_BENCHTOP_FABRICATION,
          parts: mat.parts,
          // a cut-out in a 38 mm laminate blank is bench work (jigsaw and router), not the
          // $250/h solid-surface CNC the fabricated tops pay for
          blankSink: p.cutouts.sink,
          blankCooktop: p.cutouts.cooktop,
          blankTapHole: p.cutouts.tapHole,
          benchtopLm: r3(p.benchtopLm),
          products: p.qty,
          blankCuts: p.cuts,
          endEdges: p.exposedEnds,
          blankJoins: p.blankJoins,
          longParts: mat.parts,
          blankProducts: p.qty,
        }
      : {
          ...EMPTY_BENCHTOP_FABRICATION,
          parts: mat.parts,
          cutLm: r3(p.edgeLm + p.builtUpEdgeLm * Math.max(0, p.layers - 1)),
          laminateSqm: r3(laminateSqm),
          buildUpLm: r3(buildUpLm),
          mitreLm: p.buildUp === 'mitred' ? r3(p.builtUpEdgeLm) : 0,
          substrateSqm: r3(p.substrateSqm),
          joins,
          polishSqm: r3(p.areaSqm),
          edgePolishLm: r3(p.edgeLm),
          sink: p.cutouts.sink,
          cooktop: p.cutouts.cooktop,
          tapHole: p.cutouts.tapHole,
          benchtopLm: r3(p.benchtopLm),
          products: p.qty,
        };
    const sharedBy = mat.sharedBy;
    const rowWarnings = [
      isBlank
        ? `${p.input.name}: priced as ${mat.jobSheets} x ${p.sheet.sheet_length} x ${p.sheet.sheet_width} ${p.sheet.thickness} mm ${p.sheet.name} pre-made laminate blank(s) - whole blanks as bought by the lineal metre, one layer, cut to length (${p.cuts} cut(s), ${p.exposedEnds} edged end(s)); no lamination, build-up or polishing. Blank shared by ${sharedBy} benchtop row(s); cut / edging / join minutes are DEFAULT rates, not yet calibrated`
        : `${p.input.name}: priced as ${p.layers} x ${p.sheet.thickness} mm ${p.sheet.name} laminated to ${p.nominalThickness} mm - ${r3(p.areaSqm)} m2 across ${mat.jobSheets} sheet(s) (${p.sheet.sheet_length} x ${p.sheet.sheet_width}) shared by ${sharedBy} benchtop row(s); fabrication minutes are DEFAULT rates, not yet calibrated`,
      ...p.warnings,
    ];
    warnings.push(...rowWarnings);
    return {
      index: p.input.index,
      name: p.input.name,
      qty: p.qty,
      sheet: p.sheet,
      kind: p.kind,
      ...(isBlank ? { blanks: mat.jobSheets } : {}),
      cuts: p.cuts,
      exposedEnds: p.exposedEnds,
      thickness: p.thickness,
      layers: p.layers,
      nominalThickness: p.nominalThickness,
      pieces: p.pieces,
      areaSqm: r3(p.areaSqm),
      edgeLm: r3(p.edgeLm),
      benchtopLm: r3(p.benchtopLm),
      joins,
      stockJoins: p.stockJoins,
      cutouts: p.cutouts,
      sheetsShare: mat.sheetsShare,
      jobSheets: mat.jobSheets,
      materialCost: mat.materialCost,
      adhesiveCartridges,
      adhesiveCost: money(adhesiveCartridges * adhesiveUnitCost),
      fabrication,
      warnings: rowWarnings,
    };
  });

  const adhesiveQty = out.reduce((s, r) => s + r.adhesiveCartridges, 0);
  return {
    rows: out,
    passthrough,
    sheets,
    fabrication: sumBenchtopFabrication(out.map((r) => r.fabrication)),
    adhesive: {
      code: BENCHTOP_ADHESIVE_CODE,
      name: 'Solid surface adhesive cartridge',
      quantity: adhesiveQty,
      unitCost: adhesiveUnitCost,
      cost: money(adhesiveQty * adhesiveUnitCost),
    },
    warnings,
  };
}
