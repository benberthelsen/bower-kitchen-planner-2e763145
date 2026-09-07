/**
 * Shared fixture for the Microvellum comparison scripts: the live Bower
 * catalogue rates as at 7 Sep 2026 (materials $/m2, edge, hardware, labour and
 * the parts_pricing rows this job touches), plus the mapping from a Microvellum
 * cabinet schedule to PlacedItems.
 */

const carcasePart = (name, lf, wf, edging) => ({
  name, part_type: 'Carcase', length_function: lf, width_function: wf, edging,
  handling_cost: 1.8, area_handling_cost: 2.5, machining_cost: 1.5,
  area_machining_cost: 1.95, assembly_cost: 3, area_assembly_cost: 3,
  visibility_status: 'Available',
});

export const parts = [
  carcasePart('Base Left Side', 'CabHeight', 'CabDepth', 'Len1/-/-/-'),
  carcasePart('Base Right Side', 'CabHeight', 'CabDepth', 'Len1/-/-/-'),
  carcasePart('Base Bottom', 'CabWidth-CarcaseThick*2', 'CabDepth-CarcaseThick', 'Len1/-/-/-'),
  carcasePart('Base Back', 'CabHeight', 'CabWidth-CarcaseThick*2', '-/-/-/-'),
  carcasePart('Upper Left Side', 'CabHeight', 'CabDepth', 'Len1/-/Len2/-'),
  carcasePart('Upper Right Side', 'CabHeight', 'CabDepth', 'Len1/-/Len2/-'),
  carcasePart('Upper Bottom', 'CabWidth-CarcaseThick*2', 'CabDepth-CarcaseThick', 'Len1/-/-/-'),
  carcasePart('Upper Top', 'CabWidth-CarcaseThick*2', 'CabDepth-CarcaseThick', 'Len1/-/-/-'),
  carcasePart('Upper Back', 'CabHeight', 'CabWidth-CarcaseThick*2', '-/-/Len2/-'),
  carcasePart('Tall Left Side', 'CabHeight', 'CabDepth', 'Len1/-/-/-'),
  carcasePart('Tall Right Side', 'CabHeight', 'CabDepth', 'Len1/-/-/-'),
  carcasePart('Tall Bottom', 'CabWidth-CarcaseThick*2', 'CabDepth-CarcaseThick', 'Len1/-/-/-'),
  carcasePart('Tall Top', 'CabWidth-CarcaseThick*2', 'CabDepth-CarcaseThick', 'Len1/-/-/-'),
  carcasePart('Tall Back', 'CabHeight', 'CabWidth-CarcaseThick*2', '-/-/-/-'),
  carcasePart('Adjustable Shelf', 'CabWidth-CarcaseThick*2', 'CabDepth-CarcaseThick-ShelfOffset', 'Len1/-/-/-'),
  carcasePart('Drawer Front', 'CabWidth-CarcaseThick*2', 'DrawerRunnerHeight-30', 'Len1/-/-/-'),
  carcasePart('Drawer Left Side', 'DrawerRunnerDepth', 'DrawerRunnerHeight-30', 'Len1/-/-/-'),
  carcasePart('Drawer Right Side', 'DrawerRunnerDepth', 'DrawerRunnerHeight-30', 'Len1/-/-/-'),
  carcasePart('Drawer Back', 'CabWidth-CarcaseThick*2', 'DrawerRunnerHeight-30', 'Len1/-/-/-'),
  carcasePart('Drawer Bottom', 'CabWidth-CarcaseThick*2', 'DrawerRunnerDepth', '-/-/-/-'),
  { ...carcasePart('Rail On Flat', 'CabWidth-CarcaseThick*2', '150', 'Len1/-/-/-'), part_type: 'Cabinet Top' },
  { ...carcasePart('Door', null, null, 'Len1/Wid1/Len2/Wid2'), part_type: 'Component' },
  // Flat panels are matched on part_type, not name.
  { ...carcasePart('Tall Applied End', null, null, 'Len1/-/Len2/Wid2'), part_type: 'Applied Panel',
    handling_cost: 3, area_handling_cost: 5.1, machining_cost: 2.9, area_machining_cost: 5.5 },
  { ...carcasePart('Upper Right Return', null, null, 'Len1/Wid1/-/Wid2'), part_type: 'Return Panel',
    handling_cost: 3, area_handling_cost: 5.1, machining_cost: 2.9, area_machining_cost: 5.5 },
  { ...carcasePart('Base Filler', null, null, 'Len1/-/Len2/Wid2'), part_type: 'Filler' },
];

