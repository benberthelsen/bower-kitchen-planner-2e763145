// BOM Generator Service - orchestrates all pricing calculations

import { CabinetBOM, QuoteBOM, PartDimension, PricingData, CabinetConfig, CommercialOptions, ApplianceLineItem, KickboardAllocation } from './types';
import { parseFormula, parseEdgingSpec, createFormulaVariables } from './formulaParser';
import { getCabinetPartMapping, getPartQuantities, isFlatBoardProduct, isFacesOnlyProduct, isRobeDoorProduct, boardThinAxis, flatBoardCutSize } from './cabinetPartMapping';
import { calculateSheetRequirements, consolidateSheetRequirements, pickFallbackMaterial, partFitsSheet, SHEET_TRIM_MM } from './sheetOptimizer';
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
        `${cabinet.cabinetNumber || robeName}: "${robeName}" is a robe opening / sliding robe door - robe openings are not priced by BowerOS yet, so it is priced at $0 with no board, hinges, edge tape or workshop time. Price it by hand.`,
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

  // Calculate part dimensions using formulas
  const parts = calculatePartDimensions(
    partRequirements,
    cabinet,
    globalDims,
    config,
    pricingData.parts,
    carcaseMaterialId,
    exteriorMaterialId,
    flatCut,
  );
  
  // Calculate sheet requirements
  const sheets = calculateSheetRequirements(parts, pricingData.materials);

  // Part-fit warning data only (no price moves). A floor-standing item's schedule height includes its toe kick, but
  // the live catalogue sizes tall sides and backs at CabHeight and a flat board is cut to its full height, so a
  // 2460-high broom or tall applied panel reports 2460 x 580 against a 2400 sheet while Microvellum cuts it 2325
  // (Regal; Erin & Matt 2440 -> 2305). Until that sizing is fixed, a part that only overruns its sheet by the kick is
  // not reported. Not for replacement fronts (the face IS the finished size), kick bases, or wall-hung items - nor for
  // an item no taller than the kick (a 100-high "Pelmet BC" is not standing on one: taking the kick off its height left
  // -35, which partFitsSheet does not judge, and silently dropped its real 3000 x 100 overrun on Regal).
  const kickMm = globalDims.toeKickHeight ?? 0;
  const lowerName = itemName.toLowerCase();
  const wallHung = (cabinet.y ?? 0) > 1 || lowerName.startsWith('wall') || lowerName.includes('upper');
  if (kickMm > 0 && cabinet.height > kickMm && !wallHung && !config.facesOnly && !config.toeKick) {
    const lessKick = (mm: number) => (Math.abs(mm - cabinet.height) < 0.5 ? mm - kickMm : mm);
    for (const sh of sheets) {
      if (!sh.oversizeParts) continue;
      const stillOversize = sh.oversizeParts.filter((p) => !partFitsSheet(lessKick(p.length), lessKick(p.width), sh.sheetLength, sh.sheetWidth));
      if (stillOversize.length) sh.oversizeParts = stillOversize;
      else delete sh.oversizeParts;
    }
  }

  // Calculate edge tape against the cabinet's selected edge banding (review #7).
  const edgeTape = calculateEdgeTape(parts, pricingData.edges, cabinet.edgeId);
  
  // Calculate hardware
  const hardware = calculateHardware(config, cabinet.height, hardwareOptions, pricingData.hardware);

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

  // Sum costs
  const subtotals = {
    materials: sheets.reduce((s, sh) => s + sh.totalMaterialCost, 0),
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
  };
}

/** A Microvellum ladder base the base cabinets stand on ("Toe Kick Base", "Toe Kick Base With Angled Ends"). */
export const TOE_KICK_BASE_RE = /toe\s*kick\s*base/i;

