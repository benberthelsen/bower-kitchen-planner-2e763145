// Pure type/module file. No runtime side effects.

export type ItemType = 'Cabinet' | 'Wall' | 'Structure' | 'Appliance';
export type CabinetType = 'Base' | 'Wall' | 'Tall';

export interface CatalogItemDefinition {
  id: string;
  sku: string;
  name: string;
  itemType: ItemType;
  category?: CabinetType;
  defaultWidth: number;
  defaultDepth: number;
  defaultHeight: number;
  price: number;
}

export type HandingOverride = 'Auto' | 'L' | 'R';

export interface PlacedItem {
  instanceId: string;
  definitionId: string;
  itemType: ItemType;

  // Locked cabinet reference (C01, C02...) stored ON the item.
  cabinetNumber?: string;

  x: number;
  y: number;
  z: number;
  rotation: number;
  width: number;
  depth: number;
  height: number;

  // Cabinet intent options
  handingOverride?: HandingOverride;
  endPanelLeft?: boolean;
  endPanelRight?: boolean;
  /** Dishwasher/appliance openings: render benchtop-support top rails.
   *  Defaults to on (undefined) — set false to leave the opening topless. */
  topRail?: boolean;
  fillerLeft?: number;
  fillerRight?: number;

  finishColor?: string;
  /** carcase board material (id/item_code/name) for piece pricing */
  carcaseMaterialId?: string;
  /** exterior/door finish material (id/item_code/name) for piece pricing */
  exteriorMaterialId?: string;
  /** selected edge banding (id/item_code/name) — priced by edgeCalculator */
  edgeId?: string;
  /** supplier finish image URLs for the 3D texture (resolved outside the canvas) */
  doorTextureUrl?: string | null;
  carcaseTextureUrl?: string | null;
  handleType?: string;
  /** UI finish swatch id for the handle colour (e.g. 'matte-black') */
  handleColor?: string;
  hinge?: 'Left' | 'Right';
  blindSide?: 'Left' | 'Right';
  panelOverhang?: number;
  rightCarcaseDepth?: number;
  leftCarcaseDepth?: number;
  secondWidth?: number;        // corner SECOND wall run (Wall 2) in mm; width = Wall 1
  shelfCount?: number;         // adjustable shelf count from the editor (overrides recipe default)
  drawerFrontHeights?: number[]; // mm, top → bottom — custom drawer face heights (overrides standard distribution)
  tapId?: string;
  applianceId?: string;
  
  // Corner cabinet configuration (Phase 3)
  cornerFillerWidth?: number;   // Gap between blind panel and wall (mm)
  cornerStileWidth?: number;    // Face frame stile width (mm)
  blindPullDistance?: number;   // How far blind extends past face (mm)
}

export type RoomShape = 'Rectangle' | 'LShape';

/** Wall identifier, viewed in plan: N = back wall, S = front, W = left, E = right. */
export type WallId = 'N' | 'E' | 'S' | 'W';

/** A door, window, or open walkway in a wall. Offsets measured in mm from the
 *  wall's left corner when facing the wall from inside the room. */
export interface Opening {
  id: string;
  wall: WallId;
  type: 'door' | 'window' | 'walkway';
  offsetMm: number;
  widthMm: number;
  /** door/window height (mm). Defaults: door 2040, window 1200. */
  heightMm?: number;
  /** windows only — floor to sill (mm). Default 900. */
  sillHeightMm?: number;
  /** doors only — drives swing-arc clearance validation. */
  swing?: 'in-left' | 'in-right' | 'out' | 'slider';
}

/** Fixed service location (plumbing / power / gas / ducting) on a wall. */
export interface ServicePoint {
  id: string;
  wall: WallId;
  type: 'water-supply' | 'drain' | 'gpo' | 'gas' | 'hood-duct';
  offsetMm: number;
  /** height above floor (mm), e.g. GPO at 1050. */
  heightMm?: number;
}

export interface RoomConfig {
  width: number;
  depth: number;
  height: number;
  shape: RoomShape;
  cutoutWidth: number;
  cutoutDepth: number;
  /** Doors/windows/walkways. Optional — legacy designs have none. */
  openings?: Opening[];
  /** Plumbing/power/gas points. Optional — legacy designs have none. */
  services?: ServicePoint[];
}

export type TextureType = 'none' | 'wood' | 'stone' | 'concrete' | 'marble';

export interface MaterialOption {
  id: string;
  name: string;
  hex: string;
  priceMultiplier: number;
  textureType?: TextureType;
  roughness?: number;
  metalness?: number;
}

/** Visual handle styles renderable by HandleMesh. */
export type HandleType = 'Bar' | 'DPull' | 'Knob' | 'Cup' | 'Lip' | 'Flush' | 'Profile' | 'None';

export interface HandleDefinition {
  id: string;
  name: string;
  type: HandleType;
  hex: string;
  price: number;
  /** True when the product's material fixes its colour (brass, wood…) so the
   *  user's chosen handle finish should NOT override it. */
  finishLocked?: boolean;
}

export interface TapDefinition {
  id: string;
  name: string;
  type: 'Mixer' | 'Gooseneck' | 'Square';
  hex: string;
}

export interface ApplianceModel {
  id: string;
  name: string;
  type: 'Oven' | 'Microwave';
  hex: string;
}

export interface ProjectSettings {
  userRole?: 'standard' | 'trade';
  jobName: string;
  jobReference: string;
  contactNumber: string;
  description: string;
  deliveryMethod: 'pickup' | 'delivery';
}

export interface GlobalDimensions {
  toeKickHeight: number;
  shelfSetback: number;
  baseHeight: number;
  baseDepth: number;
  wallHeight: number;
  wallDepth: number;
  tallHeight: number;
  tallDepth: number;
  benchtopThickness: number;
  benchtopOverhang: number;
  splashbackHeight: number;
  /** Floor-to-underside mounting height for wall cabinets (mm). Default 1350. */
  wallMountHeight: number;


  doorGap: number;
  drawerGap: number;
  leftGap: number;
  rightGap: number;
  topMargin: number;
  bottomMargin: number;

  /** Gap between cabinet back and wall for installation tolerance (mm) */
  wallGap: number;

  // Construction parameters (Microvellum-style)
  /** Board thickness for gables/shelves (mm) - typically 16, 18, 25, 32 */
  boardThickness: number;
  /** Back panel setback for hanging rails (mm) - typically 16 */
  backPanelSetback: number;
  /** Top reveal gap above doors (mm) - typically 3 */
  topReveal: number;
  /** Side reveal gap beside doors (mm) - typically 2 */
  sideReveal: number;
  /** 32mm system handle drill spacing (mm) - 32, 64, 96, 128 */
  handleDrillSpacing: number;

  // Corner cabinet defaults
  /** Default filler width for blind corner cabinets (mm) */
  cornerFillerWidth?: number;
  /** Default stile width for corner cabinets (mm) */
  cornerStileWidth?: number;
}

export interface HardwareOptions {
  hingeType: string;
  drawerType: string;
  cabinetTop: string;
  supplyHardware: boolean;
  adjustableLegs: boolean;
  handleId: string;
  /** UI finish swatch id (e.g. 'matte-black') applied to the handle colour. */
  handleColor?: string;
}
