/**
 * Microvellum Construction Recipe System
 * Defines how cabinets should be constructed based on product name patterns
 */

// ============= TYPE DEFINITIONS =============

export type FrontType = 'DOORS' | 'DRAWERS' | 'COMBO' | 'SINK' | 'CORNER' | 'OPEN' | 'APPLIANCE_OPENING';
export type CornerRenderType = 'L_ARMS' | 'BLIND_EXTENSION' | 'DIAGONAL_FRONT_45';

export interface CarcassRecipe {
  hasBottomPanel: boolean;
  hasTopPanel: boolean;       // Usually only for Wall cabinets
  gableThickness: number;     // mm - typically 18
  backPanelThickness: number; // mm - typically 3
  backPanelSetback: number;   // mm - typically 18 from rear
}

export interface ShelvesRecipe {
  count: number;
  adjustable: boolean;
  thickness: number;          // mm - typically 18
  setback: number;            // mm from front
}

export interface ToeKickRecipe {
  enabled: boolean;
  height: number;             // mm - typically 135
  setback: number;            // mm - typically 50
  kickboardThickness: number; // mm - typically 16
  legCount: number;           // 4 or 6 depending on width
}

export interface DoorsRecipe {
  doorCount: 1 | 2;
  glassDoor: boolean;
  overlay: 'full' | 'half';
  gap: number;                // mm - typically 2
}

export interface DrawersRecipe {
  drawerCount: number;
  ratios?: number[];          // Height ratios for each drawer (from top)
  gap: number;                // mm - typically 2
  showBox: boolean;           // Whether to render internal drawer box
}

export interface ComboRecipe {
  topDrawers: number;         // Number of drawers at top
  bottomDoors: number;        // Number of doors at bottom (1 or 2)
  dividerThickness: number;   // mm - typically 18
}

export interface SinkRecipe {
  hasFalseFront: boolean;
  falseFrontHeight: number;   // mm - typically 80
  doorCount: 1 | 2;
}

export interface CornerRecipe {
  render: CornerRenderType;
  blindSide?: 'left' | 'right';
  blindDepth?: number;        // mm
  fillerWidth?: number;       // mm
  leftArmDepth?: number;      // mm for L-shape
  rightArmDepth?: number;     // mm for L-shape
}

export interface ApplianceOpeningRecipe {
  hasTopDrawer: boolean;
  topDrawerHeight?: number;   // mm
  openingHeight?: number;     // mm
}

export interface BenchtopRecipe {
  enabled: boolean;
  thickness: number;          // mm - typically 20
  frontOverhang: number;      // mm - typically 20
  sideOverhang: number;       // mm
}

export interface ConstructionRecipe {
  category: 'Base' | 'Wall' | 'Tall' | 'Accessory';
  carcass: CarcassRecipe;
  shelves: ShelvesRecipe;
  toeKick: ToeKickRecipe;
  fronts: {
    type: FrontType;
    doors?: DoorsRecipe;
    drawers?: DrawersRecipe;
    combo?: ComboRecipe;
    sink?: SinkRecipe;
    corner?: CornerRecipe;
    applianceOpening?: ApplianceOpeningRecipe;
  };
  benchtop: BenchtopRecipe;
}

// ============= RECIPE MAP =============

