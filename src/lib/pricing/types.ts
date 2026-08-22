// BOM-based pricing engine types

export interface FormulaVariables {
  CabWidth: number;
  CabHeight: number;
  CabDepth: number;
  CabLeftWidth: number;
  CabLeftDepth: number;
  /** Corner cabinets: the second (right) wall run. parts_pricing uses these in
   *  28 Carcase/Cabinet Top formulas; before they existed those parts silently
   *  evaluated to 0 and were priced at zero area. */
  CabRightWidth: number;
  CabRightDepth: number;
  /** Corner drawer bank width (parts_pricing: "LsCabDrawerWidth*2"). */
  LsCabDrawerWidth: number;
  /** Drawer runner geometry, from the selected runner in hardware_pricing. */
  DrawerRunnerHeight: number;
  DrawerRunnerDepth: number;
  CarcaseThick: number;
  ShelfOffset: number;
  DoorGap: number;
  DrawerGap: number;
  ToeKickHeight: number;
  BenchtopThickness: number;
  BackThickness: number;
  DrawerHeight: number;
  DrawerFrontHeight: number;
  NumDrawers: number;
  NumDoors: number;
  NumShelves: number;
}

export interface EdgeSpec {
  len1: boolean;
  wid1: boolean;
  len2: boolean;
  wid2: boolean;
}

export interface PartDimension {
  name: string;
  partType: string;
  length: number;
  width: number;
  area: number;
  thickness: number;
  materialId: string;
  /** which finish this part draws from: carcase board vs exterior/door finish */
  materialRole: 'carcase' | 'exterior';
  edging: EdgeSpec;
  quantity: number;
  handlingCost: number;
  machiningCost: number;
  assemblyCost: number;
}

export interface SheetAllocation {
  materialId: string;
  materialName: string;
  materialRole?: 'carcase' | 'exterior';
  sheetWidth: number;
  sheetLength: number;
  sheetArea: number;
  sheetsRequired: number;
  totalPartArea: number;
  wasteArea: number;
  yieldFactor: number;
  /** Minimum chargeable area configured for this material across the whole job. */
  minimumJobArea?: number;
  /** Area used to determine whole-sheet quantity after yield and minimums. */
  chargeableArea?: number;
  /** The catalogue yield was invalid and the safe 85% default was used. */
  usedDefaultYield?: boolean;
  areaCostPerSqm: number;
  totalMaterialCost: number;
  /** true when the material id had no priced match at all — board priced at $0 (WS2 guard) */
  unresolved?: boolean;
}

export interface EdgeTapeAllocation {
  edgeType: string;
  edgeName: string;
  thickness: number;
  linearMeters: number;
  costPerMeter: number;
  handlingCost: number;
  applicationCost: number;
  totalCost: number;
  /** True when no positive catalogue price matched and a calibrated fallback was used. */
  isFallbackPrice?: boolean;
  /** consolidated ordering: 25m roll multiples */
  rollsRequired?: number;
  rollLengthM?: number;
}

export interface HardwareItem {
  itemCode: string;
  name: string;
  hardwareType: string;
  quantity: number;
  unitCost: number;
  machiningCost: number;
  assemblyCost: number;
  totalCost: number;
  /** True when no positive catalogue price matched and a calibrated fallback was used. */
  isFallbackPrice?: boolean;
}

export interface BuildHours {
  cut: number;        // machine hours cutting sheets
  edge: number;       // machine hours edge-banding
  assembly: number;   // labour hours assembling
  total: number;      // cut + edge + assembly
  machineCost: number;
  labourCost: number;
  cost: number;       // machine + labour (cross-check vs calibrated labor)
}

export interface CabinetBOM {
  cabinetId: string;
  cabinetNumber: string;
  cabinetName: string;
  cabinetSku: string;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  parts: PartDimension[];
  sheets: SheetAllocation[];
  edgeTape: EdgeTapeAllocation[];
  hardware: HardwareItem[];
  subtotals: {
    materials: number;
    edging: number;
    hardware: number;
    handling: number;
    machining: number;
    assembly: number;
    labor: number;
  };
  totalCost: number;
  buildHours: BuildHours;
  /** Pricing-trust warnings for this cabinet (unmatched/unpriced materials — WS2 guard) */
  warnings?: string[];
}

