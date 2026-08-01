// Hardware calculator - counts hardware items based on cabinet configuration

import { HardwareItem, HardwarePricingRecord, CabinetConfig } from './types';
import { HardwareOptions } from '@/types';

interface HardwareRules {
  hingesPerDoor: number;
  hingesPerTallDoor: number;
  runnersPerDrawer: number;
  legsPerCabinet: number;
  shelfPinsPerShelf: number;
  handlesPerDoor: number;
  handlesPerDrawer: number;
}

const DEFAULT_RULES: HardwareRules = {
  hingesPerDoor: 2,
  hingesPerTallDoor: 4,
  runnersPerDrawer: 1, // 1 pair per drawer
  legsPerCabinet: 4,
  shelfPinsPerShelf: 4,
  handlesPerDoor: 1,
  handlesPerDrawer: 1
};

/**
 * Construction consumables — screws belong to CONSTRUCTION STAGES, not to
 * hardware items (per shop practice):
 *  - carcase build: 28mm screws (e.g. ×4 per end-panel fixing)
 *  - installation: 45mm/70mm screws to fix cabinets to walls
 * Counts are per cabinet and tunable here until the admin
 * construction_consumables table lands (P1 of the pricing plan).
 */
interface ConsumableRule {
  stage: 'carcase' | 'install';
  name: string;
  /** matched against hardware_pricing name/item_code if present */
  match: string;
  qtyPerCabinet: number;
  fallbackUnitCost: number;
}

const CONSTRUCTION_CONSUMABLES: ConsumableRule[] = [
  { stage: 'carcase', name: '28mm Screws (carcase/end panels)', match: '28mm screw', qtyPerCabinet: 12, fallbackUnitCost: 0.04 },
  { stage: 'install', name: '45mm Screws (wall fixing)', match: '45mm screw', qtyPerCabinet: 4, fallbackUnitCost: 0.05 },
  { stage: 'install', name: '70mm Screws (wall fixing)', match: '70mm screw', qtyPerCabinet: 2, fallbackUnitCost: 0.07 },
];

function resolvePositiveUnitCost(
  pricing: HardwarePricingRecord | undefined,
  fallback: number,
): { unitCost: number; isFallbackPrice: boolean } {
  const hasCatalogPrice = Number.isFinite(pricing?.unit_cost) && (pricing?.unit_cost ?? 0) > 0;
  return {
    unitCost: hasCatalogPrice ? pricing!.unit_cost : fallback,
    isFallbackPrice: !hasCatalogPrice,
  };
}

/**
 * Calculate hardware requirements for a cabinet
 */
