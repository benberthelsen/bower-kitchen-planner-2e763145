// Benchtop pricing -- groups base/corner/sink cabinets by wall (rotation),
// merges each group into a single run, and prices it from the benchtop_pricing
// table. Supports three pricing methods:
//   per_sheet  -- Meganite solid surface (ceil sheets from stock length)
//   per_lm     -- Egger laminate worktops (run length x price per LM)
//   per_sqm    -- Legacy stone / custom (area x rate)

import { PlacedItem, GlobalDimensions } from '@/types';
import { PricingData, BenchtopAllocation } from './types';

/** Cabinet types that sit under a benchtop (base, corner, sink, pie/blind) */
const BENCHTOP_CAB_RE = /^(base|corner|sink|pie)/i;
const BENCHTOP_APPLIANCE_RE = /dishwasher|under[-_ ]?bench[-_ ]?oven|oven_600/i;

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
  pricingData: PricingData
): BenchtopAllocation[] {
  if (pricingData.benchtop.length === 0) return [];

  const benchtopCabs = items.filter(i =>
    (i.itemType === 'Cabinet' && BENCHTOP_CAB_RE.test(i.definitionId ?? ''))
    || (
      i.itemType === 'Appliance'
      && (i.layoutRole === 'dishwasher' || BENCHTOP_APPLIANCE_RE.test(i.definitionId ?? ''))
    )
  );

  if (benchtopCabs.length === 0) return [];

  // Default to first available material (Phase 2 will add a per-room selector)
  const material = pricingData.benchtop[0];
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
    const maxCabDepthMm = Math.max(...cabs.map(c => c.depth));
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
      pricePerUnit = material.price_per_lm ?? 0;
      supplyCost = linearMetres * pricePerUnit;
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
      pricePerUnit,
      tradeSupplyPerSqm,
      installSupplyPerSqm,
      supplyCost,
      installCost,
      totalCost: supplyCost + installCost,
    };
  });

  if (method !== 'per_sheet') return allocations;

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

  return allocations.map((run, runIndex) => {
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
}