/** Per-client commercial layers applied to cost (P3). All optional; defaults = pass-through. */
export interface CommercialOptions {
  marginPct?: number;       // workshop margin on cost, e.g. 0.30
  designFeePct?: number;    // design fee on (cost+margin), e.g. 0.05
  deliveryFlat?: number;    // flat delivery $
  installFlat?: number;     // flat install $ (fallback when no supply mode given)
  /**
   * How the job is supplied. When set, shop labour is costed by the process
   * model in workshopModel.ts instead of the flat per-cabinet regression, and
   * install is derived rather than taken from installFlat.
   */
  supplyMode?: import('./workshopModel').SupplyMode;
  /** Per-station rate/minute overrides for the workshop model. */
  workshopRates?: Partial<import('./workshopModel').WorkshopRates>;
  /** One-way road distance from the workshop, km. Drives banded delivery. */
  siteDistanceKm?: number;
  /** Override the delivery bands (defaults in deliveryCalculator.ts). */
  deliveryBands?: import('./deliveryCalculator').DeliveryBand[];
  clientMarkupPct?: number; // per-client markup, e.g. 0.10
  gstPct?: number;          // default 0.10
  /** Stage 1 appliance catalog: extra margin applied ONLY to appliance line
   *  items (default 0 = pass-through). */
  applianceMarginPct?: number;
  /**
   * Per-category client markups (fractions, e.g. 0.30 = 30%) from
   * client_markup_settings. When supplied, these drive the markup applied to
   * each cost category and override the flat clientMarkupPct path.
   */
  categoryMarkups?: {
    material?: number;
    hardware?: number;
    labor?: number;
    parts?: number;     // part handling/machining/assembly
    edge?: number;
    doorDrawer?: number;
    stone?: number;     // benchtop markup (DB column: stone_markup -- rename pending)
    delivery?: number;
  };
}

/** Stage 1 — one purchased appliance line on a quote. */
export interface ApplianceLineItem {
  productId: string;
  itemCode?: string | null;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isPlaceholderPrice: boolean;
}

/** A continuous plinth face in the workshop takeoff. Cut lengths are the
 * installed pieces required from the nominated stock length. */
export interface KickboardAllocation {
  runLabel: string;
  rotation: number;
  runLengthMm: number;
  heightMm: number;
  stockLengthMm: number;
  cutLengthsMm: number[];
}

/** Appliance product record from Supabase `appliance_products`. */
export interface ApplianceProductRecord {
  id: string;
  item_code?: string | null;
  name: string;
  brand?: string | null;
  category: string;
  subcategory?: string | null;
  description?: string | null;
  rrp?: number | null;
  sell_price?: number | null;
  installed_price?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  depth_mm?: number | null;
  cutout_width_mm?: number | null;
  cutout_height_mm?: number | null;
  cutout_depth_mm?: number | null;
  finish?: string | null;
  power_requirements?: string | null;
  features?: unknown;
  image_url?: string | null;
  /** Sinks: supplier bowl count (1, 1.75, 2). */
  bowl_count?: number | null;
  /** Sinks: per-bowl "L x W x D" strings as published. */
  bowl_sizes?: string[] | null;
  /** "Undermount" / "Surface mount" — drives how the sink meets the stone. */
  installation?: string | null;
  /** False until a human has checked the sizes, mirroring price_is_placeholder. */
  dimensions_confirmed?: boolean | null;
  model_url?: string | null;
  model_ios_url?: string | null;
  is_active: boolean;
  price_is_placeholder: boolean;
  sort_order?: number | null;
}

