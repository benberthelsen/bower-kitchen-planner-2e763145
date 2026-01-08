import { PlacedItem, ItemType, CabinetType } from '@/types';
import { ConfiguredCabinet } from '@/contexts/TradeRoomContext';

/**
 * Convert a ConfiguredCabinet to PlacedItem format for snapping calculations
 */
export function cabinetToPlacedItem(
  cabinet: ConfiguredCabinet,
  overridePosition?: { x: number; z: number }
): PlacedItem {
  const cabPos = cabinet.position;
  
  return {
    instanceId: cabinet.instanceId,
    definitionId: cabinet.definitionId,
    itemType: cabinet.category === 'Appliance' ? 'Appliance' : 'Cabinet' as ItemType,
    cabinetNumber: cabinet.cabinetNumber,
    x: overridePosition?.x ?? cabPos?.x ?? 500,
    y: cabPos?.y ?? 0,
    z: overridePosition?.z ?? cabPos?.z ?? 500,
    rotation: cabPos?.rotation ?? 0,
    width: cabinet.dimensions.width,
    depth: cabinet.dimensions.depth,
    height: cabinet.dimensions.height,
  };
}

/**
 * Convert multiple ConfiguredCabinets to PlacedItems
 */
export function cabinetsToPlacedItems(
  cabinets: ConfiguredCabinet[],
  excludeId?: string
): PlacedItem[] {
  return cabinets
    .filter(c => c.isPlaced && c.instanceId !== excludeId && c.position)
    .map(c => cabinetToPlacedItem(c));
}

/**
 * Get category from cabinet type for compatibility
 */
export function getCabinetCategory(cabinet: ConfiguredCabinet): CabinetType | undefined {
  if (cabinet.category === 'Appliance') return undefined;
  return cabinet.category as CabinetType;
}
