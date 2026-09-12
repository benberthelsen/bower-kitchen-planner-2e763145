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
  /** Finished thickness, mm (12 / 24 / 36). */
  benchtopThickness?: number;
  /** Blank sizes per unit when w x d is not the top (L-shape arms, waterfall legs). */
  benchtopPieces?: BenchtopPiece[];
  /** Each end adds a leg { l: h - thickness, w: d } and one join — only when benchtopPieces is absent. */
  benchtopWaterfallEnds?: number;
  /** Mitres / field joins per unit. Width joins forced by stock size are added automatically. */
  benchtopJoins?: number;
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
}

export const BENCHTOP_ADHESIVE_CODE = 'SS-ADHESIVE';
export const DEFAULT_BENCHTOP_WASTE = 0.05;
export const DEFAULT_ADHESIVE_UNIT_COST = 35;
/** m2 of glue line one cartridge covers, and metres of build-up strip. */
const ADHESIVE_SQM_PER_CARTRIDGE = 1.5;
const ADHESIVE_STRIP_M_PER_CARTRIDGE = 6;

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const pos = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

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
  thickness: number;
  layers: number;
  nominalThickness: number;
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
  const layers = Math.max(1, Math.ceil(thickness / sheet.thickness - 1e-9));
  const nominalThickness = layers * sheet.thickness;
  if (Math.abs(nominalThickness - thickness) > 0.01) {
    warnings.push(`${row.name}: ${thickness} mm is not a multiple of the ${sheet.thickness} mm sheet - ${layers} layers (${nominalThickness} mm) priced`);
  }

  // Blanks per unit.
  const given = (row.benchtopPieces ?? []).filter((p) => pos(p?.l) > 0 && pos(p?.w) > 0)
    .map((p) => ({ l: p.l, w: p.w }));
  let unitPieces: BenchtopPiece[];
  let waterfallJoins = 0;
  if (given.length > 0) {
    unitPieces = given;
  } else {
    unitPieces = [];
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
  }

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

  return {
    input: row, qty, sheet, thickness, layers, nominalThickness, pieces,
    areaSqm, edgeLm, benchtopLm, declaredJoins, stockJoins, cutouts, warnings,
  };
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
    const p = prepareRow(row, sheetOrMissing, defaultThickness);
    if (p.pieces.length === 0) {
      passthrough.push({ index: row.index, name: row.name, reason: `${row.name}: no blank sizes (w x d ${row.w} x ${row.d}) - ${carried(row)}` });
      continue;
    }
    prepared.push(p);
  }
  for (const p of passthrough) warnings.push(p.reason);

  // ---- whole-sheet nest per sheet id, across every row sharing it ----------
  const bySheet = new Map<string, PreparedRow[]>();
  for (const p of prepared) {
    const list = bySheet.get(p.sheet.id) ?? [];
    list.push(p);
    bySheet.set(p.sheet.id, list);
  }

  const sheets: LaminatedBenchtopSheetUse[] = [];
  const rowMaterial = new Map<PreparedRow, { materialCost: number; sheetsShare: number; jobSheets: number; parts: number }>();

  for (const group of bySheet.values()) {
    const sheet = group[0].sheet;
    const sheetAreaSqm = (sheet.sheet_length / 1000) * (sheet.sheet_width / 1000);

    // One run per piece per layer; remember which row each run belongs to.
    const runs: Array<{ runLengthMm: number; depthMm: number }> = [];
    const runRow: number[] = [];
    group.forEach((p, gi) => {
      for (const piece of p.pieces) {
        for (let layer = 0; layer < p.layers; layer++) {
          runs.push({ runLengthMm: piece.l, depthMm: piece.w });
          runRow.push(gi);
        }
      }
    });
    const packed = packWholeSheetCuts(runs, sheet.sheet_length, sheet.sheet_width);
    const partsByRow = group.map(() => 0);
    packed.cutPieces.forEach((n, ri) => { partsByRow[runRow[ri]] += n; });

    const layeredAreaSqm = group.reduce((s, p) => s + p.areaSqm * p.layers, 0);
    const packedSheets = packed.sheets.length;
    const areaSheets = Math.ceil((layeredAreaSqm * (1 + wasteFactor)) / sheetAreaSqm - 1e-9);
    const jobSheets = Math.max(1, packedSheets, areaSheets);
    const materialCost = money(jobSheets * sheetAreaSqm * sheet.area_cost);

    // Apportion by layered-area share; the last row takes the rounding remainder
    // so the row costs always sum to the sheet cost.
    let assigned = 0;
    group.forEach((p, gi) => {
      const share = layeredAreaSqm > 0 ? (p.areaSqm * p.layers) / layeredAreaSqm : 1 / group.length;
      const cost = gi === group.length - 1 ? money(materialCost - assigned) : money(materialCost * share);
      assigned = money(assigned + cost);
      rowMaterial.set(p, { materialCost: cost, sheetsShare: r3(jobSheets * share), jobSheets, parts: partsByRow[gi] });
    });

    sheets.push({
      sheet,
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
    const joins = p.declaredJoins + p.stockJoins;
    const buildUpLm = p.edgeLm * (p.layers - 1);
    const laminateSqm = p.areaSqm * (p.layers - 1);
    const adhesiveCartridges = p.layers > 1
      ? (p.layers - 1) * Math.ceil(p.areaSqm / ADHESIVE_SQM_PER_CARTRIDGE - 1e-9) + Math.ceil(buildUpLm / ADHESIVE_STRIP_M_PER_CARTRIDGE - 1e-9)
      : 0;
    const fabrication: BenchtopFabricationInputs = {
      ...EMPTY_BENCHTOP_FABRICATION,
      parts: mat.parts,
      cutLm: r3(p.edgeLm * p.layers),
      laminateSqm: r3(laminateSqm),
      buildUpLm: r3(buildUpLm),
      joins,
      polishSqm: r3(p.areaSqm),
      edgePolishLm: r3(p.edgeLm),
      sink: p.cutouts.sink,
      cooktop: p.cutouts.cooktop,
      tapHole: p.cutouts.tapHole,
      benchtopLm: r3(p.benchtopLm),
      products: p.qty,
    };
    const sharedBy = sheets.find((s) => s.sheet.id === p.sheet.id)?.rows.length ?? 1;
    const rowWarnings = [
      `${p.input.name}: priced as ${p.layers} x ${p.sheet.thickness} mm ${p.sheet.name} laminated to ${p.nominalThickness} mm - ${r3(p.areaSqm)} m2 across ${mat.jobSheets} sheet(s) (${p.sheet.sheet_length} x ${p.sheet.sheet_width}) shared by ${sharedBy} benchtop row(s); fabrication minutes are DEFAULT rates, not yet calibrated`,
      ...p.warnings,
    ];
    warnings.push(...rowWarnings);
    return {
      index: p.input.index,
      name: p.input.name,
      qty: p.qty,
      sheet: p.sheet,
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