export interface QuoteBOM {
  cabinets: CabinetBOM[];
  consolidatedSheets: SheetAllocation[];
  consolidatedEdgeTape: EdgeTapeAllocation[];
  consolidatedHardware: HardwareItem[];
  /** One entry per wall (rotation group). Empty when no benchtop material is configured. */
  benchtops: BenchtopAllocation[];
  /** Continuous kick-face runs, including dishwasher openings and fillers. */
  kickboards: KickboardAllocation[];
  /** Stage 1 — appliance line items included in the quote. Empty by default. */
  applianceItems: ApplianceLineItem[];
  /** Process-based shop labour breakdown. Null unless a supplyMode was given. */
  workshop?: import('./workshopModel').WorkshopCost | null;
  /** Banded delivery working. Null unless siteDistanceKm was given. */
  delivery?: import('./deliveryCalculator').DeliveryQuote | null;
  /**
   * Deduped pricing-trust warnings across the quote (WS2 guard): materials that
   * didn't resolve (fallback used / $0 board) or resolved with no captured
   * price. Surface as an amber badge; persist into the quote snapshot.
   */
  warnings: string[];
  grandTotal: {
    materials: number;
    edging: number;
    hardware: number;
    handling: number;
    machining: number;
    assembly: number;
    labor: number;
    /** Benchtop supply cost (material only) */
    benchtopSupply: number;
    /** Benchtop install cost */
    benchtopInstall: number;
    /** benchtopSupply + benchtopInstall */
    benchtop: number;
    /** Sum of appliance line items (Stage 1). 0 when none. */
    appliances: number;
    /** True when any included appliance has price_is_placeholder = true. */
    hasPlaceholderAppliancePrices: boolean;
    /** Total cost ex commercial, ex GST (cabinets + benchtops + appliances) */
    cost: number;
    margin: number;
    designFee: number;
    delivery: number;
    install: number;
    clientMarkup: number;
    subtotalExGst: number; // sell price ex GST
    gst: number;
    total: number;
  };
  buildHours: {
    cut: number;
    edge: number;
    assembly: number;
    total: number;
    cost: number;
  };
}

// -- Database record types ----------------------------------------------------

export interface PartPricingRecord {
  id: string;
  name: string;
  part_type: string;
  length_function: string | null;
  width_function: string | null;
  edging: string | null;
  handling_cost: number;
  area_handling_cost: number;
  machining_cost: number;
  area_machining_cost: number;
  assembly_cost: number;
  area_assembly_cost: number;
  visibility_status: string;
}

export interface MaterialPricingRecord {
  id: string;
  item_code: string;
  name: string;
  description?: string | null;
  material_type: string | null;
  brand: string | null;
  finish?: string | null;
  substrate?: string | null;
  thickness: number | null;
  sheet_width: number | null;
  sheet_length: number | null;
  area_cost: number;
  area_handling_cost: number;
  area_assembly_cost: number;
  expected_yield_factor: number;
  minimum_job_area: number;
  minimum_usage_rollover: number;
  double_sided: boolean;
  double_sided_cost: number;
  horizontal_grain: boolean;
  horizontal_grain_surcharge: number;
  visibility_status: string;
  source_supplier?: string | null;
  source_url?: string | null;
  sample_image_url?: string | null;
  supplier_variant_code?: string | null;
  supplier_finish_code?: string | null;
  supplier_range?: string | null;
  price_status?: string | null;
  captured_unit_price?: number | null;
  price_unit?: string | null;
  price_captured_at?: string | null;
  scraper_metadata?: unknown;
}

export interface EdgePricingRecord {
  id: string;
  item_code: string;
  name: string;
  edge_type: string | null;
  brand: string | null;
  thickness: number | null;
  finish: string | null;
  length_cost: number;
  handling_cost: number;
  area_handling_cost: number;
  application_cost: number;
  visibility_status: string;
}

export interface HardwarePricingRecord {
  id: string;
  item_code: string;
  name: string;
  hardware_type: string | null;
  brand: string | null;
  series: string | null;
  unit_cost: number;
  inner_unit_cost: number;
  handling_cost: number;
  machining_cost: number;
  assembly_cost: number;
  runner_depth: number | null;
  runner_height: number | null;
  runner_desc: string | null;
  visibility_status: string;
}

export interface LaborRateRecord {
  id: string;
  name: string;
  description: string | null;
  rate_type: string;
  rate: number;
}

