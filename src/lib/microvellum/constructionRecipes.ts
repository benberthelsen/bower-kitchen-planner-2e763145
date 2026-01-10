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
  backPanelSetback: number;   // mm - typically 16 from rear (for hanging rails)
  
  // Reveals & Gaps (Microvellum Phase 6)
  topReveal: number;          // mm - gap from carcass top to door (typically 3)
  bottomReveal: number;       // mm - gap from carcass bottom to door (typically 2)
  sideReveal: number;         // mm - gap from gable to door edge (typically 2)
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

// ============= RECIPE HELPERS =============

// Standard reveal values (Microvellum defaults)
const STANDARD_REVEALS = {
  topReveal: 3,      // 3mm gap above doors
  bottomReveal: 2,   // 2mm gap below doors
  sideReveal: 2,     // 2mm gap beside doors
};

// Base carcass: bottom panel, no top panel, 16mm back setback for hanging rails
const BASE_CARCASS: CarcassRecipe = { 
  hasBottomPanel: true, 
  hasTopPanel: false, 
  gableThickness: 18, 
  backPanelThickness: 3, 
  backPanelSetback: 16,
  ...STANDARD_REVEALS,
};

// Wall carcass: both bottom and top panels, standard reveals
const WALL_CARCASS: CarcassRecipe = { 
  hasBottomPanel: true, 
  hasTopPanel: true, 
  gableThickness: 18, 
  backPanelThickness: 3, 
  backPanelSetback: 16,
  ...STANDARD_REVEALS,
};

// Tall carcass: both panels, slightly larger top reveal for tall doors
const TALL_CARCASS: CarcassRecipe = { 
  hasBottomPanel: true, 
  hasTopPanel: true, 
  gableThickness: 18, 
  backPanelThickness: 3, 
  backPanelSetback: 16,
  topReveal: 3,
  bottomReveal: 2,
  sideReveal: 2,
};

const BASE_TOEKICK: ToeKickRecipe = { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 4 };
const WIDE_TOEKICK: ToeKickRecipe = { enabled: true, height: 135, setback: 50, kickboardThickness: 16, legCount: 6 };
const NO_TOEKICK: ToeKickRecipe = { enabled: false, height: 0, setback: 0, kickboardThickness: 0, legCount: 0 };
const BASE_BENCHTOP: BenchtopRecipe = { enabled: true, thickness: 20, frontOverhang: 20, sideOverhang: 0 };
const NO_BENCHTOP: BenchtopRecipe = { enabled: false, thickness: 0, frontOverhang: 0, sideOverhang: 0 };

// ============= RECIPE MAP =============

