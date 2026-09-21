// Sheet optimization engine - calculates minimum sheets required with yield factor

import { PartDimension, SheetAllocation, MaterialPricingRecord, OversizePart, SplitPart, EdgeSpec } from './types';

interface SheetSpec {
  width: number;
  length: number;
  area: number;
}

// Default sheet sizes if not specified in material pricing
const DEFAULT_SHEET_SPECS: SheetSpec[] = [
  { width: 2400, length: 1200, area: 2.88 },  // Standard sheet
  { width: 3600, length: 1800, area: 6.48 },  // Large sheet
];

/**
 * WS2 safe fallback when a material id doesn't resolve — never an arbitrary
 * first row. Order: a priced "Shop Materials" row → cheapest priced sheet
 * material → undefined (caller prices the board at $0 and flags it).
 */
export function pickFallbackMaterial(
  materials: MaterialPricingRecord[]
): MaterialPricingRecord | undefined {
  const priced = materials.filter(m => (m.area_cost ?? 0) > 0);
  // Carcase-suitable = not a thin backing/ply panel; a 3mm backer is never a
  // sensible stand-in for board.
  const boards = priced.filter(m => (m.thickness ?? 16) >= 12 && !/backing/i.test(m.name ?? ''));
  const cheapest = (rows: MaterialPricingRecord[]) =>
    rows.slice().sort((a, b) => (a.area_cost ?? 0) - (b.area_cost ?? 0))[0];
  return (
    priced.find(m => /shop materials?/i.test(m.name ?? '')) ??
    cheapest(boards) ??
    cheapest(priced)
  );
}

/**
 * Board trimmed off a sheet before parts are nested, mm, in TOTAL off each dimension (not per edge): a 2400 x 1200
 * sheet nests into 2390 x 1190. Bower's Microvellum sheet settings trim 8 + 2 mm off the length and 5 + 5 mm off the
 * width, and Polytec MDF is sold at +/- 5 mm - on Donkin Lane Microvellum left a 2400 x 100 filler unplaced on its
 * 2400 x 1200 Polar White board. The catalogue carries no per-material trim, so every board uses this. A board
 * bought oversize but listed at its nominal size (Microvellum lists some Polytec 162412 boards at 2410 x 1210) can
 * report a part of 2391 - 2400 mm that does in fact nest.
 */
export const SHEET_TRIM_MM = 10;

/**
 * Can a length x width part be placed on a sheetLength x sheetWidth board at all?
 *
 * The sheet count below is area / yield, rounded up to whole sheets - it never looked at a part's shape, so a
 * 1223 x 2345 part priced out of a 3115 x 1200 board it cannot be cut from. This is the geometric test that was
 * missing. Grain is NOT modelled anywhere in the engine (material_pricing.horizontal_grain is never read), so the
 * part may be turned 90 degrees: it fits when its long side fits the sheet's usable long side and its short side the
 * usable short side. Non-positive or non-finite sizes are not judged (true).
 *
 * The usable sheet is the nominal size less trimMm off EACH dimension (SHEET_TRIM_MM by default): the factory edges
 * are squared off before nesting, so a part exactly the sheet size does NOT fit. The finished part size is compared -
 * Microvellum nests an edged part at its finished size too. Pass 0 for the bare geometric test.
 */
export function partFitsSheet(
  length: number, width: number, sheetLength: number, sheetWidth: number, trimMm: number = SHEET_TRIM_MM,
): boolean {
  if (![length, width, sheetLength, sheetWidth].every((n) => Number.isFinite(n) && n > 0)) return true;
  const trim = Number.isFinite(trimMm) && trimMm > 0 ? trimMm : 0;
  const EPS = 1e-6;
  return Math.max(length, width) <= Math.max(sheetLength, sheetWidth) - trim + EPS
    && Math.min(length, width) <= Math.min(sheetLength, sheetWidth) - trim + EPS;
}

