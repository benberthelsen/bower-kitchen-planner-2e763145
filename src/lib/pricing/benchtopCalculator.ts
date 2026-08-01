// Benchtop pricing -- groups base/corner/sink cabinets by wall (rotation),
// merges each group into a single run, and prices it from the benchtop_pricing
// table. Supports three pricing methods:
//   per_sheet  -- Meganite solid surface (ceil sheets from stock length)
//   per_lm     -- Egger laminate worktops (run length x price per LM)
//   per_sqm    -- Legacy stone / custom (area x rate)

import { PlacedItem, GlobalDimensions } from '@/types';
import { PricingData, BenchtopAllocation, BenchtopMaterialRecord } from './types';

/** Cabinet types that sit under a benchtop (base, corner, sink, pie/blind) */
const BENCHTOP_CAB_RE = /^(base|corner|sink|pie)/i;
const BENCHTOP_APPLIANCE_RE = /dishwasher|under[-_ ]?bench[-_ ]?oven|oven_600/i;
const CORNER_CAB_RE = /corner|pie|blind/i;
const SINK_RE = /sink/i;
const COOKTOP_RE = /cooktop|hot[-_ ]?plate|hob/i;
const TAP_RE = /(^|[-_ ])tap($|[-_ ])|faucet/i;

/** Labels for each wall group in rotation order */
const WALL_LABELS = 'ABCDEFGHIJKLMNOP';

interface SheetPiece {
  runIndex: number;
  lengthMm: number;
  depthMm: number;
}

interface PackedSheet {
  shelves: Array<{ depthMm: number; usedLengthMm: number }>;
  usedDepthMm: number;
}

export interface BenchtopPricingSelection {
  benchtopPricingId?: string;
  benchtopFinishId?: string;
}

type FabricationLine = NonNullable<BenchtopAllocation['fabricationBreakdown']>[number];

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function charge(
  code: string,
  label: string,
  quantity: number,
  unit: FabricationLine['unit'],
  unitPrice: number | null | undefined,
): FabricationLine | null {
  const rate = Math.max(0, unitPrice ?? 0);
  if (quantity <= 0 || rate <= 0) return null;
  return { code, label, quantity, unit, unitPrice: rate, total: money(quantity * rate) };
}

