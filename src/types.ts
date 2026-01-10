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
  fillerLeft?: number;
  fillerRight?: number;

  finishColor?: string;
  handleType?: string;
  hinge?: 'Left' | 'Right';
  blindSide?: 'Left' | 'Right';
  panelOverhang?: number;
  rightCarcaseDepth?: number;
  leftCarcaseDepth?: number;
  tapId?: string;
  applianceId?: string;
}

export type RoomShape = 'Rectangle' | 'LShape';

export interface RoomConfig {
  width: number;
  depth: number;
  height: number;
  shape: RoomShape;
  cutoutWidth: number;
  cutoutDepth: number;
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

export interface HandleDefinition {
  id: string;
  name: string;
  type: 'Bar' | 'Knob' | 'Lip' | 'None';
  hex: string;
  price: number;
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
}

export interface HardwareOptions {
  hingeType: string;
  drawerType: string;
  cabinetTop: string;
  supplyHardware: boolean;
  adjustableLegs: boolean;
  handleId: string;
}