/** Parts that take the exterior/door finish rather than carcase board. */
const EXTERIOR_PART = /door|drawer front|false front|appliance panel|end panel|fascia/i;

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
): PartDimension[] {
  const vars = createFormulaVariables(
    { width: cabinet.width, height: cabinet.height, depth: cabinet.depth },
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

  // Per-drawer face heights (#20): custom editor values or the standard
  // distribution, over the drawer opening (cabinet height minus toe kick for
  // floor-standing cabinets). Box height = face − 20mm (shop standard).
  const numDrawers = config.numDrawers ?? 0;
  const drawerOpening = Math.max(0, cabinet.height - (cabinet.height > 600 ? globalDims.toeKickHeight : 0));
  const drawerFaces = numDrawers > 0
    ? distributeDrawerHeights(numDrawers, drawerOpening, cabinet.drawerFrontHeights)
    : [];

  const pushPart = (
    req: { partType: string; quantity: number },
    partVars: typeof vars,
    nameSuffix = '',
    quantity = req.quantity,
    /** Size when the catalogue formula is missing. Left undefined, it is a stand-in: height (length) / depth (width). */
    fallbackLength?: number,
    fallbackWidth?: number,
    exact?: { length: number; width: number },
  ) => {
    const pricing = partsPricing.find(p => p.part_type === req.partType || p.name === req.partType);
    // A flat board is a visible face - an applied end, filler, under panel, pelmet front, appliance panel - and
    // Microvellum cuts every one of them from the FRONT material. Its part names ("Tall Applied End", "Filler")
    // never matched EXTERIOR_PART, so they were all billed as carcase board.
    const isExterior = Boolean(config.flatBoard) || EXTERIOR_PART.test(`${pricing?.name ?? req.partType} ${req.partType}`);

    // `exact` bypasses the catalogue formula: a formula written for a door on a carcase takes the kick
    // off the height, which is wrong for a face that is already the finished door size.
    const lengthFn = pricing?.length_function ?? null;
    const widthFn = pricing?.width_function ?? null;
    const fromLengthFn = exact ? 0 : parseFormula(lengthFn, partVars);
    const fromWidthFn = exact ? 0 : parseFormula(widthFn, partVars);
    const length = exact ? exact.length : (fromLengthFn || (fallbackLength ?? cabinet.height));
    const width = exact ? exact.width : (fromWidthFn || (fallbackWidth ?? cabinet.depth));
    const area = (length * width) / 1_000_000; // mm² to m²
    // Not a cut size (see PartDimension.sizePlaceholder): the stand-in fallback was used, or the formula needs a
    // corner's second arm this item does not carry (CabRightWidth / CabRightDepth then default to its own W / D).
    const needsMissingArm = (fn: string | null) => Boolean(fn)
      && ((/CabRightWidth/.test(fn!) && cabinet.secondWidth == null) || (/CabRightDepth/.test(fn!) && cabinet.rightCarcaseDepth == null));
    const sizePlaceholder = !exact && (
      (!fromLengthFn && fallbackLength === undefined) || (!fromWidthFn && fallbackWidth === undefined)
      || needsMissingArm(lengthFn) || needsMissingArm(widthFn));

    parts.push({
      name: (pricing?.name ?? req.partType) + nameSuffix,
      partType: req.partType,
      length,
      width,
      area,
      thickness: 16,
      materialId: isExterior ? exteriorMaterialId : carcaseMaterialId,
      materialRole: isExterior ? 'exterior' : 'carcase',
      edging: parseEdgingSpec(pricing?.edging ?? null),
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
 * cabinet's SheetAllocation.oversizeParts, less the kick-only overruns generateCabinetBOM drops and the stand-in
 * sizes calculateSheetRequirements never judges). ONE warning per sheet material. Each entry LEADS with the schedule
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
    materialName: string; sheetLength: number; sheetWidth: number; assumed: boolean; products: Map<string, ProductGroup>;
  }>();
  for (const cab of cabinets) {
    const d = cab.dimensions;
    const size = `${mm(d.width)} x ${mm(d.height)} x ${mm(d.depth)}`;
    for (const sh of cab.sheets) {
      if (!sh.oversizeParts?.length) continue;
      const mat = byMaterial.get(sh.materialId) ?? {
        materialName: sh.materialName, sheetLength: sh.sheetLength, sheetWidth: sh.sheetWidth,
        assumed: sh.oversizeParts[0].sheetSizeAssumed, products: new Map<string, ProductGroup>(),
      };
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
      + ` The board is still priced by area as if ${many ? 'they fit' : 'it fits'}. Price a longer sheet (e.g. 3600 x 1800) or a join,`
      + ` or correct the product size if it is wrong.`;
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
  {
    const cabinetItems = items.filter(i => i.itemType === 'Cabinet');
    const standsOnLadderBases = cabinetItems.some(i => TOE_KICK_BASE_RE.test(`${i.definitionId ?? ''} ${i.productName ?? ''}`));
    cabinets.forEach((cab, idx) => {
      const item = cabinetItems[idx];
      if (!item || (!standsOnLadderBases && carriesKickFace(item))) return;
      const legs = cab.hardware.filter(h => h.hardwareType === 'leg');
      if (!legs.length) return;
      const cost = legs.reduce((s, h) => s + h.totalCost, 0);
      cab.hardware = cab.hardware.filter(h => h.hardwareType !== 'leg');
      cab.subtotals.hardware -= cost;
      cab.totalCost -= cost;
    });
  }

  const consolidatedSheets = consolidateSheetRequirements(cabinets.map(c => c.sheets));
  const consolidatedEdgeTape = consolidateEdgeTape(cabinets.map(c => c.edgeTape));
  const consolidatedHardware = consolidateHardware(cabinets.map(c => c.hardware));
  const jobLevelWarnings: string[] = [];
  jobLevelWarnings.push(...oversizePartWarnings(cabinets));
  const kickboards = hardwareOptions.adjustableLegs === false || hasExplicitKicks
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
      let reconciledMaterials = 0;
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

  // -- Kick Panels ------------------------------------------------------------
  // Adjustable-leg kick: flat board cut from 2400mm stock lengths, priced here.
  // Ladder kick: priced as a cabinet via the parts engine (definitionId: 'ladder_kick_*').
  if (hardwareOptions.adjustableLegs !== false) {
    const KICK_STOCK_MM = 2400;
    const kickHeightMm = globalDims.toeKickHeight || 135;
    const totalKickMm = kickboards.reduce((sum, run) => sum + run.runLengthMm, 0);

    if (totalKickMm > 0) {
      const pieces = stockPiecesForKickCuts(kickboards);
      // Resolve kick material: same carcase material as first cabinet, or first available
      const firstCab = items.find(i => i.itemType === 'Cabinet');
      const resolvedKickMaterialId = resolveMaterialId(firstCab?.carcaseMaterialId, pricingData.materials);
      const kickMat =
        pricingData.materials.find(m => m.id === resolvedKickMaterialId) ??
        pricingData.materials.find(m => (m.area_cost ?? 0) > 0) ??
        pricingData.materials[0];

      if (firstCab?.carcaseMaterialId && !resolvedKickMaterialId) {
        jobLevelWarnings.push(
          `Kick material "${firstCab.carcaseMaterialId}" has no catalogue match — using ${kickMat?.name ?? 'an unpriced fallback'}`,
        );
      }

      if (kickMat) {
        const areaPer = (KICK_STOCK_MM / 1000) * (kickHeightMm / 1000); // m² per piece
        const rate = kickMat.area_cost ?? 0;
        // The kick board is bought and cut, so it is charged: spread its cost, by width, over the cabinets the
        // runs were built from (the same carriesKickFace test - "has legs" would include every upper). It used
        // to reach the cost total and the ordering list but no quote line, so the sell price left it out.
        const kickCost = pieces * areaPer * rate;
        const kickCabinetIds = new Set(items.filter(i => i.itemType === 'Cabinet' && carriesKickFace(i)).map(i => i.instanceId));
        const onKick = cabinets.filter(c => kickCabinetIds.has(c.cabinetId) && c.parts.length > 0);
        const kickWidth = onKick.reduce((s, c) => s + Math.max(0, c.dimensions.width), 0);
        for (const c of onKick) {
          const share = kickWidth > 0 ? kickCost * (Math.max(0, c.dimensions.width) / kickWidth) : kickCost / onKick.length;
          c.subtotals.materials += share;
          c.totalCost += share;
        }
        consolidatedSheets.push({
          materialId: kickMat.id,
          materialName: `${kickMat.name} (Kick Panels)`,
          materialRole: 'carcase' as const,
          sheetWidth: kickHeightMm,
          sheetLength: KICK_STOCK_MM,
          sheetArea: areaPer,
          sheetsRequired: pieces,
          totalPartArea: pieces * areaPer,
          wasteArea: 0,
          yieldFactor: 1,
          areaCostPerSqm: rate,
          totalMaterialCost: pieces * areaPer * rate,
        });
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
  