/**
 * The sheet a part is judged and nested against: the material's own size when it has one, else the 2400 x 1200
 * default (flagged `sheetSizeAssumed` wherever it is reported). Shared by calculateSheetRequirements and
 * splitOversizeParts so the two can never disagree about what a part has to fit.
 */
function resolveSheetSpec(
  materialId: string,
  materials: MaterialPricingRecord[],
): { material: MaterialPricingRecord | undefined; spec: SheetSpec; assumed: boolean } {
  const exactMatch = materials.find((m) => m.id === materialId || m.item_code === materialId);
  const material = exactMatch ?? pickFallbackMaterial(materials);
  const assumed = !(material && material.sheet_width && material.sheet_length);
  const spec: SheetSpec = assumed
    ? DEFAULT_SHEET_SPECS[0]
    : {
        width: material!.sheet_width!,
        length: material!.sheet_length!,
        area: (material!.sheet_width! * material!.sheet_length!) / 1_000_000,
      };
  return { material, spec, assumed };
}

/**
 * A part that is a VISIBLE FRONT: a door, a drawer front, a false front. Such a part is NEVER split.
 *
 * Ben, 21 Sep 2026: "too long parts still price but split the items in half and make a not" - that is about BOARDS.
 * A front cannot be butt-joined across its face and sold as a front, which is exactly why an over-long robe LEAF is
 * a hard stop in robeSliderDoors ("a leaf is a door face and cannot be joined down the middle"). A hinged cabinet
 * door is the same object, so it gets the same treatment: it falls through to the over-size warning, the board is
 * still priced by area, and nobody is charged for a join that cannot be made.
 *
 * Deliberately NOT every exterior-role part. A Tall Filler, an Applied Panel, an Under Panel and a Pelmet are all
 * materialRole 'exterior' and they ARE joined - Coral Lodge's 2770 x 70 filler and Regal's 2984 x 330 under panel
 * are the very parts Ben asked to split. Only the fronts are excluded, matched on partType/name, never on role.
 */
export function isUnjoinableFace(part: { name?: string; partType?: string }): boolean {
  const s = `${part.partType ?? ''} ${part.name ?? ''}`.toLowerCase();
  // A drawer BOX side/back/bottom is internal, not a face - and never matches the terms below anyway.
  if (/\bdrawer\s+box\b/.test(s)) return false;
  return /\b(?:door|drawer\s+front|false\s+front|drawer\s+face)\b/.test(s);
}

/**
 * Split every part that cannot be cut from its board into equal pieces that can.
 *
 * Ben, 21 Sep 2026: "too long parts still price but split the items in half and make a not". Before this, an
 * over-long part raised a warning and nothing else - the sheet count is area / yield, which is blind to shape, so a
 * 2582 mm under panel on a 2400 mm board priced exactly as if it fitted. Splitting it is what the shop actually does:
 * two pieces and a join.
 *
 * Called from generateCabinetBOM BETWEEN calculatePartDimensions and calculateSheetRequirements, because `parts` is
 * the one list that feeds the sheet count, the edge tape, the per-part costs AND the workshop stations - splitting
 * inside calculateSheetRequirements would reach the sheet count and nothing else.
 *
 * Rules:
 *  - Pieces are EQUAL (Ben's "in half"), and there are ceil(dimension / usable) of them, so anything up to twice the
 *    board is two halves and a 3.3 m kick rail on a 2.44 m ply board is still two. Both axes are split when both
 *    overrun (a grid), and the orientation that needs fewer pieces wins - rotation is allowed exactly as
 *    partFitsSheet allows it, since grain is not modelled anywhere in the engine.
 *  - The JOIN edges carry NO tape: each piece keeps the original part's edging on the edges it still owns and the
 *    freshly cut ends stay bare, so the job's taped metres do not move. A visible raw edge at the seam is Ben's call.
 *  - Board cost does NOT move: n equal pieces have exactly the area of the part they came from, and the sheet count
 *    is area / yield. What moves is the extra part through the shop and the join minutes (workshopModel.partJoinMin).
 *  - A stand-in / estimated size (sizePlaceholder) is never split, for the same reason it is never judged.
 *  - A VISIBLE FRONT (isUnjoinableFace) is never split either - see that function.
 */
