// BOM Generator Service - orchestrates all pricing calculations

import { CabinetBOM, QuoteBOM, PartDimension, PricingData, CabinetConfig, CommercialOptions, ApplianceLineItem, KickboardAllocation, EdgeSpec, LadderKickPart, LadderKickBuild, MaterialPricingRecord, SplitPart } from './types';
import { parseFormula, parseEdgingSpec, createFormulaVariables } from './formulaParser';
import { getCabinetPartMapping, getPartQuantities, isFlatBoardProduct, isFacesOnlyProduct, isRobeDoorProduct, boardThinAxis, flatBoardCutSize } from './cabinetPartMapping';
import { calculateSheetRequirements, consolidateSheetRequirements, pickFallbackMaterial, partFitsSheet, splitOversizeParts, SHEET_TRIM_MM } from './sheetOptimizer';
import { calculateEdgeTape, consolidateEdgeTape } from './edgeCalculator';
import { calculateHardware, consolidateHardware } from './hardwareCalculator';
import { calculateLaborCost, resolveLaborRates } from './laborCalculator';
import { calculateBuildHours } from './timeModel';
import { calculateBenchtops, BenchtopPricingSelection } from './benchtopCalculator';
import { calculateWorkshopCost, type WorkshopCost } from './workshopModel';
import { calculateDelivery } from './deliveryCalculator';
import { PlacedItem, GlobalDimensions, HardwareOptions } from '@/types';
import { distributeDrawerHeights, drawerBoxHeightFromFace } from '@/lib/drawerHeights';
import { roundMoney } from './money';

/**
 * Generate BOM for a single cabinet
 * Note: catalogItem should be passed in from the caller who has access to the catalog hook
 */
export function generateCabinetBOM(
  cabinet: PlacedItem,
  globalDims: GlobalDimensions,
  hardwareOptions: HardwareOptions,
  pricingData: PricingData,
  catalogItemName?: string
): CabinetBOM {
  const size = { width: cabinet.width, height: cabinet.height, depth: cabinet.depth };
  const mapping = getCabinetPartMapping(cabinet.definitionId, catalogItemName, size);

  if (!mapping) {
    const empty = createEmptyBOM(cabinet, catalogItemName ?? 'Unknown');
    const robeName = [catalogItemName, cabinet.definitionId].find((n) => n && isRobeDoorProduct(n));
    if (robeName) {
      // Say what it is rather than "no part mapping": a robe opening priced here goes out at $0.
      empty.warnings = [
        `${cabinet.cabinetNumber || robeName}: "${robeName}" is a robe opening / sliding robe door - a cabinet BOM cannot price a robe opening (BowerOS prices one only from a schedule row with Hafele Slider SC robe fields), so it is priced at $0 with no board, hinges, edge tape or workshop time. Price it by hand.`,
      ];
    }
    return empty;
  }

  // The mapping infers shelves from the definitionId (tall=4 / wall=2 / base=1).
  // An explicit shelf count from the editor is real information and must win —
  // it was previously dropped, so a 3-shelf base still priced a single shelf.
  const config: CabinetConfig = typeof cabinet.shelfCount === 'number'
    ? { ...mapping.config, numShelves: Math.max(0, cabinet.shelfCount) }
    : mapping.config;
  const partRequirements = getPartQuantities(mapping.parts, config);

  const warnings: string[] = [];
  const cabLabel = cabinet.cabinetNumber || catalogItemName || cabinet.definitionId || 'Cabinet';
  if (config.facesOnly && config.numDoors === 1 && cabinet.width > 650) {
    warnings.push(`${cabLabel}: replacement front ${cabinet.width} wide priced as ONE door - check whether it is a pair`);
  }
  const itemName = catalogItemName ?? cabinet.definitionId ?? '';
  const flatCut = config.flatBoard ? flatBoardCutSize(itemName, size) : null;
  // The carcase family the parts are drawn from, and the toe kick the item stands on (0 when it does not).
  const family = carcaseFamily(partRequirements);
  const kickMm = itemKickMm(cabinet, config, family, globalDims, `${itemName} ${cabinet.definitionId ?? ''}`);
  // A base/tall carcase whose NAME says nothing about where it stands gets no kick taken off, so its sides, back and
  // fronts are cut the full item height. That is right for an upper-level product and wrong for a floor one, and the
  // engine cannot tell them apart: a schedule carries no Z (Hibiscus lists TWO "Any Angle Spacer" - 406 x 865 at
  // Z 0, on the floor, and 247 x 692 at Z 1508, on the wall). Say so instead of letting it surface later as a
  // mystery over-size part, or as a join charged on a carcase that was only ever cut too tall. Ben, 21 Sep 2026.
  {
    const jobKick = (typeof cabinet.toeKickHeight === 'number' && Number.isFinite(cabinet.toeKickHeight)
      ? cabinet.toeKickHeight : globalDims.toeKickHeight) ?? 0;
    if (kickMm === 0 && jobKick > 0 && (family === 'base' || family === 'tall')
      && !config.facesOnly && !config.flatBoard && !config.toeKick
      && (cabinet.y ?? 0) <= 1 && cabinet.height > jobKick + 300) {
      warnings.push(
        `${cabLabel}: "${itemName}" ${mmTxt(cabinet.width)} x ${mmTxt(cabinet.height)} - BowerOS cannot tell whether`
        + ` this ${family} carcase stands on the floor. Its name says none of base / tall / pantry / broom / linen /`
        + ` vanity / sink / tower / appliance / oven / larder / utility / cupboard, and a schedule carries no Z. It is`
        + ` priced standing on NO kick, cut the full ${mmTxt(cabinet.height)}; on the floor Microvellum would cut it`
        + ` ${mmTxt(cabinet.height - jobKick)}. Send kickMm on the row to settle it either way.`,
      );
    }
  }
  const layout = frontLayout(itemName, config, family);
  const hasFronts = partRequirements.some((p) => p.partType === 'Door' || /^drawer front$/i.test(p.partType));
  const fronted = config.numDoors > 0 && !config.facesOnly && !config.flatBoard;
  if (fronted && config.isCorner && !config.isBlind) {
    // Door count and width of a pie-cut corner come from prompts the schedule does not carry: Microvellum's doors sit
    // on the two faces left by the arm depths (Regal 880 x 880 x 1200: 325 + 645).
    warnings.push(`${cabLabel}: "${itemName}" is a corner cabinet - its door board is an estimate (${config.numDoors} door${config.numDoors === 1 ? '' : 's'} across the full ${cabinet.width} width). Microvellum sizes corner doors from the arm depths, which the schedule does not carry.`);
  }
  if (fronted && config.isBlind && !blindWidthOf(cabinet)) {
    // A blind corner's doors sit on the width less its Blind_Corner_Width (Erin & Matt 623, Hibiscus 473). Without it
    // the depth stands in for the blind part: Hibiscus 2 x 763 x 351.5 against Microvellum's 2 x 763 x 392.5.
    warnings.push(`${cabLabel}: "${itemName}" is a blind corner - its door board is an estimate (${config.numDoors} door${config.numDoors === 1 ? '' : 's'} over ${cabinet.width} - ${cabinet.depth}, the width less its depth). Microvellum sizes them over the width less its Blind_Corner_Width - send blindCornerWidthMm to price them exactly.`);
  }
  if (layout.kind === 'unmodelled' && hasFronts) {
    warnings.push(`${cabLabel}: "${itemName}" - its drawer layout is not modelled, so its fronts are an estimate: ${config.numDoors > 0 ? 'doors sized to the full carcase height and ' : ''}each drawer front sized by the catalogue "Drawer Front" row. Check the front board against Microvellum.`);
  }
  if (config.flatBoard === 'shape' && flatCut) {
    // The name matched nothing, so say why this is not a cabinet - it is usually a typo worth fixing at source.
    warnings.push(`${cabLabel}: "${itemName}" is ${cabinet.width} x ${cabinet.height} x ${cabinet.depth} - one board thick, priced as a single ${flatCut.length} x ${flatCut.width} panel, not a cabinet`);
  }
  if (config.slidingDoors) {
    warnings.push(`${cabLabel}: "${itemName}" has sliding doors - priced as a carcase with the board for ${config.numDoors} door${config.numDoors === 1 ? '' : 's'} but NO hinges or hinge plates, and the sliding track, rollers and soft-close are not priced. Add the sliding door hardware by hand.`);
  }

  // Resolve which board each part draws from: carcase vs exterior/door finish.
  // WS2 guard: an explicit selection that doesn't match any material never
  // silently prices as an arbitrary row — safe fallback + warning instead.
  const resolveWithGuard = (selection: string | undefined, role: string): string | undefined => {
    const matched = resolveMaterialId(selection, pricingData.materials);
    if (matched) return matched;
    const fallback = pickFallbackMaterial(pricingData.materials);
    if (selection) {
      warnings.push(
        fallback
          ? `${cabLabel}: ${role} material "${selection}" not found — priced as ${fallback.name}`
          : `${cabLabel}: ${role} material "${selection}" not found and no priced material available — board priced at $0`
      );
    }
    return fallback?.id;
  };

  const carcaseMaterialId = resolveWithGuard(cabinet.carcaseMaterialId, 'carcase') ?? 'default';
  const exteriorMaterialId = resolveMaterialId(cabinet.exteriorMaterialId, pricingData.materials)
    ?? (cabinet.exteriorMaterialId ? resolveWithGuard(cabinet.exteriorMaterialId, 'exterior') : undefined)
    ?? carcaseMaterialId;

  // WS2 guard: a resolved material with no captured price still sizes parts,
  // but the quote must say it understates.
  for (const id of new Set([carcaseMaterialId, exteriorMaterialId])) {
    const m = pricingData.materials.find(x => x.id === id);
    if (m && (m.area_cost ?? 0) <= 0) {
      warnings.push(`${m.name}${m.brand ? ` (${m.brand})` : ''}: no price captured — quote understates`);
    }
  }

  // A "Toe Kick Base" is a ply ladder with a laminate face, not a board: its parts are the ones the work order cuts.
  const ladder = config.ladderKick
    ? buildLadderKick(cabinet, pricingData, cabLabel, itemName, carcaseMaterialId, warnings)
    : null;

  // Calculate part dimensions using formulas
  let parts = ladder ? ladder.parts : calculatePartDimensions(
    partRequirements,
    cabinet,
    globalDims,
    config,
    pricingData.parts,
    carcaseMaterialId,
    exteriorMaterialId,
    flatCut,
    kickMm,
    family,
    layout,
    isRangehoodWithFacia(itemName, family) ? rangehoodFaciaOf(cabinet) : 0,
  );

  // A floor-standing FLAT BOARD is still cut to its full schedule height, which INCLUDES the toe kick, so a 2460-high
  // tall applied panel measures 2460 x 580 against a 2400 sheet while Microvellum cuts it 2325 (Regal; Erin & Matt
  // 2440 -> 2305). A board that overruns its sheet only by the kick is not really over-long: it must not be warned
  // about and, now that over-long parts are split, it must NOT be split either - a phantom join would charge work
  // that never happens. This runs BEFORE the split, and so before the sheet call, for exactly that reason. Not for an
  // item no taller than the kick (a 100-high "Pelmet BC" is not standing on one: taking the kick off its height left
  // -35, which partFitsSheet does not judge, and silently dropped its real 3000 x 100 overrun on Regal), nor for
  // wall-hung boards. Carcases need none of this: their sides, backs and doors are already cut to the carcase height.
  const boardKickMm = globalDims.toeKickHeight ?? 0;
  const lowerName = itemName.toLowerCase();
  const wallHung = (cabinet.y ?? 0) > 1 || lowerName.startsWith('wall') || lowerName.includes('upper');
  const kickShortens = Boolean(config.flatBoard) && boardKickMm > 0 && cabinet.height > boardKickMm && !wallHung;
  const fitsOnceKickIsOff = (p: PartDimension): boolean => {
    if (!kickShortens) return false;
    const lessKick = (mm: number) => (Math.abs(mm - cabinet.height) < 0.5 ? mm - boardKickMm : mm);
    return partFitsSheetFor(lessKick(p.length), lessKick(p.width), p.materialId, pricingData.materials);
  };

  // Parts that cannot be cut from their board are SPLIT into equal pieces that can, so the part still prices and the
  // join is charged (Ben, 21 Sep 2026: "too long parts still price but split the items in half and make a not").
  // This has to happen before calculateSheetRequirements AND before calculateEdgeTape, because `parts` is the one
  // list the sheets, the tape, the per-part costs and the workshop stations all read. Part order is preserved: each
  // part is replaced in place by its pieces, so a quote's part list reads in the same order it always did.
  const splitParts: SplitPart[] = [];
  parts = parts.flatMap((p) => {
    if (fitsOnceKickIsOff(p)) return [p];
    const out = splitOversizeParts([p], pricingData.materials);
    splitParts.push(...out.splits);
    return out.parts;
  });
  for (const s of splitParts) {
    warnings.push(
      `${cabLabel}: "${s.name}" ${mmTxt(s.originalLength)} x ${mmTxt(s.originalWidth)} mm does not fit ${s.materialName}`
      + `${s.sheetSizeAssumed ? ' (no sheet size in the catalogue - the 2400 x 1200 default was assumed)' : ''}`
      + `, a ${Math.max(s.sheetLength, s.sheetWidth)} x ${Math.min(s.sheetLength, s.sheetWidth)} mm sheet`
      + ` (${Math.max(s.sheetLength, s.sheetWidth) - SHEET_TRIM_MM} x ${Math.min(s.sheetLength, s.sheetWidth) - SHEET_TRIM_MM} mm usable), even turned 90 degrees.`
      + ` It is PRICED, cut as ${s.pieces} x ${mmTxt(s.pieceLength)} x ${mmTxt(s.pieceWidth)} mm`
      + ` and NEEDS ${s.joins === 1 ? 'A JOIN' : `${s.joins} JOINS`} - the board costs the same (the area is unchanged), the join labour and the extra part do not.`
      + ` The join edges are left bare. A longer sheet in the same decor avoids the join if the catalogue has one.`,
    );
  }

  // Calculate sheet requirements
  const sheets = calculateSheetRequirements(parts, pricingData.materials);

  // Anything left on SheetAllocation.oversizeParts after the split is a part the split could not help (today: none -
  // every over-long part splits). The kick-only overrun above is already out of the list because such a part is
  // never split and its stated size still exceeds the sheet, so it is dropped here for the same reason as before.
  if (kickShortens) {
    const lessKick = (mm: number) => (Math.abs(mm - cabinet.height) < 0.5 ? mm - boardKickMm : mm);
    for (const sh of sheets) {
      if (!sh.oversizeParts) continue;
      const stillOversize = sh.oversizeParts.filter((p) => !partFitsSheet(lessKick(p.length), lessKick(p.width), sh.sheetLength, sh.sheetWidth));
      if (stillOversize.length) sh.oversizeParts = stillOversize;
      else delete sh.oversizeParts;
    }
  }

  // Calculate edge tape against the cabinet's selected edge banding (review #7).
  const edgeTape = calculateEdgeTape(parts, pricingData.edges, cabinet.edgeId);
  
  // Calculate hardware. The item's OWN hinge / plate / runner (what the work order named on this line) beats the
  // job's global pick; an item that names none is priced on the job's exactly as before.
  const hardware = calculateHardware(config, cabinet.height, hardwareOptions, pricingData.hardware, {
    hingeType: cabinet.hingeTypeId,
    hingePlateType: cabinet.hingePlateTypeId,
    drawerType: cabinet.drawerTypeId,
    runnerKits: cabinet.runnerKits,
    handleId: cabinet.handleTypeId,
    handleCount: cabinet.handleCount,
  });

  edgeTape
    .filter(edge => edge.isFallbackPrice)
    .forEach(edge => warnings.push(
      `Edge tape "${edge.edgeName}" has no positive catalogue price — using fallback $${edge.costPerMeter.toFixed(2)}/m`,
    ));
  hardware
    .filter(item => item.isFallbackPrice)
    .forEach(item => warnings.push(
      `Hardware "${item.name}" has no positive catalogue price — using fallback $${item.unitCost.toFixed(2)} each`,
    ));
  // A line that names its own hardware but names something the catalogue does not hold. The item is still counted
  // and still costed - on the job's pick - so nothing goes out free; the warning is loud so the gap gets closed.
  hardware
    .filter(item => item.overrideUnresolved)
    .forEach(item => warnings.push(
      `HARDWARE NOT IN THE CATALOGUE: ${cabLabel} names ${item.hardwareType === 'hinge-plate' ? 'hinge plate' : item.hardwareType}`
      + ` "${item.requestedCode}", which matches no hardware_pricing row. The line is priced on the job's own`
      + ` ${item.hardwareType === 'hinge-plate' ? 'plate' : item.hardwareType} instead - ${item.quantity} x "${item.name}"`
      + ` at $${item.unitCost.toFixed(2)} each${item.isFallbackPrice ? ' (itself a fallback price)' : ''}.`
      + ` Add the row to hardware_pricing, or pick the ${item.hardwareType === 'hinge-plate' ? 'plate' : item.hardwareType} for this line by hand.`,
    ));
  sheets
    .filter(sheet => sheet.usedDefaultYield)
    .forEach(sheet => warnings.push(
      `Material "${sheet.materialName}" has an invalid yield — using the safe 85% yield`,
    ));
  if (pricingData.labor.length === 0) {
    warnings.push('No labour-rate catalogue rows loaded — using calibrated labour defaults');
  }

  // Fallback labour only. generateQuoteBOM replaces this with the process model
  // unless the caller opts out with supplyMode: 'none'; it is kept per-cabinet
  // so a single cabinet costed on its own still has a labour figure.
  const isFlatPanel = Boolean(config.flatBoard) || isFlatBoardProduct(itemName);
  const isTall = !isFlatPanel &&
    (cabinet.height >= 1500 || /tall|pantry|broom|linen/i.test(cabinet.definitionId ?? ''));
  const laborRates = resolveLaborRates(pricingData.labor as never);
  const labor = calculateLaborCost(config, cabinet.width, isTall, laborRates, isFlatPanel);

  // Production build hours (scheduling + cross-check vs calibrated labor)
  const buildHours = calculateBuildHours(sheets, edgeTape, config, isTall, cabinet.definitionId);

  // Sum costs. The kick FACE is a material cost that is deliberately NOT a whole sheet (see buildLadderKick), so it
  // is added to the material subtotal here rather than through calculateSheetRequirements.
  const subtotals = {
    materials: sheets.reduce((s, sh) => s + sh.totalMaterialCost, 0) + (ladder?.build.facing?.cost ?? 0),
    edging: edgeTape.reduce((s, e) => s + e.totalCost, 0),
    hardware: hardware.reduce((s, h) => s + h.totalCost, 0),
    handling: parts.reduce((s, p) => s + p.handlingCost * p.quantity, 0),
    machining: parts.reduce((s, p) => s + p.machiningCost * p.quantity, 0),
    assembly: parts.reduce((s, p) => s + p.assemblyCost * p.quantity, 0),
    labor,
  };
  
  const totalCost = Object.values(subtotals).reduce((a, b) => a + b, 0);
  
  return {
    cabinetId: cabinet.instanceId,
    cabinetNumber: cabinet.cabinetNumber ?? '',
    cabinetName: catalogItemName ?? 'Unknown',
    cabinetSku: cabinet.definitionId,
    dimensions: { width: cabinet.width, height: cabinet.height, depth: cabinet.depth },
    parts,
    sheets,
    edgeTape,
    hardware,
    subtotals,
    totalCost,
    buildHours,
    warnings,
    itemKind: config.facesOnly ? 'fronts' : config.flatBoard ? 'board' : 'cabinet',
    ...(splitParts.length ? { splitParts } : {}),
    ...(ladder ? { ladderKick: ladder.build } : {}),
  };
}

