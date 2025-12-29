// Cabinet to parts mapping - defines which parts each cabinet type requires

import { CabinetConfig } from './types';

interface PartRequirement {
  partType: string;
  quantity: number | 'perDoor' | 'perDrawer' | 'perShelf';
}

interface CabinetPartDefinition {
  config: CabinetConfig;
  parts: PartRequirement[];
}

// Map cabinet definition IDs to their part requirements
export const CABINET_PART_MAP: Record<string, CabinetPartDefinition> = {
  // Base cabinets - single door
  'base-300-1d': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 1, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'base-450-1d': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 1, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'base-600-1d': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 1, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  
  // Base cabinets - double door
  'base-800-2d': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 1, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'base-900-2d': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 1, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  
  // Base cabinets - drawers
  'base-450-4dr': {
    config: { numDoors: 0, numDrawers: 4, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Back', quantity: 'perDrawer' },
      { partType: 'Drawer Box Bottom', quantity: 'perDrawer' },
    ]
  },
  'base-600-2dr': {
    config: { numDoors: 0, numDrawers: 2, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Back', quantity: 'perDrawer' },
      { partType: 'Drawer Box Bottom', quantity: 'perDrawer' },
    ]
  },
  'base-600-3dr': {
    config: { numDoors: 0, numDrawers: 3, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Back', quantity: 'perDrawer' },
      { partType: 'Drawer Box Bottom', quantity: 'perDrawer' },
    ]
  },
  'base-900-3dr': {
    config: { numDoors: 0, numDrawers: 3, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Back', quantity: 'perDrawer' },
      { partType: 'Drawer Box Bottom', quantity: 'perDrawer' },
    ]
  },
  
  // Base cabinets - special
  'base-150-po': {
    config: { numDoors: 0, numDrawers: 0, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
    ]
  },
  'base-600-ov': {
    config: { numDoors: 0, numDrawers: 1, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Back', quantity: 'perDrawer' },
      { partType: 'Drawer Box Bottom', quantity: 'perDrawer' },
    ]
  },
  
  // Sink cabinets
  'base-600-sink': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 0, hasSides: true, hasBack: true, hasBottom: false, hasTop: false, hasRails: true, isSinkCabinet: true, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
    ]
  },
  'base-900-sink': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 0, hasSides: true, hasBack: true, hasBottom: false, hasTop: false, hasRails: true, isSinkCabinet: true, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
    ]
  },
  
  // Corner cabinets
  'base-1000-bc': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 1, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: true },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'base-900-lc': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 1, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: true, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 2 },
      { partType: 'Base Front Rail', quantity: 2 },
      { partType: 'Base Rear Rail', quantity: 2 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  
  // Wall cabinets
  'wall-300-1d': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 2, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'wall-450-1d': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 2, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'wall-600-1d': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 2, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'wall-600-2d': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 2, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'wall-800-2d': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 2, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'wall-900-2d': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 2, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'wall-600-rh': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
    ]
  },
  'wall-900-rh': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
    ]
  },
  
  // Tall cabinets
  'tall-450-1d': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 5, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Tall Left Side', quantity: 1 },
      { partType: 'Tall Right Side', quantity: 1 },
      { partType: 'Tall Top', quantity: 1 },
      { partType: 'Tall Bottom', quantity: 1 },
      { partType: 'Tall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'tall-600-2d': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 5, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Tall Left Side', quantity: 1 },
      { partType: 'Tall Right Side', quantity: 1 },
      { partType: 'Tall Top', quantity: 1 },
      { partType: 'Tall Bottom', quantity: 1 },
      { partType: 'Tall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'tall-600-ov': {
    config: { numDoors: 2, numDrawers: 1, numShelves: 2, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Tall Left Side', quantity: 1 },
      { partType: 'Tall Right Side', quantity: 1 },
      { partType: 'Tall Top', quantity: 1 },
      { partType: 'Tall Bottom', quantity: 1 },
      { partType: 'Tall Back', quantity: 1 },
      { partType: 'Fixed Shelf', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Back', quantity: 'perDrawer' },
      { partType: 'Drawer Box Bottom', quantity: 'perDrawer' },
    ]
  },
  'tall-1000-ref': {
    config: { numDoors: 0, numDrawers: 0, numShelves: 0, hasSides: true, hasBack: false, hasBottom: false, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Tall Left Side', quantity: 1 },
      { partType: 'Tall Right Side', quantity: 1 },
      { partType: 'Tall Top', quantity: 1 },
    ]
  },
};

/**
 * Get the cabinet configuration and part list for a cabinet definition ID
 */
export function getCabinetPartMapping(definitionId: string): CabinetPartDefinition | null {
  return CABINET_PART_MAP[definitionId] || null;
}

/**
 * Calculate actual part quantities based on cabinet configuration
 */
export function getPartQuantities(
  parts: PartRequirement[],
  config: CabinetConfig
): Array<{ partType: string; quantity: number }> {
  const result: Array<{ partType: string; quantity: number }> = [];
  
  // Group parts by type to combine quantities
  const partMap = new Map<string, number>();
  
  for (const part of parts) {
    let qty: number;
    
    if (typeof part.quantity === 'number') {
      qty = part.quantity;
    } else if (part.quantity === 'perDoor') {
      qty = config.numDoors;
    } else if (part.quantity === 'perDrawer') {
      qty = config.numDrawers;
    } else if (part.quantity === 'perShelf') {
      qty = config.numShelves;
    } else {
      qty = 1;
    }
    
    if (qty > 0) {
      const existing = partMap.get(part.partType) || 0;
      partMap.set(part.partType, existing + qty);
    }
  }
  
  for (const [partType, quantity] of partMap) {
    result.push({ partType, quantity });
  }
  
  return result;
}
