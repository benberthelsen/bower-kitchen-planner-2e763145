// BOM Generator Service - orchestrates all pricing calculations

import { CabinetBOM, QuoteBOM, PartDimension, PricingData, CabinetConfig, CommercialOptions } from './types';
import { parseFormula, parseEdgingSpec, createFormulaVariables } from './formulaParser';
import { getCabinetPartMapping, getPartQuantities } from './cabinetPartMapping';
import { calculateSheetRequirements, consolidateSheetRequirements, pickFallbackMaterial } from './sheetOptimizer';
import { calculateEdgeTape, consolidateEdgeTape } from './edgeCalculator';
import { calculateHardware, consolidateHardware } from './hardwareCalculator';
import { calculateLaborCost, resolveLaborRates } from './laborCalculator';
import { calculateBuildHours } from './timeModel';
import { calculateBenchtops } from './benchtopCalculator';
import { PlacedItem, GlobalDimensions, HardwareOptions } from '@/types';
import { distributeDrawerHeights, drawerBoxHeightFromFace } from '@/lib/drawerHeights';

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
  const mapping = getCabinetPartMapping(cabinet.definitionId);
  
  if (!mapping) {
    return createEmptyBOM(cabinet, catalogItemName ?? 'Unknown');
  }
  
  const config = mapping.config;
  const partRequirements = getPartQuantities(mapping.parts, config);

  const warnings: string[] = [];
  const cabLabel = cabinet.cabinetNumber || catalogItemName || cabinet.definitionId || 'Cabinet';

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
    exteriorMaterialId
  );
  
  // Calculate sheet requirements
  const sheets = calculateSheetRequirements(parts, pricingData.materials);
  
  // Calculate edge tape against the cabinet's selected edge banding (review #7).
  const edgeTape = calculateEdgeTape(parts, pricingData.edges, cabinet.edgeId);
  
  // Calculate hardware
  const hardware = calculateHardware(config, cabinet.height, hardwareOptions, pricingData.hardware);

  // Labor (calibrated against real MV cost reports; tunable via labor_rates)
  const isTall = cabinet.height >= 1500 || /tall|pantry|broom|linen/i.test(cabinet.definitionId ?? '');
  const laborRates = resolveLaborRates(pricingData.labor as never);
  const labor = calculateLaborCost(config, cabinet.width, isTall, laborRates);

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
    warnings
  };
}

/** Parts that take the exterior/door finish rather than carcase board. */
const EXTERIOR_PART = /door|drawer front|false front|appliance panel|end panel|fascia/i;

/** Match a user material selection (id, item_code, or name fragment) to a material id. */
function resolveMaterialId(
  selection: string | undefined,
  materials: PricingData['materials']
): string | undefined {
  if (!selection) return undefined;
  const sel = String(selection).toLowerCase();
  const m = materials.find(x =>
    x.id === selection || x.item_code === selection || (x.name ?? '').toLowerCase().includes(sel));
  return m?.id;
}