export function splitOversizeParts(
  parts: PartDimension[],
  materials: MaterialPricingRecord[],
): { parts: PartDimension[]; splits: SplitPart[] } {
  const out: PartDimension[] = [];
  const splits: SplitPart[] = [];
  const specCache = new Map<string, ReturnType<typeof resolveSheetSpec>>();

  for (const part of parts) {
    const materialId = part.materialId || 'default';
    if (part.sizePlaceholder || isUnjoinableFace(part) || !(part.length > 0) || !(part.width > 0)
      || !Number.isFinite(part.length) || !Number.isFinite(part.width)) {
      out.push(part);
      continue;
    }
    let resolved = specCache.get(materialId);
    if (!resolved) {
      resolved = resolveSheetSpec(materialId, materials);
      specCache.set(materialId, resolved);
    }
    const { spec, assumed } = resolved;
    if (partFitsSheet(part.length, part.width, spec.length, spec.width)) {
      out.push(part);
      continue;
    }

    const usableLong = Math.max(spec.length, spec.width) - SHEET_TRIM_MM;
    const usableShort = Math.min(spec.length, spec.width) - SHEET_TRIM_MM;
    if (!(usableLong > 0) || !(usableShort > 0)) { out.push(part); continue; }
    const count = (dim: number, usable: number) => Math.max(1, Math.ceil(dim / usable - 1e-9));
    // Orientation A: the part's length lies along the sheet's long side. B: turned 90 degrees.
    const a = { nl: count(part.length, usableLong), nw: count(part.width, usableShort) };
    const b = { nl: count(part.length, usableShort), nw: count(part.width, usableLong) };
    const pick = a.nl * a.nw <= b.nl * b.nw ? a : b;
    const pieces = pick.nl * pick.nw;
    if (pieces <= 1) { out.push(part); continue; }

    const pieceLength = part.length / pick.nl;
    const pieceWidth = part.width / pick.nw;
    const quantity = Math.max(1, part.quantity ?? 1);
    const e = part.edging;
    for (let i = 0; i < pick.nl; i++) {
      for (let j = 0; j < pick.nw; j++) {
        // The edges at right angles to the LENGTH are the width edges (wid1 / wid2), so splitting the length hands
        // the outer ones to the first and last piece and leaves every new cut end bare. Mirrored for the width.
        const edging: EdgeSpec = {
          wid1: i === 0 ? e.wid1 : false,
          wid2: i === pick.nl - 1 ? e.wid2 : false,
          len1: j === 0 ? e.len1 : false,
          len2: j === pick.nw - 1 ? e.len2 : false,
        };
        out.push({
          ...part,
          name: `${part.name} (${pieces === 2 ? 'half' : 'piece'} ${i * pick.nw + j + 1} of ${pieces})`,
          length: pieceLength,
          width: pieceWidth,
          area: (pieceLength * pieceWidth) / 1_000_000,
          edging,
          splitPiece: { pieces, index: i * pick.nw + j + 1, originalLength: part.length, originalWidth: part.width },
        });
      }
    }
    splits.push({
      name: part.name,
      partType: part.partType,
      originalLength: part.length,
      originalWidth: part.width,
      pieceLength,
      pieceWidth,
      lengthPieces: pick.nl,
      widthPieces: pick.nw,
      pieces,
      quantity,
      joins: (pieces - 1) * quantity,
      materialName: resolved.material?.name ?? 'Unresolved Material',
      sheetLength: spec.length,
      sheetWidth: spec.width,
      sheetSizeAssumed: assumed,
    });
  }

  return { parts: out, splits };
}

/**
 * Group parts by material and calculate sheet requirements for each
 */
