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
    
    items.push({
      itemCode: hingePricing?.item_code ?? hardwareOptions.hingeType,
      name: hingePricing?.name ?? hardwareOptions.hingeType,
      hardwareType: 'hinge',
      quantity: hingeCount,
      unitCost: hingePricing?.unit_cost ?? 8,
      machiningCost: (hingePricing?.machining_cost ?? 0) * hingeCount,
      assemblyCost: (hingePricing?.assembly_cost ?? 0) * hingeCount,
      totalCost: (hingePricing?.unit_cost ?? 8) * hingeCount + 
                 (hingePricing?.machining_cost ?? 0) * hingeCount +
                 (hingePricing?.assembly_cost ?? 0) * hingeCount
    });

    // === HINGE PLATES (separate item — plate type varies by hinge type) ===
    const platePricing = hardwarePricing.find(h =>
      /plate/i.test(`${h.hardware_type} ${h.name}`) &&
      (!hingePricing?.series || h.series === hingePricing.series)
    ) ?? hardwarePricing.find(h => /plate/i.test(`${h.hardware_type} ${h.name}`));

    items.push({
      itemCode: platePricing?.item_code ?? 'hinge-plate',
      name: platePricing?.name ?? 'Hinge Plate',
      hardwareType: 'hinge-plate',
      quantity: hingeCount,
      unitCost: platePricing?.unit_cost ?? 2.5,
      machiningCost: (platePricing?.machining_cost ?? 0) * hingeCount,
      assemblyCost: (platePricing?.assembly_cost ?? 0) * hingeCount,
      totalCost: (platePricing?.unit_cost ?? 2.5) * hingeCount +
        (platePricing?.machining_cost ?? 0) * hingeCount +
        (platePricing?.assembly_cost ?? 0) * hingeCount,
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
    
    items.push({
      itemCode: runnerPricing?.item_code ?? hardwareOptions.drawerType,
      name: runnerPricing?.name ?? hardwareOptions.drawerType,
      hardwareType: 'runner',
      quantity: runnerCount,
      unitCost: runnerPricing?.unit_cost ?? 45,
      machiningCost: (runnerPricing?.machining_cost ?? 0) * runnerCount,
      assemblyCost: (runnerPricing?.assembly_cost ?? 0) * runnerCount,
      totalCost: (runnerPricing?.unit_cost ?? 45) * runnerCount +
                 (runnerPricing?.machining_cost ?? 0) * runnerCount +
                 (runnerPricing?.assembly_cost ?? 0) * runnerCount
    });
  }
  
  // === HANDLES ===
  if (hardwareOptions.handleId !== 'handle-none') {
    const handleCount = (config.numDoors * rules.handlesPerDoor) + 
                       (config.numDrawers * rules.handlesPerDrawer);
    
    if (handleCount > 0) {
      const handlePricing = hardwarePricing.find(h => 
        h.hardware_type === 'handle' && 
        (h.item_code === hardwareOptions.handleId)
      );
      
      items.push({
        itemCode: hardwareOptions.handleId,
        name: handlePricing?.name ?? 'Handle',
        hardwareType: 'handle',
        quantity: handleCount,
        unitCost: handlePricing?.unit_cost ?? 15,
        machiningCost: 0,
        assemblyCost: (handlePricing?.assembly_cost ?? 0) * handleCount,
        totalCost: (handlePricing?.unit_cost ?? 15) * handleCount +
                   (handlePricing?.assembly_cost ?? 0) * handleCount
      });
    }
  }
  
  // === ADJUSTABLE LEGS ===
  if (hardwareOptions.adjustableLegs) {
    const legPricing = hardwarePricing.find(h => h.hardware_type === 'leg');
    
    items.push({
      itemCode: legPricing?.item_code ?? 'LEG-ADJ',
      name: legPricing?.name ?? 'Adjustable Leg',
      hardwareType: 'leg',
      quantity: rules.legsPerCabinet,
      unitCost: legPricing?.unit_cost ?? 3,
      machiningCost: 0,
      assemblyCost: 0,
      totalCost: (legPricing?.unit_cost ?? 3) * rules.legsPerCabinet
    });
  }
  
  // === SHELF PINS ===
  if (config.numShelves > 0) {
    const pinCount = config.numShelves * rules.shelfPinsPerShelf;
    const pinPricing = hardwarePricing.find(h => h.hardware_type === 'shelf_pin');
    
    items.push({
      itemCode: pinPricing?.item_code ?? 'PIN-SHELF',
      name: pinPricing?.name ?? 'Shelf Pin',
      hardwareType: 'shelf_pin',
      quantity: pinCount,
      unitCost: pinPricing?.unit_cost ?? 0.20,
      machiningCost: 0,
      assemblyCost: 0,
      totalCost: (pinPricing?.unit_cost ?? 0.20) * pinCount
    });
  }
  
  // === CONSTRUCTION CONSUMABLES (stage-based screws) ===
  for (const rule of CONSTRUCTION_CONSUMABLES) {
    const pricing = hardwarePricing.find(h =>
      h.name.toLowerCase().includes(rule.match) || h.item_code?.toLowerCase?.() === rule.match
    );
    const unitCost = pricing?.unit_cost ?? rule.fallbackUnitCost;
    items.push({
      itemCode: pricing?.item_code ?? rule.match.replace(/\s+/g, '-'),
      name: pricing?.name ?? rule.name,
      hardwareType: `consumable-${rule.stage}`,
      quantity: rule.qtyPerCabinet,
      unitCost,
      machiningCost: 0,
      assemblyCost: 0,
      totalCost: unitCost * rule.qtyPerCabinet,
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
      totalCost: (template.unitCost * totalQuantity) + totalMachiningCost + totalAssemblyCost
    });
  }
  
  return consolidated;
}