function calculatePartDimensions(
  partRequirements: Array<{ partType: string; quantity: number }>,
  cabinet: PlacedItem,
  globalDims: GlobalDimensions,
  config: CabinetConfig,
  partsPricing: PricingData['parts'],
  carcaseMaterialId: string,
  exteriorMaterialId: string
): PartDimension[] {
  const vars = createFormulaVariables(
    { width: cabinet.width, height: cabinet.height, depth: cabinet.depth },
    globalDims,
    { numDoors: config.numDoors, numDrawers: config.numDrawers, numShelves: config.numShelves }
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
    fallbackLength = cabinet.height,
    fallbackWidth = cabinet.depth,
  ) => {
    const pricing = partsPricing.find(p => p.part_type === req.partType || p.name === req.partType);
    const isExterior = EXTERIOR_PART.test(`${pricing?.name ?? req.partType} ${req.partType}`);

    const length = parseFormula(pricing?.length_function ?? null, partVars) || fallbackLength;
    const width = parseFormula(pricing?.width_function ?? null, partVars) || fallbackWidth;
    const area = (length * width) / 1_000_000; // mm² to m²

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
      handlingCost: pricing?.handling_cost ?? 0,
      machiningCost: pricing?.machining_cost ?? 0,
      assemblyCost: pricing?.assembly_cost ?? 0,
    });
  };

  for (const req of partRequirements) {
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

/**
 * Generate complete quote BOM for all cabinets
 */
export function generateQuoteBOM(
  items: PlacedItem[],
  globalDims: GlobalDimensions,
  hardwareOptions: HardwareOptions,
  pricingData: PricingData,
  commercial: CommercialOptions = {}
): QuoteBOM {
  const cabinets = items
    .filter(i => i.itemType === 'Cabinet')
    .map(cab => generateCabinetBOM(cab, globalDims, hardwareOptions, pricingData));
  
  const consolidatedSheets = consolidateSheetRequirements(cabinets.map(c => c.sheets));
  const consolidatedEdgeTape = consolidateEdgeTape(cabinets.map(c => c.edgeTape));
  const consolidatedHardware = consolidateHardware(cabinets.map(c => c.hardware));

  // -- P5 Reconciliation -------------------------------------------------------
  // Redistribute the consolidated sheet cost back to each cabinet as an
  // area-share so per-cabinet material lines reflect bulk-yield savings.
  // Rate = consolidatedCost / consolidatedPartArea ($/m2 of actual part area).
  // Only cabinet-sourced sheets are considered here; kick panels (added below)
  // are a job-level line item not attributed to individual cabinets.
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

  // -- Kick Panels ------------------------------------------------------------
  // Adjustable-leg kick: flat board cut from 2400mm stock lengths, priced here.
  // Ladder kick: priced as a cabinet via the parts engine (definitionId: 'ladder_kick_*').
  if (hardwareOptions.adjustableLegs !== false) {
    const KICK_STOCK_MM = 2400;
    const kickHeightMm = globalDims.toeKickHeight || 135;
    // Only Base, Tall, Corner, Sink cabs carry a toe kick -- Wall/Upper do not
    const BASE_TALL_RE = /^(base|tall|corner|sink|pie)/i;
    const totalKickMm = items
      .filter(i => i.itemType === 'Cabinet' && BASE_TALL_RE.test(i.definitionId ?? ''))
      .reduce((sum, cab) => sum + cab.width, 0);

    if (totalKickMm > 0) {
      const pieces = Math.ceil(totalKickMm / KICK_STOCK_MM);
      // Resolve kick material: same carcase material as first cabinet, or first available
      const firstCab = items.find(i => i.itemType === 'Cabinet');
      const kickMat =
        pricingData.materials.find(m =>
          firstCab?.carcaseMaterialId &&
          (m.id === firstCab.carcaseMaterialId || m.item_code === firstCab.carcaseMaterialId)
        ) ??
        pricingData.materials.find(m => (m.area_cost ?? 0) > 0) ??
        pricingData.materials[0];

      if (kickMat) {
        const areaPer = (KICK_STOCK_MM / 1000) * (kickHeightMm / 1000); // m² per piece
        const rate = kickMat.area_cost ?? 0;
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
  const benchtops = calculateBenchtops(items, globalDims, pricingData);
  const benchtopSupply = benchtops.reduce((s, b) => s + b.supplyCost, 0);
  const benchtopInstall = benchtops.reduce((s, b) => s + b.installCost, 0);
  const benchtopTotal = benchtopSupply + benchtopInstall;

  // Category cost totals (cost = ex commercial, ex GST).
  const matTotal = consolidatedSheets.reduce((s, sh) => s + sh.totalMaterialCost, 0);
  const edgeTotal = consolidatedEdgeTape.reduce((s, e) => s + e.totalCost, 0);
  const hwTotal = consolidatedHardware.reduce((s, h) => s + h.totalCost, 0);
  const handlingTotal = cabinets.reduce((s, c) => s + c.subtotals.handling, 0);
  const machiningTotal = cabinets.reduce((s, c) => s + c.subtotals.machining, 0);
  const assemblyTotal = cabinets.reduce((s, c) => s + c.subtotals.assembly, 0);
  const laborTotal = cabinets.reduce((s, c) => s + c.subtotals.labor, 0);

  // Cost -> commercial layers -> sell price. Defaults are pass-through.
  const cabinetCost = cabinets.reduce((s, c) => s + c.totalCost, 0);
  const cost = cabinetCost + benchtopTotal;
  const marginPct = commercial.marginPct ?? 0;
  const designFeePct = commercial.designFeePct ?? 0;
  const deliveryFlat = commercial.deliveryFlat ?? 0;
  const installFlat = commercial.installFlat ?? 0;
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
  const subtotalExGst = afterDelivery + clientMarkup;
  const gst = subtotalExGst * gstPct;

  // WS2 guard: roll up deduped pricing-trust warnings for the whole quote.
  const warnings = Array.from(new Set([
    ...cabinets.flatMap(c => c.warnings ?? []),
    ...consolidatedSheets
      .filter(s => s.unresolved)
      .map(s => `Material "${s.materialId}" has no priced match — board line priced at $0`),
  ]));

  return {
    warnings,
    cabinets,
    consolidatedSheets,
    consolidatedEdgeTape,
    consolidatedHardware,
    benchtops,
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
      cost,
      margin,
      designFee,
      delivery: deliveryFlat,
      install: installFlat,
      clientMarkup,
      subtotalExGst,
      gst,
      total: subtotalExGst + gst
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
  