/** A Microvellum ladder base the base cabinets stand on ("Toe Kick Base", "Toe Kick Base With Angled Ends"). */
export const TOE_KICK_BASE_RE = /toe\s*kick\s*base/i;

// ---- Toe Kick Base: the ply ladder and its laminate face -----------------------------------------------------------
// Ben, 21 Sep 2026: "if ladder kick buikld a cut list and price the kicks as ply with the selected lamnate face".
// Every dimension and count below is read off the 15 "Toe Kick Base" products in Bower's 7 exported Microvellum work
// orders (Coral Lodge robe, Donkin kitchen + laundry, Forest Glen laundry, Hibiscus kitchen, Regal kitchen, Kenfrost
// WO2) and reproduces 11 of 11 standard kicks part for part; the other 4 are named variants (see ladderKickCutList).
// The ladder is 15 mm ply ("Plywood 15mm_Clone" on every part) and the face is a 0.4 mm laminate ("Laminate Kick
// Front"). NO ladder part carries edge tape - EdgeNameTop/Bottom/Left/Right are blank on all 15 kicks.

/** Ply the ladder frame is cut from, mm. Microvellum: "Plywood 15mm_Clone" on every sleeper, cleat and sub rail. */
export const LADDER_PLY_THICKNESS_MM = 15;
/**
 * mm taken off the Sub Front's length for each FINISHED (returned) end - the face laminate wraps the end, so the ply
 * stops 0.4 mm short of it. Microvellum: a 1284 kick with one finished side cuts a 1283.6 Sub Front, a 1908 with two
 * cuts 1907.2.
 */
export const LADDER_FINISHED_END_MM = 0.4;
/**
 * mm the Sub Back is shorter than the Sub Front. OBSERVED, NOT DERIVED: exactly 30 on every 135 mm kick (Donkin,
 * Regal, Kenfrost) and exactly 46 on every 100 mm kick (Coral Lodge robe, Forest Glen, Hibiscus) across 11 kicks.
 * 30 is the two 15 mm sleepers the Sub Back sits between; the extra 16 on a 100 mm kick is not derivable from
 * anything in the work orders. FOR BEN TO CONFIRM against the Microvellum library before it is trusted further.
 */
export const ladderSubBackInsetMm = (kickHeightMm: number) => (kickHeightMm >= 120 ? 30 : 46);
/** A sleeper stands this far in from the end of the kick: D - 15.4 long (Microvellum, every kick, both heights). */
export const LADDER_SLEEPER_END_MM = 15.4;
/** An intermediate sleeper and a cleat run between the end sleepers: D - 30.4 long (Microvellum, every kick). */
export const LADDER_INNER_END_MM = 30.4;
/** A cleat is 75 mm wide whatever the kick height (Microvellum, 100 and 135 kicks alike). */
export const LADDER_CLEAT_WIDTH_MM = 75;
/** One intermediate sleeper per 600 mm of width, less the two end sleepers: n = ceil(W / 600) - 1 (11 of 11). */
export const LADDER_SLEEPER_PITCH_MM = 600;
/** One extra cleat per full 2400 mm of width on top of the two end cleats: 2 + floor(W / 2400) (11 of 11). */
export const LADDER_CLEAT_PITCH_MM = 2400;
/** The Sub Back and the intermediate sleepers are two thirds of the kick height (66.667 on 100, 90 on 135). */
export const LADDER_INNER_HEIGHT_FRACTION = 2 / 3;
/**
 * Waste on the kick FACE laminate. Ben, 16 Sep 2026: "kick it does not have to use the full board rule" - the facing
 * is charged by the AREA USED plus waste, never as a whole 3600 x 1200 sheet. 15% is Ben's own proposed figure;
 * Microvellum's own costing report uses 20% (Kenfrost: 0.5978 m2 x 1.20 = 0.72 units). HIS TO SETTLE.
 */
export const KICK_FACING_WASTE = 0.15;
/**
 * Facing this thin is a laminate that has to be contact-glued to the ply and trimmed (the Kick facing lamination
 * station); anything thicker is a pre-faced kickboard panel bought finished, which needs no bonding.
 */
export const KICK_FACING_LAMINATE_MAX_MM = 3;

const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/**
 * The parts a Microvellum "Toe Kick Base" actually cuts, from its W x H x D and how many of its ends return.
 *
 * Verified against all 15 Toe Kick Base products in the 7 work orders: 11 match part for part and dimension for
 * dimension; the other 4 are variants this cannot draw and each sets `variant` so the quote says so rather than
 * pretending:
 *   - "Toe Kick Base With Angled Ends" (Hibiscus 880.344 and 1123): the Sub Front and Finished Front are the ANGLED
 *     length, not W, the Sub Back runs the full W at full height, and the sleepers beside the angle are 85 wide.
 *   - a notched kick (Forest Glen 1226): a Notched Sleeper Left and Notched Sub Back Left round a short left arm.
 *   - a shallow return kick (Donkin 1250 x 135 x 30): D leaves no room for cleats or intermediate sleepers, which
 *     this does reproduce, but its Sub Back is inset 46 mm where a 135 kick is otherwise inset 30.
 */
export function ladderKickCutList(
  size: { width: number; height: number; depth: number },
  exposedEnds: number,
  productName = '',
): { parts: LadderKickPart[]; variant?: string } {
  const W = Math.max(0, size.width);
  const H = Math.max(0, size.height);
  const D = Math.max(0, size.depth);
  const sides = Math.min(2, Math.max(0, Math.round(exposedEnds)));
  const innerH = r3(H * LADDER_INNER_HEIGHT_FRACTION);
  const subFrontL = r3(W - LADDER_FINISHED_END_MM * sides);
  const sleeperL = r3(D - LADDER_SLEEPER_END_MM);
  const innerL = r3(D - LADDER_INNER_END_MM);
  const parts: LadderKickPart[] = [];
  const push = (name: string, length: number, width: number, material: 'ply' | 'facing', quantity = 1) => {
    if (length > 0 && width > 0 && quantity > 0) parts.push({ name, length: r3(length), width: r3(width), quantity, material });
  };

  push('Sub Front', subFrontL, H, 'ply');
  push('Sub Back', subFrontL - ladderSubBackInsetMm(H), innerH, 'ply');
  push('Sleeper Left', sleeperL, H, 'ply');
  push('Sleeper Right', sleeperL, H, 'ply');
  // Intermediate sleepers and cleats only exist when the kick is deep enough to hold them (a 30 mm deep return kick
  // has neither - Microvellum cuts it with the two end sleepers alone).
  if (innerL > 0) {
    const sleepers = Math.max(0, Math.ceil(W / LADDER_SLEEPER_PITCH_MM - 1e-9) - 1);
    for (let i = 1; i <= sleepers; i++) push(`Sleeper ${i}`, innerL, innerH, 'ply');
    const cleats = 2 + Math.floor(W / LADDER_CLEAT_PITCH_MM + 1e-9);
    push('Cleat Left', innerL, LADDER_CLEAT_WIDTH_MM, 'ply');
    push('Cleat Right', innerL, LADDER_CLEAT_WIDTH_MM, 'ply');
    for (let i = 3; i <= cleats; i++) push(`Cleat ${i}`, innerL, LADDER_CLEAT_WIDTH_MM, 'ply');
  }
  push('Finished Front', W, H, 'facing');
  if (sides > 0) push('Finished Side', D, H, 'facing', sides);

  const name = (productName || '').toLowerCase();
  const variant = /angled/.test(name)
    ? 'angled ends - Microvellum cuts the Sub Front and Finished Front to the ANGLED length, the Sub Back to the full width at full height, and the sleepers beside the angle 85 wide. This cut list is the square ladder for the same W x H x D.'
    : /notch/.test(name)
      ? 'notched - Microvellum cuts a Notched Sleeper and a Notched Sub Back round the short arm. This cut list is the square ladder for the same W x H x D.'
      : innerL <= 0
        ? `only ${D} mm deep - no cleats and no intermediate sleepers fit, which matches Microvellum, but its Sub Back on a kick this shallow is inset 46 mm where a ${H} mm kick is otherwise inset ${ladderSubBackInsetMm(H)}.`
        : undefined;
  return variant ? { parts, variant } : { parts };
}

/** mm, printed: whole numbers bare, anything else to one decimal. */
const mmTxt = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1));

/** partFitsSheet against the board a part is actually cut from (the same resolution calculateSheetRequirements uses). */
function partFitsSheetFor(length: number, width: number, materialId: string, materials: MaterialPricingRecord[]): boolean {
  const exact = materials.find((m) => m.id === materialId || m.item_code === materialId);
  const material = exact ?? pickFallbackMaterial(materials);
  const sheetLength = material?.sheet_length ?? 2400;
  const sheetWidth = material?.sheet_width ?? 1200;
  return partFitsSheet(length, width, sheetLength, sheetWidth);
}