export function calculateSheetRequirements(
  parts: PartDimension[],
  materials: MaterialPricingRecord[]
): SheetAllocation[] {
  // Group parts by material ID
  const partsByMaterial = new Map<string, PartDimension[]>();
  
  for (const part of parts) {
    const materialId = part.materialId || 'default';
    if (!partsByMaterial.has(materialId)) {
      partsByMaterial.set(materialId, []);
    }
    partsByMaterial.get(materialId)!.push(part);
  }
  
  const allocations: SheetAllocation[] = [];
  
  for (const [materialId, materialParts] of partsByMaterial) {
    // Resolve the part's material. If the part isn't tagged with a known material
    // id (e.g. carcase selection not yet plumbed through), fall back safely:
    // priced "Shop Materials" row → cheapest priced sheet — board is always
    // charged when any priced material exists. Never an arbitrary first row;
    // if NOTHING is priced, the line goes out at $0 flagged `unresolved`.
    const exactMatch = materials.find(m => m.id === materialId || m.item_code === materialId);
    const material = exactMatch ?? pickFallbackMaterial(materials);
    const unresolved = !material;

    // Get sheet spec from material or use default
    const sheetSpec: SheetSpec = material && material.sheet_width && material.sheet_length
      ? {
          width: material.sheet_width,
          length: material.sheet_length,
          area: (material.sheet_width * material.sheet_length) / 1_000_000 // mm² to m²
        }
      : DEFAULT_SHEET_SPECS[0];
    
    const allocation = calculateMaterialSheets(
      materialParts,
      sheetSpec,
      material?.expected_yield_factor ?? 0.85,
      material?.minimum_job_area ?? 0,
      material?.area_cost ?? 0,
      material?.name ?? 'Unresolved Material',
      materialId
    );
    allocation.materialRole = materialParts[0]?.materialRole ?? 'carcase';
    if (unresolved) allocation.unresolved = true;

    // Warning data only - the sheet count and cost above are untouched. A stand-in or estimated size
    // (PartDimension.sizePlaceholder: a part with no formula and no code default, a corner's doors) is not a cut size,
    // so it is not judged.
    const sheetSizeAssumed = !(material && material.sheet_width && material.sheet_length);
    const oversizeParts: OversizePart[] = materialParts
      .filter((p) => !p.sizePlaceholder && !partFitsSheet(p.length, p.width, sheetSpec.length, sheetSpec.width))
      .map((p) => ({
        name: p.name, length: p.length, width: p.width, quantity: p.quantity, sheetSizeAssumed,
        ...(isUnjoinableFace(p) ? { unjoinableFace: true as const } : {}),
      }));
    if (oversizeParts.length) allocation.oversizeParts = oversizeParts;

    allocations.push(allocation);
  }
  
  return allocations;
}

/**
 * Calculate sheets required for a specific material
 */
function calculateMaterialSheets(
  parts: PartDimension[],
  sheetSpec: SheetSpec,
  yieldFactor: number,
  minimumJobArea: number,
  areaCostPerSqm: number,
  materialName: string,
  materialId: string
): SheetAllocation {
  // Calculate total part area (accounting for quantities)
  let totalPartArea = 0;
  for (const part of parts) {
    totalPartArea += part.area * part.quantity;
  }
  
  // Apply yield factor (accounts for offcuts, grain direction, etc.). Invalid
  // imported values must never turn into a free/negative board calculation.
  const usedDefaultYield = !Number.isFinite(yieldFactor) || yieldFactor <= 0 || yieldFactor > 1;
  const effectiveYield = usedDefaultYield ? 0.85 : yieldFactor;
  // yieldFactor of 0.85 means we can use 85% of each sheet.
  const adjustedArea = totalPartArea / effectiveYield;
  
  // Apply minimum job area if specified
  const chargeableArea = Math.max(adjustedArea, minimumJobArea);
  
  // Calculate sheets required (round UP - you pay for whole sheets)
  const sheetsRequired = Math.ceil(chargeableArea / sheetSpec.area);
  
  // Calculate total material area used
  const totalSheetArea = sheetsRequired * sheetSpec.area;
  
  // Waste area
  const wasteArea = totalSheetArea - totalPartArea;

  // Calculate cost — you BUY whole sheets, so you pay for whole sheets.
  // (One small door in a job still pays the full sheet price.)
  const totalMaterialCost = totalSheetArea * areaCostPerSqm;
  
  return {
    materialId,
    materialName,
    sheetWidth: sheetSpec.width,
    sheetLength: sheetSpec.length,
    sheetArea: sheetSpec.area,
    sheetsRequired,
    totalPartArea,
    wasteArea,
    yieldFactor: effectiveYield,
    minimumJobArea: Math.max(0, minimumJobArea),
    chargeableArea,
    ...(usedDefaultYield ? { usedDefaultYield: true } : {}),
    areaCostPerSqm,
    totalMaterialCost
  };
}

