import { RoomConfig, PlacedItem, GlobalDimensions, HardwareOptions } from '@/types';
import { DEFAULT_GLOBAL_DIMENSIONS, HINGE_OPTIONS, DRAWER_OPTIONS, HANDLE_OPTIONS } from '@/constants';

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
    endPanelLeft?: boolean;
    endPanelRight?: boolean;
    fillerLeft?: number;
    fillerRight?: number;
  }>;
}

// Default dimensions lookup for sample kitchen items
const DEFAULT_DIMS: Record<string, { width: number; depth: number; height: number; category?: string }> = {
  'base-600-3dr': { width: 600, depth: 575, height: 870, category: 'Base' },
  'base-600-sink': { width: 600, depth: 575, height: 870, category: 'Base' },
  'app-dw-600': { width: 600, depth: 600, height: 850 },
  'base-600-1d': { width: 600, depth: 575, height: 870, category: 'Base' },
  'base-900-lc': { width: 900, depth: 900, height: 870, category: 'Base' },
  'base-600-ov': { width: 600, depth: 575, height: 870, category: 'Base' },
  'tall-600-2d': { width: 600, depth: 600, height: 2200, category: 'Tall' },
  'wall-600-2d': { width: 600, depth: 350, height: 720, category: 'Wall' },
  'wall-600-1d': { width: 600, depth: 350, height: 720, category: 'Wall' },
  'wall-900-rh': { width: 900, depth: 350, height: 720, category: 'Wall' },
  'base-900-2d': { width: 900, depth: 575, height: 870, category: 'Base' },
  'tall-450-1d': { width: 450, depth: 600, height: 2200, category: 'Tall' },
  'wall-900-2d': { width: 900, depth: 350, height: 720, category: 'Wall' },
};

function createPlacedItem(
  preset: {
    definitionId: string;
    x: number;
    z: number;
    rotation: number;
    endPanelLeft?: boolean;
    endPanelRight?: boolean;
    fillerLeft?: number;
    fillerRight?: number;
  },
  index: number,
  globalDimensions: GlobalDimensions,
  room: RoomConfig
): PlacedItem {
  const dims = DEFAULT_DIMS[preset.definitionId] || { width: 600, depth: 575, height: 870, category: 'Base' };

  const width = dims.width;
  let depth = dims.depth;
  let height = dims.height;
  let posY = 0;

  if (dims.category === 'Base') {
    height = globalDimensions.baseHeight + globalDimensions.toeKickHeight;
    depth = globalDimensions.baseDepth;
  } else if (dims.category === 'Wall') {
    height = globalDimensions.wallHeight;
    depth = globalDimensions.wallDepth;
    posY = globalDimensions.toeKickHeight + globalDimensions.baseHeight +
      globalDimensions.benchtopThickness + globalDimensions.splashbackHeight;
  } else if (dims.category === 'Tall') {
    height = globalDimensions.tallHeight;
    depth = globalDimensions.tallDepth;
  }

  const itemType = dims.category === 'Base' || dims.category === 'Wall' || dims.category === 'Tall' ? 'Cabinet' : 'Appliance';

  const normalizedRotation = ((preset.rotation % 360) + 360) % 360;
  const wallGap = globalDimensions.wallGap;

  let x = preset.x;
  let z = preset.z;

  // Auto-align to wall based on rotation
  if (normalizedRotation === 0) {
    z = depth / 2 + wallGap;
  } else if (normalizedRotation === 180) {
    z = room.depth - depth / 2 - wallGap;
  } else if (normalizedRotation === 90) {
    x = room.width - depth / 2 - wallGap;
  } else if (normalizedRotation === 270) {
    x = depth / 2 + wallGap;
  }

  // Clamp inside room bounds
  x = Math.max(width / 2 + wallGap, Math.min(room.width - width / 2 - wallGap, x));
  z = Math.max(depth / 2 + wallGap, Math.min(room.depth - depth / 2 - wallGap, z));

  return {
    instanceId: `sample_${index}_${Math.random().toString(36).substr(2, 6)}`,
    definitionId: preset.definitionId,
    itemType,
    cabinetNumber: itemType === 'Cabinet' ? `C${String(index + 1).padStart(2, '0')}` : undefined,
    x,
    y: posY,
    z,
    rotation: normalizedRotation,
    width,
    depth,
    height,
    hinge: 'Left',
    endPanelLeft: preset.endPanelLeft,
    endPanelRight: preset.endPanelRight,
    fillerLeft: preset.fillerLeft,
    fillerRight: preset.fillerRight,
  };
}