export const materials = [
  { id: 'carcase', item_code: 'POLY1038', name: 'Particle 162412 DS Carcass Texture MR',
    material_type: 'Particleboard', brand: 'Polytec', thickness: 16,
    area_cost: 22.30, area_handling_cost: 0, area_assembly_cost: 0,
    sheet_length: 2400, sheet_width: 1200, expected_yield_factor: 1,
    minimum_job_area: 0, minimum_usage_rollover: 0, double_sided: false, double_sided_cost: 0,
    horizontal_grain: false, horizontal_grain_surcharge: 0, visibility_status: 'Available' },
  { id: 'door', item_code: 'POLY52602', name: 'MDF 162412 DS Natural Ply Woodmatt MR E0',
    material_type: 'MDF', brand: 'Polytec', thickness: 16,
    area_cost: 51.52, area_handling_cost: 0, area_assembly_cost: 0,
    sheet_length: 2400, sheet_width: 1200, expected_yield_factor: 1,
    minimum_job_area: 0, minimum_usage_rollover: 0, double_sided: false, double_sided_cost: 0,
    horizontal_grain: false, horizontal_grain_surcharge: 0, visibility_status: 'Available' },
  { id: 'white', item_code: 'POLY25832', name: 'MDF 162412 DS Polar White Sheen LMG E0 No Film',
    material_type: 'MDF', brand: 'Polytec', thickness: 16,
    area_cost: 31.47, area_handling_cost: 0, area_assembly_cost: 0,
    sheet_length: 2400, sheet_width: 1200, expected_yield_factor: 1,
    minimum_job_area: 0, minimum_usage_rollover: 0, double_sided: false, double_sided_cost: 0,
    horizontal_grain: false, horizontal_grain_surcharge: 0, visibility_status: 'Available' },
];

export const edges = [
  { id: 'abs1', item_code: 'ABS1W', name: '1mm ABS White', edge_type: 'ABS', brand: 'Nover',
    thickness: 1, length_cost: 0.30, handling_cost: 0, area_handling_cost: 0,
    application_cost: 0, visibility_status: 'Available' },
];