/**
 * Is this catalogue row a 12-19 mm plywood board? "plywood" only, never the word "ply" on its own: a decor NAME can
 * contain it ("MDF 162412 DS Natural Ply Woodmatt"), and that row is MDF.
 */
export function isPlywoodRow(m: MaterialPricingRecord): boolean {
  return /plywood/i.test(`${m.name ?? ''} ${m.substrate ?? ''} ${m.material_type ?? ''}`)
    && (m.thickness ?? 0) >= 12 && (m.thickness ?? 0) <= 19;
}

/** Cheapest priced 12-19 mm PLYWOOD row - the stand-in when a kick is priced with no kickPlyMaterialId. */
export function pickKickPlyMaterial(materials: MaterialPricingRecord[]): MaterialPricingRecord | undefined {
  const ply = materials.filter((m) => (m.area_cost ?? 0) > 0 && isPlywoodRow(m));
  // nearest to the 15 mm Microvellum cuts, then cheapest
  return ply.sort((a, b) =>
    Math.abs((a.thickness ?? 0) - LADDER_PLY_THICKNESS_MM) - Math.abs((b.thickness ?? 0) - LADDER_PLY_THICKNESS_MM)
    || (a.area_cost ?? 0) - (b.area_cost ?? 0))[0];
}

/**
 * Price a "Toe Kick Base" as what it is: a ply ladder plus the selected kick face.
 *
 * The ply goes into `parts` and is bought as WHOLE BOARDS like every other board. The FACE does not: it is charged by
 * the area used plus waste (KICK_FACING_WASTE), which is Ben's one standing exception to the whole-board rule (16 Sep
 * 2026) and is what Microvellum's own costing report does - Kenfrost charges "Laminate Kick Front" as 0.72 units of
 * solid stock, exactly the 0.5978 m2 of face x 1.20, never a 3600 x 1200 sheet at $384. Keeping the face out of
 * `parts` is what guarantees it can never be caught by the whole-board sheet path.
 */
function buildLadderKick(
  cabinet: PlacedItem,
  pricingData: PricingData,
  cabLabel: string,
  itemName: string,
  carcaseMaterialId: string,
  warnings: string[],
): { parts: PartDimension[]; build: LadderKickBuild } {
  const size = { width: cabinet.width, height: cabinet.height, depth: cabinet.depth };
  const sentEnds = cabinet.kickExposedEnds;
  const exposedEndsSent = typeof sentEnds === 'number' && Number.isFinite(sentEnds) && sentEnds >= 0;
  const exposedEnds = exposedEndsSent ? Math.min(2, Math.round(sentEnds!)) : 0;
  const { parts: cutList, variant } = ladderKickCutList(size, exposedEnds, itemName);

  // ---- ply: a real board on the whole-board rule -------------------------------------------------------------
  const askedPly = cabinet.kickPlyMaterialId;
  const plyExact = askedPly
    ? pricingData.materials.find((m) => m.id === askedPly || m.item_code === askedPly)
      ?? pricingData.materials.find((m) => m.id === resolveMaterialId(askedPly, pricingData.materials))
    : undefined;
  // A Microvellum export already sends the kick row's own board, and on Bower's jobs that IS the ply
  // ("Plywood 15mm_Clone"), so it is used as it stands when it is plywood. Only when it is not - a planner row, or a
  // kick carrying the job's carcase melamine - does the engine look for a ply row of its own, and say so.
  const rowBoard = pricingData.materials.find((m) => m.id === carcaseMaterialId);
  const rowBoardIsPly = rowBoard ? isPlywoodRow(rowBoard) : false;
  const plyFallback = rowBoardIsPly ? rowBoard : pickKickPlyMaterial(pricingData.materials);
  const ply = plyExact ?? plyFallback ?? rowBoard;
  if (askedPly && !plyExact) {
    warnings.push(`${cabLabel}: kick ply "${askedPly}" is not a material_pricing id or item_code - the ladder is priced on ${ply?.name ?? 'no priced board'} instead`);
  } else if (!askedPly && rowBoardIsPly) {
    // nothing to say: the row's own board is already plywood, which is what a ladder is built from
  } else if (!askedPly && plyFallback) {
    warnings.push(`${cabLabel}: no kickPlyMaterialId sent and the row's own board is not plywood - the ladder is priced on ${plyFallback.name} (${plyFallback.item_code}), the cheapest 12-19 mm plywood in the catalogue at $${(plyFallback.area_cost ?? 0).toFixed(2)}/m2. Send the ply Bower actually buys.`);
  } else if (!askedPly && !plyFallback) {
    warnings.push(`${cabLabel}: no kickPlyMaterialId sent and the catalogue holds no plywood row - the ladder is priced on ${rowBoard?.name ?? 'the carcase board'}, which is not what a kick is built from.`);
  }

  // The ladder's own parts row, for the per-part handling / machining / assembly figures (the process model
  // supersedes them in every supply mode but 'none').
  const plyRow = pricingData.parts.find((p) => p.name === 'Kick Frame Length') ?? pricingData.parts.find((p) => p.name === 'Kick Frame Ladder');
  const parts: PartDimension[] = cutList.filter((c) => c.material === 'ply').map((c) => {
    const area = (c.length * c.width) / 1_000_000;
    return {
      name: c.name,
      partType: 'Kick Frame',
      length: c.length,
      width: c.width,
      area,
      thickness: LADDER_PLY_THICKNESS_MM,
      materialId: ply?.id ?? carcaseMaterialId,
      materialRole: 'carcase' as const,
      // Microvellum tapes NO edge on any ladder part: EdgeNameTop/Bottom/Left/Right are blank on all 15 kicks.
      edging: { len1: false, wid1: false, len2: false, wid2: false },
      quantity: c.quantity,
      handlingCost: (plyRow?.handling_cost ?? 0) + area * (plyRow?.area_handling_cost ?? 0),
      machiningCost: (plyRow?.machining_cost ?? 0) + area * (plyRow?.area_machining_cost ?? 0),
      assemblyCost: (plyRow?.assembly_cost ?? 0) + area * (plyRow?.area_assembly_cost ?? 0),
    };
  });

  // ---- face: by the area used plus waste, never a sheet ---------------------------------------------------------
  const faceParts = cutList.filter((c) => c.material === 'facing');
  const areaSqm = r3(faceParts.reduce((s, c) => s + (c.length * c.width * c.quantity) / 1_000_000, 0));
  const askedFace = cabinet.kickFacingMaterialId;
  const faceMat = askedFace
    ? pricingData.materials.find((m) => m.id === askedFace || m.item_code === askedFace)
      ?? pricingData.materials.find((m) => m.id === resolveMaterialId(askedFace, pricingData.materials))
    : undefined;
  let facing: LadderKickBuild['facing'] = null;
  if (!askedFace) {
    warnings.push(`${cabLabel}: no kickFacingMaterialId sent - the kick is priced as BARE PLY and no facing laminate is charged (${areaSqm.toFixed(3)} m2 of face). Send the kick laminate (e.g. POLY6428 Kickboard Laminate Brushed Stainless) to have it priced.`);
  } else if (!faceMat) {
    warnings.push(`${cabLabel}: kick facing "${askedFace}" is not a material_pricing id or item_code - the kick is priced as BARE PLY and no facing laminate is charged.`);
  } else if (!((faceMat.area_cost ?? 0) > 0)) {
    warnings.push(`${cabLabel}: kick facing ${faceMat.name} (${faceMat.item_code}) has no captured price - the kick is priced as BARE PLY.`);
  } else {
    const chargedSqm = r3(areaSqm * (1 + KICK_FACING_WASTE));
    const thicknessMm = Number(faceMat.thickness ?? 0);
    facing = {
      materialId: faceMat.id,
      materialName: faceMat.name,
      itemCode: faceMat.item_code ?? null,
      thicknessMm,
      areaSqm,
      wastePct: KICK_FACING_WASTE,
      chargedSqm,
      areaCost: faceMat.area_cost ?? 0,
      cost: roundMoney(chargedSqm * (faceMat.area_cost ?? 0)),
      bonded: thicknessMm > 0 && thicknessMm <= KICK_FACING_LAMINATE_MAX_MM,
    };
    // The face is not nested, but a single piece longer than the stock sheet still cannot be cut in one.
    const sheetLong = Math.max(Number(faceMat.sheet_length ?? 0), Number(faceMat.sheet_width ?? 0));
    const tooLong = sheetLong > 0 ? faceParts.filter((c) => c.length > sheetLong - SHEET_TRIM_MM) : [];
    for (const c of tooLong) {
      warnings.push(`${cabLabel}: the ${mmTxt(c.length)} mm "${c.name}" kick face will not come off ${faceMat.name} in one piece (${sheetLong} mm stock) - it needs a join in the facing.`);
    }
  }
  if (variant) {
    warnings.push(`${cabLabel}: "${itemName}" ${mmTxt(cabinet.width)} x ${mmTxt(cabinet.height)} x ${mmTxt(cabinet.depth)} is a ${variant} Check the cut list against the work order.`);
  }
  if (!exposedEndsSent) {
    warnings.push(`${cabLabel}: no kickExposedEnds sent - the kick is priced with NO returned end, so no "Finished Side" is cut or faced. Microvellum returns the face on 11 of the 15 kicks in Bower's work orders, worth about a quarter of the finished face metres.`);
  }

  return {
    parts,
    build: {
      width: cabinet.width,
      height: cabinet.height,
      depth: cabinet.depth,
      exposedEnds,
      exposedEndsSent,
      cutList,
      plySqm: r3(parts.reduce((s, p) => s + p.area * p.quantity, 0)),
      plyMaterialId: ply?.id ?? carcaseMaterialId,
      plyMaterialName: ply?.name ?? 'Unresolved Material',
      plyFromSelection: Boolean(plyExact),
      facing,
      ...(variant ? { variant } : {}),
    },
  };
}

/** Parts that take the exterior/door finish rather than carcase board. */
const EXTERIOR_PART = /door|drawer front|false front|appliance panel|end panel|fascia/i;

// ---- Front geometry (doors and drawer faces on a carcase) ---------------------------------------------------------
// Read off the Microvellum Toolbox work orders of 11 Bower jobs (the product prompts and the finished parts' base
// points agree on every non-corner product): Left_Reveal / Right_Reveal 1 mm (2 at some exposed ends - not in a
// schedule, and worth 1 mm), Door_Gap 2 mm between doors (34 of 34 pairs; = GlobalDimensions.doorGap), Top_Reveal 2 mm
// on a base (under the benchtop: 10 of 10 door products, 14 of 17 drawer banks) and 0 on tall (5 of 6) and upper (26 of
// 28), Bottom_Reveal 0 - except an "Upper Rangehood Cabinet", whose Bottom_Reveal is its Rangehood_Facia_Height (40 on
// Donkin and Coral Lodge; 80 on an older Donkin revision). Upper doors that drop 16 mm over an under panel (Regal, Erin &
// Matt, Coral Lodge) are not modelled: the schedule does not say which run has one.
/** Left_Reveal and Right_Reveal of a front, mm each. */
export const FRONT_EDGE_REVEAL_MM = 1;
/** Top_Reveal of a base front (door or drawer bank), mm. Tall and upper fronts have none. */
export const BASE_FRONT_TOP_REVEAL_MM = 2;
/** Left_Reveal 2 + Right_Reveal 1 of a blind corner's doors (the "Base Blind Corner" prompts; Hibiscus, Erin & Matt). */
export const BLIND_CORNER_SIDE_REVEALS_MM = 3;
/** Top_Drawer_Front_Height of a top-drawer product ("Base 1 Door 1 Drawer", "Base Open 1 Drawer" ... - their prompts). */
export const TOP_DRAWER_FRONT_HEIGHT_MM = 180;
/** Rangehood_Facia_Height of an "Upper Rangehood Cabinet" (library default; Donkin 1.22, Coral Lodge 208). */
export const RANGEHOOD_FACIA_HEIGHT_MM = 40;
/** A drawer face is edged all round, as a door is (50 of 52 Microvellum drawer fronts). */
const ALL_EDGES: EdgeSpec = { len1: true, wid1: true, len2: true, wid2: true };

/**
 * How a carcase's drawers sit on its front - read off the Microvellum library's product prompts (microvellum_product_
 * prompts: Top_Drawer, Double_Top_Drawer, Drawer_Bank, Bay_Qty, Appliance_Top_Opening) and the work orders.
 *   none       - no drawers (doors only, or no fronts).
 *   bank       - drawers only, and they fill the front: "Base 1..7 Drawer", "... Waste Bin", "N Drawer Suspended Cabinet"
 *                (Top_Drawer 0, no bay or appliance opening). Faces share the face stack.
 *   topDrawer  - one row of `faces` drawer faces, Top_Drawer_Front_Height (180) high, over the doors or an open bay:
 *                "Base 1 Door 1 Drawer", "Base 2 Door 1 Drawer", "Base 2 Door 2 Drawer" and "Base Open 2 Drawer"
 *                (Double_Top_Drawer 1: two faces side by side), "Base Open 1 Drawer", and the "... Blind Corner" pair.
 *   inner      - drawers behind the doors ("... With Inner Drawers", Top_Drawer 0): full-height doors, no face.
 *   unmodelled - any other drawer product: a microwave or oven opening, a bay of doors beside a bay of drawers, a bin
 *                with a top drawer, a false-front sink, a corner. Doors full height, drawer fronts from the catalogue
 *                row, both estimates, and a warning.
 */
export type FrontLayout =
  | { kind: 'none' } | { kind: 'bank' } | { kind: 'topDrawer'; faces: number } | { kind: 'inner' } | { kind: 'unmodelled' };
