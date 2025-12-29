import { RoomConfig, PlacedItem, GlobalDimensions, HardwareOptions } from '@/types';
import { CATALOG, DEFAULT_GLOBAL_DIMENSIONS, HINGE_OPTIONS, DRAWER_OPTIONS, HANDLE_OPTIONS } from '@/constants';

export interface SampleKitchenPreset {
  name: string;
  description: string;
  cabinetCount: number;
  room: RoomConfig;
  globalDimensions: GlobalDimensions;
  hardwareOptions: HardwareOptions;
  items: Array<{
    definitionId: string;
    x: number;
    z: number;
    rotation: number;
  }>;
}

function createPlacedItem(
  preset: { definitionId: string; x: number; z: number; rotation: number },
  index: number,
  globalDimensions: GlobalDimensions
): PlacedItem {
  const def = CATALOG.find(c => c.id === preset.definitionId);
  if (!def) {
    throw new Error(`Cabinet definition not found: ${preset.definitionId}`);
  }

  let width = def.defaultWidth;
  let depth = def.defaultDepth;
  let height = def.defaultHeight;
  let posY = 0;

  if (def.itemType === 'Cabinet') {
    if (def.category === 'Base') {
      height = globalDimensions.baseHeight + globalDimensions.toeKickHeight;
      depth = globalDimensions.baseDepth;
    } else if (def.category === 'Wall') {
      height = globalDimensions.wallHeight;
      depth = globalDimensions.wallDepth;
      posY = globalDimensions.toeKickHeight + globalDimensions.baseHeight + 
             globalDimensions.benchtopThickness + globalDimensions.splashbackHeight;
    } else if (def.category === 'Tall') {
      height = globalDimensions.tallHeight;
      depth = globalDimensions.tallDepth;
    }
  }

  return {
    instanceId: `sample_${index}_${Math.random().toString(36).substr(2, 6)}`,
    definitionId: def.id,
    itemType: def.itemType,
    cabinetNumber: def.itemType === 'Cabinet' ? `C${String(index + 1).padStart(2, '0')}` : undefined,
    x: preset.x,
    y: posY,
    z: preset.z,
    rotation: preset.rotation,
    width,
    depth,
    height,
    hinge: 'Left',
  };
}

