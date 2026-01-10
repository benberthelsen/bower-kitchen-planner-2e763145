// Cabinet Configuration Types for Microvellum-compliant rendering

export type GrainDirection = 'horizontal' | 'vertical' | 'none';
export type CornerType = 'blind' | 'diagonal' | 'l-shape' | null;
export type CabinetCategory = 'Base' | 'Wall' | 'Tall' | 'Accessory';

/**
 * Product types determine which renderer to use
 */
export type ProductType = 'cabinet' | 'countertop' | 'appliance' | 'panel' | 'accessory' | 'prop';

/**
 * Render configuration derived from Microvellum product metadata
 * Determines exactly how a cabinet should be rendered in 3D
 */
export interface CabinetRenderConfig {
  // Identity
  productId: string;
  productName: string;
  category: CabinetCategory;
  cabinetType: string; // e.g., 'Drawer', 'Door', 'Corner', 'Sink'
  
  // Product type for renderer routing
  productType: ProductType;
  specGroup: string;
  
  // Door/Drawer counts from Microvellum data
  doorCount: number;
  drawerCount: number;
  
  // Special cabinet types (parsed from product name/metadata)
  isCorner: boolean;
  isSink: boolean;
  isBlind: boolean;
  isPantry: boolean;
  isAppliance: boolean;
  isOven: boolean;
  isFridge: boolean;
  isRangehood: boolean;
  isDishwasher: boolean;
  
  // Construction details
  hasFalseFront: boolean;        // Only if "False Front" in name
  hasAdjustableShelves: boolean;
  shelfCount: number;            // Calculated from height
  cornerType: CornerType;
  
  // Corner cabinet specific dimensions (in mm)
  leftArmDepth: number;   // Depth of left arm for L-shape corners
  rightArmDepth: number;  // Depth of right arm for L-shape corners
  blindDepth: number;     // Blind extension depth
  fillerWidth: number;    // Required filler width for blind corners
  hasReturnFiller: boolean; // Whether return filler is needed
  
  // Dimensions (defaults from Microvellum, can be overridden)
  defaultWidth: number;
  defaultHeight: number;
  defaultDepth: number;
  
  // SVG thumbnail and front geometry from DXF processing
  thumbnailSvg?: string;
  frontGeometry?: {
    doors: Array<{ x: number; y: number; width: number; height: number }>;
    drawers: Array<{ x: number; y: number; width: number; height: number }>;
    handles: Array<{ x: number; y: number; type: 'bar' | 'knob' }>;
    cutouts?: Array<{ x: number; y: number; width: number; height: number; type: 'sink' | 'appliance' }>;
  };
  hasDxfGeometry?: boolean;
}

/**
 * Material configuration for a specific cabinet part
 */
export interface PartMaterialConfig {
  color: string;
  roughness: number;
  metalness: number;
  grainDirection: GrainDirection;
  textureType: 'wood' | 'stone' | 'concrete' | 'marble' | 'none';
  boardThickness: number; // in mm
}

/**
 * Board thickness options available
 */
export const BOARD_THICKNESS_OPTIONS = [16, 18, 25, 32] as const;
export type BoardThickness = typeof BOARD_THICKNESS_OPTIONS[number];

/**
 * Standard construction dimensions (in mm)
 * Based on Microvellum manufacturing standards
 */
export const CONSTRUCTION_STANDARDS = {
  // Board thicknesses (mm)
  gableThickness: 18,
  shelfThickness: 18,
  backPanelThickness: 3,       // Backing board
  doorThickness: 18,
  drawerFrontThickness: 18,
  bottomPanelThickness: 18,
  topPanelThickness: 18,
  kickboardThickness: 16,
  edgeBanding: 0.4,
  
  // Gaps & Reveals (mm) - Microvellum standard
  doorGap: 2,                  // Between doors
  drawerGap: 2,                // Between drawers
  topReveal: 3,                // Gap from carcass top to door
  bottomReveal: 2,             // Gap from carcass bottom to door
  sideReveal: 2,               // Gap from gable to door edge
  
  // Setbacks (mm)
  backPanelSetback: 16,        // Recessed for hanging rails (industry standard)
  backPanelInset: 9,           // Inset from gable edges (dado depth)
  
  // 32mm System drilling pattern
  shelfHoleSpacing: 32,        // Standard 32mm system
  shelfHoleFromEdge: 37,       // Distance from front/back edge
  hingeInset: 100,             // From top/bottom of door
  handleInset: 40,             // From edge of door
  handleCenterFromEdge: 40,    // Standard handle position
  handleDrillPattern: 32,      // 32mm, 64mm, 96mm, 128mm centers
  
  // Toe kick dimensions
  toeKickHeight: 135,
  toeKickSetback: 50,
} as const;

/**
 * Parse Microvellum product name to extract render configuration
 */
/**
 * Determine product type from spec_group and product name
 */