function applyFabricationMatrix(
  baseAllocations: BenchtopAllocation[],
  material: BenchtopMaterialRecord,
  items: PlacedItem[],
  selectionWarnings: string[],
): BenchtopAllocation[] {
  if (baseAllocations.length === 0) return baseAllocations;

  const totalRunLm = baseAllocations.reduce((sum, run) => sum + run.runLengthMm / 1000, 0);
  const cornerCount = items.filter(item => CORNER_CAB_RE.test(item.definitionId ?? '')).length;
  const joinCount = Math.min(Math.max(0, baseAllocations.length - 1), cornerCount);
  const finishedEndCount = Math.max(0, baseAllocations.length * 2 - joinCount * 2);
  const sinkCount = items.filter(item =>
    item.layoutRole === 'sink'
    || SINK_RE.test(item.definitionId ?? '')
    || SINK_RE.test(item.productName ?? '')
  ).length;
  const cooktopCount = items.filter(item =>
    item.layoutRole === 'cooktop'
    || COOKTOP_RE.test(item.definitionId ?? '')
    || COOKTOP_RE.test(item.productName ?? '')
  ).length;
  const tapCount = items.filter(item =>
    item.layoutRole === 'tap'
    || TAP_RE.test(item.definitionId ?? '')
    || TAP_RE.test(item.productName ?? '')
  ).length;

  const jobLines = [
    charge('cnc_setup', 'CNC / fabrication setup', 1, 'job', material.cnc_setup_cost),
    charge('joins', 'Benchtop joints', joinCount, 'each', material.join_cost),
    charge('finished_ends', 'Finished ends', finishedEndCount, 'each', material.finished_end_cost),
    charge('sink_cutouts', 'Sink cut-outs', sinkCount, 'each', material.sink_cutout_cost),
    charge('cooktop_cutouts', 'Cooktop cut-outs', cooktopCount, 'each', material.cooktop_cutout_cost),
    charge('tap_holes', 'Tap holes', tapCount, 'each', material.tap_hole_cost),
    charge('supplier_order', 'Supplier custom-order fee', 1, 'job', material.supplier_order_fee),
    charge('freight', 'Benchtop freight', 1, 'job', material.freight_cost),
  ].filter((line): line is FabricationLine => Boolean(line));

  const result = baseAllocations.map((run, index) => {
    const runLm = run.runLengthMm / 1000;
    const runLines = [
      charge('cut_to_length', 'Cut to length', 1, 'each', material.cut_to_length_cost),
      charge('cnc_cutting', 'CNC cutting', runLm, 'lm', material.cnc_cut_per_lm),
      charge('sand_polish', 'Sand and polish', runLm, 'lm', material.sanding_polishing_per_lm),
      charge('edge_finish', 'Edge finishing', runLm, 'lm', material.edge_finish_per_lm),
      ...(index === 0 ? jobLines : []),
    ].filter((line): line is FabricationLine => Boolean(line));
    const fabricationCost = money(runLines.reduce((sum, line) => sum + line.total, 0));
    const baseMaterialCost = run.supplyCost;

    return {
      ...run,
      supplyPathway: material.supply_pathway,
      profileType: material.profile_type ?? undefined,
      baseMaterialCost,
      fabricationCost,
      fabricationBreakdown: runLines,
      warnings: index === 0 ? [...selectionWarnings] : [],
      supplyCost: money(baseMaterialCost + fabricationCost),
      totalCost: money(baseMaterialCost + fabricationCost + run.installCost),
    };
  });

  const currentSupply = result.reduce((sum, run) => sum + run.supplyCost, 0);
  const minimumCharge = Math.max(0, material.minimum_charge ?? 0);
  if (minimumCharge > currentSupply) {
    const adjustment = money(minimumCharge - currentSupply);
    const first = result[0];
    first.fabricationBreakdown = [
      ...(first.fabricationBreakdown ?? []),
      {
        code: 'minimum_charge',
        label: 'Minimum completed-benchtop charge',
        quantity: 1,
        unit: 'adjustment',
        unitPrice: adjustment,
        total: adjustment,
      },
    ];
    first.fabricationCost = money((first.fabricationCost ?? 0) + adjustment);
    first.supplyCost = money(first.supplyCost + adjustment);
    first.totalCost = money(first.totalCost + adjustment);
  }

  // A base-only catalogue row is safe to estimate material quantities from,
  // but it is not a trustworthy finished-top price.
  if (material.price_status === 'base_only' || material.price_status === 'needs_review') {
    result[0].warnings = [
      ...(result[0].warnings ?? []),
      `${[material.brand, material.range_tier].filter(Boolean).join(' - ')} has supplier material pricing only; confirm fabrication/order rates before approval`,
    ];
  }
  if (
    material.supply_pathway === 'stock_sheet_fabricated'
    && (material.cnc_cut_per_lm ?? 0) === 0
    && (material.sanding_polishing_per_lm ?? 0) === 0
  ) {
    result[0].warnings = [
      ...(result[0].warnings ?? []),
      'Fabricated sheet benchtop is missing CNC/cutting and sanding/polishing rates',
    ];
  }

  return result;
}

/**
 * First-fit shelf nesting for rectangular benchtop cuts. Runs may share a
 * sheet along its length and, on wide stock, across its depth. Oversize runs
 * are split into stock-sized pieces before nesting. Rotation is deliberately
 * disabled so directional finishes and finished front edges remain correct.
 */
function packWholeSheetCuts(
  runs: Array<{ runLengthMm: number; depthMm: number }>,
  stockLengthMm: number,
  stockDepthMm: number,
): { sheets: PackedSheet[]; runSheetIndexes: Map<number, Set<number>>; cutPieces: number[] } {
  const pieces: SheetPiece[] = [];
  const cutPieces = runs.map(() => 0);

  runs.forEach((run, runIndex) => {
    let remainingLength = run.runLengthMm;
    while (remainingLength > 0) {
      const lengthMm = Math.min(stockLengthMm, remainingLength);
      let remainingDepth = run.depthMm;
      while (remainingDepth > 0) {
        pieces.push({
          runIndex,
          lengthMm,
          depthMm: Math.min(stockDepthMm, remainingDepth),
        });
        cutPieces[runIndex] += 1;
        remainingDepth -= stockDepthMm;
      }
      remainingLength -= stockLengthMm;
    }
  });

  pieces.sort((a, b) => b.depthMm - a.depthMm || b.lengthMm - a.lengthMm);
  const sheets: PackedSheet[] = [];
  const runSheetIndexes = new Map<number, Set<number>>();

  for (const piece of pieces) {
    let placedSheet = -1;
    for (let sheetIndex = 0; sheetIndex < sheets.length && placedSheet < 0; sheetIndex += 1) {
      const sheet = sheets[sheetIndex];
      const shelf = sheet.shelves.find(candidate =>
        candidate.depthMm >= piece.depthMm
        && candidate.usedLengthMm + piece.lengthMm <= stockLengthMm
      );
      if (shelf) {
        shelf.usedLengthMm += piece.lengthMm;
        placedSheet = sheetIndex;
        break;
      }
      if (sheet.usedDepthMm + piece.depthMm <= stockDepthMm) {
        sheet.shelves.push({ depthMm: piece.depthMm, usedLengthMm: piece.lengthMm });
        sheet.usedDepthMm += piece.depthMm;
        placedSheet = sheetIndex;
      }
    }

    if (placedSheet < 0) {
      sheets.push({
        shelves: [{ depthMm: piece.depthMm, usedLengthMm: piece.lengthMm }],
        usedDepthMm: piece.depthMm,
      });
      placedSheet = sheets.length - 1;
    }
    const indexes = runSheetIndexes.get(piece.runIndex) ?? new Set<number>();
    indexes.add(placedSheet);
    runSheetIndexes.set(piece.runIndex, indexes);
  }

  return { sheets, runSheetIndexes, cutPieces };
}