export const MV_CONSTRUCTION_RECIPES: Record<string, ConstructionRecipe> = {
  // ============= BASE CABINETS - DOOR ONLY =============
  
  'Base 1 Door': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 1 Door No Bottom': {
    category: 'Base',
    carcass: { ...BASE_CARCASS, hasBottomPanel: false },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 2 Door': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 2, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 2 Door No Bottom': {
    category: 'Base',
    carcass: { ...BASE_CARCASS, hasBottomPanel: false },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 2, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 3 Door': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 2, glassDoor: false, overlay: 'full', gap: 2 } }, // 3 doors rendered as 2+1
    benchtop: BASE_BENCHTOP,
  },
  
  // ============= BASE CABINETS - DRAWER ONLY =============
  
  'Base 1 Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 1, ratios: [1.0], gap: 2, showBox: true } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 2 Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 2, ratios: [0.40, 0.60], gap: 2, showBox: true } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 2 Bay Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 2, ratios: [0.40, 0.60], gap: 2, showBox: true } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 3 Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 3, ratios: [0.25, 0.33, 0.42], gap: 2, showBox: true } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 3 Drawer Split Top Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 3, ratios: [0.25, 0.33, 0.42], gap: 2, showBox: true } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 4 Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 4, ratios: [0.18, 0.24, 0.28, 0.30], gap: 2, showBox: true } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 4 Drawer Split Top Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 4, ratios: [0.18, 0.24, 0.28, 0.30], gap: 2, showBox: true } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 5 Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 5, ratios: [0.14, 0.18, 0.22, 0.22, 0.24], gap: 2, showBox: true } },
    benchtop: BASE_BENCHTOP,
  },
  
  // Waste bin drawers
  'Base 1 Drawer Waste Bin': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 1, ratios: [1.0], gap: 2, showBox: true } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 1 Drawer Waste Bin With Top Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 2, ratios: [0.25, 0.75], gap: 2, showBox: true } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 2 Drawer Waste Bin': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 2, ratios: [0.40, 0.60], gap: 2, showBox: true } },
    benchtop: BASE_BENCHTOP,
  },
  
  // Suspended drawers (no toe kick, no benchtop)
  '1 Drawer Suspended Cabinet': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 1, ratios: [1.0], gap: 2, showBox: true } },
    benchtop: NO_BENCHTOP,
  },
  
  '2 Drawer Suspended Cabinet': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 2, ratios: [0.40, 0.60], gap: 2, showBox: true } },
    benchtop: NO_BENCHTOP,
  },
  
  // ============= BASE CABINETS - COMBO (DOOR + DRAWER) =============
  
  'Base 1 Door 1 Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'COMBO', combo: { topDrawers: 1, bottomDoors: 1, dividerThickness: 18 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 1 Door 1 Drawer Blind Corner': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'BLIND_EXTENSION', blindSide: 'left', blindDepth: 150, fillerWidth: 75 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 1 Door 2 Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'COMBO', combo: { topDrawers: 2, bottomDoors: 1, dividerThickness: 18 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 2 Door 1 Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'COMBO', combo: { topDrawers: 1, bottomDoors: 2, dividerThickness: 18 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 2 Door 1 Drawer Blind Corner': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'BLIND_EXTENSION', blindSide: 'left', blindDepth: 150, fillerWidth: 75 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 2 Door 2 Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'COMBO', combo: { topDrawers: 2, bottomDoors: 2, dividerThickness: 18 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 2 Door 4 Drawer Cabinet': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'COMBO', combo: { topDrawers: 4, bottomDoors: 2, dividerThickness: 18 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 2 Doors Middle 4 Drawer Cabinet': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'COMBO', combo: { topDrawers: 4, bottomDoors: 2, dividerThickness: 18 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 3 Drawer 2 Door Cabinet': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'COMBO', combo: { topDrawers: 3, bottomDoors: 2, dividerThickness: 18 } },
    benchtop: BASE_BENCHTOP,
  },
  
  // ============= BASE CABINETS - SINK =============
  
  'Base 1 Door Sink': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'SINK', sink: { hasFalseFront: false, falseFrontHeight: 80, doorCount: 1 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 1 Door Sink With False Front': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'SINK', sink: { hasFalseFront: true, falseFrontHeight: 80, doorCount: 1 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 2 Door Sink': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'SINK', sink: { hasFalseFront: false, falseFrontHeight: 80, doorCount: 2 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 2 Door Sink With False Front': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'SINK', sink: { hasFalseFront: true, falseFrontHeight: 80, doorCount: 2 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 2 Door ADA Sink': {
    category: 'Base',
    carcass: { ...BASE_CARCASS, hasBottomPanel: false },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'SINK', sink: { hasFalseFront: false, falseFrontHeight: 80, doorCount: 2 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 2 Door ADA Sink With False Front': {
    category: 'Base',
    carcass: { ...BASE_CARCASS, hasBottomPanel: false },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'SINK', sink: { hasFalseFront: true, falseFrontHeight: 80, doorCount: 2 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'ADA Sink Angled Frame': {
    category: 'Base',
    carcass: { ...BASE_CARCASS, hasBottomPanel: false },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'SINK', sink: { hasFalseFront: true, falseFrontHeight: 80, doorCount: 2 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Sink 1 Door': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'SINK', sink: { hasFalseFront: false, falseFrontHeight: 80, doorCount: 1 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Sink 2 Door': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'SINK', sink: { hasFalseFront: false, falseFrontHeight: 80, doorCount: 2 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Sink False Front 2 Door': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'SINK', sink: { hasFalseFront: true, falseFrontHeight: 80, doorCount: 2 } },
    benchtop: BASE_BENCHTOP,
  },
  
  // ============= BASE CABINETS - CORNER =============
  
  'Base Blind Corner Left': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'BLIND_EXTENSION', blindSide: 'left', blindDepth: 150, fillerWidth: 75 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Blind Corner Right': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'BLIND_EXTENSION', blindSide: 'right', blindDepth: 150, fillerWidth: 75 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Blind Corner 1 Door': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'BLIND_EXTENSION', blindSide: 'left', blindDepth: 150, fillerWidth: 75 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base L Corner': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'L_ARMS', leftArmDepth: 575, rightArmDepth: 575 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Diagonal Corner': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'DIAGONAL_FRONT_45' } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Diagonal Corner 1 Door': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'DIAGONAL_FRONT_45' } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Corner Pie Cut': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'L_ARMS', leftArmDepth: 900, rightArmDepth: 900 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Corner Lazy Susan': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'L_ARMS', leftArmDepth: 900, rightArmDepth: 900 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Corner Easy Reach': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'L_ARMS', leftArmDepth: 900, rightArmDepth: 900 } },
    benchtop: BASE_BENCHTOP,
  },
  
  // ============= BASE CABINETS - APPLIANCE OPENINGS =============
  
  'Base Dishwasher': {
    category: 'Base',
    carcass: { ...BASE_CARCASS, hasBottomPanel: false },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: false } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Dishwasher With Drawer': {
    category: 'Base',
    carcass: { ...BASE_CARCASS, hasBottomPanel: false },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: true, topDrawerHeight: 180 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Microwave': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: true, topDrawerHeight: 180, openingHeight: 400 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Oven': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: true, topDrawerHeight: 180, openingHeight: 600 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Cooktop': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 2, ratios: [0.40, 0.60], gap: 2, showBox: true } },
    benchtop: BASE_BENCHTOP,
  },
  
  // ============= BASE CABINETS - OPEN SHELVES =============
  
  'Base Open Shelf': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'OPEN' },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Open 2 Shelf': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'OPEN' },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Open 1 Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'COMBO', combo: { topDrawers: 1, bottomDoors: 0, dividerThickness: 18 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Open 2 Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 2, ratios: [0.40, 0.60], gap: 2, showBox: true } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 6 Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 6, ratios: [0.12, 0.15, 0.17, 0.18, 0.19, 0.19], gap: 2, showBox: true } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base 7 Drawer': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 7, ratios: [0.10, 0.12, 0.14, 0.15, 0.16, 0.16, 0.17], gap: 2, showBox: true } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Winerack': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'OPEN' },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Pullout': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 4, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Starter': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Folding Door': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 2, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: BASE_BENCHTOP,
  },
  
  'Base Wine Rack': {
    category: 'Base',
    carcass: BASE_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'OPEN' },
    benchtop: BASE_BENCHTOP,
  },
  
  // ============= WALL CABINETS - DOOR ONLY =============
  
  'Upper 1 Door': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper 2 Door': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 2, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper 3 Door': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 2, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper Glass Door': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: true, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper 1 Door Glass': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: true, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper 2 Door Glass': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 2, glassDoor: true, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper Lift Door': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper Horizontal 1 Door': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper Horizontal 2 Door': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 2, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  // ============= WALL CABINETS - CORNER =============
  
  'Upper Blind Corner Left': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'BLIND_EXTENSION', blindSide: 'left', blindDepth: 100, fillerWidth: 50 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper Blind Corner Right': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'BLIND_EXTENSION', blindSide: 'right', blindDepth: 100, fillerWidth: 50 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper Diagonal Corner': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'DIAGONAL_FRONT_45' } },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper Corner Pie Cut': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'L_ARMS', leftArmDepth: 600, rightArmDepth: 600 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper L Corner': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'L_ARMS', leftArmDepth: 400, rightArmDepth: 400 } },
    benchtop: NO_BENCHTOP,
  },
  
  // ============= WALL CABINETS - OPEN & APPLIANCE =============
  
  'Upper Open Shelf': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'OPEN' },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper Open 2 Shelf': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'OPEN' },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper Open 3 Shelf': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 3, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'OPEN' },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper Rangehood': {
    category: 'Wall',
    carcass: { ...WALL_CARCASS, hasBottomPanel: false },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: false } },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper Rangehood Canopy': {
    category: 'Wall',
    carcass: { ...WALL_CARCASS, hasBottomPanel: false },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: false } },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper Microwave': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: false, openingHeight: 400 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Upper Refrigerator': {
    category: 'Wall',
    carcass: WALL_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 10 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 2, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  // ============= TALL CABINETS - PANTRY =============
  
  'Tall Pantry 1 Door': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 5, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Tall Pantry 2 Door': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 5, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 2, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Tall Pantry 4 Door': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 5, adjustable: true, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 2, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Tall Pantry Pullout': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 4, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Tall Pantry Drawer': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DRAWERS', drawers: { drawerCount: 4, ratios: [0.20, 0.25, 0.27, 0.28], gap: 2, showBox: true } },
    benchtop: NO_BENCHTOP,
  },
  
  // ============= TALL CABINETS - UTILITY =============
  
  'Tall Broom': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Tall Utility': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 3, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 1, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Tall Wardrobe': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 2, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'DOORS', doors: { doorCount: 2, glassDoor: false, overlay: 'full', gap: 2 } },
    benchtop: NO_BENCHTOP,
  },
  
  // ============= TALL CABINETS - APPLIANCE =============
  
  'Tall Oven Tower': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: true, topDrawerHeight: 200, openingHeight: 600 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Tall Double Oven': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: true, topDrawerHeight: 200, openingHeight: 1200 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Tall Oven Microwave': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: true, topDrawerHeight: 180, openingHeight: 1000 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Tall Fridge': {
    category: 'Tall',
    carcass: { ...TALL_CARCASS, hasBottomPanel: false },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: false } },
    benchtop: NO_BENCHTOP,
  },
  
  'Tall Fridge Enclosure': {
    category: 'Tall',
    carcass: { ...TALL_CARCASS, hasBottomPanel: false },
    shelves: { count: 0, adjustable: false, thickness: 18, setback: 20 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: false } },
    benchtop: NO_BENCHTOP,
  },
  
  'Tall Fridge With Top Cabinet': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 1, adjustable: true, thickness: 18, setback: 20 },
    toeKick: NO_TOEKICK,
    fronts: { type: 'APPLIANCE_OPENING', applianceOpening: { hasTopDrawer: false } },
    benchtop: NO_BENCHTOP,
  },
  
  // ============= TALL CABINETS - CORNER =============
  
  'Tall Blind Corner Left': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 4, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'BLIND_EXTENSION', blindSide: 'left', blindDepth: 150, fillerWidth: 75 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Tall Blind Corner Right': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 4, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'BLIND_EXTENSION', blindSide: 'right', blindDepth: 150, fillerWidth: 75 } },
    benchtop: NO_BENCHTOP,
  },
  
  'Tall Diagonal Corner': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 4, adjustable: true, thickness: 18, setback: 20 },
    toeKick: BASE_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'DIAGONAL_FRONT_45' } },
    benchtop: NO_BENCHTOP,
  },
  
  'Tall L Corner': {
    category: 'Tall',
    carcass: TALL_CARCASS,
    shelves: { count: 4, adjustable: true, thickness: 18, setback: 20 },
    toeKick: WIDE_TOEKICK,
    fronts: { type: 'CORNER', corner: { render: 'L_ARMS', leftArmDepth: 575, rightArmDepth: 575 } },
    benchtop: NO_BENCHTOP,
  },
};