// ── Preset Definitions ──────────────────────────────────────────────

export const SAMPLE_KITCHENS: Record<string, SampleKitchenPreset> = {
  'single-wall': {
    name: 'Single Wall',
    description: 'Compact single wall layout. Great for small apartments or butler pantries.',
    cabinetCount: 7,
    room: { width: 4000, depth: 2500, height: 2400, shape: 'Rectangle', cutoutWidth: 0, cutoutDepth: 0 },
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
      // Base run (rotation 0 = back wall, x = center coords, z auto)
      { definitionId: 'tall-600-2d', x: 310, z: 0, rotation: 0, endPanelLeft: true },
      { definitionId: 'base-600-3dr', x: 910, z: 0, rotation: 0 },
      { definitionId: 'base-600-sink', x: 1510, z: 0, rotation: 0 },
      { definitionId: 'base-600-ov', x: 2110, z: 0, rotation: 0 },
      { definitionId: 'base-600-1d', x: 2710, z: 0, rotation: 0, endPanelRight: true },
      // Wall cabinets above
      { definitionId: 'wall-600-2d', x: 910, z: 0, rotation: 0 },
      { definitionId: 'wall-900-rh', x: 1660, z: 0, rotation: 0 },
    ],
  },

  'l-shaped-basic': {
    name: 'L-Shaped Basic',
    description: 'Classic L-shaped layout with sink, dishwasher, and pantry. Perfect for medium kitchens.',
    cabinetCount: 12,
    room: { width: 4000, depth: 3500, height: 2400, shape: 'LShape', cutoutWidth: 1500, cutoutDepth: 1500 },
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
      // Back wall base run (rotation 0, left→right)
      { definitionId: 'base-600-3dr', x: 310, z: 0, rotation: 0, endPanelLeft: true },
      { definitionId: 'base-600-sink', x: 910, z: 0, rotation: 0 },
      { definitionId: 'app-dw-600', x: 1510, z: 0, rotation: 0 },
      { definitionId: 'base-600-1d', x: 2110, z: 0, rotation: 0 },
      { definitionId: 'base-900-lc', x: 2860, z: 0, rotation: 0 },
      // Right wall base run (rotation 90, z descending = top→bottom)
      { definitionId: 'base-600-ov', x: 0, z: 2540, rotation: 90 },
      { definitionId: 'base-600-3dr', x: 0, z: 1940, rotation: 90 },
      { definitionId: 'tall-600-2d', x: 0, z: 1340, rotation: 90, endPanelRight: true },
      // Wall cabinets (back wall)
      { definitionId: 'wall-600-2d', x: 310, z: 0, rotation: 0 },
      { definitionId: 'wall-600-1d', x: 910, z: 0, rotation: 0 },
      { definitionId: 'wall-900-rh', x: 1660, z: 0, rotation: 0 },
      { definitionId: 'wall-600-2d', x: 2410, z: 0, rotation: 0 },
    ],
  },

  'galley-kitchen': {
    name: 'Galley Kitchen',
    description: 'Efficient parallel layout ideal for narrow spaces. Two wall runs facing each other.',
    cabinetCount: 10,
    room: { width: 4500, depth: 2400, height: 2400, shape: 'Rectangle', cutoutWidth: 0, cutoutDepth: 0 },
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
      // Top wall base run (rotation 0)
      { definitionId: 'tall-600-2d', x: 310, z: 0, rotation: 0, endPanelLeft: true },
      { definitionId: 'base-600-ov', x: 910, z: 0, rotation: 0 },
      { definitionId: 'base-600-3dr', x: 1510, z: 0, rotation: 0 },
      { definitionId: 'base-900-2d', x: 2260, z: 0, rotation: 0, endPanelRight: true },
      // Bottom wall base run (rotation 180)
      { definitionId: 'base-600-sink', x: 310, z: 0, rotation: 180, endPanelLeft: true },
      { definitionId: 'app-dw-600', x: 910, z: 0, rotation: 180 },
      { definitionId: 'base-600-1d', x: 1510, z: 0, rotation: 180 },
      { definitionId: 'base-600-3dr', x: 2110, z: 0, rotation: 180, endPanelRight: true },
      // Wall cabinets (top wall)
      { definitionId: 'wall-600-2d', x: 910, z: 0, rotation: 0 },
      { definitionId: 'wall-900-2d', x: 1660, z: 0, rotation: 0 },
    ],
  },

  'u-shaped-large': {
    name: 'U-Shaped Large',
    description: 'Spacious U-shaped layout with maximum storage and workspace.',
    cabinetCount: 16,
    room: { width: 5000, depth: 4000, height: 2400, shape: 'Rectangle', cutoutWidth: 0, cutoutDepth: 0 },
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
      // Left wall (rotation 270, z ascending = bottom→top)
      { definitionId: 'tall-600-2d', x: 0, z: 310, rotation: 270, endPanelLeft: true },
      { definitionId: 'base-600-ov', x: 0, z: 910, rotation: 270 },
      { definitionId: 'base-600-3dr', x: 0, z: 1510, rotation: 270 },
      { definitionId: 'base-900-lc', x: 0, z: 2260, rotation: 270 },
      // Back wall (rotation 0, left→right)
      { definitionId: 'base-600-3dr', x: 960, z: 0, rotation: 0 },
      { definitionId: 'base-600-sink', x: 1560, z: 0, rotation: 0 },
      { definitionId: 'app-dw-600', x: 2160, z: 0, rotation: 0 },
      { definitionId: 'base-600-1d', x: 2760, z: 0, rotation: 0 },
      { definitionId: 'base-900-lc', x: 3510, z: 0, rotation: 0 },
      // Right wall (rotation 90, z descending = top→bottom)
      { definitionId: 'base-600-3dr', x: 0, z: 2740, rotation: 90 },
      { definitionId: 'base-600-1d', x: 0, z: 2140, rotation: 90 },
      { definitionId: 'tall-450-1d', x: 0, z: 1615, rotation: 90, endPanelRight: true },
      // Wall cabinets (back wall)
      { definitionId: 'wall-600-2d', x: 960, z: 0, rotation: 0 },
      { definitionId: 'wall-600-1d', x: 1560, z: 0, rotation: 0 },
      { definitionId: 'wall-900-rh', x: 2310, z: 0, rotation: 0 },
      { definitionId: 'wall-600-2d', x: 3060, z: 0, rotation: 0 },
    ],
  },
};

// ── Loader ───────────────────────────────────────────────────────────

export function loadSampleKitchen(kitchenId: string): {
  room: RoomConfig;
  items: PlacedItem[];
  globalDimensions: GlobalDimensions;
  hardwareOptions: HardwareOptions;
} | null {
  const preset = SAMPLE_KITCHENS[kitchenId];
  if (!preset) return null;

  const items = preset.items.map((item, index) =>
    createPlacedItem(item, index, preset.globalDimensions, preset.room)
  );

  return {
    room: preset.room,
    items,
    globalDimensions: preset.globalDimensions,
    hardwareOptions: preset.hardwareOptions,
  };
}