function determineProductType(specGroup: string | null, name: string): ProductType {
  const sg = (specGroup || '').toLowerCase();
  const n = name.toLowerCase();
  
  // Countertops
  if (sg.includes('countertop') || n.includes('benchtop') || n.includes('countertop')) {
    return 'countertop';
  }
  
  // Appliances
  if (sg.includes('appliance') || n.includes('fridge') || n.includes('dishwasher') || 
      n.includes('oven') || n.includes('rangehood') || n.includes('range hood') ||
      n.includes('cooktop') || n.includes('microwave')) {
    return 'appliance';
  }
  
  // Props (decorative items, not functional cabinets)
  if (sg.includes('prop')) {
    return 'prop';
  }
  
  // Parts/Panels
  if (sg.includes('part') || n.includes('panel') || n.includes('filler') || 
      n.includes('kick strip') || n.includes('scribe')) {
    return 'panel';
  }
  
  // Accessories
  if (sg.includes('accessor') && !sg.includes('cabinet')) {
    return 'accessory';
  }
  
  // Everything else is a cabinet
  return 'cabinet';
}

export function parseProductToRenderConfig(product: {
  id: string;
  name: string;
  category: string | null;
  cabinet_type: string | null;
  door_count: number | null;
  drawer_count: number | null;
  is_corner: boolean | null;
  is_sink: boolean | null;
  is_blind: boolean | null;
  default_width: number | null;
  default_height: number | null;
  default_depth: number | null;
  // New database columns
  has_false_front?: boolean | null;
  has_adjustable_shelves?: boolean | null;
  corner_type?: string | null;
  // Corner dimension columns
  left_arm_depth?: number | null;
  right_arm_depth?: number | null;
  blind_depth?: number | null;
  filler_width?: number | null;
  return_filler?: boolean | null;
  // DXF geometry columns
  thumbnail_svg?: string | null;
  front_geometry?: unknown;
  has_dxf_geometry?: boolean | null;
  // Spec group for product type detection
  spec_group?: string | null;
}): CabinetRenderConfig {
  const name = product.name.toLowerCase();
  const category = (product.category as CabinetCategory) || 'Base';
  const specGroup = product.spec_group || '';
  const productType = determineProductType(specGroup, product.name);
  
  // Use database columns if available, otherwise parse from name
  const hasFalseFront = product.has_false_front ?? 
    (name.includes('false front') || name.includes('false drawer'));
  
  const isPantry = name.includes('pantry') || name.includes('larder');
  const isOven = name.includes('oven') || name.includes('ov tower');
  const isFridge = name.includes('fridge') || name.includes('refrigerator') || name.includes('ref ');
  const isRangehood = name.includes('rangehood') || name.includes('range hood') || name.includes('canopy');
  const isDishwasher = name.includes('dishwasher') || name.includes('dw ');
  const isAppliance = isOven || isFridge || isRangehood || isDishwasher;
  
  // Determine corner type - prefer database column
  let cornerType: CornerType = null;
  if (product.corner_type) {
    cornerType = product.corner_type as CornerType;
  } else if (product.is_corner || product.is_blind) {
    if (name.includes('blind')) {
      cornerType = 'blind';
    } else if (name.includes('diagonal') || name.includes('45')) {
      cornerType = 'diagonal';
    } else if (name.includes('l-shape') || name.includes('l shape') || name.includes('lazy')) {
      cornerType = 'l-shape';
    } else if (product.is_blind) {
      cornerType = 'blind';
    }
  }
  
  // Calculate shelf count based on height (every 300mm after first 200mm)
  const height = product.default_height || 870;
  const usableHeight = height - 200; // Exclude top/bottom clearance
  const shelfCount = Math.max(1, Math.floor(usableHeight / 300));
  
  // Determine if adjustable shelves - use database column if available
  const hasDrawers = (product.drawer_count || 0) > 0;
  const hasAdjustableShelves = product.has_adjustable_shelves ?? 
    (!hasDrawers && !(product.is_sink) && !isAppliance);
  
  return {
    productId: product.id,
    productName: product.name,
    category,
    cabinetType: product.cabinet_type || 'Standard',
    productType,
    specGroup,
    
    doorCount: product.door_count || 0,
    drawerCount: product.drawer_count || 0,
    
    isCorner: product.is_corner || false,
    isSink: product.is_sink || false,
    isBlind: product.is_blind || false,
    isPantry,
    isAppliance,
    isOven,
    isFridge,
    isRangehood,
    isDishwasher,
    
    hasFalseFront,
    hasAdjustableShelves,
    shelfCount,
    cornerType,
    
    // Corner dimensions from database
    leftArmDepth: product.left_arm_depth || 575,
    rightArmDepth: product.right_arm_depth || 575,
    blindDepth: product.blind_depth || 150,
    fillerWidth: product.filler_width || 75,
    hasReturnFiller: product.return_filler || false,
    
    defaultWidth: product.default_width || 600,
    defaultHeight: product.default_height || 870,
    defaultDepth: product.default_depth || 575,
    
    // DXF geometry data
    thumbnailSvg: product.thumbnail_svg || undefined,
    frontGeometry: product.front_geometry as CabinetRenderConfig['frontGeometry'] || undefined,
    hasDxfGeometry: product.has_dxf_geometry || false,
  };
}

/**
 * Get grain direction for a specific cabinet part
 */
export function getPartGrainDirection(partType: string): GrainDirection {
  switch (partType) {
    case 'gable':
    case 'door':
    case 'endPanel':
      return 'vertical';
    case 'drawerFront':
    case 'kickboard':
      return 'horizontal';
    case 'shelf':
    case 'bottom':
    case 'top':
      return 'horizontal'; // Front to back
    default:
      return 'none';
  }
}