const TOP_DRAWER_NAME_RE = /^base (?:[12] doors? |open )([12]) drawers?(?: blind corner)?(?: (?:left|right))?$/;
const NOT_A_DRAWER_BANK_RE = /\bopen\b|microwave|\bov(?:en)?\b|appliance|dishwasher|with top drawer|\bbays?\b|with drawers|false front|spacer|corner/;
const normalName = (s: string) => (s || '').toLowerCase().replace(/[_\-/]+/g, ' ').replace(/\s+/g, ' ').trim();
/** The blind part of a blind corner's width, mm (PlacedItem.blindCornerWidth) - 0 when it was not sent or is not usable. */
function blindWidthOf(cabinet: PlacedItem): number {
  const b = cabinet.blindCornerWidth;
  return typeof b === 'number' && Number.isFinite(b) && b > 0 && b < cabinet.width ? b : 0;
}
/** An "Upper Rangehood Cabinet" (not the undermount one): its doors stop its Rangehood_Facia_Height short. */
function isRangehoodWithFacia(name: string, family: CarcaseFamily): boolean {
  return family === 'upper' && /^upper rangehood cabinet\b/.test(normalName(name));
}
function rangehoodFaciaOf(cabinet: PlacedItem): number {
  const f = cabinet.rangehoodFaciaHeight;
  return typeof f === 'number' && Number.isFinite(f) && f >= 0 ? f : RANGEHOOD_FACIA_HEIGHT_MM;
}

export function frontLayout(name: string, config: CabinetConfig, family: CarcaseFamily): FrontLayout {
  const numDrawers = config.numDrawers ?? 0;
  if (numDrawers <= 0 || config.facesOnly || config.flatBoard) return { kind: 'none' };
  const s = normalName(name);
  const top = TOP_DRAWER_NAME_RE.exec(s);
  if (top && family === 'base' && Number(top[1]) === numDrawers) return { kind: 'topDrawer', faces: numDrawers };
  if ((config.numDoors ?? 0) > 0) return /\binner\b/.test(s) ? { kind: 'inner' } : { kind: 'unmodelled' };
  return NOT_A_DRAWER_BANK_RE.test(s) ? { kind: 'unmodelled' } : { kind: 'bank' };
}

/** Which carcase family a part list is drawn from: 'Base Left Side' / 'Ls Base …' → base, 'Tall …', 'Upper …' / 'Wall …'. */
export type CarcaseFamily = 'base' | 'tall' | 'upper' | null;
export function carcaseFamily(parts: Array<{ partType: string }>): CarcaseFamily {
  for (const p of parts) {
    if (/^(?:ls\s+)?(?:upper|wall)\b/i.test(p.partType)) return 'upper';
    if (/^(?:ls\s+)?tall\b/i.test(p.partType)) return 'tall';
    if (/^(?:ls\s+)?base\b/i.test(p.partType)) return 'base';
  }
  return null;
}

/**
 * Names of cabinets that stand on the floor (after _ - / are read as spaces).
 *
 * Widened 21 Sep 2026. It read only base|tall|pantry|broom|linen|vanity|sink, and a floor carcase the list missed -
 * "Appliance Tower 2 Door", "Utility Cupboard 2 Door", "Larder", "Oven Tower" - got NO kick taken off its height, so
 * its sides, back and fronts were cut the full item height. That was merely a wrong size until parts started being
 * split; then it also bought phantom joins (a 2460 tower charged 150 min of join labour it can never do). Every name
 * added here is a floor product; anything wall-hung says so and is caught by OFF_FLOOR_NAME_RE first.
 */
const FLOOR_CABINET_NAME_RE =
  /\b(?:base|tall|pantry|broom|linen|vanity|sink|tower|appliance|oven|larder|utility|cupboard|robe|bookcase|dresser)\b/;
/** Names of cabinets that do not, whatever else they say. */
const OFF_FLOOR_NAME_RE = /^(?:wall|upper)\b|\bupper\b|\b(?:suspended|floating)\b|\bwall\s?hung\b/;

/**
 * The toe kick a cabinet stands on, mm - 0 when it stands on none. A floor-standing base or tall carcase's schedule
 * height INCLUDES its kick (Microvellum: Regal's 2460 broom is 2325 of carcase on a 135 kick), so its sides, back and
 * fronts are that much shorter than the item.
 *
 * The kick is the item's own `toeKickHeight` (quoteFromSchedule sets it from the Toe Kick Base rows of its room, or
 * the row's kickMm), else GlobalDimensions.toeKickHeight (the planner's room setting). It is 0 for: replacement
 * fronts, flat boards (still cut to their full height - not changed here), kick bases, anything whose parts are not a
 * base or tall carcase, anything off the floor (y > 1) or named upper / wall / suspended / floating / wall-hung, any
 * name that does not say it is a base / tall / pantry / broom / linen / vanity / sink cabinet (Hibiscus's "Any Angle
 * Spacer" is also an upper-level product, and the mapping cannot tell which) unless its layoutRole is a floor role,
 * and an item no taller than the kick.
 *
 * Microvellum's own Toe_Kick_Height agrees with the Toe Kick Base rows on every floor carcase of the 11 exported work
 * orders except the three "Base Open" 382 units stacked on a "Base 1 Drawer" (Z 494-498, Toe_Kick_Height 0) - the
 * schedule has no Z, so scheduleKickHeights gives those 0 when their height and the unit under them add up to the
 * room's base height (or the row's kickMm says so).
 */
export function itemKickMm(
  cabinet: PlacedItem, config: CabinetConfig, family: CarcaseFamily, globalDims: GlobalDimensions, name: string,
): number {
  if (config.facesOnly || config.flatBoard || config.toeKick) return 0;
  if (family !== 'base' && family !== 'tall') return 0;
  if ((cabinet.y ?? 0) > 1) return 0;
  const s = (name || '').toLowerCase().replace(/[_\-/]+/g, ' ').trim();
  if (OFF_FLOOR_NAME_RE.test(s)) return 0;
  if (!FLOOR_CABINET_NAME_RE.test(s) && !(cabinet.layoutRole && KICKABLE_ROLE.has(cabinet.layoutRole))) return 0;
  const own = cabinet.toeKickHeight;
  const kick = typeof own === 'number' && Number.isFinite(own) ? own : (globalDims.toeKickHeight ?? 0);
  if (!(kick > 0) || cabinet.height <= kick) return 0;
  return kick;
}

/**
 * Normalise the verbose labels stored by older jobs into the same vocabulary
 * used by the imported pricing catalogue.  Historic room defaults contain
 * presentation words (for example `Available`) and punctuation that are not
 * part of the supplier row, so a literal substring comparison incorrectly
 * fell through to the cheapest material.
 */
function materialLookupTokens(value: unknown): string[] {
  return String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/carcass/g, 'carcase')
    .replace(/\b(?:available|unavailable|sheet|board)\b/g, ' ')
    .replace(/(\d+(?:\.\d+)?)\s*mm\b/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(token => token.length > 1);
}

/** Match a user material selection (id, item_code, or supplier description). */
function resolveMaterialId(
  selection: string | undefined,
  materials: PricingData['materials']
): string | undefined {
  if (!selection) return undefined;
  const exact = materials.find(x => x.id === selection || x.item_code === selection);
  if (exact) return exact.id;

  const selectedTokens = materialLookupTokens(selection);
  if (selectedTokens.length === 0) return undefined;
  const selectedSet = new Set(selectedTokens);

  const scored = materials.map(material => {
    const searchable = [
      material.name,
      material.item_code,
      material.brand,
      material.finish,
      material.substrate,
      material.material_type,
      material.description,
      material.supplier_variant_code,
      material.supplier_finish_code,
      material.supplier_range,
      material.thickness != null ? `${material.thickness}mm` : null,
    ].filter(Boolean).join(' ');
    const candidateTokens = materialLookupTokens(searchable);
    const candidateSet = new Set(candidateTokens);
    const intersection = selectedTokens.filter(token => candidateSet.has(token)).length;
    const union = new Set([...selectedSet, ...candidateSet]).size || 1;
    const score = intersection / union;
    const coverage = intersection / selectedTokens.length;
    return { material, intersection, score, coverage };
  }).sort((a, b) => b.coverage - a.coverage || b.score - a.score || b.intersection - a.intersection);

  const best = scored[0];
  // Require multiple meaningful agreements so a colour word such as "White"
  // cannot resolve to an unrelated board. Short catalogue labels may match on
  // two tokens; verbose legacy labels must agree on at least three.
  const minimumIntersection = selectedTokens.length <= 3 ? 2 : 3;
  return best && best.intersection >= minimumIntersection && best.coverage >= 0.4
    ? best.material.id
    : undefined;
}