// ============= RECIPE LOOKUP FUNCTION =============

/**
 * Normalize a product name for matching
 * - lowercase
 * - collapse multiple spaces
 * - remove special characters
 * - standardize common variations
 */
function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')           // Collapse multiple spaces
    .replace(/[_-]/g, ' ')          // Replace underscores and hyphens with spaces
    .replace(/cabinet/gi, '')       // Remove redundant "cabinet" word
    .replace(/\s+/g, ' ')           // Collapse again after removals
    .trim();
}

/**
 * Calculate similarity score between two strings (0-1)
 * Uses word overlap scoring for fuzzy matching
 */
function calculateMatchScore(name1: string, name2: string): number {
  const words1 = name1.split(' ').filter(w => w.length > 1);
  const words2 = name2.split(' ').filter(w => w.length > 1);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  let matchedWords = 0;
  let partialMatches = 0;
  
  for (const word1 of words1) {
    for (const word2 of words2) {
      if (word1 === word2) {
        matchedWords++;
        break;
      } else if (word1.includes(word2) || word2.includes(word1)) {
        partialMatches += 0.5;
        break;
      }
    }
  }
  
  // Score based on matches relative to total words
  const totalWords = Math.max(words1.length, words2.length);
  return (matchedWords + partialMatches) / totalWords;
}