export interface DoorDrawerPricingRecord {
  id: string;
  item_code: string;
  name: string;
  suffix: string | null;
  filter_name: string | null;
  outsourced: boolean;
  advanced: boolean;
  unit_cost: number;
  handling_cost: number;
  area_handling_cost: number;
  machining_cost: number;
  area_machining_cost: number;
  assembly_cost: number;
  area_assembly_cost: number;
  visibility_status: string;
}

/**
 * Benchtop material record -- covers solid-surface (Meganite), laminate worktops
 * (Egger), and legacy per-sqm stone. The pricing_method field controls which
 * price columns the calculator uses.
 *
 * DB table: benchtop_pricing (renamed from stone_pricing)
 */
export interface BenchtopMaterialRecord {
  id: string;
  brand: string;                              // 'Meganite', 'Egger', etc.
  range_tier: string | null;                  // colour/finish tier name
  material_type: 'solid_surface' | 'laminate' | 'stone';
  pricing_method: 'per_sheet' | 'per_lm' | 'per_sqm';
  /** Sheet/board length in mm (3660 Meganite, 3650 Egger) */
  stock_length_mm: number;
  /** Sheet/board width in mm (760 Meganite 12mm, 600 or 920 Egger worktops) */
  stock_depth_mm: number;
  /** Price per sheet ex GST -- used when pricing_method = 'per_sheet' */
  price_per_sheet: number | null;
  /** Price per linear metre ex GST -- used when pricing_method = 'per_lm' */
  price_per_lm: number | null;
  /** Price per sqm ex GST -- used when pricing_method = 'per_sqm' (legacy stone) */
  trade_supply_per_sqm: number;
  /** Install cost per linear metre (supply + install quote component) */
  install_per_lm: number | null;
  /** Install cost per sqm (legacy stone path) */
  install_supply_per_sqm: number;
  /** Extra stock allowance used by whole-sheet planning (0.05 = 5%). */
  waste_factor?: number | null;
  /** Smallest whole-sheet order when this material is used. */
  minimum_sheet_quantity?: number | null;
  /** Supplier/manufacturer and ordering identity. */
  supplier?: string | null;
  item_code?: string | null;
  /** Optional visual/style catalogue id used to link a selected finish. */
  catalog_finish_id?: string | null;
  /** Procurement/fabrication route for the finished top. */
  supply_pathway?: 'stock_preformed' | 'stock_sheet_fabricated' | 'supplier_custom' | 'made_to_order';
  profile_type?: string | null;
  thickness_mm?: number | null;
  /** Minimum billable length for LM-priced products. */
  minimum_order_length_mm?: number | null;
  /** Minimum completed-benchtop charge after material + operations. */
  minimum_charge?: number | null;
  /** Fabrication/order matrix, all ex GST. */
  cut_to_length_cost?: number | null;
  cnc_setup_cost?: number | null;
  cnc_cut_per_lm?: number | null;
  join_cost?: number | null;
  sanding_polishing_per_lm?: number | null;
  edge_finish_per_lm?: number | null;
  finished_end_cost?: number | null;
  /** Additional visible side/end edge rate; preferred over fixed finished_end_cost when set. */
  finished_end_per_lm?: number | null;
  sink_cutout_cost?: number | null;
  cooktop_cutout_cost?: number | null;
  tap_hole_cost?: number | null;
  supplier_order_fee?: number | null;
  freight_cost?: number | null;
  is_default?: boolean | null;
  is_active?: boolean | null;
  price_status?: 'base_only' | 'confirmed' | 'needs_review' | null;
  notes?: string | null;
  /** Supplier depth bands for made-to-order LM pricing. */
  width_price_tiers?: Array<{
    min_depth_mm: number;
    max_depth_mm: number;
    one_edge_price_per_lm: number;
    two_edge_price_per_lm: number;
  }> | null;
  /** Edge count included in the supplier LM rate. */
  quoted_edge_count?: 1 | 2 | null;
  /** Published finish/shape/lamination surcharges, in percentage points. */
  surface_surcharge_pct?: number | null;
  circular_surcharge_pct?: number | null;
  double_sided_surcharge_pct?: number | null;
  /** Supplier billing increment for run length, e.g. 100mm. */
  length_rounding_mm?: number | null;
  /** Applied only when confirmed; null explicitly means no assumption. */
  account_discount_pct?: number | null;
  /** Full source operation schedule retained for audit/future selections. */
  operation_rates?: Record<string, number> | null;
  source_document?: string | null;
  source_page?: string | null;
  source_date?: string | null;
}

