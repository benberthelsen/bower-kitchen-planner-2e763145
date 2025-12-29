// Sheet optimization engine - calculates minimum sheets required with yield factor

import { PartDimension, SheetAllocation, MaterialPricingRecord } from './types';

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
    const material = materials.find(m => m.id === materialId || m.item_code === materialId);
    
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
      material?.name ?? 'Unknown Material',
      materialId
    );
    
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
  
  // Apply yield factor (accounts for offcuts, grain direction, etc.)
  // yieldFactor of 0.85 means we can use 85% of each sheet
  const adjustedArea = yieldFactor > 0 ? totalPartArea / yieldFactor : totalPartArea;
  
  // Apply minimum job area if specified
  const chargeableArea = Math.max(adjustedArea, minimumJobArea);
  
  // Calculate sheets required (round UP - you pay for whole sheets)
  const sheetsRequired = Math.ceil(chargeableArea / sheetSpec.area);
  
  // Calculate total material area used
  const totalSheetArea = sheetsRequired * sheetSpec.area;
  
  // Waste area
  const wasteArea = totalSheetArea - totalPartArea;
  
  // Calculate cost
  const totalMaterialCost = chargeableArea * areaCostPerSqm;
  
  return {
    materialId,
    materialName,
    sheetWidth: sheetSpec.width,
    sheetLength: sheetSpec.length,
    sheetArea: sheetSpec.area,
    sheetsRequired,
    totalPartArea,
    wasteArea,
    yieldFactor,
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
    const adjustedArea = template.yieldFactor > 0 
      ? totalPartArea / template.yieldFactor 
      : totalPartArea;
    
    const sheetsRequired = Math.ceil(adjustedArea / template.sheetArea);
    const totalSheetArea = sheetsRequired * template.sheetArea;
    
    consolidated.push({
      materialId,
      materialName: template.materialName,
      sheetWidth: template.sheetWidth,
      sheetLength: template.sheetLength,
      sheetArea: template.sheetArea,
      sheetsRequired,
      totalPartArea,
      wasteArea: totalSheetArea - totalPartArea,
      yieldFactor: template.yieldFactor,
      areaCostPerSqm: template.areaCostPerSqm,
      totalMaterialCost: adjustedArea * template.areaCostPerSqm
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