/**
 * Get construction recipe for a product by name
 * Uses improved fuzzy matching with scoring to find the best recipe
 */
export function getConstructionRecipe(
  productName: string,
  recipes: Record<string, ConstructionRecipe> = MV_CONSTRUCTION_RECIPES
): ConstructionRecipe | null {
  if (!productName) return null;
  
  // Normalize product name
  const normalizedName = normalizeProductName(productName);
  
  // 1. Try exact match first (case-insensitive, normalized)
  for (const [key, recipe] of Object.entries(recipes)) {
    const normalizedKey = normalizeProductName(key);
    if (normalizedKey === normalizedName) {
      return recipe;
    }
  }
  
  // 2. Try best fuzzy match with scoring
  let bestMatch: { recipe: ConstructionRecipe; score: number; key: string } | null = null;
  
  for (const [key, recipe] of Object.entries(recipes)) {
    const normalizedKey = normalizeProductName(key);
    const score = calculateMatchScore(normalizedName, normalizedKey);
    
    // Also check if either contains the other (for partial matches)
    const containsBonus = normalizedName.includes(normalizedKey) || normalizedKey.includes(normalizedName) ? 0.3 : 0;
    const totalScore = score + containsBonus;
    
    if (totalScore > 0.5 && (!bestMatch || totalScore > bestMatch.score)) {
      bestMatch = { recipe, score: totalScore, key };
    }
  }
  
  if (bestMatch) {
    return bestMatch.recipe;
  }
  
  // 3. Pattern-based matching as fallback
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
      backPanelSetback: 16,
      topReveal: 3,
      bottomReveal: 2,
      sideReveal: 2,
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

// ============= REVEAL HELPERS =============

/**
 * Standard reveal values exported for use in rendering
 */
export const DEFAULT_REVEALS = {
  topReveal: 3,      // 3mm gap above doors
  bottomReveal: 2,   // 2mm gap below doors
  sideReveal: 2,     // 2mm gap beside doors
  doorGap: 2,        // 2mm gap between doors
  drawerGap: 2,      // 2mm gap between drawers
} as const;

/**
 * Get reveal values from a construction recipe
 * Falls back to defaults if not specified
 */
export function getRecipeReveals(recipe: ConstructionRecipe): {
  topReveal: number;
  bottomReveal: number;
  sideReveal: number;
  doorGap: number;
  drawerGap: number;
} {
  return {
    topReveal: recipe.carcass.topReveal ?? DEFAULT_REVEALS.topReveal,
    bottomReveal: recipe.carcass.bottomReveal ?? DEFAULT_REVEALS.bottomReveal,
    sideReveal: recipe.carcass.sideReveal ?? DEFAULT_REVEALS.sideReveal,
    doorGap: recipe.fronts.doors?.gap ?? DEFAULT_REVEALS.doorGap,
    drawerGap: recipe.fronts.drawers?.gap ?? DEFAULT_REVEALS.drawerGap,
  };
}

/**
 * Get reveal values for a category with sensible defaults
 */
export function getCategoryReveals(category: 'Base' | 'Wall' | 'Tall' | 'Accessory'): {
  topReveal: number;
  bottomReveal: number;
  sideReveal: number;
} {
  switch (category) {
    case 'Wall':
      // Wall cabinets: slightly tighter reveals since they're at eye level
      return { topReveal: 3, bottomReveal: 2, sideReveal: 2 };
    case 'Tall':
      // Tall cabinets: standard reveals
      return { topReveal: 3, bottomReveal: 2, sideReveal: 2 };
    case 'Base':
    case 'Accessory':
    default:
      // Base/Accessory: standard reveals
      return { topReveal: 3, bottomReveal: 2, sideReveal: 2 };
  }
}