export const hardware = [
  { id: 'hng', item_code: 'SAL-100-FO', name: 'Hinge Salice Silentia+ Series 100 105 Full Overlay',
    hardware_type: 'hinge', brand: 'Salice', series: 'Silentia+', unit_cost: 2.42,
    inner_unit_cost: 0, handling_cost: 0, machining_cost: 0, assembly_cost: 0.98,
    runner_depth: null, runner_height: null, visibility_status: 'Available' },
  { id: 'plt', item_code: 'HET-CROSS', name: 'Hinge Plate Hettich Cross Direct height adjustment',
    hardware_type: 'hinge plate', brand: 'Hettich', series: 'Cross', unit_cost: 2.50,
    inner_unit_cost: 0, handling_cost: 0, machining_cost: 0, assembly_cost: 0.65,
    runner_depth: null, runner_height: null, visibility_status: 'Available' },
  { id: 'run', item_code: '514.11.834', name: 'Hafele Alto Slim Drawer Kit H199 500mm 35kg White',
    hardware_type: 'drawer runner', brand: 'Hafele', series: 'Alto Slim', unit_cost: 33.15,
    inner_unit_cost: 0, handling_cost: 0, machining_cost: 0, assembly_cost: 5.44,
    runner_depth: 500, runner_height: 199, visibility_status: 'Available' },
  { id: 'hdl', item_code: 'TAB-160', name: 'Tab Pull Rebated 160mm',
    hardware_type: 'handle', brand: 'Nover', series: 'Tab Pull', unit_cost: 15.50,
    inner_unit_cost: 0, handling_cost: 0, machining_cost: 0, assembly_cost: 0,
    runner_depth: null, runner_height: null, visibility_status: 'Available' },
  { id: 'leg', item_code: 'LEG-ADJ', name: 'Adjustable Leg', hardware_type: 'leg', brand: 'Generic',
    series: null, unit_cost: 3.50, inner_unit_cost: 0, handling_cost: 0, machining_cost: 0,
    assembly_cost: 0, runner_depth: null, runner_height: null, visibility_status: 'Available' },
  { id: 'pin', item_code: 'PIN-SHELF', name: 'Hafele White Shelf Support', hardware_type: 'shelf_pin',
    brand: 'Hafele', series: null, unit_cost: 0.15, inner_unit_cost: 0, handling_cost: 0,
    machining_cost: 0, assembly_cost: 0.16, runner_depth: null, runner_height: null,
    visibility_status: 'Available' },
  { id: 's28', item_code: 'SCR-28', name: '28mm Screws', hardware_type: 'consumable', unit_cost: 0.04 },
  { id: 's45', item_code: 'SCR-45', name: '45mm Screws (wall fixing)', hardware_type: 'consumable', unit_cost: 0.10 },
  { id: 's70', item_code: 'SCR-70', name: '70mm Screws', hardware_type: 'consumable', unit_cost: 0.10 },
];

/** Live labor_rates rows. Override via `laborOverride` to test a re-calibration. */
export const labor = [
  { id: 'l1', name: 'Labor Base Per Cabinet', rate_type: 'per_cabinet', rate: 235 },
  { id: 'l2', name: 'Labor Per Door', rate_type: 'per_door', rate: 36 },
  { id: 'l3', name: 'Labor Per Drawer', rate_type: 'per_drawer', rate: 102 },
  { id: 'l4', name: 'Labor Tall Extra', rate_type: 'per_cabinet', rate: 162 },
  { id: 'l5', name: 'Labor Per Metre Width', rate_type: 'per_metre', rate: 86 },
  { id: 'l6', name: 'Labor Panel or Filler', rate_type: 'per_item', rate: 158 },
];

export const dims = {
  toeKickHeight: 135, shelfSetback: 5, baseHeight: 880, baseDepth: 555,
  wallHeight: 879, wallDepth: 330, tallHeight: 2400, tallDepth: 580,
  benchtopThickness: 24, benchtopOverhang: 25, splashbackHeight: 600,
  doorGap: 2, drawerGap: 2, leftGap: 1.5, rightGap: 1.5,
  topMargin: 0, bottomMargin: 0, wallGap: 10,
  boardThickness: 16, backPanelSetback: 16, topReveal: 3, sideReveal: 2, handleDrillSpacing: 32,
};

export const hardwareOptions = {
  hingeType: 'SAL-100-FO', drawerType: '514.11.834', cabinetTop: 'rail',
  supplyHardware: true, adjustableLegs: true, handleId: 'TAB-160',
};

/** Turn a Microvellum cabinet schedule into PlacedItems plus the pricing data. */
export function fixture(rows, laborOverride) {
  const items = rows.map((r, i) => ({
    instanceId: `mv-${i + 1}`,
    definitionId: r.name,        // generic mapping reads doors/drawers from the name
    itemType: 'Cabinet',
    productName: r.name,
    cabinetNumber: `C${String(i + 1).padStart(2, '0')}`,
    x: 0, y: 0, z: 0, rotation: 0,
    width: r.w, height: r.h, depth: r.d,
    carcaseMaterialId: 'carcase',
    exteriorMaterialId: 'door',
    edgeId: 'abs1',
  }));
  return {
    items, dims, hardwareOptions,
    pricingData: {
      parts, materials, edges, hardware,
      labor: laborOverride ?? labor,
      doorDrawer: [], benchtop: [],
    },
  };
}
