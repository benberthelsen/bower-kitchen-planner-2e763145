// BOM Generator Service - orchestrates all pricing calculations

import { CabinetBOM, QuoteBOM, PartDimension, PricingData, CabinetConfig, CommercialOptions, ApplianceLineItem } from './types';
import { parseFormula, parseEdgingSpec, createFormulaVariables } from './formulaParser';
import { getCabinetPartMapping, getPartQuantities, FLAT_PANEL_RE } from './cabinetPartMapping';
import { calculateSheetRequirements, consolidateSheetRequirements, pickFallbackMaterial } from './sheetOptimizer';
import { calculateEdgeTape, consolidateEdgeTape } from './edgeCalculator';
import { calculateHardware, consolidateHardware } from './hardwareCalculator';
import { calculateLaborCost, resolveLaborRates } from './laborCalculator';
import { calculateBuildHours } from './timeModel';
import { calculateBenchtops } from './benchtopCalculator';
import { calculateWorkshopCost, type WorkshopCost } from './workshopModel';
import { calculateDelivery } from './deliveryCalculator';
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
  const mapping = getCabinetPartMapping(cabinet.definitionId, catalogItemName);

  if (!mapping) {
    return createEmptyBOM(cabinet, catalogItemName ?? 'Unknown');
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
  const hardwareWarnings: string[] = [];
  const hardware = calculateHardware(
    config, cabinet.height, hardwareOptions, pricingData.hardware, hardwareWarnings);
  for (const w of hardwareWarnings) warnings.push(`${cabLabel}: ${w}`);

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
  const sel = String(selection).toLowerCase().trim();
  // Exact identifiers first — always unambiguous.
  const exact = materials.find(x => x.id === selection || x.item_code === selection);
  if (exact) return exact.id;
  // Then an exact name match.
  const byName = materials.find(x => (x.name ?? '').toLowerCase().trim() === sel);
  if (byName) return byName.id;
  // Substring is a last resort and only when it is specific enough to mean
  // something: "white" would otherwise bind to whichever white board sorted
  // first out of hundreds, silently pricing the job on the wrong material.
  if (sel.length < 6) return undefined;
  const hits = materials.filter(x => (x.name ?? '').toLowerCase().includes(sel));
  return hits.length === 1 ? hits[0].id : undefined;
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
    // Flat boards (fillers, scribes, applied/return panels) are a single panel
    // the size of the item's own face: height x WIDTH. The default fallback is
    // height x DEPTH, which for a 16mm filler on a 573 deep run would bill
    // 0.50 m2 instead of 0.014 m2 — 35x the board.
    if (FLAT_PANEL_RE.test((cabinet.definitionId ?? '').toLowerCase())) {
      pushPart(req, vars, '', req.quantity, cabinet.height, cabinet.width);
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
  // Every floor-standing job has a toe kick — Microvellum bills it as real
  // products ("Toe Kick Base", 3 of them totalling $915.50 on the Donkin
  // kitchen). This block used to run ONLY when adjustableLegs !== false, so a
  // ladder-kick job (adjustableLegs: false) was quoted with no kick at all,
  // which is backwards: a ladder kick needs MORE material than a clip-on
  // panel, not none. Now always priced, with a ladder allowance for the frame.
  const isLadderKick = hardwareOptions.adjustableLegs === false;
  // captured for the workshop model — kick boards are cut, edged and fitted
  // like any other part, so they must carry labour as well as material
  let kickPieces = 0;
  let kickCutLengthM = 0;
  {
    const KICK_STOCK_MM = 2400;
    const kickHeightMm = globalDims.toeKickHeight || 135;
    // Only floor-standing cabinets carry a toe kick -- Wall/Upper do not.
    // This used to whitelist ids STARTING WITH base|tall|corner|sink|pie, which
    // missed 'open_base' (starts with "open"), every Microvellum product name,
    // and every uuid — so those cabinets contributed no kick at all. Sitting on
    // the floor (y = 0) is the property that actually decides it; a stacked unit
    // like a drawer-over-open-shelf has y > 0 and its kick belongs to the box
    // underneath, which is exactly the behaviour we want.
    const NON_CARCASS_RE = /filler|panel|opening|kick|rail|splash/i;
    const WALL_RE = /^(wall|upper)|[_-](wall|upper)/i;
    const totalKickMm = items
      .filter((i) => {
        if (i.itemType !== 'Cabinet') return false;
        const id = i.definitionId ?? '';
        if (NON_CARCASS_RE.test(id) || WALL_RE.test(id)) return false;
        return (i.y ?? 0) <= 1; // floor-standing
      })
      .reduce((sum, cab) => sum + cab.width, 0);

    if (totalKickMm > 0) {
      // A ladder kick is a built frame — front face plus stiles and noggins —
      // so it consumes materially more board than a clip-on leg panel.
      const LADDER_FRAME_FACTOR = 1.6;
      const kickRunMm = totalKickMm * (isLadderKick ? LADDER_FRAME_FACTOR : 1);
      const pieces = Math.ceil(kickRunMm / KICK_STOCK_MM);
      kickPieces = pieces;
      kickCutLengthM = (2 * (kickRunMm + kickHeightMm * pieces)) / 1000; // perimeter of each board
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

  // -- Appliances (Stage 1, additive) ----------------------------------------
  // Purely additive: when no items are opted in, applianceItems is [] and the
  // total is 0 -- byte-identical with pre-Stage-1 outputs.
  const applianceItems = buildApplianceLineItems(items, pricingData, commercial);
  const appliancesTotal = applianceItems.reduce((s, a) => s + a.lineTotal, 0);
  const hasPlaceholderAppliancePrices = applianceItems.some(a => a.isPlaceholderPrice);

  // Category cost totals (cost = ex commercial, ex GST).
  const matTotal = consolidatedSheets.reduce((s, sh) => s + sh.totalMaterialCost, 0);
  const edgeTotal = consolidatedEdgeTape.reduce((s, e) => s + e.totalCost, 0);
  const hwTotal = consolidatedHardware.reduce((s, h) => s + h.totalCost, 0);
  const regressionLaborTotal = cabinets.reduce((s, c) => s + c.subtotals.labor, 0);

  // -- Workshop model (supply mode) -------------------------------------------
  // When a supply mode is given, shop labour comes from the process model
  // (minutes per part / metre / product at station rates) instead of the flat
  // $235-per-cabinet regression, and the difference is pushed back onto each
  // cabinet pro-rata so per-cabinet lines still add up to the job total.
  let laborTotal = regressionLaborTotal;
  let workshop: WorkshopCost | null = null;
  if (commercial.supplyMode) {
    const benchtopLm = benchtops.reduce((s, b) => s + (b.runLengthMm ?? 0), 0) / 1000;
    // edgeCalculator already bills tape application via edge_pricing.application_cost;
    // don't charge the Edgebanding station on top of it.
    const edgeApplicationAlreadyPriced = consolidatedEdgeTape.some(
      (e) => (e.applicationCost ?? 0) > 0,
    );
    workshop = calculateWorkshopCost(cabinets, {
      mode: commercial.supplyMode,
      rates: commercial.workshopRates,
      benchtopLm,
      edgeApplicationAlreadyPriced,
      // toe kick boards + benchtop pieces are real products that get cut,
      // handled and installed but carry no CabinetBOM of their own
      extraParts: kickPieces,
      extraCutLengthM: kickCutLengthM,
      extraInstallProducts: kickPieces + benchtops.reduce((s, b) => s + (b.sheetsRequired ?? 1), 0),
    });
    laborTotal = workshop.shopCost;
    // The per-part handling / machining / assembly costs from parts_pricing
    // cover the SAME work as the Part handling, Panel cutting, Vertical
    // drilling and Shop part assembly stations, so charging both bills it
    // twice ($840 of it on this kitchen). The station model supersedes them:
    // a fixed per-part charge cannot express supply mode, whereas the stations
    // drop out correctly for flat pack.
    for (const cab of cabinets) {
      const superseded =
        cab.subtotals.handling + cab.subtotals.machining + cab.subtotals.assembly;
      cab.totalCost -= superseded;
      cab.subtotals.handling = 0;
      cab.subtotals.machining = 0;
      cab.subtotals.assembly = 0;
    }
    if (regressionLaborTotal > 0) {
      for (const cab of cabinets) {
        const share = cab.subtotals.labor / regressionLaborTotal;
        const next = workshop.shopCost * share;
        cab.totalCost += next - cab.subtotals.labor;
        cab.subtotals.labor = next;
      }
    }
  }

  const handlingTotal = cabinets.reduce((s, c) => s + c.subtotals.handling, 0);
  const machiningTotal = cabinets.reduce((s, c) => s + c.subtotals.machining, 0);
  const assemblyTotal = cabinets.reduce((s, c) => s + c.subtotals.assembly, 0);

  // Cost -> commercial layers -> sell price. Defaults are pass-through.
  const cabinetCost = cabinets.reduce((s, c) => s + c.totalCost, 0);
  const cost = cabinetCost + benchtopTotal + appliancesTotal;
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
  const subtotalExGst = afterDelivery + clientMarkup;
  const gst = subtotalExGst * gstPct;

  // WS2 guard: roll up deduped pricing-trust warnings for the whole quote.
  const warnings = Array.from(new Set([
    ...cabinets.flatMap(c => c.warnings ?? []),
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
    applianceItems,
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
      total: subtotalExGst + gst
    },
    // When the workshop model runs it IS the labour model, so build hours come
    // from its stations. Previously timeModel.ts computed a second, unrelated
    // set of hours and a `cost` that disagreed with the quote — anything using
    // buildHours for scheduling was reading a different number to the price.
    buildHours: workshop
      ? {
          cut: workshop.lines
            .filter(l => /cutting|lead-in|drilling|routing/i.test(l.station))
            .reduce((s, l) => s + l.hours, 0),
          edge: workshop.lines
            .filter(l => /edgeband/i.test(l.station))
            .reduce((s, l) => s + l.hours, 0),
          assembly: workshop.lines
            .filter(l => /assembly|handling|packag|loading/i.test(l.station))
            .reduce((s, l) => s + l.hours, 0),
          total: workshop.shopHours,
          cost: workshop.shopCost,
        }
      : {
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
): ApplianceLineItem[] {
  const applianceMargin = 1 + (commercial.applianceMarginPct ?? 0);
  const byProduct = new Map<string, ApplianceLineItem>();
  for (const item of items) {
    if (!item.applianceProductId) continue;
    if (item.supplyWithOrder === false) continue;
    const snapshot = item.applianceSnapshot;
    const dbRow = pricingData.appliances?.find(a => a.id === item.applianceProductId);
    // Snapshot wins for stability. Fall back to live catalog row.
    const name = snapshot?.name ?? dbRow?.name;
    if (!name) continue;
    const unitPriceRaw = snapshot?.unitPrice
      ?? dbRow?.installed_price ?? dbRow?.sell_price ?? dbRow?.rrp ?? 0;
    if (unitPriceRaw <= 0) continue;
    const unitPrice = unitPriceRaw * applianceMargin;
    const isPlaceholder = snapshot?.isPlaceholderPrice ?? dbRow?.price_is_placeholder ?? true;
    const key = item.applianceProductId;
    const existing = byProduct.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.lineTotal = existing.quantity * existing.unitPrice;
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
  return Array.from(byProduct.values());
}
  