export function calculateHardware(
  config: CabinetConfig,
  cabinetHeight: number,
  hardwareOptions: HardwareOptions,
  hardwarePricing: HardwarePricingRecord[]
): HardwareItem[] {
  const items: HardwareItem[] = [];
  const rules = DEFAULT_RULES;
  
  // Determine if tall cabinet (affects hinge count)
  const isTall = cabinetHeight > 1200;
  
  // === HINGES ===
  if (config.numDoors > 0) {
    const hingesPerDoor = isTall ? rules.hingesPerTallDoor : rules.hingesPerDoor;
    const hingeCount = config.numDoors * hingesPerDoor;
    
    const hingePricing = hardwarePricing.find(h =>
      h.id === hardwareOptions.hingeType || h.item_code === hardwareOptions.hingeType
    ) ?? hardwarePricing.find(h =>
      h.hardware_type === 'hinge' &&
      (h.name.toLowerCase().includes(hardwareOptions.hingeType.toLowerCase()) ||
       h.item_code === hardwareOptions.hingeType)
    );
    const hingeCost = resolvePositiveUnitCost(hingePricing, 8);
    
    items.push({
      itemCode: hingePricing?.item_code ?? hardwareOptions.hingeType,
      name: hingePricing?.name ?? hardwareOptions.hingeType,
      hardwareType: 'hinge',
      quantity: hingeCount,
      unitCost: hingeCost.unitCost,
      machiningCost: (hingePricing?.machining_cost ?? 0) * hingeCount,
      assemblyCost: (hingePricing?.assembly_cost ?? 0) * hingeCount,
      totalCost: hingeCost.unitCost * hingeCount +
                 (hingePricing?.machining_cost ?? 0) * hingeCount +
                 (hingePricing?.assembly_cost ?? 0) * hingeCount,
      isFallbackPrice: hingeCost.isFallbackPrice,
    });

    // === HINGE PLATES (separate item — plate type varies by hinge type) ===
    const platePricing = hardwarePricing.find(h =>
      /plate/i.test(`${h.hardware_type} ${h.name}`) &&
      (!hingePricing?.series || h.series === hingePricing.series)
    ) ?? hardwarePricing.find(h => /plate/i.test(`${h.hardware_type} ${h.name}`));
    const plateCost = resolvePositiveUnitCost(platePricing, 2.5);

    items.push({
      itemCode: platePricing?.item_code ?? 'hinge-plate',
      name: platePricing?.name ?? 'Hinge Plate',
      hardwareType: 'hinge-plate',
      quantity: hingeCount,
      unitCost: plateCost.unitCost,
      machiningCost: (platePricing?.machining_cost ?? 0) * hingeCount,
      assemblyCost: (platePricing?.assembly_cost ?? 0) * hingeCount,
      totalCost: plateCost.unitCost * hingeCount +
        (platePricing?.machining_cost ?? 0) * hingeCount +
        (platePricing?.assembly_cost ?? 0) * hingeCount,
      isFallbackPrice: plateCost.isFallbackPrice,
    });
  }
  
  // === DRAWER RUNNERS ===
  if (config.numDrawers > 0) {
    const runnerCount = config.numDrawers * rules.runnersPerDrawer;
    
    const runnerPricing = hardwarePricing.find(h =>
      h.id === hardwareOptions.drawerType || h.item_code === hardwareOptions.drawerType
    ) ?? hardwarePricing.find(h =>
      h.hardware_type === 'runner' &&
      (h.name.toLowerCase().includes(hardwareOptions.drawerType.toLowerCase()) ||
       h.item_code === hardwareOptions.drawerType)
    );
    const runnerCost = resolvePositiveUnitCost(runnerPricing, 45);
    
    items.push({
      itemCode: runnerPricing?.item_code ?? hardwareOptions.drawerType,
      name: runnerPricing?.name ?? hardwareOptions.drawerType,
      hardwareType: 'runner',
      quantity: runnerCount,
      unitCost: runnerCost.unitCost,
      machiningCost: (runnerPricing?.machining_cost ?? 0) * runnerCount,
      assemblyCost: (runnerPricing?.assembly_cost ?? 0) * runnerCount,
      totalCost: runnerCost.unitCost * runnerCount +
                 (runnerPricing?.machining_cost ?? 0) * runnerCount +
                 (runnerPricing?.assembly_cost ?? 0) * runnerCount,
      isFallbackPrice: runnerCost.isFallbackPrice,
    });
  }
  
  // === HANDLES ===
  if (hardwareOptions.handleId !== 'handle-none') {
    const handleCount = (config.numDoors * rules.handlesPerDoor) + 
                       (config.numDrawers * rules.handlesPerDrawer);
    
    if (handleCount > 0) {
      const handlePricing = hardwarePricing.find(h => 
        h.hardware_type === 'handle' && 
        (h.id === hardwareOptions.handleId || h.item_code === hardwareOptions.handleId)
      );
      const handleCost = resolvePositiveUnitCost(handlePricing, 15);
      
      items.push({
        itemCode: hardwareOptions.handleId,
        name: handlePricing?.name ?? 'Handle',
        hardwareType: 'handle',
        quantity: handleCount,
        unitCost: handleCost.unitCost,
        machiningCost: 0,
        assemblyCost: (handlePricing?.assembly_cost ?? 0) * handleCount,
        totalCost: handleCost.unitCost * handleCount +
                   (handlePricing?.assembly_cost ?? 0) * handleCount,
        isFallbackPrice: handleCost.isFallbackPrice,
      });
    }
  }
  
  // === ADJUSTABLE LEGS ===
  if (hardwareOptions.adjustableLegs) {
    const legPricing = hardwarePricing.find(h => h.hardware_type === 'leg');
    const legCost = resolvePositiveUnitCost(legPricing, 3);
    
    items.push({
      itemCode: legPricing?.item_code ?? 'LEG-ADJ',
      name: legPricing?.name ?? 'Adjustable Leg',
      hardwareType: 'leg',
      quantity: rules.legsPerCabinet,
      unitCost: legCost.unitCost,
      machiningCost: 0,
      assemblyCost: 0,
      totalCost: legCost.unitCost * rules.legsPerCabinet,
      isFallbackPrice: legCost.isFallbackPrice,
    });
  }
  
  // === SHELF PINS ===
  if (config.numShelves > 0) {
    const pinCount = config.numShelves * rules.shelfPinsPerShelf;
    const pinPricing = hardwarePricing.find(h => h.hardware_type === 'shelf_pin');
    const pinCost = resolvePositiveUnitCost(pinPricing, 0.20);
    
    items.push({
      itemCode: pinPricing?.item_code ?? 'PIN-SHELF',
      name: pinPricing?.name ?? 'Shelf Pin',
      hardwareType: 'shelf_pin',
      quantity: pinCount,
      unitCost: pinCost.unitCost,
      machiningCost: 0,
      assemblyCost: 0,
      totalCost: pinCost.unitCost * pinCount,
      isFallbackPrice: pinCost.isFallbackPrice,
    });
  }
  
  // === CONSTRUCTION CONSUMABLES (stage-based screws) ===
  for (const rule of CONSTRUCTION_CONSUMABLES) {
    const pricing = hardwarePricing.find(h =>
      h.name.toLowerCase().includes(rule.match) || h.item_code?.toLowerCase?.() === rule.match
    );
    const resolvedCost = resolvePositiveUnitCost(pricing, rule.fallbackUnitCost);
    items.push({
      itemCode: pricing?.item_code ?? rule.match.replace(/\s+/g, '-'),
      name: pricing?.name ?? rule.name,
      hardwareType: `consumable-${rule.stage}`,
      quantity: rule.qtyPerCabinet,
      unitCost: resolvedCost.unitCost,
      machiningCost: 0,
      assemblyCost: 0,
      totalCost: resolvedCost.unitCost * rule.qtyPerCabinet,
      isFallbackPrice: resolvedCost.isFallbackPrice,
    });
  }

  return items;
}