/**
 * Consolidate sheet requirements across multiple cabinets
 * This combines all parts by material to calculate bulk sheet requirements
 */
export function consolidateSheetRequirements(
  cabinetSheets: SheetAllocation[][]
): SheetAllocation[] {
  // Group by material ID
  const byMaterial = new Map<string, SheetAllocation[]>();
  
  for (const sheets of cabinetSheets) {
    for (const sheet of sheets) {
      if (!byMaterial.has(sheet.materialId)) {
        byMaterial.set(sheet.materialId, []);
      }
      byMaterial.get(sheet.materialId)!.push(sheet);
    }
  }
  
  const consolidated: SheetAllocation[] = [];
  
  for (const [materialId, allocations] of byMaterial) {
    // Sum up all part areas for this material
    const totalPartArea = allocations.reduce((sum, a) => sum + a.totalPartArea, 0);
    
    // Use the first allocation's properties as template
    const template = allocations[0];
    const adjustedArea = totalPartArea / template.yieldFactor;
    // minimum_job_area is a per-material, per-job rule. It was previously
    // applied to each cabinet, then accidentally dropped during consolidation.
    const minimumJobArea = Math.max(0, ...allocations.map(a => a.minimumJobArea ?? 0));
    const chargeableArea = Math.max(adjustedArea, minimumJobArea);
    
    const sheetsRequired = Math.ceil(chargeableArea / template.sheetArea);
    const totalSheetArea = sheetsRequired * template.sheetArea;
    
    consolidated.push({
      materialId,
      materialName: template.materialName,
      materialRole: template.materialRole,
      sheetWidth: template.sheetWidth,
      sheetLength: template.sheetLength,
      sheetArea: template.sheetArea,
      sheetsRequired,
      totalPartArea,
      wasteArea: totalSheetArea - totalPartArea,
      yieldFactor: template.yieldFactor,
      minimumJobArea,
      chargeableArea,
      ...(allocations.some(a => a.usedDefaultYield) ? { usedDefaultYield: true } : {}),
      areaCostPerSqm: template.areaCostPerSqm,
      totalMaterialCost: totalSheetArea * template.areaCostPerSqm,
      ...(template.unresolved ? { unresolved: true } : {})
    });
  }
  
  return consolidated;
}

/**
 * Calculate cost savings from bulk ordering
 * Compares individual cabinet sheet requirements vs consolidated
 */
export function calculateBulkSavings(
  individualSheets: SheetAllocation[][],
  consolidatedSheets: SheetAllocation[]
): number {
  const individualTotal = individualSheets.reduce(
    (sum, sheets) => sum + sheets.reduce((s, sh) => s + sh.totalMaterialCost, 0),
    0
  );

  const consolidatedTotal = consolidatedSheets.reduce(
    (sum, sh) => sum + sh.totalMaterialCost,
    0
  );

  return individualTotal - consolidatedTotal;
}
