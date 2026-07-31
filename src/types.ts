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
  /** Island and peninsula cabinets have their back on show. Without this the
   *  3mm carcase backing board faces the room, set back behind the gables —
   *  which is what "no back panel on the island" looks like. Renders a
   *  finished panel in the door material, flush with the carcase. */
  finishedBack?: boolean;
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
  /** Layout role stamped by compileSpec (`sink`, `cooktop`, `oven-tower`,
   *  `dishwasher`, `fridge-gap`, …). Downstream code must read this rather
   *  than pattern-matching the definitionId SKU string. */
  layoutRole?: string;
  /** Source coordinates in KitchenSpec for homeowner cabinet editing.
   * Auto-filled cupboards, upper cabinets and appliance overlays omit these
   * fields because they are derived rather than directly editable units. */
  layoutRunIndex?: number;
  layoutSegmentIndex?: number;


  // Corner cabinet configuration (Phase 3)
  cornerFillerWidth?: number;   // Gap between blind panel and wall (mm)
  cornerStileWidth?: number;    // Face frame stile width (mm)
  blindPullDistance?: number;   // How far blind extends past face (mm)

  // -- Appliance catalog (Stage 1) ------------------------------------------
  /** appliance_products.id when this placed item came from the catalog */
  applianceProductId?: string;
  /** Cabinet whose visible fronts are replaced by this appliance overlay.
   * Used by under-bench ovens so their face does not z-fight with intact
   * cooktop-cabinet doors and leave a floating handle bar. */
  applianceHostInstanceId?: string;
  /** Frozen snapshot at placement time — quote stays stable if catalog changes */
  applianceSnapshot?: {
    itemCode?: string | null;
    name: string;
    category: string;
    unitPrice: number;
    isPlaceholderPrice: boolean;
    /** Stage 2 — GLB URL for real 3D rendering (planner / Android AR). */
    modelUrl?: string | null;
    /** Stage 2 — USDZ URL for Apple Quick Look per-product AR. */
    modelIosUrl?: string | null;
    /** Stage 2 — surface finish hint for procedural fallback (e.g. 'stainless'). */
    finish?: string | null;
    /** Manufacturer cut-out dimensions used for real benchtop openings. */
    cutoutWidthMm?: number | null;
    cutoutHeightMm?: number | null;
    cutoutDepthMm?: number | null;
    /** Supplier product elevation, mapped onto the face you actually look at.
     *  Häfele's `ppic-` images are straight-on shots of the appliance filling
     *  the frame — see materials/applianceImage.ts. `dimd-`/`mont-` drawings
     *  must never land here. */
    imageUrl?: string | null;
    /** Sinks: real bowl count from the supplier ("1 bowl", "1.75 bowl",
     *  "2.0 bowl"). Replaces the old "two bowls if wider than 700 mm" guess. */
    bowlCount?: number | null;
    /** Sinks: per-bowl "L x W x D" strings, in the supplier's own order. */
    bowlSizes?: string[] | null;
  };
  /** Default true when the product has a price. If false, appliance is
   *  opening-only (client supplies) and NOT priced into the quote. */
  supplyWithOrder?: boolean;
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
  /** Customer-facing source identity. Existing ids remain stable for saved jobs. */
  supplier?: string;
  supplierCode?: string;
  /** Small product sample used by selectors and review summaries. */
  swatchUrl?: string;
  /** Physical material image used by the 3D renderer when available. */
  textureUrl?: string;
  surface?: 'door' | 'benchtop' | 'kick';
  grainDirection?: 'none' | 'vertical' | 'horizontal';
  /** Real-world repeat represented by the texture image. */
  textureRepeatMm?: { width: number; height: number };
  availability?: 'available' | 'limited' | 'quote-only';
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