function calculatePartDimensions(
  partRequirements: Array<{ partType: string; quantity: number }>,
  cabinet: PlacedItem,
  globalDims: GlobalDimensions,
  config: CabinetConfig,
  partsPricing: PricingData['parts'],
  carcaseMaterialId: string,
  exteriorMaterialId: string,
  /** A board-thin flat item's cut size (flatBoardCutSize); null for anything else. */
  flatCut: { length: number; width: number } | null = null,
  /** The toe kick the item stands on (itemKickMm); 0 when it stands on none. */
  kickMm = 0,
  /** The carcase family its parts are drawn from (carcaseFamily). */
  family: CarcaseFamily = null,
  /** How its drawers sit on its front (frontLayout). */
  layout: FrontLayout = { kind: 'none' },
  /** mm its doors stop short of the carcase bottom (an "Upper Rangehood Cabinet"'s facia); 0 for anything else. */
  doorBottomReveal = 0,
): PartDimension[] {
  // CabHeight is the CARCASE height: the item's height less the kick it stands on. Microvellum cuts every base and
  // tall side and back of the 11 exported work orders at H - Toe_Kick_Height (113 of 113), and the live catalogue's
  // sides and backs are plain `CabHeight`. For anything not on a kick this is the item height, as before.
  const carcaseHeight = cabinet.height - kickMm;
  const vars = createFormulaVariables(
    { width: cabinet.width, height: carcaseHeight, depth: cabinet.depth },
    globalDims,
    {
      numDoors: config.numDoors,
      numDrawers: config.numDrawers,
      numShelves: config.numShelves,
      // corner second run — drives CabRightWidth / CabRightDepth, which 28
      // parts_pricing formulas depend on
      rightWidth: cabinet.secondWidth,
      rightDepth: cabinet.rightCarcaseDepth,
    }
  );
  
  const parts: PartDimension[] = [];

  // Fronts on a carcase (see FRONT_EDGE_REVEAL_MM): a base front sits 2 mm under the benchtop; tall and upper fronts
  // run the full carcase height.
  const frontTopReveal = family === 'base' ? BASE_FRONT_TOP_REVEAL_MM : 0;
  const numDoors = config.numDoors ?? 0;

  // Per-drawer face heights (#20): custom editor values or the standard distribution, over the FACE STACK - the
  // carcase height less the top reveal and a DrawerGap between faces. Microvellum: every standard drawer bank's faces
  // add up to H - Toe_Kick_Height - 2 - 2(n-1) (14 of 14; Donkin 4-drawer 880 high = 4 x 184.25). How the stack is split
  // between drawers changes neither the face board nor its edge metres. Box height = face − 20mm (shop standard).
  // A top-drawer product's faces are one row, Top_Drawer_Front_Height high, side by side (frontLayout).
  const numDrawers = config.numDrawers ?? 0;
  const faceStack = Math.max(0, carcaseHeight - frontTopReveal - (globalDims.drawerGap ?? 0) * Math.max(0, numDrawers - 1));
  const drawerFaces = numDrawers <= 0 ? []
    : layout.kind === 'topDrawer' ? Array.from({ length: numDrawers }, () => TOP_DRAWER_FRONT_HEIGHT_MM)
      : distributeDrawerHeights(numDrawers, faceStack, cabinet.drawerFrontHeights);
  // Faces the engine sizes: a drawer bank's (they fill the front) and a top-drawer product's. Any other drawer front -
  // inner drawers, a layout frontLayout does not model - keeps the catalogue "Drawer Front" row.
  const sizedFaces = layout.kind === 'bank' || layout.kind === 'topDrawer';

  // The span a blind corner's fronts sit on: the width less its Blind_Corner_Width, or (not sent) less its depth, as an
  // estimate. Its reveals are Left 2 + Right 1. Any other carcase's fronts span the width, 1 + 1.
  const blindWidth = config.isBlind ? blindWidthOf(cabinet) : 0;
  const frontSpan = config.isBlind ? cabinet.width - (blindWidth || cabinet.depth) : cabinet.width;
  const sideReveals = config.isBlind ? BLIND_CORNER_SIDE_REVEALS_MM : 2 * FRONT_EDGE_REVEAL_MM;
  const frontsEstimated = (config.isCorner && !config.isBlind) || (config.isBlind && !blindWidth);
  // The face row "Drawer" (Component, like "Door") sizes an engine-sized face; its formula wins on an axis that has one.
  const drawerFaceRow = partsPricing.find((p) => p.name === 'Drawer');

  const pushPart = (
    req: { partType: string; quantity: number },
    partVars: typeof vars,
    nameSuffix = '',
    quantity = req.quantity,
    /** Size when the catalogue formula is missing. Left undefined, it is a stand-in: height (length) / depth (width). */
    fallbackLength?: number,
    fallbackWidth?: number,
    exact?: { length: number; width: number },
    opts: {
      /** Edging when the catalogue row's does not describe this part (a drawer FACE sized by the engine). */
      edging?: EdgeSpec;
      /** The fallback size is an estimate, not a cut size (a corner's doors - see generateCabinetBOM). */
      estimate?: boolean;
      /** Price and size against this catalogue row instead of the one named by req.partType (a face on "Drawer"). */
      row?: PricingData['parts'][number];
    } = {},
  ) => {
    const pricing = opts.row ?? partsPricing.find(p => p.part_type === req.partType || p.name === req.partType);
    // A flat board is a visible face - an applied end, filler, under panel, pelmet front, appliance panel - and
    // Microvellum cuts every one of them from the FRONT material. Its part names ("Tall Applied End", "Filler")
    // never matched EXTERIOR_PART, so they were all billed as carcase board.
    const isExterior = Boolean(config.flatBoard) || EXTERIOR_PART.test(`${pricing?.name ?? req.partType} ${req.partType}`);

    // `exact` bypasses the catalogue formula: a formula written for a door on a carcase takes the kick
    // off the height, which is wrong for a face that is already the finished door size.
    const lengthFn = pricing?.length_function ?? null;
    const widthFn = pricing?.width_function ?? null;
    // A formula that names ToeKickHeight takes the kick off by itself ("CabHeight-ToeKickHeight", the 2 July seed's
    // style): it is evaluated against the full item height, exactly as before, so the kick never comes off twice.
    // ToeKickHeight is then the item's own kick (its room's 100 on Forest Glen, Hibiscus, Coral Lodge's robe; kickMm),
    // not the job default 135, so H - ToeKickHeight is the carcase height.
    const varsFor = (fn: string | null) =>
      (kickMm > 0 && fn && /\bToeKickHeight\b/.test(fn) ? { ...partVars, CabHeight: cabinet.height, ToeKickHeight: kickMm } : partVars);
    const fromLengthFn = exact ? 0 : parseFormula(lengthFn, varsFor(lengthFn));
    const fromWidthFn = exact ? 0 : parseFormula(widthFn, varsFor(widthFn));
    const length = exact ? exact.length : (fromLengthFn || (fallbackLength ?? cabinet.height));
    const width = exact ? exact.width : (fromWidthFn || (fallbackWidth ?? cabinet.depth));
    const area = (length * width) / 1_000_000; // mm² to m²
    // Not a cut size (see PartDimension.sizePlaceholder): the stand-in fallback was used, an estimated fallback was
    // used, or the formula needs a corner's second arm this item does not carry (CabRightWidth / CabRightDepth then
    // default to its own W / D).
    const needsMissingArm = (fn: string | null) => Boolean(fn)
      && ((/CabRightWidth/.test(fn!) && cabinet.secondWidth == null) || (/CabRightDepth/.test(fn!) && cabinet.rightCarcaseDepth == null));
    const sizePlaceholder = !exact && (
      (!fromLengthFn && (fallbackLength === undefined || Boolean(opts.estimate)))
      || (!fromWidthFn && (fallbackWidth === undefined || Boolean(opts.estimate)))
      || needsMissingArm(lengthFn) || needsMissingArm(widthFn));

    parts.push({
      name: (opts.row ? req.partType : (pricing?.name ?? req.partType)) + nameSuffix,
      partType: req.partType,
      length,
      width,
      area,
      thickness: 16,
      materialId: isExterior ? exteriorMaterialId : carcaseMaterialId,
      materialRole: isExterior ? 'exterior' : 'carcase',
      edging: opts.edging ?? parseEdgingSpec(pricing?.edging ?? null),
      quantity,
      handlingCost: (pricing?.handling_cost ?? 0) + area * (pricing?.area_handling_cost ?? 0),
      machiningCost: (pricing?.machining_cost ?? 0) + area * (pricing?.area_machining_cost ?? 0),
      assemblyCost: (pricing?.assembly_cost ?? 0) + area * (pricing?.area_assembly_cost ?? 0),
      ...(sizePlaceholder ? { sizePlaceholder: true } : {}),
    });
  };

  for (const req of partRequirements) {
    // Replacement fronts: the item's W x H IS the face. One door takes all of it; several share the width.
    if (config.facesOnly) {
      const n = Math.max(1, config.numDoors);
      pushPart(req, vars, '', req.quantity, cabinet.height, cabinet.width,
        { length: cabinet.height, width: n > 1 ? (cabinet.width - globalDims.doorGap * (n - 1)) / n : cabinet.width });
      continue;
    }

    // Flat boards (fillers, scribes, applied/return panels) are a single panel.
    // A board-thin one is cut to its faces (flatBoardCutSize). Sizing every one
    // height x WIDTH billed the THICKNESS as the width whenever the thin
    // dimension was W: E&M's 2440 x 710 tall applied panels priced as 2440 x 16
    // strips and a 740 x 348 upper return filler as 740 x 16, while an under
    // panel (thin in H) priced as 16 x 2086. Only a flat item with no thin
    // dimension - a pelmet or scribe filler face - keeps height x width.
    if (config.flatBoard) {
      if (flatCut) pushPart(req, vars, '', req.quantity, flatCut.length, flatCut.width, flatCut);
      else pushPart(req, vars, '', req.quantity, cabinet.height, cabinet.width);
      continue;
    }

    // A door on a carcase. The live catalogue's Door row has NO length or width formula, so every door fell back to the
    // item's height x DEPTH (Regal's 250-wide broom priced a 2460 x 580 door; Microvellum cuts 2325 x 248). The code
    // default below is Microvellum's geometry and is used only where the catalogue has no formula for that axis:
    // height = carcase height - top reveal, width = (W - 1 - 1 - DoorGap x (n - 1)) / n. Below a top drawer the door
    // loses the face and the Horizontal_Drawer_Gap (880 on a 135 kick: 880 - 135 - 2 - 180 - 2 = 561); an "Upper
    // Rangehood Cabinet"'s loses its facia (Donkin 695 - 40 = 655); a blind corner's spans the width less the blind part
    // (frontSpan). A pie-cut corner's, a blind corner's without its blind width, and an unmodelled layout's are estimates.
    if (req.partType === 'Door') {
      const n = Math.max(1, numDoors);
      const underTopDrawer = layout.kind === 'topDrawer' ? TOP_DRAWER_FRONT_HEIGHT_MM + (globalDims.drawerGap ?? 0) : 0;
      const doorHeight = carcaseHeight - frontTopReveal - underTopDrawer - doorBottomReveal;
      const doorWidth = (frontSpan - sideReveals - (globalDims.doorGap ?? 0) * (n - 1)) / n;
      const sized = doorHeight > 0 && doorWidth > 0;
      pushPart(req, vars, '', req.quantity, sized ? doorHeight : undefined, sized ? doorWidth : undefined, undefined,
        { estimate: frontsEstimated || layout.kind === 'unmodelled' });
      continue;
    }

    // Drawer faces the engine sizes (a drawer bank's, a top-drawer product's). The live "Drawer Front" row is a
    // drawer-BOX front formula ((W - 32) x (runner height - 30) = 110 high), so every face was priced as a 110-high
    // strip: Regal's 600 x 480 Base 1 Drawer at 568 x 110 where Microvellum cuts 598 x 343. A face is its finished size:
    //   bank       - W less 1 + 1 reveal, by its share of the face stack;
    //   topDrawer  - Top_Drawer_Front_Height (180) high, over the front span less its reveals, shared by the faces in
    //                the row with a DoorGap between them (Double_Top_Drawer).
    // It is priced on the catalogue's "Drawer" face row (Component, edged all round, the same costs), as a door is on
    // "Door": that row's formula wins on an axis that has one, this is the default. Without that row, on "Drawer
    // Front" at exactly this size, edged all round.
    if (sizedFaces && /^drawer front$/i.test(req.partType) && drawerFaces.length === numDrawers) {
      const perDrawer = Math.max(1, Math.round(req.quantity / numDrawers));
      const faceWidth = layout.kind === 'topDrawer'
        ? (frontSpan - sideReveals - (globalDims.doorGap ?? 0) * (numDrawers - 1)) / numDrawers
        : cabinet.width - 2 * FRONT_EDGE_REVEAL_MM;
      const estimate = layout.kind === 'topDrawer' && frontsEstimated;
      drawerFaces.forEach((faceH, i) => {
        const suffix = numDrawers > 1 ? ` (D${i + 1})` : '';
        if (drawerFaceRow) {
          const perVars = { ...vars, DrawerFrontHeight: faceH, DrawerHeight: drawerBoxHeightFromFace(faceH) };
          pushPart(req, perVars, suffix, perDrawer, faceWidth, faceH, undefined, { row: drawerFaceRow, estimate });
        } else {
          pushPart(req, vars, suffix, perDrawer, undefined, undefined, { length: faceWidth, width: faceH }, { edging: ALL_EDGES });
        }
      });
      continue;
    }

    const isDrawerPart = /^drawer/i.test(req.partType);

    // Expand per-drawer parts so each drawer prices at its own face height.
    if (isDrawerPart && numDrawers > 1 && req.quantity === numDrawers && drawerFaces.length === numDrawers) {
      const isFront = /front/i.test(req.partType);
      for (let i = 0; i < numDrawers; i++) {
        const faceH = drawerFaces[i];
        const boxH = drawerBoxHeightFromFace(faceH);
        const perVars = { ...vars, DrawerFrontHeight: faceH, DrawerHeight: boxH };
        pushPart(
          req,
          perVars,
          ` (D${i + 1})`,
          1,
          isFront ? cabinet.width : cabinet.depth,
          isFront ? faceH : boxH,
        );
      }
      continue;
    }

    if (isDrawerPart && numDrawers > 0 && drawerFaces.length === numDrawers) {
      const faceH = drawerFaces[0];
      const perVars = { ...vars, DrawerFrontHeight: faceH, DrawerHeight: drawerBoxHeightFromFace(faceH) };
      pushPart(req, perVars);
      continue;
    }

    pushPart(req, vars);
  }

  return parts;
}

function createEmptyBOM(cabinet: PlacedItem, name: string): CabinetBOM {
  return {
    cabinetId: cabinet.instanceId,
    cabinetNumber: cabinet.cabinetNumber ?? '',
    cabinetName: name,
    cabinetSku: '',
    dimensions: { width: cabinet.width, height: cabinet.height, depth: cabinet.depth },
    parts: [],
    sheets: [],
    edgeTape: [],
    hardware: [],
    subtotals: { materials: 0, edging: 0, hardware: 0, handling: 0, machining: 0, assembly: 0, labor: 0 },
    totalCost: 0,
    buildHours: { cut: 0, edge: 0, assembly: 0, total: 0, machineCost: 0, labourCost: 0, cost: 0 },
    warnings: [`${cabinet.cabinetNumber || name}: no part mapping for "${cabinet.definitionId}" — cabinet not priced`]
  };
}

const KICKABLE_ROLE = new Set([
  'doors', 'drawers', 'sink', 'cooktop', 'dishwasher', 'corner',
  'pantry', 'oven-tower', 'fridge-corner-pantry',
]);

function carriesKickFace(item: PlacedItem): boolean {
  // Replacement fronts go on cabinets already standing on their own kick - checked before any role test.
  if (isFacesOnlyProduct(item.definitionId ?? '')) return false;
  // Nor does a robe opening / sliding robe door: it is not a cabinet and is not priced here at all.
  if (isRobeDoorProduct(item.definitionId ?? '') || isRobeDoorProduct(item.productName ?? '')) return false;
  // Nor does a board one board thick: "oven panle" (W 600 x H 16) added 600 mm of kick to 10 Sands St.
  if (item.itemType === 'Cabinet' && boardThinAxis(item)) return false;
  if ((item.y ?? 0) > 1) return false;
  // Nor a unit the engine has already decided is STACKED on the one below it. A schedule carries no Z, so a stacked
  // "Base Open" 382 sits at y = 0 and the y test above cannot see it - quoteFromSchedule's stacked-unit rule marks it
  // by setting its own toeKickHeight to 0 (an explicit 0, never undefined). Without this it was billed a full width
  // of kick face and four legs on top of the cabinet it is standing on, while the quote's own warning said it was off
  // the floor. Ben, 21 Sep 2026.
  if (item.toeKickHeight === 0) return false;
  if (item.layoutRole === 'dishwasher') return true;
  if (item.itemType !== 'Cabinet') return false;
  if (item.layoutRole && KICKABLE_ROLE.has(item.layoutRole)) return true;
  // Final fallback for items with no layoutRole. Whitelisting ids that START
  // WITH base|tall|corner|sink|pie missed 'open_base' (starts with "open") and
  // every Microvellum product name ("Base Open", "Upper 3 Door"), so those
  // cabinets contributed no kick run. The y<=1 floor test above already did the
  // real work; here we only need to exclude wall units and non-carcass items.
  const id = item.definitionId ?? '';
  if (/^(wall|upper)|[_-](wall|upper)/i.test(id)) return false;
  if (/filler|panel|opening|kick|rail|splash|scribe|applied/i.test(id)) return false;
  // a floating shelf ("Mitered Shelf" 606 x 32 x 345, Coral Lodge) is fixed to a wall, not stood on a kick;
  // a floor-standing "Shelf Unit" is not caught
  if (/\b(mitt?e?red|mitred|floating|wall)\s+shel(f|ves)\b/i.test(id)) return false;
  return true;
}

function cutKickRun(runLengthMm: number, stockLengthMm: number): number[] {
  const cuts: number[] = [];
  let remaining = Math.max(0, Math.round(runLengthMm));
  while (remaining > 0) {
    const cut = Math.min(stockLengthMm, remaining);
    cuts.push(cut);
    remaining -= cut;
  }
  return cuts;
}

/** Build complete plinth runs rather than one takeoff line per cabinet. */
export function calculateKickboardRuns(
  items: PlacedItem[],
  globalDims: GlobalDimensions,
  stockLengthMm = 2400,
): KickboardAllocation[] {
  type Span = { start: number; end: number; rotation: number };
  const groups = new Map<string, Span[]>();

  for (const item of items.filter(carriesKickFace)) {
    const rotation = ((Math.round(item.rotation / 90) * 90) % 360 + 360) % 360;
    const alongX = rotation === 0 || rotation === 180;
    const centre = alongX ? item.x : item.z;
    const cross = alongX ? item.z : item.x;
    const start = centre - item.width / 2 - (item.fillerLeft ?? 0);
    const end = centre + item.width / 2 + (item.fillerRight ?? 0);
    const crossBand = Math.round(cross / 25) * 25;
    const key = `${rotation}:${crossBand}`;
    const spans = groups.get(key) ?? [];
    spans.push({ start, end, rotation });
    groups.set(key, spans);
  }

  const allocations: KickboardAllocation[] = [];
  let runNumber = 1;
  const pushRun = (rotation: number, runLengthMm: number) => {
    const roundedLength = Math.max(0, Math.round(runLengthMm));
    if (roundedLength === 0) return;
    allocations.push({
      runLabel: `Kick run ${runNumber++}`,
      rotation,
      runLengthMm: roundedLength,
      heightMm: globalDims.toeKickHeight || 135,
      stockLengthMm,
      cutLengthsMm: cutKickRun(roundedLength, stockLengthMm),
    });
  };

  for (const spans of groups.values()) {
    spans.sort((a, b) => a.start - b.start);
    // Older saved jobs and pricing fixtures can carry placeholder coordinates.
    // Preserve their known total width instead of collapsing overlapping items.
    const hasPlaceholderCollisions = spans.some((span, index) => index > 0
      && span.start < spans[index - 1].end - 5);
    if (hasPlaceholderCollisions) {
      pushRun(spans[0].rotation, spans.reduce((sum, span) => sum + span.end - span.start, 0));
      continue;
    }

    let mergedStart = spans[0]?.start;
    let mergedEnd = spans[0]?.end;
    const flush = () => {
      if (mergedStart !== undefined && mergedEnd !== undefined) {
        pushRun(spans[0].rotation, mergedEnd - mergedStart);
      }
    };
    for (const span of spans.slice(1)) {
      if (span.start <= (mergedEnd ?? span.start) + 5) {
        mergedEnd = Math.max(mergedEnd ?? span.end, span.end);
      } else {
        flush();
        mergedStart = span.start;
        mergedEnd = span.end;
      }
    }
    flush();
  }
  return allocations;
}