/** @deprecated Use BenchtopMaterialRecord */
export type StonePricingRecord = BenchtopMaterialRecord;

/**
 * One benchtop run -- all base/corner/sink cabinets on the same wall
 * (grouped by rotation), priced from the benchtop_pricing table.
 */
export interface BenchtopAllocation {
  /** Human-readable label, e.g. "Wall A" */
  wallLabel: string;
  /** Normalised rotation in degrees: 0 / 90 / 180 / 270 */
  rotation: number;
  /** Sum of all cabinet widths on this wall (mm) */
  runLengthMm: number;
  /** Deepest cabinet depth + benchtop overhang (mm) */
  depthMm: number;
  /** runLengthMm x depthMm in sqm */
  areaSqm: number;
  materialId: string;
  /** brand + range_tier display name */
  materialName: string;
  materialType: string;     // 'solid_surface' | 'laminate' | 'stone'
  pricingMethod: string;    // 'per_sheet' | 'per_lm' | 'per_sqm'
  supplyPathway?: string;
  profileType?: string;
  /** Sheets needed (per_sheet materials -- Meganite) */
  sheetsRequired?: number;
  /** Whole sheets ordered for all runs of this material in the room/job. */
  jobSheetsRequired?: number;
  /** Number of rectangular cut pieces produced for this run. */
  cutPieces?: number;
  /** Stock dimensions used by the whole-sheet nesting calculation. */
  stockLengthMm?: number;
  stockDepthMm?: number;
  /** Actual benchtop area / total ordered sheet area, expressed 0..1. */
  sheetUtilisation?: number;
  /** Allowance included in the minimum sheet calculation, expressed 0..1. */
  wasteFactor?: number;
  /** Run length in linear metres (per_lm materials -- Egger) */
  linearMetres?: number;
  /** Quantity charged after supplier minimum-order rules. */
  billableLinearMetres?: number;
  /** Supplier width band and adjustments used for this run. */
  widthPriceBand?: string;
  surfaceSurchargePct?: number;
  accountDiscountPct?: number;
  /** Unit price used: per sheet, per LM, or per sqm */
  pricePerUnit: number;
  /** Computed $/m² equivalent (for display) */
  tradeSupplyPerSqm: number;
  /** Computed install $/m² equivalent (for display) */
  installSupplyPerSqm: number;
  /** areaSqm x tradeSupplyPerSqm (or equivalent from sheet/LM calc) */
  supplyCost: number;
  /** Fabrication/order component within supplyCost. */
  fabricationCost?: number;
  /** Material-only component before fabrication/order operations. */
  baseMaterialCost?: number;
  /** Itemised operations applied to this run/job allocation. */
  fabricationBreakdown?: Array<{
    code: string;
    label: string;
    quantity: number;
    unit: 'each' | 'lm' | 'job' | 'adjustment';
    unitPrice: number;
    total: number;
  }>;
  warnings?: string[];
  /** Install cost component */
  installCost: number;
  /** supplyCost + installCost */
  totalCost: number;
}

export interface PricingData {
  parts: PartPricingRecord[];
  materials: MaterialPricingRecord[];
  edges: EdgePricingRecord[];
  hardware: HardwarePricingRecord[];
  labor: LaborRateRecord[];
  doorDrawer: DoorDrawerPricingRecord[];
  benchtop: BenchtopMaterialRecord[];
  /** Stage 1 — appliance catalog (may be empty). */
  appliances?: ApplianceProductRecord[];
}

// Cabinet configuration for BOM generation
export interface CabinetConfig {
  numDoors: number;
  numDrawers: number;
  numShelves: number;
  hasSides: boolean;
  hasBack: boolean;
  hasBottom: boolean;
  hasTop: boolean;
  hasRails: boolean;
  isSinkCabinet: boolean;
  isCorner: boolean;
  isBlind: boolean;
}