export const MV_CONSTRUCTION_RECIPES: Record<string, ConstructionRecipe> = {
  // ============= BASE CABINETS =============
  
  // Standard base with door(s)
  'Base 1 Door': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  'Base 2 Door': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'DOORS', doors: { doorCount: 2, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  // Drawer bases
  'Base 3 Drawer': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 3, ratios: [0.25, 0.33, 0.42], gap: 2, showBox: true } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  'Base 4 Drawer': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 6 },
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 4, ratios: [0.18, 0.24, 0.28, 0.30], gap: 2, showBox: true } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  // Combo cabinets (drawers + doors)
  'Base 1 Drawer 1 Door': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'COMBO', combo: { topDrawers: 1, bottomDoors: 1, dividerThickness: 18 } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  'Base 1 Drawer 2 Door': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'COMBO', combo: { topDrawers: 1, bottomDoors: 2, dividerThickness: 18 } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  'Base 2 Drawer 2 Door': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'COMBO', combo: { topDrawers: 2, bottomDoors: 2, dividerThickness: 18 } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  // Sink cabinets
  'Base Sink 1 Door': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'SINK', sink: { hasFalseFront: false, falseFrontHeight: 80, doorCount: 1 } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  'Base Sink 2 Door': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'SINK', sink: { hasFalseFront: false, falseFrontHeight: 80, doorCount: 2 } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  'Base Sink False Front 2 Door': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'SINK', sink: { hasFalseFront: true, falseFrontHeight: 80, doorCount: 2 } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  // Corner cabinets - Blind
  'Base Blind Corner Left': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'CORNER', corner: { render: 'BLIND_EXTENSION', blindSide: 'left', blindDepth: 150, fillerWidth: 75 } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  'Base Blind Corner Right': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'CORNER', corner: { render: 'BLIND_EXTENSION', blindSide: 'right', blindDepth: 150, fillerWidth: 75 } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  // Corner cabinets - L-Shape
  'Base L Corner': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 6 },
    fronts: { type: 'CORNER', corner: { render: 'L_ARMS', leftArmDepth: 575, rightArmDepth: 575 } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  // Corner cabinets - Diagonal
  'Base Diagonal Corner': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'CORNER', corner: { render: 'DIAGONAL_FRONT_45' } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  // Appliance openings
  'Base Dishwasher': {
    category: 'Base',
    carcass: { hasBottomPanel: false, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: false } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  'Base Microwave': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: true, topDrawerHeight: 180 } },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  // Open shelf base
  'Base Open Shelf': {
    category: 'Base',
    carcass: { hasBottomPanel: true, hasTopPanel: false, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'OPEN' },
    benchtop: { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 },
  },
  
  // ============= WALL CABINETS =============
  
  'Upper 1 Door': {
    category: 'Wall',
    carcass: { hasBottomPanel: true, hasTopPanel: true, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: { enabled: false, height: 0, setback: 0, kickboardThickness: 0, legCount: 0 },
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: { enabled: false, thickness: 0, frontOverhang: 0, sideOverhang: 0 },
  },
  
  'Upper 2 Door': {
    category: 'Wall',
    carcass: { hasBottomPanel: true, hasTopPanel: true, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: { enabled: false, height: 0, setback: 0, kickboardThickness: 0, legCount: 0 },
    fronts: { type: 'DOORS', doors: { doorCount: 2, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: { enabled: false, thickness: 0, frontOverhang: 0, sideOverhang: 0 },
  },
  
  'Upper Glass Door': {
    category: 'Wall',
    carcass: { hasBottomPanel: true, hasTopPanel: true, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: { enabled: false, height: 0, setback: 0, kickboardThickness: 0, legCount: 0 },
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: true, overlay: 'full', gap: 2 } },
    benchtop: { enabled: false, thickness: 0, frontOverhang: 0, sideOverhang: 0 },
  },
  
  'Upper Blind Corner Left': {
    category: 'Wall',
    carcass: { hasBottomPanel: true, hasTopPanel: true, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: { enabled: false, height: 0, setback: 0, kickboardThickness: 0, legCount: 0 },
    fronts: { type: 'CORNER', corner: { render: 'BLIND_EXTENSION', blindSide: 'left', blindDepth: 100, fillerWidth: 50 } },
    benchtop: { enabled: false, thickness: 0, frontOverhang: 0, sideOverhang: 0 },
  },
  
  'Upper Diagonal Corner': {
    category: 'Wall',
    carcass: { hasBottomPanel: true, hasTopPanel: true, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: { enabled: false, height: 0, setback: 0, kickboardThickness: 0, legCount: 0 },
    fronts: { type: 'CORNER', corner: { render: 'DIAGONAL_FRONT_45' } },
    benchtop: { enabled: false, thickness: 0, frontOverhang: 0, sideOverhang: 0 },
  },
  
  'Upper Open Shelf': {
    category: 'Wall',
    carcass: { hasBottomPanel: true, hasTopPanel: true, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: { enabled: false, height: 0, setback: 0, kickboardThickness: 0, legCount: 0 },
    fronts: { type: 'OPEN' },
    benchtop: { enabled: false, thickness: 0, frontOverhang: 0, sideOverhang: 0 },
  },
  
  'Upper Rangehood': {
    category: 'Wall',
    carcass: { hasBottomPanel: false, hasTopPanel: true, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 10 },
    toeKick: { enabled: false, height: 0, setback: 0, kickboardThickness: 0, legCount: 0 },
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: false } },
    benchtop: { enabled: false, thickness: 0, frontOverhang: 0, sideOverhang: 0 },
  },
  
  // ============= TALL CABINETS =============
  
  'Tall Pantry 2 Door': {
    category: 'Tall',
    carcass: { hasBottomPanel: true, hasTopPanel: true, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 5, adjustable: true, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'DOORS', doors: { doorCount: 2, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: { enabled: false, thickness: 0, frontOverhang: 0, sideOverhang: 0 },
  },
  
  'Tall Oven Tower': {
    category: 'Tall',
    carcass: { hasBottomPanel: true, hasTopPanel: true, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: true, topDrawerHeight: 200, openingHeight: 600 } },
    benchtop: { enabled: false, thickness: 0, frontOverhang: 0, sideOverhang: 0 },
  },
  
  'Tall Broom': {
    category: 'Tall',
    carcass: { hasBottomPanel: true, hasTopPanel: true, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 },
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: { enabled: false, thickness: 0, frontOverhang: 0, sideOverhang: 0 },
  },
  
  'Tall Fridge': {
    category: 'Tall',
    carcass: { hasBottomPanel: false, hasTopPanel: true, gableThickness: 18, backPanelThickness: 3, backPanelSetback: 18 },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: { enabled: false, height: 0, setback: 0, kickboardThickness: 0, legCount: 0 },
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: false } },
    benchtop: { enabled: false, thickness: 0, frontOverhang: 0, sideOverhang: 0 },
  },
};

// ============= RECIPE LOOKUP FUNCTION =============

/**
 * Get construction recipe for a product by name
 * Uses fuzzy matching to find the best recipe
 */
export function getConstructionRecipe(
  productName: string,
  recipes: Record<string, ConstructionRecipe> = MV_CONSTRUCTION_RECIPES
): ConstructionRecipe | null {
  // Normalize product name
  const normalizedName = productName.toLowerCase().trim();
  
  // 1. Try exact match first
  for (const [key, recipe] of Object.entries(recipes)) {
    if (key.toLowerCase() === normalizedName) {
      return recipe;
    }
  }
  
  // 2. Try partial match
  for (const [key, recipe] of Object.entries(recipes)) {
    if (normalizedName.includes(key.toLowerCase())) {
      return recipe;
    }
  }
  
  // 3. Pattern-based matching
  return getRecipeFromPatterns(normalizedName);
}

/**
 * Generate a recipe based on name patterns when no exact match is found
 */
function getRecipeFromPatterns(name: string): ConstructionRecipe {
  const isBase = name.includes('base') || (!name.includes('upper') && !name.includes('wall') && !name.includes('tall'));
  const isWall = name.includes('upper') || name.includes('wall');
  const isTall = name.includes('tall') || name.includes('pantry') || name.includes('oven') || name.includes('broom');
  
  // Detect front type
  const hasSink = name.includes('sink');
  const hasCorner = name.includes('corner') || name.includes('blind') || name.includes('diagonal');
  const hasDrawer = name.includes('drawer') || name.includes('dr');
  const hasDoor = name.includes('door') || name.includes('d ') || name.endsWith(' d');
  const isOpen = name.includes('open') || name.includes('shelf');
  const isAppliance = name.includes('dishwasher') || name.includes('fridge') || name.includes('oven') || 
                      name.includes('rangehood') || name.includes('microwave');
  
  // Count doors/drawers from name
  const doorMatch = name.match(/(\d+)\s*(?:door|d\b)/i);
  const drawerMatch = name.match(/(\d+)\s*(?:drawer|dr)/i);
  const doorCount = doorMatch ? parseInt(doorMatch[1]) as 1 | 2 : (hasDoor ? 1 : 0);
  const drawerCount = drawerMatch ? parseInt(drawerMatch[1]) : (hasDrawer ? 3 : 0);
  
  // Determine category
  const category: 'Base' | 'Wall' | 'Tall' | 'Accessory' = isTall ? 'Tall' : isWall ? 'Wall' : 'Base';
  
  // Determine front type
  let frontType: FrontType = 'DOORS';
  if (hasSink) frontType = 'SINK';
  else if (hasCorner) frontType = 'CORNER';
  else if (isAppliance) frontType = 'APPLIANCE_OPENING';
  else if (isOpen) frontType = 'OPEN';
  else if (hasDrawer && hasDoor) frontType = 'COMBO';
  else if (hasDrawer && !hasDoor) frontType = 'DRAWERS';
  
  // Build recipe
  const recipe: ConstructionRecipe = {
    category,
    carcass: {
      hasBottomPanel: !isAppliance || !name.includes('dishwasher'),
      hasTopPanel: category === 'Wall' || category === 'Tall',
      gableThickness: 18,
      backPanelThickness: 3,
      backPanelSetback: 18,
    },
    shelves: {
      count: category === 'Tall' ? 5 : category === 'Wall' ? 2 : 1,
      adjustable: !hasDrawer && !isAppliance,
      thickness: 18,
      setback: category === 'Wall' ? 10 : 20,
    },
    toeKick: {
      enabled: category !== 'Wall' && !name.includes('fridge'),
      height: 135,
      setback: 50,
      kickboardThickness: 16,
      legCount: 4,
    },
    fronts: { type: frontType },
    benchtop: {
      enabled: category === 'Base',
      thickness: 20,
      frontOverhang: 20,
      sideOverhang: 0,
    },
  };
  
  // Add front-specific config
  switch (frontType) {
    case 'DOORS':
      recipe.fronts.doors = {
        doorCount: (doorCount || 1) as 1 | 2,
        glassDoor: name.includes('glass'),
        overlay: 'full',
        gap: 2,
      };
      break;
    case 'DRAWERS':
      recipe.fronts.drawers = {
        drawerCount: drawerCount || 3,
        ratios: getDrawerRatios(drawerCount || 3),
        gap: 2,
        showBox: true,
      };
      recipe.shelves.count = 0;
      break;
    case 'COMBO':
      recipe.fronts.combo = {
        topDrawers: drawerCount || 1,
        bottomDoors: (doorCount || 2) as 1 | 2,
        dividerThickness: 18,
      };
      break;
    case 'SINK':
      recipe.fronts.sink = {
        hasFalseFront: name.includes('false'),
        falseFrontHeight: 80,
        doorCount: (doorCount || 2) as 1 | 2,
      };
      recipe.shelves.count = 0;
      break;
    case 'CORNER':
      recipe.fronts.corner = {
        render: name.includes('blind') ? 'BLIND_EXTENSION' : 
                name.includes('diagonal') ? 'DIAGONAL_FRONT_45' : 'L_ARMS',
        blindSide: name.includes('left') ? 'left' : 'right',
        blindDepth: 150,
        fillerWidth: 75,
        leftArmDepth: 575,
        rightArmDepth: 575,
      };
      break;
    case 'APPLIANCE_OPENING':
      recipe.fronts.applianceOpening = {
        hasTopDrawer: name.includes('microwave'),
        topDrawerHeight: 180,
      };
      recipe.shelves.count = 0;
      break;
    case 'OPEN':
      recipe.shelves.count = 2;
      break;
  }
  
  return recipe;
}

/**
 * Get drawer height ratios based on count
 */
function getDrawerRatios(count: number): number[] {
  const distributions: Record<number, number[]> = {
    1: [1.0],
    2: [0.40, 0.60],
    3: [0.25, 0.33, 0.42],
    4: [0.18, 0.24, 0.28, 0.30],
    5: [0.14, 0.18, 0.22, 0.22, 0.24],
  };
  return distributions[count] || Array(count).fill(1 / count);
}

/**
 * Merge a recipe with overrides from database
 */
export function mergeRecipeWithOverrides(
  recipe: ConstructionRecipe,
  overrides: Partial<{
    doorCount: number;
    drawerCount: number;
    shelfCount: number;
    hasFalseFront: boolean;
    cornerType: string;
    blindSide: string;
    leftArmDepth: number;
    rightArmDepth: number;
    blindDepth: number;
    fillerWidth: number;
  }>
): ConstructionRecipe {
  const merged = { ...recipe };
  
  // Merge shelf count
  if (overrides.shelfCount !== undefined) {
    merged.shelves = { ...merged.shelves, count: overrides.shelfCount };
  }
  
  // Merge door count
  if (overrides.doorCount !== undefined && merged.fronts.doors) {
    merged.fronts.doors = { ...merged.fronts.doors, doorCount: overrides.doorCount as 1 | 2 };
  }
  
  // Merge drawer count
  if (overrides.drawerCount !== undefined && merged.fronts.drawers) {
    merged.fronts.drawers = { 
      ...merged.fronts.drawers, 
      drawerCount: overrides.drawerCount,
      ratios: getDrawerRatios(overrides.drawerCount),
    };
  }
  
  // Merge sink config
  if (overrides.hasFalseFront !== undefined && merged.fronts.sink) {
    merged.fronts.sink = { ...merged.fronts.sink, hasFalseFront: overrides.hasFalseFront };
  }
  
  // Merge corner config
  if (merged.fronts.corner) {
    if (overrides.cornerType) {
      const renderMap: Record<string, CornerRenderType> = {
        'blind': 'BLIND_EXTENSION',
        'diagonal': 'DIAGONAL_FRONT_45',
        'l-shape': 'L_ARMS',
      };
      merged.fronts.corner.render = renderMap[overrides.cornerType] || merged.fronts.corner.render;
    }
    if (overrides.blindSide) {
      merged.fronts.corner.blindSide = overrides.blindSide as 'left' | 'right';
    }
    if (overrides.leftArmDepth) merged.fronts.corner.leftArmDepth = overrides.leftArmDepth;
    if (overrides.rightArmDepth) merged.fronts.corner.rightArmDepth = overrides.rightArmDepth;
    if (overrides.blindDepth) merged.fronts.corner.blindDepth = overrides.blindDepth;
    if (overrides.fillerWidth) merged.fronts.corner.fillerWidth = overrides.fillerWidth;
  }
  
  return merged;
}