/**
 * Job-level warnings for parts that cannot be cut from their board (sheetOptimizer.partFitsSheet, recorded on each
 * cabinet's SheetAllocation.oversizeParts, less a flat board's kick-only overrun generateCabinetBOM drops and the
 * stand-in / estimated sizes calculateSheetRequirements never judges). ONE warning per sheet material. Each entry LEADS with the schedule
 * product and its W x H x D (identical products grouped, with their cabinet numbers), then the part(s) at BowerOS's
 * calculated size, and the warning says what to do. WARNING ONLY: the sheet count is still area / yield.
 *
 * Only cabinet parts reach this. Kick runs are job-level stock lengths added after, and schedule benchtops (blanks
 * and laminated tops) are nested by benchtopLaminate against their own sheet, so neither can trigger it.
 */
function oversizePartWarnings(cabinets: CabinetBOM[]): string[] {
  const mm = (n: number) => String(Math.round(n * 10) / 10);
  type PartGroup = { name: string; length: number; width: number; quantity: number };
  type ProductGroup = { name: string; size: string; numbers: string[]; units: number; parts: Map<string, PartGroup> };
  const byMaterial = new Map<string, {
    materialName: string; sheetLength: number; sheetWidth: number; assumed: boolean; faces: boolean;
    products: Map<string, ProductGroup>;
  }>();
  for (const cab of cabinets) {
    const d = cab.dimensions;
    const size = `${mm(d.width)} x ${mm(d.height)} x ${mm(d.depth)}`;
    for (const sh of cab.sheets) {
      if (!sh.oversizeParts?.length) continue;
      const mat = byMaterial.get(sh.materialId) ?? {
        materialName: sh.materialName, sheetLength: sh.sheetLength, sheetWidth: sh.sheetWidth,
        assumed: sh.oversizeParts[0].sheetSizeAssumed, faces: false, products: new Map<string, ProductGroup>(),
      };
      if (sh.oversizeParts.some((p) => p.unjoinableFace)) mat.faces = true;
      byMaterial.set(sh.materialId, mat);
      const productKey = `${cab.cabinetName}|${size}`;
      const product = mat.products.get(productKey)
        ?? { name: cab.cabinetName, size, numbers: [], units: 0, parts: new Map<string, PartGroup>() };
      mat.products.set(productKey, product);
      product.units += 1;
      if (cab.cabinetNumber) product.numbers.push(cab.cabinetNumber);
      for (const p of sh.oversizeParts) {
        const key = `${p.name}|${mm(p.length)}x${mm(p.width)}`;
        const g = product.parts.get(key) ?? { name: p.name, length: p.length, width: p.width, quantity: 0 };
        g.quantity += Math.max(1, p.quantity ?? 1);
        product.parts.set(key, g);
      }
    }
  }
  return [...byMaterial.values()].map((m) => {
    const sheetLong = Math.max(m.sheetLength, m.sheetWidth);
    const sheetShort = Math.min(m.sheetLength, m.sheetWidth);
    const products = [...m.products.values()];
    const entries = products.map((pr) => {
      const nums = pr.numbers.length > 3 ? `${pr.numbers.slice(0, 3).join(', ')} +${pr.numbers.length - 3} more` : pr.numbers.join(', ');
      const parts = [...pr.parts.values()].map((g) => `${g.quantity} x "${g.name}" ${mm(g.length)} x ${mm(g.width)}`);
      return `${pr.units} x "${pr.name}" ${pr.size}${nums ? ` (${nums})` : ''} - ${parts.join(', ')}`;
    });
    const many = products.length > 1 || products.some((pr) => pr.parts.size > 1 || pr.units > 1);
    return `Part too big for its board: ${m.materialName} is a ${sheetLong} x ${sheetShort} mm sheet`
      + `${m.assumed ? ' (no sheet size in the catalogue - the 2400 x 1200 default was assumed)' : ''}`
      + ` - ${sheetLong - SHEET_TRIM_MM} x ${sheetShort - SHEET_TRIM_MM} mm usable once ${SHEET_TRIM_MM} mm is trimmed off its length and width`
      + ` - and BowerOS's calculated size for ${many ? 'these parts' : 'this part'} will not fit on one sheet even turned 90 degrees`
      + ` (grain direction is not modelled, so rotation is allowed): ${entries.join('; ')}.`
      + (m.faces
        ? ` A DOOR or DRAWER FRONT is never split: a front cannot be butt-joined across its face and sold as a front`
          + ` (the same reason an over-long robe leaf is a hard stop). The board is still priced by area as if`
          + ` ${many ? 'they fit' : 'it fits'}, but the job NEEDS a longer sheet in the same decor (e.g. 3600 x 1800)`
          + ` - or the front has to be split into two stacked fronts, which is a design change, not a join.`
        : ` ${many ? 'They' : 'It'} could NOT be split into pieces that fit, so the board is still priced by area as if`
          + ` ${many ? 'they fit' : 'it fits'}. Price a longer sheet (e.g. 3600 x 1800), or correct the product size if it is wrong.`);
  });
}

function stockPiecesForKickCuts(allocations: KickboardAllocation[]): number {
  const stockLength = allocations[0]?.stockLengthMm ?? 2400;
  const remaining: number[] = [];
  const cuts = allocations.flatMap(allocation => allocation.cutLengthsMm).sort((a, b) => b - a);
  for (const cut of cuts) {
    const bin = remaining.findIndex(space => space >= cut);
    if (bin >= 0) remaining[bin] -= cut;
    else remaining.push(stockLength - cut);
  }
  return remaining.length;
}

/**
 * Generate complete quote BOM for all cabinets
 */
