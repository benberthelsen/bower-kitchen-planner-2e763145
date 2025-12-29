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
  edging: EdgeSpec;
  quantity: number;
  handlingCost: number;
  machiningCost: number;
  assemblyCost: number;
}

export interface SheetAllocation {
  materialId: string;
  materialName: string;
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
  };
  totalCost: number;
}

export interface QuoteBOM {
  cabinets: CabinetBOM[];
  consolidatedSheets: SheetAllocation[];
  consolidatedEdgeTape: EdgeTapeAllocation[];
  consolidatedHardware: HardwareItem[];
  grandTotal: {
    materials: number;
    edging: number;
    hardware: number;
    handling: number;
    machining: number;
    assembly: number;
    labor: number;
    subtotalExGst: number;
    gst: number;
    total: number;
  };
}

// Database record types
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
  material_type: string | null;
  brand: string | null;
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

export interface StonePricingRecord {
  id: string;
  brand: string;
  range_tier: string | null;
  trade_supply_per_sqm: number;
  install_supply_per_sqm: number;
}

export interface PricingData {
  parts: PartPricingRecord[];
  materials: MaterialPricingRecord[];
  edges: EdgePricingRecord[];
  hardware: HardwarePricingRecord[];
  labor: LaborRateRecord[];
  doorDrawer: DoorDrawerPricingRecord[];
  stone: StonePricingRecord[];
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