/**
 * Consolidate hardware across multiple cabinets
 */
export function consolidateHardware(
  cabinetHardware: HardwareItem[][]
): HardwareItem[] {
  const byCode = new Map<string, HardwareItem[]>();
  
  for (const hardware of cabinetHardware) {
    for (const item of hardware) {
      if (!byCode.has(item.itemCode)) {
        byCode.set(item.itemCode, []);
      }
      byCode.get(item.itemCode)!.push(item);
    }
  }
  
  const consolidated: HardwareItem[] = [];
  
  for (const [itemCode, items] of byCode) {
    const template = items[0];
    const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
    const totalMachiningCost = items.reduce((sum, i) => sum + i.machiningCost, 0);
    const totalAssemblyCost = items.reduce((sum, i) => sum + i.assemblyCost, 0);
    
    consolidated.push({
      itemCode,
      name: template.name,
      hardwareType: template.hardwareType,
      quantity: totalQuantity,
      unitCost: template.unitCost,
      machiningCost: totalMachiningCost,
      assemblyCost: totalAssemblyCost,
      totalCost: (template.unitCost * totalQuantity) + totalMachiningCost + totalAssemblyCost,
      isFallbackPrice: items.some(i => i.isFallbackPrice),
    });
  }
  
  return consolidated;
}