export function generateQuoteBOM(
  items: PlacedItem[],
  globalDims: GlobalDimensions,
  hardwareOptions: HardwareOptions,
  pricingData: PricingData,
  commercial: CommercialOptions = {},
  pricingSelection: BenchtopPricingSelection = {},
): QuoteBOM {
  const cabinets = items
    .filter(i => i.itemType === 'Cabinet')
    .map(cab => generateCabinetBOM(cab, globalDims, hardwareOptions, pricingData, cab.productName));
  const jobLevelWarnings: string[] = [];

  // hardware_pricing rows imported from Microvellum carry their own machining_cost / assembly_cost (a hinge
  // bored and fitted, a runner fitted). The workshop model's Vertical drilling and Hardware assembly stations
  // time that same work, so with the process model on, both billed it - Ben: "hardware is charged twice".
  // The stations supersede the per-item figures exactly as they supersede parts_pricing's below; the supplied
  // item keeps its unit cost x quantity. supplyMode 'none' (the regression fallback) keeps them.
  // Machining (hinge cup boring) is timed by Vertical drilling in every supply mode; fitting only by Hardware
  // assembly, which runs only when the shop assembles - a flat-pack job keeps the catalogue fitting figure.
  const supplyMode = commercial.supplyMode ?? 'assembled_installed';
  if (supplyMode !== 'none') {
    const shopFitsHardware = supplyMode === 'assembled' || supplyMode === 'assembled_installed';
    for (const cab of cabinets) {
      for (const h of cab.hardware) {
        const machining = h.machiningCost ?? 0;
        const fitting = shopFitsHardware ? (h.assemblyCost ?? 0) : 0;
        const labour = machining + fitting;
        if (labour === 0) continue;
        h.totalCost -= labour;
        h.machiningCost = 0;
        if (shopFitsHardware) h.assemblyCost = 0;
        cab.subtotals.hardware -= labour;
        cab.totalCost -= labour;
      }
    }
  }

  // Explicit kick products beat inferred runs: when the schedule already lists
  // its kicks (as a Microvellum export does), pricing the geometry-derived runs
  // as well would charge the same board twice.
  const hasExplicitKicks = items.some(
    (i) => i.itemType === 'Cabinet' && /kick/i.test(i.definitionId ?? '') &&
           !/ladder/i.test(i.definitionId ?? ''),
  );

  // Adjustable legs only go under a cabinet that stands on the floor on its own legs. calculateHardware gave 4 to
  // every carcase, so wall cabinets and floating shelves were billed legs (and the minutes to fit them), and on a
  // job that stands on Toe Kick Base ladder bases - every Microvellum kitchen at Bower - no cabinet has legs at all
  // (Erin & Matt was billed 84). carriesKickFace is the same floor test that builds the kick runs. Only a ladder
  // BASE means no legs: a planner 'base_kick' / 'return_kick' is a kick board clipped to legs.
  // Ben, 21 Sep 2026: "if there is adjusble leg price four legs per cabinet". FOUR is the count, always - not a
  // number computed from the cabinet's width - and it is stated on the line (CabinetBOM.legs) rather than buried in
  // the hardware subtotal.
  // Hoisted out of the leg block: the kick FACE charge needs the same test. A job standing on ladder bases has no
  // legs AND no separate leg kick face - the ladder cuts its own Finished Front.
  const standsOnLadderBases = items.some(
    i => i.itemType === 'Cabinet' && TOE_KICK_BASE_RE.test(`${i.definitionId ?? ''} ${i.productName ?? ''}`),
  );
  const legCabinets: CabinetBOM[] = [];
  {
    const cabinetItems = items.filter(i => i.itemType === 'Cabinet');
    cabinets.forEach((cab, idx) => {
      const item = cabinetItems[idx];
      const legs = cab.hardware.filter(h => h.hardwareType === 'leg');
      if (item && !standsOnLadderBases && carriesKickFace(item)) {
        if (legs.length) {
          const quantity = legs.reduce((s, h) => s + (h.quantity ?? 0), 0);
          legCabinets.push(cab);
          cab.legs = {
            perCabinet: quantity,
            quantity,
            unitCost: legs[0].unitCost,
            cost: legs.reduce((s, h) => s + h.totalCost, 0),
            itemCode: legs[0].itemCode,
            name: legs[0].name,
          };
        }
        return;
      }
      if (!legs.length) return;
      const cost = legs.reduce((s, h) => s + h.totalCost, 0);
      cab.hardware = cab.hardware.filter(h => h.hardwareType !== 'leg');
      cab.subtotals.hardware -= cost;
      cab.totalCost -= cost;
    });
    if (legCabinets.length) {
      const per = legCabinets[0].legs!.perCabinet;
      const total = legCabinets.reduce((s, c) => s + (c.legs?.quantity ?? 0), 0);
      jobLevelWarnings.push(
        `Adjustable legs: ${per} per cabinet on ${legCabinets.length} floor cabinet${legCabinets.length === 1 ? '' : 's'}`
        + ` = ${total} x ${legCabinets[0].legs!.name} at $${legCabinets[0].legs!.unitCost.toFixed(2)} each`
        + ` (Ben, 21 Sep 2026: four legs a cabinet). Wall units and floating shelves carry none;`
        + ` a job on Toe Kick Base ladder bases carries none at all.`,
      );
    }
  }

  const consolidatedSheets = consolidateSheetRequirements(cabinets.map(c => c.sheets));
  const consolidatedEdgeTape = consolidateEdgeTape(cabinets.map(c => c.edgeTape));
  const consolidatedHardware = consolidateHardware(cabinets.map(c => c.hardware));
  jobLevelWarnings.push(...oversizePartWarnings(cabinets));
  // One line for every ladder kick on the job: what it is cut from, how big the face is, and whether the face is
  // priced at all. Ben, 21 Sep 2026: "if ladder kick buikld a cut list and price the kicks as ply with the selected
  // lamnate face".
  {
    const ladders = cabinets.filter((c) => c.ladderKick);
    if (ladders.length) {
      const faceSqmOf = (c: CabinetBOM) =>
        (c.ladderKick?.cutList ?? []).filter((x) => x.material === 'facing')
          .reduce((s, x) => s + (x.length * x.width * x.quantity) / 1e6, 0);
      const plySqm = ladders.reduce((s, c) => s + (c.ladderKick?.plySqm ?? 0), 0);
      const partCount = ladders.reduce((s, c) => s + (c.ladderKick?.cutList.length ?? 0), 0);
      const faced = ladders.filter((c) => c.ladderKick?.facing);
      const bare = ladders.filter((c) => !c.ladderKick?.facing);
      const facedSqm = faced.reduce((s, c) => s + (c.ladderKick?.facing?.areaSqm ?? 0), 0);
      const bareSqm = bare.reduce((s, c) => s + faceSqmOf(c), 0);
      const faceCost = faced.reduce((s, c) => s + (c.ladderKick?.facing?.cost ?? 0), 0);
      jobLevelWarnings.push(
        `Ladder kicks: ${ladders.length} Toe Kick Base priced as a ply ladder cut list (${partCount} parts,`
        + ` ${plySqm.toFixed(3)} m2 of ${ladders[0].ladderKick!.plyMaterialName} bought as WHOLE boards).`
        + (faced.length
          ? ` Face: ${facedSqm.toFixed(3)} m2 of ${faced[0].ladderKick!.facing!.materialName} charged by the AREA USED`
            + ` + ${Math.round(KICK_FACING_WASTE * 100)}% waste = $${faceCost.toFixed(2)} - never a whole sheet (Ben, 16 Sep 2026).`
          : '')
        + (bare.length
          ? ` ${bare.length} kick${bare.length === 1 ? ' is' : 's are'} priced as BARE PLY with no facing laminate`
            + ` - ${bareSqm.toFixed(3)} m2 of face is NOT charged.`
          : '')
        + ` The cut list is the SQUARE ladder for each kick's W x H x D. A NOTCHED kick is not visible in a schedule`
        + ` row at all (Forest Glen's 1226 cuts a Notched Sleeper and a Notched Sub Back round a short arm), and an`
        + ` angled one is only visible in its name - check those against the work order.`,
      );
    }
  }
  // `let`, because the kick FACE block below recomputes the runs at the stock length it actually charges: the
  // 2400 mm default here is not the 3600 mm length of either kickboard product Bower buys.
  let kickboards = hardwareOptions.adjustableLegs === false || hasExplicitKicks
    ? []
    : calculateKickboardRuns(items, globalDims);

  // -- P5 Reconciliation -------------------------------------------------------
  // Redistribute the consolidated sheet cost back to each cabinet as an
  // area-share so per-cabinet material lines reflect bulk-yield savings.
  // Rate = consolidatedCost / consolidatedPartArea ($/m2 of actual part area).
  // Only cabinet-sourced sheets are considered here; inferred kick panels (added
  // below) are a job-level sheet whose cost is spread onto the kick cabinets there.
  {
    const reconciledRates = new Map<string, number>();
    for (const cs of consolidatedSheets) {
      if (cs.totalPartArea > 0) {
        reconciledRates.set(cs.materialId, cs.totalMaterialCost / cs.totalPartArea);
      }
    }
    for (const cab of cabinets) {
      // A ladder kick's FACE is not a sheet and never was (it is charged by area + waste), so it survives the
      // redistribution instead of being wiped by it.
      let reconciledMaterials = cab.ladderKick?.facing?.cost ?? 0;
      for (const sh of cab.sheets) {
        const rate = reconciledRates.get(sh.materialId) ?? (sh.areaCostPerSqm ?? 0);
        const reconciledCost = sh.totalPartArea * rate;
        reconciledMaterials += reconciledCost;
        sh.totalMaterialCost = reconciledCost;
      }
      const delta = reconciledMaterials - cab.subtotals.materials;
      cab.subtotals.materials = reconciledMaterials;
      cab.totalCost += delta;
    }
  }

  // Edge tape the same way. The consolidated line buys whole lengths (EDGE_ROLL_LENGTH_M), so its cost is
  // spread back over the metres each cabinet actually edges. Without this the quote lines charged only the
  // metres used while the ordering list and the cost total charged the whole length.
  {
    const consolidatedByType = new Map(consolidatedEdgeTape.map(e => [e.edgeType, e]));
    for (const cab of cabinets) {
      let reconciledEdging = 0;
      for (const e of cab.edgeTape) {
        const job = consolidatedByType.get(e.edgeType);
        const share = job && job.linearMeters > 0 ? job.totalCost * (e.linearMeters / job.linearMeters) : e.totalCost;
        e.totalCost = share;
        reconciledEdging += share;
      }
      cab.totalCost += reconciledEdging - cab.subtotals.edging;
      cab.subtotals.edging = reconciledEdging;
    }
  }

  // -- Kick facing laminate (ladder kicks) -------------------------------------
  // The FACE of a Toe Kick Base is the one material in the engine that is deliberately NOT bought as whole sheets:
  // it is charged by the area used plus waste (Ben, 16 Sep 2026 - "kick it does not have to use the full board
  // rule"). It reaches the job cost as an AREA row here, and `sheetsRequired: 0` says out loud that no sheet was
  // bought for it. The per-cabinet share is already on each kick's own line (generateCabinetBOM).
  {
    const byMaterial = new Map<string, { name: string; itemCode?: string | null; rate: number; areaSqm: number; chargedSqm: number; cost: number; sheetLength: number; sheetWidth: number }>();
    for (const cab of cabinets) {
      const f = cab.ladderKick?.facing;
      if (!f) continue;
      const mat = pricingData.materials.find((m) => m.id === f.materialId);
      const hit = byMaterial.get(f.materialId) ?? {
        name: f.materialName, itemCode: f.itemCode, rate: f.areaCost, areaSqm: 0, chargedSqm: 0, cost: 0,
        sheetLength: Number(mat?.sheet_length ?? 0), sheetWidth: Number(mat?.sheet_width ?? 0),
      };
      hit.areaSqm += f.areaSqm;
      hit.chargedSqm += f.chargedSqm;
      hit.cost += f.cost;
      byMaterial.set(f.materialId, hit);
    }
    for (const [materialId, f] of byMaterial) {
      consolidatedSheets.push({
        materialId,
        materialName: `${f.name} (Kick facing - by area used + ${Math.round(KICK_FACING_WASTE * 100)}% waste, NOT whole sheets)`,
        materialRole: 'exterior' as const,
        sheetWidth: f.sheetWidth,
        sheetLength: f.sheetLength,
        sheetArea: f.chargedSqm,
        // no whole sheet is bought for a kick facing - this is the flag that says so
        sheetsRequired: 0,
        totalPartArea: r3(f.areaSqm),
        wasteArea: r3(f.chargedSqm - f.areaSqm),
        yieldFactor: 1 / (1 + KICK_FACING_WASTE),
        chargeableArea: r3(f.chargedSqm),
        areaCostPerSqm: f.rate,
        totalMaterialCost: roundMoney(f.cost),
      });
    }
  }

  // -- Kick FACE board under adjustable legs ------------------------------------
  // Ben, 21 Sep 2026: "if there is adjusble leg price four legs per cabinet then a lm of face board". A job on legs
  // has no kick product of its own, so the kick face is charged BY THE LINEAL METRE of each cabinet's OWN face - its
  // width plus the fillers it carries, plus its depth for every end that returns, plus any appliance opening the kick
  // runs straight through beside it - in THAT cabinet's selected kick face material.
  //
  // Four things this block got wrong when it was first written, all corrected 21 Sep 2026:
  //  1. It fired even when the job already listed its kicks. The block it replaced inherited that gate through
  //     `kickboards` (forced to [] when hasExplicitKicks), so a planner base_kick row or a Microvellum "Toe Kick Base"
  //     ladder was billed its face twice - once in the kick's own line, once here - and on a ladder job the engine had
  //     already deleted every leg. Gated again on !hasExplicitKicks && !standsOnLadderBases.
  //  2. It charged the bare FRACTION of a board: 0.900 lm of a 3600 x 150 kickboard strip at $16.51/lm = $14.86, when
  //     the smallest thing Bower can buy is the whole $59.45 strip, and it never rounded up however small the job.
  //     The metres are still what the LINE says, but the JOB now buys whole STOCK LENGTHS of the board it cuts them
  //     from - Bower's standing rule, and what the block before this one did - and that cost is spread back over the
  //     cabinets by their metres.
  //  3. It read the face material from cabinetItems[0], the first cabinet of ANY kind, so listing a wall unit first
  //     priced the whole job's kick on carcase melamine and printed "no kickFacingMaterialId sent" although a row had
  //     sent one. The material is a per-row selection and is resolved per cabinet.
  //  4. It counted cabinet widths only, so the 600 mm of kick board across a dishwasher opening - bought, cut and
  //     fitted, and counted by calculateKickboardRuns - was free.
  const kickFaceCabinets: CabinetBOM[] = [];
  if (hardwareOptions.adjustableLegs !== false && !hasExplicitKicks && !standsOnLadderBases) {
    const kickHeightMm = globalDims.toeKickHeight || 135;
    const cabinetItems = items.filter(i => i.itemType === 'Cabinet');
    const onKick = cabinetItems
      .map((item, idx) => ({ item, cab: cabinets[idx] }))
      .filter(({ item, cab }) => item && cab && carriesKickFace(item) && cab.parts.length > 0);
    /** mm of kick face a span shows the room: its own width plus the fillers on either side of it. */
    const spanOf = (i: PlacedItem) => Math.max(0, i.width + (i.fillerLeft ?? 0) + (i.fillerRight ?? 0));
    const endsOf = (i: PlacedItem) => Math.min(2, Math.max(0, Math.round(i.kickExposedEnds ?? 0)));

    // The kick runs STRAIGHT THROUGH an appliance opening. carriesKickFace says so (it returns true for a dishwasher
    // before its itemType test) and calculateKickboardRuns counts it in the run, but the charge was built from the
    // cabinet list, so a 600 mm dishwasher gap was bought and cut and never billed. Each such span goes on the
    // nearest cabinet on the same wall - the board really is one piece with it.
    const axisOf = (i: PlacedItem) => {
      const rot = ((Math.round((i.rotation ?? 0) / 90) * 90) % 360 + 360) % 360;
      return { rot, centre: rot === 0 || rot === 180 ? i.x : i.z };
    };
    const adjacentMm = new Map<CabinetBOM, number>();
    if (onKick.length) {
      for (const gap of items.filter(i => i.itemType !== 'Cabinet' && carriesKickFace(i))) {
        const g = axisOf(gap);
        const nearest = onKick
          .map(x => ({ x, a: axisOf(x.item) }))
          .sort((p, q) => (Number(q.a.rot === g.rot) - Number(p.a.rot === g.rot))
            || (Math.abs(p.a.centre - g.centre) - Math.abs(q.a.centre - g.centre)))[0];
        adjacentMm.set(nearest.x.cab, (adjacentMm.get(nearest.x.cab) ?? 0) + spanOf(gap));
      }
    }
    const metresOf = (x: { item: PlacedItem; cab: CabinetBOM }) =>
      (spanOf(x.item) + x.item.depth * endsOf(x.item) + (adjacentMm.get(x.cab) ?? 0)) / 1000;
    const totalMetres = onKick.reduce((s, x) => s + metresOf(x), 0);

    if (totalMetres > 0) {
      // kickFacingMaterialId is documented per ROW (ScheduleItem / PlacedItem), with the job-level selection only as
      // the default when a row carries none - so it is resolved per cabinet, never once for the job.
      const firstAsked = onKick.find(({ item }) => item.kickFacingMaterialId)?.item.kickFacingMaterialId;
      const unresolved = new Set<string>();
      const faceMaterialFor = (item: PlacedItem): MaterialPricingRecord | undefined => {
        const asked = item.kickFacingMaterialId ?? firstAsked;
        const askedMat = asked
          ? pricingData.materials.find(m => m.id === asked || m.item_code === asked)
            ?? pricingData.materials.find(m => m.id === resolveMaterialId(asked, pricingData.materials))
          : undefined;
        if (asked && !askedMat) unresolved.add(asked);
        return askedMat
          ?? pricingData.materials.find(m => m.id === resolveMaterialId(item.carcaseMaterialId, pricingData.materials))
          ?? pricingData.materials.find(m => (m.area_cost ?? 0) > 0)
          ?? pricingData.materials[0];
      };

      type FaceGroup = { mat: MaterialPricingRecord; rows: Array<{ item: PlacedItem; cab: CabinetBOM; metresLm: number }> };
      const groups = new Map<string, FaceGroup>();
      for (const x of onKick) {
        const metresLm = metresOf(x);
        if (metresLm <= 0) continue;
        const mat = faceMaterialFor(x.item);
        if (!mat) continue;
        const group = groups.get(mat.id) ?? { mat, rows: [] };
        group.rows.push({ item: x.item, cab: x.cab, metresLm });
        groups.set(mat.id, group);
      }
      for (const id of unresolved) {
        jobLevelWarnings.push(
          `Kick face board "${id}" is not a material_pricing id or item_code - the cabinets that asked for it are`
          + ` priced on their own carcase board instead.`,
        );
      }
      if (!firstAsked) {
        jobLevelWarnings.push(
          `No kickFacingMaterialId sent for a job on adjustable legs - ${totalMetres.toFixed(3)} lm of kick face is`
          + ` priced on each cabinet's own carcase board. Send the kick board Bower buys (a pre-faced panel such as`
          + ` POLY10679 Brushed Stainless Kickboard 3600 x 1200, or the 3600 x 150 strip POLY12745), or the laminate`
          + ` if the kick is faced in the shop.`,
        );
      }

      let orderStockMm = 0;
      for (const group of groups.values()) {
        const rate = group.mat.area_cost ?? 0;
        const sheetL = Number(group.mat.sheet_length ?? 0);
        const sheetW = Number(group.mat.sheet_width ?? 0);
        const longMm = Math.max(sheetL, sheetW) > 0 ? Math.max(sheetL, sheetW) : 2400;
        const shortMm = Math.min(sheetL, sheetW) > 0 ? Math.min(sheetL, sheetW) : 1200;
        // A stock board narrower than twice the kick height is a kickboard STRIP: the whole strip is bought even when
        // the kick is shorter than it. A wide panel is ripped to the kick height and only that height is charged.
        const isStrip = shortMm < 2 * kickHeightMm;
        const chargedWidthMm = isStrip ? shortMm : kickHeightMm;
        const ratePerM = (chargedWidthMm / 1000) * rate;
        const groupMetres = group.rows.reduce((s, r) => s + r.metresLm, 0);
        // WHOLE STOCK LENGTHS, as bought. The metres are what each cabinet's LINE says; the job buys whole lengths of
        // the board it cuts them from, at the length that board actually comes in - the note and the charge used to
        // disagree, because calculateKickboardRuns' 2400 mm default is not the 3600 mm of either kickboard product.
        // A whole SHEET is deliberately not the unit here: one 900 mm cabinet would carry a $427 sheet of POLY10679
        // for 0.12 m2 of kick. A rip off the sheet is what the shop buys and what the old code charged.
        const metresPerPiece = longMm / 1000;
        const piecesBought = Math.max(1, Math.ceil(groupMetres / metresPerPiece - 1e-9));
        const pieceAreaSqm = metresPerPiece * (chargedWidthMm / 1000);
        const boughtSqm = piecesBought * pieceAreaSqm;
        const usedSqm = groupMetres * (chargedWidthMm / 1000);
        const jobCost = roundMoney(boughtSqm * rate);
        orderStockMm = Math.max(orderStockMm, longMm);

        // Spread the whole-stock cost over the cabinets by their metres; the last row carries the rounding remainder
        // so the lines always add up to what the job bought.
        let spent = 0;
        group.rows.forEach((r, i) => {
          const cost = i === group.rows.length - 1
            ? roundMoney(jobCost - spent)
            : roundMoney((jobCost * r.metresLm) / groupMetres);
          spent = roundMoney(spent + cost);
          const adjacent = Math.round(adjacentMm.get(r.cab) ?? 0);
          r.cab.kickFace = {
            metresLm: r3(r.metresLm),
            exposedEnds: endsOf(r.item),
            ...(adjacent > 0 ? { adjacentSpanMm: adjacent } : {}),
            chargedWidthMm,
            materialId: group.mat.id,
            materialName: group.mat.name,
            ratePerM: roundMoney(ratePerM),
            cost,
          };
          r.cab.subtotals.materials += cost;
          r.cab.totalCost += cost;
          kickFaceCabinets.push(r.cab);
        });

        consolidatedSheets.push({
          materialId: group.mat.id,
          materialName: `${group.mat.name} (Kick face board - ${groupMetres.toFixed(3)} lm at ${chargedWidthMm} mm high,`
            + ` bought whole as ${piecesBought} x ${longMm} mm stock length${piecesBought === 1 ? '' : 's'})`,
          materialRole: 'exterior' as const,
          sheetWidth: chargedWidthMm,
          sheetLength: longMm,
          sheetArea: r3(pieceAreaSqm),
          sheetsRequired: piecesBought,
          totalPartArea: r3(usedSqm),
          wasteArea: r3(Math.max(0, boughtSqm - usedSqm)),
          yieldFactor: 1,
          chargeableArea: r3(boughtSqm),
          areaCostPerSqm: rate,
          totalMaterialCost: jobCost,
        });
      }

      // The merged runs say what to ORDER and how to cut it. They are recomputed at the stock length actually
      // charged: the note used to quote calculateKickboardRuns' 2400 mm default beside a 3600 mm kickboard charge.
      if (orderStockMm > 0) {
        kickboards = calculateKickboardRuns(items, globalDims, orderStockMm);
        if (kickboards.length) {
          jobLevelWarnings.push(
            `Kick face ordering: ${totalMetres.toFixed(3)} lm charged across ${kickFaceCabinets.length} cabinet`
            + `${kickFaceCabinets.length === 1 ? '' : 's'} comes off ${stockPiecesForKickCuts(kickboards)} x`
            + ` ${orderStockMm} mm stock length(s) in ${kickboards.length} run(s). The metres are what each cabinet's`
            + ` line says; the whole stock is what the job is charged and what is ordered.`,
          );
        }
      }
    }
  }

  // -- Benchtops --------------------------------------------------------------
  // Group base/corner/sink/pie cabs by wall (rotation) and price by material.
  const benchtops = calculateBenchtops(items, globalDims, pricingData, pricingSelection);
  const benchtopSupply = benchtops.reduce((s, b) => s + b.supplyCost, 0);
  const benchtopInstall = benchtops.reduce((s, b) => s + b.installCost, 0);
  const benchtopTotal = benchtopSupply + benchtopInstall;

  // -- Appliances (Stage 1, additive) ----------------------------------------
  // Purely additive: when no items are opted in, applianceItems is [] and the
  // total is 0 -- byte-identical with pre-Stage-1 outputs.
  const applianceResult = buildApplianceLineItems(items, pricingData, commercial);
  const applianceItems = applianceResult.items;
  const appliancesTotal = applianceItems.reduce((s, a) => s + a.lineTotal, 0);
  const hasPlaceholderAppliancePrices = applianceItems.some(a => a.isPlaceholderPrice);

  // Category cost totals (cost = ex commercial, ex GST).
  const matTotal = consolidatedSheets.reduce((s, sh) => s + sh.totalMaterialCost, 0);
  const edgeTotal = consolidatedEdgeTape.reduce((s, e) => s + e.totalCost, 0);
  const hwTotal = consolidatedHardware.reduce((s, h) => s + h.totalCost, 0);
  const regressionLaborTotal = cabinets.reduce((s, c) => s + c.subtotals.labor, 0);

  // -- Workshop model ---------------------------------------------------------
  // Shop labour comes from the process model — minutes per part, per metre and
  // per product, each at its station's hourly rate — not from the flat
  // per-cabinet regression in laborCalculator. The regression cannot express
  // what a cabinet actually is: it charged the same base whether the box had
  // one door or six drawers, and it could not drop the assembly stations for a
  // flat-pack job. It survives only as the fallback when a caller explicitly
  // opts out with supplyMode: 'none'.
  //
  // The process cost is pushed back onto each cabinet pro-rata so per-cabinet
  // lines still add up to the job total.
  let laborTotal = regressionLaborTotal;
  let workshop: WorkshopCost | null = null;
  if (supplyMode !== 'none') {
    const benchtopLm = benchtops.reduce((s, b) => s + (b.runLengthMm ?? 0), 0) / 1000;
    // edgeCalculator already bills tape application via
    // edge_pricing.application_cost; don't charge the Edgebanding station too.
    const edgeApplicationAlreadyPriced = consolidatedEdgeTape.some(
      (e) => (e.applicationCost ?? 0) > 0,
    );
    workshop = calculateWorkshopCost(cabinets, {
      mode: supplyMode,
      rates: commercial.workshopRates,
      benchtopLm,
      edgeApplicationAlreadyPriced,
      extraParts: kickboards.length,
      extraCutLengthM: kickboards.reduce((s, k) => s + (k.runLengthMm ?? 0), 0) / 1000,
      extraInstallProducts: kickboards.length
        + benchtops.reduce((s, b) => s + (b.sheetsRequired ?? 1), 0),
      // kick runs are boards: carried, not loaded like a cabinet, and not box-assembled
      extraLooseItems: kickboards.length,
      jobMinimums: commercial.jobMinimums ?? false,
      // Only a thin facing LAMINATE is bonded in the shop; a pre-faced kickboard panel is bought finished.
      kickFacingSqm: cabinets.reduce((s, c) => s + (c.ladderKick?.facing?.bonded ? c.ladderKick.facing.areaSqm : 0), 0),
    });
    laborTotal = workshop.shopCost;
    // parts_pricing handling / machining / assembly cover the SAME work as the
    // Part handling, Panel cutting, Vertical drilling and Shop part assembly
    // stations, so charging both bills it twice. The stations supersede them: a
    // fixed per-part charge cannot express supply mode, whereas the stations
    // drop out correctly for flat pack.
    for (const cab of cabinets) {
      const superseded =
        cab.subtotals.handling + cab.subtotals.machining + cab.subtotals.assembly;
      cab.totalCost -= superseded;
      cab.subtotals.handling = 0;
      cab.subtotals.machining = 0;
      cab.subtotals.assembly = 0;
    }
    // Spread the job's shop cost across cabinets by what actually drives shop
    // time — parts to cut, edge and assemble, and hardware to fit — rather than
    // by the regression figure it just replaced. Weighting by the regression
    // would put its distortion straight back into the per-cabinet lines: a
    // pelmet would still carry a full cabinet's share of the shop.
    const workWeight = (cab: CabinetBOM) =>
      cab.parts.reduce((s, p) => s + Math.max(1, p.quantity ?? 1), 0)
      + cab.hardware.reduce((s, h) => s + Math.max(0, h.quantity ?? 0), 0);
    const totalWeight = cabinets.reduce((s, c) => s + workWeight(c), 0);
    if (totalWeight > 0) {
      for (const cab of cabinets) {
        const next = workshop.shopCost * (workWeight(cab) / totalWeight);
        cab.totalCost += next - cab.subtotals.labor;
        cab.subtotals.labor = next;
      }
    }
  }

  const handlingTotal = cabinets.reduce((s, c) => s + c.subtotals.handling, 0);
  const machiningTotal = cabinets.reduce((s, c) => s + c.subtotals.machining, 0);
  const assemblyTotal = cabinets.reduce((s, c) => s + c.subtotals.assembly, 0);

  // Cost -> commercial layers -> sell price. Defaults are pass-through.
  // The complete category sum is the cost authority. Cabinet totals do not
  // contain job-level kick sheets, so summing cabinets previously omitted kick
  // board from the quote while still charging it in the ordering list.
  const cost = matTotal + edgeTotal + hwTotal + handlingTotal + machiningTotal
    + assemblyTotal + laborTotal + benchtopTotal + appliancesTotal;
  const marginPct = commercial.marginPct ?? 0;
  const designFeePct = commercial.designFeePct ?? 0;
  // -- Delivery ---------------------------------------------------------------
  // Banded by road distance from the workshop, scaled by vehicle loads.
  // Falls back to deliveryFlat when no distance is supplied.
  const packedVolumeCuM = items
    .filter((i) => i.itemType === 'Cabinet')
    .reduce((s, i) => s + (i.width * i.depth * i.height) / 1e9, 0);
  const deliveryQuote = commercial.siteDistanceKm != null
    ? calculateDelivery({
        distanceKm: commercial.siteDistanceKm,
        volumeCuM: packedVolumeCuM,
        bands: commercial.deliveryBands,
      })
    : null;
  const deliveryFlat = deliveryQuote ? deliveryQuote.total : (commercial.deliveryFlat ?? 0);
  const installFlat = workshop ? workshop.installCost : (commercial.installFlat ?? 0);
  const clientMarkupPct = commercial.clientMarkupPct ?? 0;
  const gstPct = commercial.gstPct ?? 0.1;
  const cm = commercial.categoryMarkups;

  const margin = cost * marginPct;
  const designFee = (cost + margin) * designFeePct;
  const afterDelivery = cost + margin + designFee + deliveryFlat + installFlat;
  // Per-category markup (client_markup_settings) takes precedence when supplied.
  const clientMarkup = cm
    ? matTotal * (cm.material ?? 0)
      + edgeTotal * (cm.edge ?? 0)
      + hwTotal * (cm.hardware ?? 0)
      + (handlingTotal + machiningTotal + assemblyTotal) * (cm.parts ?? 0)
      + laborTotal * (cm.labor ?? 0)
      + deliveryFlat * (cm.delivery ?? 0)
      + benchtopTotal * (cm.stone ?? 0)
    : afterDelivery * clientMarkupPct;
  const subtotalExGst = roundMoney(afterDelivery + clientMarkup);
  const gst = roundMoney(subtotalExGst * gstPct);
  const total = roundMoney(subtotalExGst + gst);

  // WS2 guard: roll up deduped pricing-trust warnings for the whole quote.
  const warnings = Array.from(new Set([
    ...cabinets.flatMap(c => c.warnings ?? []),
    ...jobLevelWarnings,
    ...benchtops.flatMap(benchtop => benchtop.warnings ?? []),
    ...applianceResult.warnings,
    ...consolidatedSheets
      .filter(s => s.unresolved)
      .map(s => `Material "${s.materialId}" has no priced match — board line priced at $0`),
    ...(hasPlaceholderAppliancePrices ? ['Appliance prices to be confirmed'] : []),
  ]));

  return {
    warnings,
    cabinets,
    consolidatedSheets,
    consolidatedEdgeTape,
    consolidatedHardware,
    benchtops,
    kickboards,
    applianceItems,
    // Both are declared on QuoteBOM but were never actually returned, so a
    // quote could never show or store the working behind its labour, install
    // and delivery figures — only the single rolled-up number.
    workshop,
    delivery: deliveryQuote,
    grandTotal: {
      materials: matTotal,
      edging: edgeTotal,
      hardware: hwTotal,
      handling: handlingTotal,
      machining: machiningTotal,
      assembly: assemblyTotal,
      labor: laborTotal,
      benchtopSupply,
      benchtopInstall,
      benchtop: benchtopTotal,
      appliances: appliancesTotal,
      hasPlaceholderAppliancePrices,
      cost,
      margin,
      designFee,
      delivery: deliveryFlat,
      install: installFlat,
      clientMarkup,
      subtotalExGst,
      gst,
      total
    },
    buildHours: {
      cut: cabinets.reduce((s, c) => s + c.buildHours.cut, 0),
      edge: cabinets.reduce((s, c) => s + c.buildHours.edge, 0),
      assembly: cabinets.reduce((s, c) => s + c.buildHours.assembly, 0),
      total: cabinets.reduce((s, c) => s + c.buildHours.total, 0),
      cost: cabinets.reduce((s, c) => s + c.buildHours.cost, 0)
    }
  };
}