/**
 * Calculate benchtop runs from placed cabinets.
 *
 * Groups eligible cabinets by normalised rotation (0/90/180/270deg), sums their
 * widths into a run length, and prices each run according to the pricing_method
 * of the first benchtop material in pricingData. Returns an empty array when
 * there are no base cabinets or no benchtop material is configured.
 */
export function calculateBenchtops(
  items: PlacedItem[],
  globalDims: GlobalDimensions,
  pricingData: PricingData,
  selection: BenchtopPricingSelection = {},
): BenchtopAllocation[] {
  const activeMaterials = pricingData.benchtop.filter(material => material.is_active !== false);
  if (activeMaterials.length === 0) return [];

  const benchtopCabs = items.filter(i =>
    (i.itemType === 'Cabinet' && BENCHTOP_CAB_RE.test(i.definitionId ?? ''))
    || (
      i.itemType === 'Appliance'
      && (i.layoutRole === 'dishwasher' || BENCHTOP_APPLIANCE_RE.test(i.definitionId ?? ''))
    )
  );

  if (benchtopCabs.length === 0) return [];

  const explicitlySelected = activeMaterials.find(material =>
    material.id === selection.benchtopPricingId
    || (
      selection.benchtopFinishId
      && material.catalog_finish_id === selection.benchtopFinishId
    )
  );
  const material = explicitlySelected
    ?? activeMaterials.find(candidate => candidate.is_default)
    ?? activeMaterials[0];
  const selectionWarnings: string[] = [];
  if (selection.benchtopPricingId && !explicitlySelected) {
    selectionWarnings.push(`Selected benchtop "${selection.benchtopPricingId}" is unavailable; using ${material.brand} - ${material.range_tier ?? 'default'}`);
  } else if (!selection.benchtopPricingId && !selection.benchtopFinishId && activeMaterials.length > 1) {
    selectionWarnings.push(`No benchtop was selected for this room; using default ${material.brand} - ${material.range_tier ?? ''}`.trim());
  }
  const overhang = globalDims.benchtopOverhang ?? 25;
  const method = material.pricing_method ?? 'per_sqm';

  // -- Group by normalised rotation ------------------------------------------
  const byWall = new Map<number, PlacedItem[]>();
  for (const cab of benchtopCabs) {
    const raw = cab.rotation ?? 0;
    const normRot = ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
    const group = byWall.get(normRot) ?? [];
    group.push(cab);
    byWall.set(normRot, group);
  }

  // Sort walls by rotation so Wall A is always the 0deg wall
  const sortedWalls = [...byWall.entries()].sort(([a], [b]) => a - b);

  const materialName = [material.brand, material.range_tier].filter(Boolean).join(' - ');

  const allocations = sortedWalls.map(([rot, cabs], idx) => {
    const runLengthMm = cabs.reduce((sum, c) => sum + c.width, 0);
    // A corner cabinet's nominal 900mm depth is its footprint along the
    // returning wall, not a 900mm-deep rectangular top across this whole run.
    // Treat its benchtop arm as the standard base depth; otherwise one corner
    // falsely turns every top on that wall into an oversize two-sheet cut.
    const maxCabDepthMm = Math.max(
      globalDims.baseDepth ?? 575,
      ...cabs.map(c => CORNER_CAB_RE.test(c.definitionId ?? '')
        ? (globalDims.baseDepth ?? 575)
        : c.depth),
    );
    const depthMm = maxCabDepthMm + overhang;
    const areaSqm = (runLengthMm / 1000) * (depthMm / 1000);

    let supplyCost = 0;
    let installCost = 0;
    let sheetsRequired: number | undefined;
    let linearMetres: number | undefined;
    let pricePerUnit = 0;
    let tradeSupplyPerSqm = 0;
    let installSupplyPerSqm = 0;

    if (method === 'per_sheet') {
      // Whole-sheet stock is allocated across every run after this map. Keeping
      // this row at $0 here prevents the old "one sheet per wall" overcharge.
      pricePerUnit = material.price_per_sheet ?? 0;

    } else if (method === 'per_lm') {
      // -- Egger laminate worktops ----------------------------------------------
      // Priced per linear metre of run length.
      linearMetres = runLengthMm / 1000;
      const billableLinearMetres = Math.max(
        linearMetres,
        Math.max(0, material.minimum_order_length_mm ?? 0) / 1000,
      );
      pricePerUnit = material.price_per_lm ?? 0;
      supplyCost = billableLinearMetres * pricePerUnit;
      const installPerLm = material.install_per_lm ?? 0;
      installCost = linearMetres * installPerLm;
      tradeSupplyPerSqm = areaSqm > 0 ? supplyCost / areaSqm : 0;
      installSupplyPerSqm = areaSqm > 0 ? installCost / areaSqm : 0;

    } else {
      // -- Legacy per-sqm (stone) -----------------------------------------------
      tradeSupplyPerSqm = material.trade_supply_per_sqm ?? 0;
      installSupplyPerSqm = material.install_supply_per_sqm ?? 0;
      pricePerUnit = tradeSupplyPerSqm;
      supplyCost = areaSqm * tradeSupplyPerSqm;
      installCost = areaSqm * installSupplyPerSqm;
    }

    return {
      wallLabel: `Wall ${WALL_LABELS[idx] ?? String(idx + 1)}`,
      rotation: rot,
      runLengthMm,
      depthMm,
      areaSqm,
      materialId: material.id,
      materialName,
      materialType: material.material_type ?? 'stone',
      pricingMethod: method,
      ...(sheetsRequired !== undefined && { sheetsRequired }),
      ...(linearMetres !== undefined && { linearMetres }),
      ...(method === 'per_lm' && {
        billableLinearMetres: Math.max(
          linearMetres ?? 0,
          Math.max(0, material.minimum_order_length_mm ?? 0) / 1000,
        ),
      }),
      pricePerUnit,
      tradeSupplyPerSqm,
      installSupplyPerSqm,
      supplyCost,
      installCost,
      totalCost: supplyCost + installCost,
    };
  });

  if (method !== 'per_sheet') {
    return applyFabricationMatrix(allocations, material, items, selectionWarnings);
  }

  const stockLengthMm = Math.max(1, material.stock_length_mm ?? 3660);
  const stockDepthMm = Math.max(1, material.stock_depth_mm ?? 760);
  const wasteFactor = Math.min(0.25, Math.max(0, material.waste_factor ?? 0.05));
  const minimumSheets = Math.max(1, Math.ceil(material.minimum_sheet_quantity ?? 1));
  const packed = packWholeSheetCuts(allocations, stockLengthMm, stockDepthMm);
  const sheetAreaSqm = (stockLengthMm * stockDepthMm) / 1_000_000;
  const totalAreaSqm = allocations.reduce((sum, run) => sum + run.areaSqm, 0);
  const areaMinimum = Math.ceil((totalAreaSqm * (1 + wasteFactor)) / sheetAreaSqm);
  const jobSheetsRequired = Math.max(minimumSheets, packed.sheets.length, areaMinimum);
  const totalSupplyCost = jobSheetsRequired * (material.price_per_sheet ?? 0);
  const sheetUtilisation = jobSheetsRequired > 0
    ? Math.min(1, totalAreaSqm / (jobSheetsRequired * sheetAreaSqm))
    : 0;

  const sheetAllocations = allocations.map((run, runIndex) => {
    const areaShare = totalAreaSqm > 0 ? run.areaSqm / totalAreaSqm : 0;
    const supplyCost = totalSupplyCost * areaShare;
    return {
      ...run,
      sheetsRequired: packed.runSheetIndexes.get(runIndex)?.size ?? 0,
      jobSheetsRequired,
      cutPieces: packed.cutPieces[runIndex] ?? 0,
      stockLengthMm,
      stockDepthMm,
      sheetUtilisation,
      wasteFactor,
      supplyCost,
      installCost: 0,
      tradeSupplyPerSqm: run.areaSqm > 0 ? supplyCost / run.areaSqm : 0,
      installSupplyPerSqm: 0,
      totalCost: supplyCost,
    };
  });

  return applyFabricationMatrix(sheetAllocations, material, items, selectionWarnings);
}
