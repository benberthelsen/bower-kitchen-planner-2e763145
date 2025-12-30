// BOM Generator Service - orchestrates all pricing calculations

import { CabinetBOM, QuoteBOM, PartDimension, PricingData, CabinetConfig } from './types';
import { parseFormula, parseEdgingSpec, createFormulaVariables } from './formulaParser';
import { getCabinetPartMapping, getPartQuantities } from './cabinetPartMapping';
import { calculateSheetRequirements, consolidateSheetRequirements } from './sheetOptimizer';
import { calculateEdgeTape, consolidateEdgeTape } from './edgeCalculator';
import { calculateHardware, consolidateHardware } from './hardwareCalculator';
import { PlacedItem, GlobalDimensions, HardwareOptions } from '@/types';

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
  
  // Calculate part dimensions using formulas
  const parts = calculatePartDimensions(
    partRequirements,
    cabinet,
    globalDims,
    config,
    pricingData.parts
  );
  
  // Calculate sheet requirements
  const sheets = calculateSheetRequirements(parts, pricingData.materials);
  
  // Calculate edge tape
  const edgeTape = calculateEdgeTape(parts, pricingData.edges);
  
  // Calculate hardware
  const hardware = calculateHardware(config, cabinet.height, hardwareOptions, pricingData.hardware);
  
  // Sum costs
  const subtotals = {
    materials: sheets.reduce((s, sh) => s + sh.totalMaterialCost, 0),
    edging: edgeTape.reduce((s, e) => s + e.totalCost, 0),
    hardware: hardware.reduce((s, h) => s + h.totalCost, 0),
    handling: parts.reduce((s, p) => s + p.handlingCost * p.quantity, 0),
    machining: parts.reduce((s, p) => s + p.machiningCost * p.quantity, 0),
    assembly: parts.reduce((s, p) => s + p.assemblyCost * p.quantity, 0),
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
    totalCost
  };
}

function calculatePartDimensions(
  partRequirements: Array<{ partType: string; quantity: number }>,
  cabinet: PlacedItem,
  globalDims: GlobalDimensions,
  config: CabinetConfig,
  partsPricing: PricingData['parts']
): PartDimension[] {
  const vars = createFormulaVariables(
    { width: cabinet.width, height: cabinet.height, depth: cabinet.depth },
    globalDims,
    { numDoors: config.numDoors, numDrawers: config.numDrawers, numShelves: config.numShelves }
  );
  
  const parts: PartDimension[] = [];
  
  for (const req of partRequirements) {
    const pricing = partsPricing.find(p => p.part_type === req.partType || p.name === req.partType);
    
    const length = parseFormula(pricing?.length_function ?? null, vars) || cabinet.height;
    const width = parseFormula(pricing?.width_function ?? null, vars) || cabinet.depth;
    const area = (length * width) / 1_000_000; // mm² to m²
    
    parts.push({
      name: pricing?.name ?? req.partType,
      partType: req.partType,
      length,
      width,
      area,
      thickness: 16,
      materialId: 'default',
      edging: parseEdgingSpec(pricing?.edging ?? null),
      quantity: req.quantity,
      handlingCost: pricing?.handling_cost ?? 0,
      machiningCost: pricing?.machining_cost ?? 0,
      assemblyCost: pricing?.assembly_cost ?? 0,
    });
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
    subtotals: { materials: 0, edging: 0, hardware: 0, handling: 0, machining: 0, assembly: 0 },
    totalCost: 0
  };
}

/**
 * Generate complete quote BOM for all cabinets
 */
export function generateQuoteBOM(
  items: PlacedItem[],
  globalDims: GlobalDimensions,
  hardwareOptions: HardwareOptions,
  pricingData: PricingData
): QuoteBOM {
  const cabinets = items
    .filter(i => i.itemType === 'Cabinet')
    .map(cab => generateCabinetBOM(cab, globalDims, hardwareOptions, pricingData));
  
  const consolidatedSheets = consolidateSheetRequirements(cabinets.map(c => c.sheets));
  const consolidatedEdgeTape = consolidateEdgeTape(cabinets.map(c => c.edgeTape));
  const consolidatedHardware = consolidateHardware(cabinets.map(c => c.hardware));
  
  const subtotalExGst = cabinets.reduce((s, c) => s + c.totalCost, 0);
  const gst = subtotalExGst * 0.1;
  
  return {
    cabinets,
    consolidatedSheets,
    consolidatedEdgeTape,
    consolidatedHardware,
    grandTotal: {
      materials: consolidatedSheets.reduce((s, sh) => s + sh.totalMaterialCost, 0),
      edging: consolidatedEdgeTape.reduce((s, e) => s + e.totalCost, 0),
      hardware: consolidatedHardware.reduce((s, h) => s + h.totalCost, 0),
      handling: cabinets.reduce((s, c) => s + c.subtotals.handling, 0),
      machining: cabinets.reduce((s, c) => s + c.subtotals.machining, 0),
      assembly: cabinets.reduce((s, c) => s + c.subtotals.assembly, 0),
      labor: 0,
      subtotalExGst,
      gst,
      total: subtotalExGst + gst
    }
  };
}