/**
 * Stage 1 — collect appliance line items from items placed via the catalog.
 * Groups identical productIds into a single quantity>1 row. Ignores items
 * that opt out (`supplyWithOrder === false`) or that have no price.
 */
function buildApplianceLineItems(
  items: PlacedItem[],
  pricingData: PricingData,
  commercial: CommercialOptions,
): { items: ApplianceLineItem[]; warnings: string[] } {
  const applianceMargin = 1 + (commercial.applianceMarginPct ?? 0);
  const byProduct = new Map<string, ApplianceLineItem>();
  const warnings: string[] = [];
  for (const item of items) {
    if (!item.applianceProductId) continue;
    if (item.supplyWithOrder === false) continue;
    const snapshot = item.applianceSnapshot;
    const dbRow = pricingData.appliances?.find(a => a.id === item.applianceProductId);
    // Snapshot wins for stability. Fall back to live catalog row.
    const name = snapshot?.name ?? dbRow?.name;
    if (!name) {
      warnings.push(`Appliance "${item.applianceProductId}" was selected but is missing from the catalogue — not priced`);
      continue;
    }
    const unitPriceRaw = snapshot?.unitPrice
      ?? dbRow?.installed_price ?? dbRow?.sell_price ?? dbRow?.rrp ?? 0;
    if (unitPriceRaw <= 0) {
      warnings.push(`Appliance "${name}" has no positive catalogue price — not included in the quote`);
      continue;
    }
    const unitPrice = roundMoney(unitPriceRaw * applianceMargin);
    const isPlaceholder = snapshot?.isPlaceholderPrice ?? dbRow?.price_is_placeholder ?? true;
    const key = item.applianceProductId;
    const existing = byProduct.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.lineTotal = roundMoney(existing.quantity * existing.unitPrice);
    } else {
      byProduct.set(key, {
        productId: item.applianceProductId,
        itemCode: snapshot?.itemCode ?? dbRow?.item_code ?? null,
        name,
        category: snapshot?.category ?? dbRow?.category ?? 'other',
        quantity: 1,
        unitPrice,
        lineTotal: unitPrice,
        isPlaceholderPrice: isPlaceholder,
      });
    }
  }
  return { items: Array.from(byProduct.values()), warnings };
}
  