export const SAMPLE_KITCHENS: Record<string, SampleKitchenPreset> = {
  'l-shaped-basic': {
    name: 'L-Shaped Basic',
    description: 'Classic L-shaped layout with sink, dishwasher, and pantry. Perfect for medium kitchens.',
    cabinetCount: 12,
    room: { 
      width: 4000, 
      depth: 3500, 
      height: 2400, 
      shape: 'LShape', 
      cutoutWidth: 1500, 
      cutoutDepth: 1500 
    },
    globalDimensions: DEFAULT_GLOBAL_DIMENSIONS,
    hardwareOptions: {
      hingeType: HINGE_OPTIONS[0],
      drawerType: DRAWER_OPTIONS[0],
      cabinetTop: 'Rail On Flat',
      supplyHardware: true,
      adjustableLegs: true,
      handleId: HANDLE_OPTIONS[0].id,
    },
    items: [
      // Back wall - Base cabinets (left to right)
      { definitionId: 'base-600-3dr', x: 400, z: 3200, rotation: 0 },
      { definitionId: 'base-600-sink', x: 1050, z: 3200, rotation: 0 },
      { definitionId: 'app-dw-600', x: 1700, z: 3200, rotation: 0 },
      { definitionId: 'base-600-1d', x: 2350, z: 3200, rotation: 0 },
      { definitionId: 'base-900-lc', x: 3150, z: 3150, rotation: 0 },
      
      // Right wall - Base cabinets (top to bottom)
      { definitionId: 'base-600-ov', x: 3700, z: 2500, rotation: 90 },
      { definitionId: 'base-600-3dr', x: 3700, z: 1850, rotation: 90 },
      { definitionId: 'tall-600-2d', x: 3700, z: 1100, rotation: 90 },
      
      // Back wall - Wall cabinets
      { definitionId: 'wall-600-2d', x: 400, z: 3200, rotation: 0 },
      { definitionId: 'wall-600-1d', x: 1050, z: 3200, rotation: 0 },
      { definitionId: 'wall-900-rh', x: 2000, z: 3200, rotation: 0 },
      { definitionId: 'wall-600-2d', x: 2750, z: 3200, rotation: 0 },
    ],
  },
  
  'galley-kitchen': {
    name: 'Galley Kitchen',
    description: 'Efficient parallel layout ideal for narrow spaces. Two wall runs facing each other.',
    cabinetCount: 10,
    room: { 
      width: 4500, 
      depth: 2400, 
      height: 2400, 
      shape: 'Rectangle', 
      cutoutWidth: 0, 
      cutoutDepth: 0 
    },
    globalDimensions: DEFAULT_GLOBAL_DIMENSIONS,
    hardwareOptions: {
      hingeType: HINGE_OPTIONS[0],
      drawerType: DRAWER_OPTIONS[1],
      cabinetTop: 'Rail On Flat',
      supplyHardware: true,
      adjustableLegs: true,
      handleId: HANDLE_OPTIONS[1].id,
    },
    items: [
      // Top wall - Base cabinets
      { definitionId: 'tall-600-2d', x: 400, z: 2100, rotation: 0 },
      { definitionId: 'base-600-ov', x: 1050, z: 2100, rotation: 0 },
      { definitionId: 'base-600-3dr', x: 1700, z: 2100, rotation: 0 },
      { definitionId: 'base-900-2d', x: 2500, z: 2100, rotation: 0 },
      
      // Bottom wall - Base cabinets  
      { definitionId: 'base-600-sink', x: 800, z: 400, rotation: 180 },
      { definitionId: 'app-dw-600', x: 1450, z: 400, rotation: 180 },
      { definitionId: 'base-600-1d', x: 2100, z: 400, rotation: 180 },
      { definitionId: 'base-600-3dr', x: 2750, z: 400, rotation: 180 },
      
      // Wall cabinets - Top wall
      { definitionId: 'wall-600-2d', x: 1050, z: 2100, rotation: 0 },
      { definitionId: 'wall-900-2d', x: 1850, z: 2100, rotation: 0 },
    ],
  },
  
  'u-shaped-large': {
    name: 'U-Shaped Large',
    description: 'Spacious U-shaped layout with island potential. Maximum storage and workspace.',
    cabinetCount: 16,
    room: { 
      width: 5000, 
      depth: 4000, 
      height: 2400, 
      shape: 'Rectangle', 
      cutoutWidth: 0, 
      cutoutDepth: 0 
    },
    globalDimensions: DEFAULT_GLOBAL_DIMENSIONS,
    hardwareOptions: {
      hingeType: HINGE_OPTIONS[0],
      drawerType: DRAWER_OPTIONS[0],
      cabinetTop: 'Rail On Flat',
      supplyHardware: true,
      adjustableLegs: true,
      handleId: HANDLE_OPTIONS[0].id,
    },
    items: [
      // Left wall - Base cabinets (bottom to top)
      { definitionId: 'tall-600-2d', x: 400, z: 600, rotation: 270 },
      { definitionId: 'base-600-ov', x: 400, z: 1300, rotation: 270 },
      { definitionId: 'base-600-3dr', x: 400, z: 1950, rotation: 270 },
      { definitionId: 'base-900-lc', x: 550, z: 2800, rotation: 270 },
      
      // Back wall - Base cabinets (left to right)
      { definitionId: 'base-600-3dr', x: 1100, z: 3700, rotation: 0 },
      { definitionId: 'base-600-sink', x: 1750, z: 3700, rotation: 0 },
      { definitionId: 'app-dw-600', x: 2400, z: 3700, rotation: 0 },
      { definitionId: 'base-600-1d', x: 3050, z: 3700, rotation: 0 },
      { definitionId: 'base-900-lc', x: 3850, z: 3550, rotation: 0 },
      
      // Right wall - Base cabinets (top to bottom)
      { definitionId: 'base-600-3dr', x: 4700, z: 2900, rotation: 90 },
      { definitionId: 'base-600-1d', x: 4700, z: 2250, rotation: 90 },
      { definitionId: 'tall-450-1d', x: 4700, z: 1500, rotation: 90 },
      
      // Wall cabinets - Back wall
      { definitionId: 'wall-600-2d', x: 1100, z: 3700, rotation: 0 },
      { definitionId: 'wall-600-1d', x: 1750, z: 3700, rotation: 0 },
      { definitionId: 'wall-900-rh', x: 2550, z: 3700, rotation: 0 },
      { definitionId: 'wall-600-2d', x: 3300, z: 3700, rotation: 0 },
    ],
  },
  
  'single-wall': {
    name: 'Single Wall',
    description: 'Compact single wall layout. Great for small apartments or butler pantries.',
    cabinetCount: 7,
    room: { 
      width: 4000, 
      depth: 2500, 
      height: 2400, 
      shape: 'Rectangle', 
      cutoutWidth: 0, 
      cutoutDepth: 0 
    },
    globalDimensions: DEFAULT_GLOBAL_DIMENSIONS,
    hardwareOptions: {
      hingeType: HINGE_OPTIONS[0],
      drawerType: DRAWER_OPTIONS[0],
      cabinetTop: 'Rail On Flat',
      supplyHardware: true,
      adjustableLegs: true,
      handleId: HANDLE_OPTIONS[0].id,
    },
    items: [
      // Back wall - Base cabinets
      { definitionId: 'tall-600-2d', x: 400, z: 2200, rotation: 0 },
      { definitionId: 'base-600-3dr', x: 1050, z: 2200, rotation: 0 },
      { definitionId: 'base-600-sink', x: 1700, z: 2200, rotation: 0 },
      { definitionId: 'base-600-ov', x: 2350, z: 2200, rotation: 0 },
      { definitionId: 'base-600-1d', x: 3000, z: 2200, rotation: 0 },
      
      // Wall cabinets
      { definitionId: 'wall-600-2d', x: 1050, z: 2200, rotation: 0 },
      { definitionId: 'wall-900-rh', x: 1850, z: 2200, rotation: 0 },
    ],
  },
};

export function loadSampleKitchen(kitchenId: string): {
  room: RoomConfig;
  items: PlacedItem[];
  globalDimensions: GlobalDimensions;
  hardwareOptions: HardwareOptions;
} | null {
  const preset = SAMPLE_KITCHENS[kitchenId];
  if (!preset) return null;

  const items = preset.items.map((item, index) => 
    createPlacedItem(item, index, preset.globalDimensions)
  );

  return {
    room: preset.room,
    items,
    globalDimensions: preset.globalDimensions,
    hardwareOptions: preset.hardwareOptions,
  };
}
