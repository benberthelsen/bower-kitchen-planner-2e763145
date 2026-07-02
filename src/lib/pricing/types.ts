// BOM-based pricing engine types

export interface FormulaVariables {
  CabWidth: number;
  CabHeight: number;
  CabDepth: number;
  CabLeftWidth: number;
  CabLeftDepth: number;
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
  areaCostPerSqm: number;
  totalMaterialCost: number;
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
}

/** Per-client commercial layers applied to cost (P3). All optional; defaults = pass-through. */
export interface CommercialOptions {
  marginPct?: number;       // workshop margin on cost, e.g. 0.30
  designFeePct?: number;    // design fee on (cost+margin), e.g. 0.05
  deliveryFlat?: number;    // flat delivery $
  installFlat?: number;     // flat install $
  clientMarkupPct?: number; // per-client markup, e.g. 0.10
  gstPct?: number;          // default 0.10
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

export interface QuoteBOM {
  cabinets: CabinetBOM[];
  consolidatedSheets: SheetAllocation[];
  consolidatedEdgeTape: EdgeTapeAllocation[];
  consolidatedHardware: HardwareItem[];
  /** One entry per wall (rotation group). Empty when no benchtop material is configured. */
  benchtops: BenchtopAllocation[];
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
    /** Total cost ex commercial, ex GST (cabinets + benchtops) */
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
  /** Sheets needed (per_sheet materials -- Meganite) */
  sheetsRequired?: number;
  /** Run length in linear metres (per_lm materials -- Egger) */
  linearMetres?: number;
  /** Unit price used: per sheet, per LM, or per sqm */
  pricePerUnit: number;
  /** Computed $/m² equivalent (for display) */
  tradeSupplyPerSqm: number;
  /** Computed install $/m² equivalent (for display) */
  installSupplyPerSqm: number;
  /** areaSqm x tradeSupplyPerSqm (or equivalent from sheet/LM calc) */
  supplyCost: number;
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
