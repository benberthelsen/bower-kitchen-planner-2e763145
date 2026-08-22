/**
 * Pricing engine smoke tests — fault hunt.
 *
 * Build + run:
 *   npx esbuild scripts/pricing-smoke-entry.ts --bundle --format=esm \
 *     --outfile=.tmp-snap-test/pricing.mjs "--alias:@=./src" --platform=node
 *   node scripts/pricing-smoke.mjs
 *
 * Uses a deterministic synthetic pricing dataset so it runs offline and in CI.
 * Checks engine INVARIANTS across all cabinet families plus degenerate inputs.
 */
import { generateQuoteBOM, generateCabinetBOM, calculateBenchtops } from '../.tmp-snap-test/pricing.mjs';

// ---------- synthetic pricing fixture ----------
const P = (name, lf, wf, extra = {}) => ({
  name, part_type: 'Carcase',
  length_function: lf, width_function: wf,
  edging: '1/-/-/-',
  handling_cost: 1.5, area_handling_cost: 0, machining_cost: 1.2, area_machining_cost: 0,
  assembly_cost: 2.0, area_assembly_cost: 0, visibility_status: 'Available',
  ...extra,
});

const pricingData = {
  parts: [
    P('Base Left Side', 'CabHeight-ToeKickHeight', 'CabDepth'),
    P('Base Right Side', 'CabHeight-ToeKickHeight', 'CabDepth'),
    P('Base Bottom', 'CabWidth-CarcaseThick*2', 'CabDepth-BackThickness'),
    P('Base Back', 'CabWidth-CarcaseThick*2', 'CabHeight-ToeKickHeight'),
    P('Rail On Flat', 'CabWidth-CarcaseThick*2', '80'),
    P('Adjustable Shelf', 'CabWidth-CarcaseThick*2-4', 'CabDepth-ShelfOffset'),
    P('Door', 'CabHeight-ToeKickHeight-DoorGap', 'CabWidth/NumDoors-DoorGap'),
    P('Drawer Front', 'CabWidth-DrawerGap', '180'),
    P('Drawer Left Side', 'CabDepth-50', '120'),
    P('Drawer Right Side', 'CabDepth-50', '120'),
    P('Drawer Back', 'CabWidth-100', '120'),
    P('Drawer Bottom', 'CabWidth-80', 'CabDepth-60'),
    P('Upper Left Side', 'CabHeight', 'CabDepth'),
    P('Upper Right Side', 'CabHeight', 'CabDepth'),
    P('Upper Bottom', 'CabWidth-CarcaseThick*2', 'CabDepth'),
    P('Upper Top', 'CabWidth-CarcaseThick*2', 'CabDepth'),
    P('Upper Back', 'CabWidth-CarcaseThick*2', 'CabHeight'),
    P('Tall Left Side', 'CabHeight-ToeKickHeight', 'CabDepth'),
    P('Tall Right Side', 'CabHeight-ToeKickHeight', 'CabDepth'),
    P('Tall Bottom', 'CabWidth-CarcaseThick*2', 'CabDepth'),
    P('Tall Top', 'CabWidth-CarcaseThick*2', 'CabDepth'),
    P('Tall Back', 'CabWidth-CarcaseThick*2', 'CabHeight-ToeKickHeight'),
    P('Ls Base Left Side', 'CabHeight-ToeKickHeight', 'CabDepth'),
    P('Ls Base Right Side', 'CabHeight-ToeKickHeight', 'CabLeftDepth'),
    P('Ls Base Left Back', 'CabWidth-CarcaseThick', 'CabHeight-ToeKickHeight'),
    P('Ls Base Right Back', 'CabLeftDepth-CarcaseThick', 'CabHeight-ToeKickHeight'),
    P('Ls Base Bottom', 'CabWidth-CarcaseThick*2', 'CabLeftDepth-CarcaseThick'),
    P('Ls Rail On Edge', 'CabWidth-CarcaseThick*2', '80'),
    P('L Shape Shelf', 'CabWidth-CarcaseThick*2-4', 'CabLeftDepth-ShelfOffset'),
  ],
  materials: [
    { id: 'm1', item_code: 'WHT16', name: 'White Carcase 16.5', material_type: 'Melamine',
      area_cost: 34.5, area_handling_cost: 3.15, area_assembly_cost: 4.5,
      sheet_length: 2400, sheet_width: 1200, expected_yield_factor: 0.85,
      visibility_status: 'Available' },
  ],
  edges: [
    { id: 'e1', item_code: 'EW1', name: 'White 1mm', edge_type: 'Melamine', thickness: 1,
      length_cost: 1.5, handling_cost: 0.5, application_cost: 0.9, visibility_status: 'Available' },
  ],
  hardware: [
    { id: 'h1', item_code: 'HNG-S200', name: 'Series 200 110 KnockIn', hardware_type: 'hinge', series: 'Salice Knock In', unit_cost: 6.2, machining_cost: 1.4, assembly_cost: 1.2 },
    { id: 'h2', item_code: 'PLT-S200', name: 'Salice Mounting Plate', hardware_type: 'hinge plate', series: 'Salice Knock In', unit_cost: 2.1, machining_cost: 0, assembly_cost: 0.4 },
    { id: 'h3', item_code: 'RUN-ALTO500', name: 'Hafele Alto Slim 500', hardware_type: 'drawer runner', series: 'Alto Slim', runner_depth: 500, unit_cost: 28, machining_cost: 2, assembly_cost: 3 },
    { id: 'h4', item_code: 'SCR-28', name: '28mm Screws', hardware_type: 'consumable', unit_cost: 0.04 },
    { id: 'h5', item_code: 'SCR-45', name: '45mm Screws', hardware_type: 'consumable', unit_cost: 0.05 },
  ],
  labor: [
    { name: 'Labor Base Per Cabinet', rate: 235 },
    { name: 'Labor Per Door', rate: 36 },
    { name: 'Labor Per Drawer', rate: 102 },
    { name: 'Labor Tall Extra', rate: 162 },
    { name: 'Labor Per Metre Width', rate: 86 },
  ],
  doorDrawer: [],
  benchtop: [],
};

const dims = {
  toeKickHeight: 135, shelfSetback: 5, baseHeight: 730, baseDepth: 575,
  wallHeight: 720, wallDepth: 350, tallHeight: 2100, tallDepth: 580,
  benchtopThickness: 33, benchtopOverhang: 25, splashbackHeight: 600,
  doorGap: 2, drawerGap: 2, leftGap: 1.5, rightGap: 1.5,
  topMargin: 0, bottomMargin: 0, wallGap: 10,
  boardThickness: 18, backPanelSetback: 16, topReveal: 3, sideReveal: 2, handleDrillSpacing: 32,
};

const hw = { hingeType: 'Series 200', drawerType: 'Alto', cabinetTop: 'rail', supplyHardware: true, adjustableLegs: true, handleId: 'bar' };

const cab = (definitionId, width, height, depth, n = 1) => ({
  instanceId: `t-${definitionId}-${n}`, definitionId, itemType: 'Cabinet',
  cabinetNumber: `C${n}`, x: 0, y: 0, z: 0, rotation: 0, width, height, depth,
});

// ---------- assertions ----------
let failures = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   ← ' + detail}`);
};
const finite = (n) => typeof n === 'number' && Number.isFinite(n);

// Legacy jobs stored a display label rather than the material UUID. The
// resolver must tolerate status words and supplier description suffixes
// without falling through to an unrelated cheapest board.
const legacyMaterialCab = {
  ...cab('base_1_door', 600, 870, 575, 991),
  carcaseMaterialId: 'White Carcase Available - 16.5mm Shop Materials HMR PB',
  exteriorMaterialId: 'White Carcase Available - 16.5mm Shop Materials HMR PB',
};
const legacyMaterialBom = generateCabinetBOM(legacyMaterialCab, dims, hw, pricingData);
check(
  'material aliases: verbose legacy carcase resolves to priced White Carcase',
  !legacyMaterialBom.warnings?.some(w => /material .*not found/i.test(w)),
  (legacyMaterialBom.warnings ?? []).join(' | '),
);

const namedQuoteCabinet = {
  ...cab('base_1_door', 600, 870, 575, 992),
  productName: 'Base 1 Door',
};
const namedQuote = generateQuoteBOM([namedQuoteCabinet], dims, hw, pricingData);
check(
  'workshop documents retain the configured cabinet name',
  namedQuote.cabinets[0]?.cabinetName === 'Base 1 Door',
  namedQuote.cabinets[0]?.cabinetName,
);

// 1. Every cabinet family produces a sane BOM
const families = [
  ['base_1_door', 600, 870, 575],
  ['base_2_door', 900, 870, 575],
  ['base_2_door_1_drawer', 900, 870, 575],
  ['base_3_drawer', 600, 870, 575],
  ['base_4_drawer', 450, 870, 575],
  ['sink_base_2_door', 800, 870, 575],
  ['base_corner_pie_cut_2_door', 900, 870, 900],
  ['wall_2_door', 900, 720, 350],
  ['upper_1_door', 450, 720, 350],
  ['tall_2_door_pantry', 900, 2100, 580],
];

for (const [id, w, h, d] of families) {
  const bom = generateCabinetBOM(cab(id, w, h, d), dims, hw, pricingData, id);
  const partsOk = bom.parts.length > 0;
  check(`${id}: explodes to parts (${bom.parts.length})`, partsOk, 'no parts generated');
  if (!partsOk) continue;

  const badDims = bom.parts.filter(p => !finite(p.length) || !finite(p.width) || p.length <= 0 || p.width <= 0 || p.length > 5000 || p.width > 5000);
  check(`${id}: all part dims positive & sane`, badDims.length === 0,
    badDims.map(p => `${p.name}=${Math.round(p.length)}x${Math.round(p.width)}`).join(', '));

  const subs = bom.subtotals;
  const allFinite = Object.values(subs).every(finite) && finite(bom.totalCost);
  check(`${id}: all costs finite`, allFinite, JSON.stringify(subs));
  const sum = Object.values(subs).reduce((a, b) => a + b, 0);
  check(`${id}: totalCost = sum(subtotals)`, Math.abs(sum - bom.totalCost) < 0.01, `${sum} vs ${bom.totalCost}`);
  check(`${id}: labor > 0`, subs.labor > 0, String(subs.labor));
  check(`${id}: materials > 0`, subs.materials > 0, String(subs.materials));

  const hinges = bom.hardware.filter(x => x.hardwareType === 'hinge').reduce((s, x) => s + x.quantity, 0);
  const plates = bom.hardware.filter(x => x.hardwareType === 'hinge-plate').reduce((s, x) => s + x.quantity, 0);
  check(`${id}: plates match hinges (${hinges})`, hinges === plates, `${hinges} hinges vs ${plates} plates`);

  const consumables = bom.hardware.filter(x => String(x.hardwareType).startsWith('consumable-'));
  check(`${id}: construction consumables present`, consumables.length >= 2, String(consumables.length));
}

// 2. Drawer cabinets carry runners
{
  const bom = generateCabinetBOM(cab('base_3_drawer', 600, 870, 575), dims, hw, pricingData);
  const runners = bom.hardware.filter(x => /runner|drawer/i.test(x.hardwareType) || /runner/i.test(x.name));
  check('3-drawer: runners present', runners.some(r => r.quantity >= 3), JSON.stringify(runners.map(r => [r.name, r.quantity])));
}

// 3. Min-board rule: a job with ONE small door still pays a full sheet
{
  const one = generateQuoteBOM([cab('base_1_door', 300, 870, 575)], dims, hw, pricingData);
  const sheet = one.consolidatedSheets[0];
  check('min-board: 1 small cabinet → ≥1 whole sheet', sheet && sheet.sheetsRequired >= 1, JSON.stringify(sheet));
  // grandTotal.materials is BOARD ONLY (area_cost); handling/assembly are separate subtotals.
  const fullSheetCost = (2.4 * 1.2) * 34.5;
  check('min-board: charged ≥ full sheet cost', one.grandTotal.materials >= fullSheetCost - 0.01,
    `${one.grandTotal.materials} vs ${fullSheetCost}`);
}

// 4. Job-level consolidation ≤ per-cabinet sheet sum (never charges MORE than per-cabinet rounding)
{
  const cabs = [cab('base_1_door', 600, 870, 575, 1), cab('base_2_door', 900, 870, 575, 2), cab('wall_2_door', 900, 720, 350, 3)];
  const job = generateQuoteBOM(cabs, dims, hw, pricingData);
  const perCabSheets = job.cabinets.reduce((s, c) => s + c.sheets.reduce((x, sh) => x + sh.sheetsRequired, 0), 0);
  const jobSheets = job.consolidatedSheets.reduce((s, sh) => s + sh.sheetsRequired, 0);
  check('consolidation: job sheets ≤ per-cabinet sheets', jobSheets <= perCabSheets, `${jobSheets} vs ${perCabSheets}`);
  check('grandTotal GST = 10%', Math.abs(job.grandTotal.gst - job.grandTotal.subtotalExGst * 0.1) < 0.01);
  check('grandTotal total = subtotal + GST', Math.abs(job.grandTotal.total - (job.grandTotal.subtotalExGst + job.grandTotal.gst)) < 0.01);
  check('grandTotal labor = Σ cabinet labor', Math.abs(job.grandTotal.labor - job.cabinets.reduce((s, c) => s + c.subtotals.labor, 0)) < 0.01);

  // 25m roll rounding
  const tape = job.consolidatedEdgeTape[0];
  if (tape) {
    check('edge tape: rolls = ceil(LM/25)', tape.rollsRequired === Math.ceil(tape.linearMeters / 25),
      `${tape.linearMeters}m → ${tape.rollsRequired} rolls`);
    const orderedTapeCost = tape.rollsRequired * 25 * tape.costPerMeter;
    check('edge tape: material charge covers whole ordered rolls',
      tape.totalCost >= orderedTapeCost,
      `${tape.totalCost} vs minimum ${orderedTapeCost}`);
  } else {
    check('edge tape: consolidation produced tape', false, 'no tape rows');
  }
}

// 4b. Build hours (P2 time model) — spot checks
{
  const bom = generateCabinetBOM(cab('base_2_door_1_drawer', 900, 870, 575), dims, hw, pricingData);
  const bh  = bom.buildHours;
  check('buildHours: cut > 0',      bh.cut > 0,       String(bh.cut));
  check('buildHours: edge > 0',     bh.edge > 0,      String(bh.edge));
  check('buildHours: assembly > 0', bh.assembly > 0,  String(bh.assembly));
  check('buildHours: total = cut+edge+asm',
    Math.abs(bh.total - (bh.cut + bh.edge + bh.assembly)) < 0.001,
    `${bh.total} vs ${bh.cut}+${bh.edge}+${bh.assembly}`);
  check('buildHours: cost = machineCost+labourCost',
    Math.abs(bh.cost - (bh.machineCost + bh.labourCost)) < 0.01,
    `${bh.cost} vs ${bh.machineCost}+${bh.labourCost}`);

  const tall = generateCabinetBOM(cab('tall_2_door_pantry', 900, 2100, 580), dims, hw, pricingData);
  check('buildHours: tall assembly > base assembly',
    tall.buildHours.assembly > bom.buildHours.assembly,
    `tall=${tall.buildHours.assembly} base=${bom.buildHours.assembly}`);

  const quote = generateQuoteBOM(
    [cab('base_1_door', 600, 870, 575, 1), cab('wall_2_door', 900, 720, 350, 2)],
    dims, hw, pricingData
  );
  check('buildHours: quote total = sum of cabinet totals',
    Math.abs(quote.buildHours.total - quote.cabinets.reduce((s, c) => s + c.buildHours.total, 0)) < 0.001,
    String(quote.buildHours.total));
}

// 5. Monotonicity: a wider cabinet of the same type never costs less
{
  const small = generateCabinetBOM(cab('base_2_door', 600, 870, 575), dims, hw, pricingData);
  const big = generateCabinetBOM(cab('base_2_door', 1200, 870, 575), dims, hw, pricingData);
  check('monotonic: 1200w ≥ 600w', big.totalCost >= small.totalCost, `${big.totalCost} vs ${small.totalCost}`);
}

// 6. Degenerate inputs must not crash or emit NaN
{
  const weird = [
    cab('base_1_door', 0, 870, 575),
    cab('base_1_door', -50, 870, 575),
    cab('base_1_door', 600, 0, 0),
    cab('unknown_product_xyz', 600, 870, 575),
    cab('base_9_drawer', 600, 870, 575),
    cab('base_1_door', 99999, 99999, 99999),
  ];
  for (const c of weird) {
    let bom = null, threw = false;
    try { bom = generateCabinetBOM(c, dims, hw, pricingData); } catch (e) { threw = true; }
    check(`degenerate ${c.definitionId} ${c.width}x${c.height}: no crash`, !threw);
    if (bom) {
      const nan = !finite(bom.totalCost) || bom.parts.some(p => !finite(p.length) || !finite(p.width));
      check(`degenerate ${c.definitionId} ${c.width}x${c.height}: no NaN`, !nan, `total=${bom.totalCost}`);
    }
  }
}

// 7. What is and is not priced through the parts engine.
//
// UPDATED: this used to assert that ovens, fillers and end panels all produced
// an empty BOM. Two of those were wrong:
//   - an appliance HOUSING ("Base Under Counter Oven") is a real carcass with
//     sides, bottom, back and rails, and was being quoted at $0;
//   - a filler / end panel is a real cut, edged board with a Microvellum
//     product behind it ("Base Return Filler"), also quoted at $0.
// Only a true appliance OPENING has no carcass of its own.
{
  // genuinely no carcass -> still empty
  for (const id of ['dishwasher_opening']) {
    const bom = generateCabinetBOM(cab(id, 600, 870, 575), dims, hw, pricingData);
    check(`${id}: opening has no carcass`, bom.parts.length === 0 && bom.totalCost === 0, `${bom.parts.length} parts, $${bom.totalCost}`);
  }
  // real boards -> must now be priced
  for (const id of ['oven_600', 'base_filler', 'end_panel']) {
    const bom = generateCabinetBOM(cab(id, 600, 870, 575), dims, hw, pricingData);
    check(`${id}: real board is priced`, bom.parts.length > 0 && bom.totalCost > 0, `${bom.parts.length} parts, $${bom.totalCost}`);
  }
  for (const id of []) {
    const bom = generateCabinetBOM(cab(id, 600, 870, 575), dims, hw, pricingData);
    check(`${id}: intentionally empty BOM`, bom.parts.length === 0 && bom.totalCost === 0, `${bom.parts.length} parts, $${bom.totalCost}`);
  }
}

// 8. Kick panels (adjustable-leg toe kick priced from 2400mm stock)
{
  // Three base cabs totalling 2200mm — fits in one 2400mm piece
  const three = [
    cab('base_2_door', 800, 870, 575, 1),
    cab('base_1_door', 700, 870, 575, 2),
    cab('base_2_door_1_drawer', 700, 870, 575, 3),
  ];
  const q3 = generateQuoteBOM(three, dims, { ...hw, adjustableLegs: true }, pricingData);
  const kickSheet = q3.consolidatedSheets.find(s => s.materialName.includes('Kick'));
  check('kick: sheet allocation exists for base cabs', !!kickSheet, kickSheet ? 'found' : 'missing');
  check('kick: 2200mm run needs 1 piece (fits in 2400)', kickSheet?.sheetsRequired === 1, String(kickSheet?.sheetsRequired));
  check('kick: cost > 0', (kickSheet?.totalMaterialCost ?? 0) > 0, String(kickSheet?.totalMaterialCost));
  check('kick takeoff: one complete 2200mm face, not three cabinet pieces',
    q3.kickboards.length === 1
      && q3.kickboards[0].runLengthMm === 2200
      && q3.kickboards[0].cutLengthsMm.join(',') === '2200',
    JSON.stringify(q3.kickboards));

  const dishwasherOpening = {
    instanceId: 'dw-kick', definitionId: 'dishwasher_opening', itemType: 'Appliance',
    layoutRole: 'dishwasher', x: 1100, y: 0, z: 287.5, rotation: 0,
    width: 600, height: 730, depth: 575,
  };
  const positionedRun = [
    { ...cab('base_2_door', 800, 730, 575, 21), x: 400, z: 287.5 },
    dishwasherOpening,
    { ...cab('base_2_door', 800, 730, 575, 22), x: 1800, z: 287.5 },
  ];
  const qDishwasherKick = generateQuoteBOM(positionedRun, dims, { ...hw, adjustableLegs: true }, pricingData);
  check('kick takeoff: adjoining cabinets continue through a dishwasher opening',
    qDishwasherKick.kickboards.length === 1
      && qDishwasherKick.kickboards[0].runLengthMm === 2200,
    JSON.stringify(qDishwasherKick.kickboards));

  const separatedRuns = [
    { ...cab('base_1_door', 600, 730, 575, 23), x: 300, z: 287.5 },
    { ...cab('base_1_door', 600, 730, 575, 24), x: 2100, z: 287.5 },
  ];
  const qSeparatedKick = generateQuoteBOM(separatedRuns, dims, { ...hw, adjustableLegs: true }, pricingData);
  check('kick takeoff: a genuine cabinet gap starts a second run',
    qSeparatedKick.kickboards.length === 2
      && qSeparatedKick.kickboards.every(run => run.runLengthMm === 600),
    JSON.stringify(qSeparatedKick.kickboards));

  // Four base cabs totalling 3300mm - needs 2 pieces (ceil(3300/2400)=2)
  const four = [
    cab('base_2_door', 900, 870, 575, 1),
    cab('base_2_door', 900, 870, 575, 2),
    cab('base_2_door', 900, 870, 575, 3),
    cab('base_1_door', 600, 870, 575, 4),
  ];
  const q4 = generateQuoteBOM(four, dims, { ...hw, adjustableLegs: true }, pricingData);
  const kickSheet4 = q4.consolidatedSheets.find(s => s.materialName.includes('Kick'));
  check('kick: 3300mm run needs 2 pieces', kickSheet4?.sheetsRequired === 2, String(kickSheet4?.sheetsRequired));

  // Wall cabs only - NO kick panels
  const wallOnly = [cab('wall_2_door', 900, 720, 350, 1)];
  const qWall = generateQuoteBOM(wallOnly, dims, { ...hw, adjustableLegs: true }, pricingData);
  const kickSheetWall = qWall.consolidatedSheets.find(s => s.materialName.includes('Kick'));
  check('kick: wall-only job has no kick sheets', !kickSheetWall, kickSheetWall ? 'found (wrong)' : 'absent (correct)');

  // adjustableLegs: false - NO kick panel added (ladder kick priced as cabinet)
  const qLadder = generateQuoteBOM(three, dims, { ...hw, adjustableLegs: false }, pricingData);
  const kickSheetLadder = qLadder.consolidatedSheets.find(s => s.materialName.includes('Kick'));
  check('kick: ladder kick mode adds no kick sheets', !kickSheetLadder, kickSheetLadder ? 'found (wrong)' : 'absent (correct)');
  check('kick takeoff: ladder kick mode has no adjustable-leg faces', qLadder.kickboards.length === 0);
}

// 9. Benchtop pricing — per_sqm (legacy stone), per_sheet (Meganite), per_lm (Egger)
{
  // Helper: cab with explicit rotation
  const cabR = (id, w, h, d, rot, n) => ({ ...cab(id, w, h, d, n), rotation: rot });

  // ── 9a–9f: per_sqm (legacy stone path) ───────────────────────────────────
  const stoneMat = {
    id: 'st1', brand: 'Caesarstone', range_tier: 'Premium',
    material_type: 'stone', pricing_method: 'per_sqm',
    stock_length_mm: 3200, stock_depth_mm: 1600,
    price_per_sheet: null, price_per_lm: null, install_per_lm: null,
    trade_supply_per_sqm: 250, install_supply_per_sqm: 80,
  };
  const pdStone = { ...pricingData, benchtop: [stoneMat] };

  const wallA = [
    cabR('base_1_door', 600, 870, 575, 0, 1),
    cabR('base_2_door', 600, 870, 575, 0, 2),
  ];
  const qA = generateQuoteBOM(wallA, dims, hw, pdStone);
  check('benchtop: benchtops array has 1 entry for single wall', qA.benchtops.length === 1, String(qA.benchtops.length));
  const btA = qA.benchtops[0];
  check('benchtop: runLengthMm = 1200', btA?.runLengthMm === 1200, String(btA?.runLengthMm));
  check('benchtop: depthMm = 600 (575+25)', btA?.depthMm === 600, String(btA?.depthMm));
  const expectedArea = (1200 / 1000) * (600 / 1000);
  check('benchtop: areaSqm = 0.72', Math.abs((btA?.areaSqm ?? 0) - expectedArea) < 0.001, String(btA?.areaSqm));
  const expectedSupply = expectedArea * 250;
  const expectedInstall = expectedArea * 80;
  check('benchtop: supplyCost correct (per_sqm)', Math.abs((btA?.supplyCost ?? 0) - expectedSupply) < 0.01, String(btA?.supplyCost));
  check('benchtop: installCost correct (per_sqm)', Math.abs((btA?.installCost ?? 0) - expectedInstall) < 0.01, String(btA?.installCost));
  check('benchtop: totalCost = supply + install', Math.abs((btA?.totalCost ?? 0) - (expectedSupply + expectedInstall)) < 0.01, String(btA?.totalCost));
  check('benchtop: wallLabel is "Wall A"', btA?.wallLabel === 'Wall A', String(btA?.wallLabel));
  check('benchtop: materialName includes brand', btA?.materialName?.includes('Caesarstone'), String(btA?.materialName));

  // 9b. Two-wall job
  const twoWall = [
    cabR('base_1_door', 600, 870, 575, 0, 1),
    cabR('base_2_door', 900, 870, 575, 0, 2),
    cabR('sink_base_2_door', 800, 870, 575, 90, 3),
  ];
  const qTwo = generateQuoteBOM(twoWall, dims, hw, pdStone);
  check('benchtop: two-wall job -> 2 runs', qTwo.benchtops.length === 2, String(qTwo.benchtops.length));
  const wallArun = qTwo.benchtops.find(b => b.rotation === 0);
  const wallBrun = qTwo.benchtops.find(b => b.rotation === 90);
  check('benchtop: Wall A run = 1500mm (600+900)', wallArun?.runLengthMm === 1500, String(wallArun?.runLengthMm));
  check('benchtop: Wall B run = 800mm', wallBrun?.runLengthMm === 800, String(wallBrun?.runLengthMm));

  // 9c. Wall/upper cabs only -> no benchtop runs
  const wallOnly2 = [cabR('wall_2_door', 900, 720, 350, 0, 1)];
  const qWall2 = generateQuoteBOM(wallOnly2, dims, hw, pdStone);
  check('benchtop: wall-only job -> 0 runs', qWall2.benchtops.length === 0, String(qWall2.benchtops.length));

  const dishwasherRun = [
    cabR('base_2_door', 600, 870, 575, 0, 21),
    { ...cabR('dishwasher_opening', 600, 870, 575, 0, 22), itemType: 'Appliance', layoutRole: 'dishwasher' },
  ];
  const qDishwasherRun = generateQuoteBOM(dishwasherRun, dims, hw, pdStone);
  check('benchtop: dishwasher opening remains inside the continuous run',
    qDishwasherRun.benchtops[0]?.runLengthMm === 1200,
    String(qDishwasherRun.benchtops[0]?.runLengthMm));

  // 9d. No benchtop material -> empty
  const qNoBenchtop = generateQuoteBOM(wallA, dims, hw, pricingData);
  check('benchtop: no material record -> empty array', qNoBenchtop.benchtops.length === 0, String(qNoBenchtop.benchtops.length));

  // 9e. grandTotal fields
  check('benchtop: grandTotal.benchtopSupply > 0', qA.grandTotal.benchtopSupply > 0, String(qA.grandTotal.benchtopSupply));
  check('benchtop: grandTotal.benchtopInstall > 0', qA.grandTotal.benchtopInstall > 0, String(qA.grandTotal.benchtopInstall));
  check('benchtop: grandTotal.benchtop = supply + install',
    Math.abs(qA.grandTotal.benchtop - (qA.grandTotal.benchtopSupply + qA.grandTotal.benchtopInstall)) < 0.01,
    String(qA.grandTotal.benchtop));
  check('benchtop: grandTotal.cost includes benchtop',
    qA.grandTotal.cost > qA.cabinets.reduce((s, c) => s + c.totalCost, 0),
    'cost=' + qA.grandTotal.cost);

  // 9f. stone categoryMarkup wires into clientMarkup
  const commercial = { gstPct: 0.1, categoryMarkups: { stone: 0.20 } };
  const qMarkup = generateQuoteBOM(wallA, dims, hw, pdStone, commercial);
  const expectedStoneMarkup = qMarkup.grandTotal.benchtop * 0.20;
  check('benchtop: stone categoryMarkup applied to benchtop cost',
    Math.abs(qMarkup.grandTotal.clientMarkup - expectedStoneMarkup) < 0.01,
    'markup=' + qMarkup.grandTotal.clientMarkup + ' expected~' + expectedStoneMarkup.toFixed(2));

  // 9g: per_sheet pricing (Meganite solid surface)
  const meganite = {
    id: 'mg1', brand: 'Meganite', range_tier: 'Snow White',
    material_type: 'solid_surface', pricing_method: 'per_sheet',
    stock_length_mm: 3660, stock_depth_mm: 760,
    price_per_sheet: 493, price_per_lm: null, install_per_lm: null,
    trade_supply_per_sqm: 0, install_supply_per_sqm: 0,
  };
  const pdMeg = { ...pricingData, benchtop: [meganite] };

  // 3000mm run = ceil(3000/3660) = 1 sheet = $493
  const megWallA = [
    cabR('base_1_door', 1000, 870, 575, 0, 1),
    cabR('base_2_door', 1000, 870, 575, 0, 2),
    cabR('base_2_door', 1000, 870, 575, 0, 3),
  ];
  const qMeg = generateQuoteBOM(megWallA, dims, hw, pdMeg);
  const btMeg = qMeg.benchtops[0];
  check('meganite: 3000mm run = 1 sheet', btMeg?.sheetsRequired === 1, String(btMeg?.sheetsRequired));
  check('meganite: supplyCost = 1 x $493', Math.abs((btMeg?.supplyCost ?? 0) - 493) < 0.01, String(btMeg?.supplyCost));
  check('meganite: installCost = 0 (fabrication separate)', btMeg?.installCost === 0, String(btMeg?.installCost));
  check('meganite: pricingMethod = per_sheet', btMeg?.pricingMethod === 'per_sheet', String(btMeg?.pricingMethod));
  check('meganite: materialType = solid_surface', btMeg?.materialType === 'solid_surface', String(btMeg?.materialType));

  // 4000mm run = ceil(4000/3660) = 2 sheets = $986
  const megWallB = [
    cabR('base_1_door', 2000, 870, 575, 0, 1),
    cabR('base_2_door', 2000, 870, 575, 0, 2),
  ];
  const qMeg2 = generateQuoteBOM(megWallB, dims, hw, pdMeg);
  const btMeg2 = qMeg2.benchtops[0];
  check('meganite: 4000mm run = 2 sheets', btMeg2?.sheetsRequired === 2, String(btMeg2?.sheetsRequired));
  check('meganite: supplyCost = 2 x $493 = $986', Math.abs((btMeg2?.supplyCost ?? 0) - 986) < 0.01, String(btMeg2?.supplyCost));

  // Two separate walls share the same physical sheet when their cuts fit.
  // This guards against the old one-sheet-per-wall overcharge.
  const megTwoWalls = [
    cabR('base_2_door', 1600, 870, 575, 0, 11),
    cabR('base_2_door', 1600, 870, 575, 90, 12),
  ];
  const qMegPacked = generateQuoteBOM(megTwoWalls, dims, hw, pdMeg);
  check('meganite: two 1600mm wall cuts nest on one 3660mm sheet',
    qMegPacked.benchtops.every(bt => bt.jobSheetsRequired === 1),
    qMegPacked.benchtops.map(bt => bt.jobSheetsRequired).join(','));
  check('meganite: shared sheet charged once across both walls',
    Math.abs(qMegPacked.grandTotal.benchtopSupply - 493) < 0.01,
    String(qMegPacked.grandTotal.benchtopSupply));

  // A 900mm corner cabinet is two standard-depth arms, not a 900mm-deep
  // rectangle covering the whole wall. This job needs two lengthwise sheets,
  // not a third sheet caused by the corner footprint depth.
  const megCornerJob = [
    cabR('base_corner_pie_cut_2_door', 900, 870, 900, 0, 31),
    cabR('base_2_door', 1500, 870, 575, 0, 32),
    cabR('base_corner_pie_cut_2_door', 900, 870, 900, 90, 33),
    cabR('base_2_door', 700, 870, 575, 90, 34),
  ];
  const qMegCorner = generateQuoteBOM(megCornerJob, dims, hw, pdMeg);
  check('meganite: corner footprint keeps standard 600mm benchtop arm depth',
    qMegCorner.benchtops.every(bt => bt.depthMm === 600),
    qMegCorner.benchtops.map(bt => bt.depthMm).join(','));
  check('meganite: 2400mm + 1600mm corner runs use 2 job sheets, not 3',
    qMegCorner.benchtops.every(bt => bt.jobSheetsRequired === 2),
    qMegCorner.benchtops.map(bt => bt.jobSheetsRequired).join(','));
  check('meganite: corner job charges exactly 2 sheets',
    Math.abs(qMegCorner.grandTotal.benchtopSupply - 986) < 0.01,
    String(qMegCorner.grandTotal.benchtopSupply));

  // 9h: per_lm pricing (Egger laminate worktops)
  const egger = {
    id: 'eg1', brand: 'Egger', range_tier: 'Standard 600',
    material_type: 'laminate', pricing_method: 'per_lm',
    stock_length_mm: 3650, stock_depth_mm: 600,
    price_per_sheet: null, price_per_lm: 76.70, install_per_lm: 0,
    trade_supply_per_sqm: 0, install_supply_per_sqm: 0,
  };
  const pdEgg = { ...pricingData, benchtop: [egger] };

  // 1200mm run = 1.2 LM x $76.70 = $92.04
  const eggWallA = [
    cabR('base_1_door', 600, 870, 575, 0, 1),
    cabR('base_2_door', 600, 870, 575, 0, 2),
  ];
  const qEgg = generateQuoteBOM(eggWallA, dims, hw, pdEgg);
  const btEgg = qEgg.benchtops[0];
  check('egger: pricingMethod = per_lm', btEgg?.pricingMethod === 'per_lm', String(btEgg?.pricingMethod));
  check('egger: materialType = laminate', btEgg?.materialType === 'laminate', String(btEgg?.materialType));
  check('egger: linearMetres = 1.2', Math.abs((btEgg?.linearMetres ?? 0) - 1.2) < 0.001, String(btEgg?.linearMetres));
  const expectedEggSupply = 1.2 * 76.70;
  check('egger: supplyCost = 1.2 x $76.70', Math.abs((btEgg?.supplyCost ?? 0) - expectedEggSupply) < 0.01, String(btEgg?.supplyCost));
  check('egger: installCost = 0', btEgg?.installCost === 0, String(btEgg?.installCost));

  const eggerWithInstall = { ...egger, install_per_lm: 25 };
  const pdEggInst = { ...pricingData, benchtop: [eggerWithInstall] };
  const qEggInst = generateQuoteBOM(eggWallA, dims, hw, pdEggInst);
  const btEggInst = qEggInst.benchtops[0];
  check('egger: installCost with install_per_lm', Math.abs((btEggInst?.installCost ?? 0) - 1.2 * 25) < 0.01, String(btEggInst?.installCost));

  // 9i: explicit product selection + finished-top fabrication matrix.
  const meganiteFabricated = {
    ...meganite,
    supply_pathway: 'stock_sheet_fabricated',
    price_status: 'confirmed',
    cut_to_length_cost: 25,
    cnc_setup_cost: 100,
    cnc_cut_per_lm: 20,
    sanding_polishing_per_lm: 30,
    edge_finish_per_lm: 10,
    sink_cutout_cost: 150,
    cooktop_cutout_cost: 120,
  };
  const fabricatedRun = [
    cabR('sink_base_2_door', 600, 870, 575, 0, 61),
    cabR('base_2_door', 1200, 870, 575, 0, 62),
    cabR('base_2_door', 1200, 870, 575, 0, 63),
    {
      ...cabR('cooktop_appliance', 600, 50, 500, 0, 64),
      itemType: 'Appliance',
      layoutRole: 'cooktop',
    },
  ];
  const qFabricated = generateQuoteBOM(
    fabricatedRun,
    dims,
    hw,
    { ...pricingData, benchtop: [egger, meganiteFabricated] },
    {},
    { benchtopPricingId: meganiteFabricated.id },
  );
  const btFabricated = qFabricated.benchtops[0];
  check('benchtop matrix: explicit room selection wins over catalogue order', btFabricated?.materialId === meganiteFabricated.id, btFabricated?.materialId);
  check('benchtop matrix: Meganite sheet material remains itemised', Math.abs((btFabricated?.baseMaterialCost ?? 0) - 493) < 0.01, String(btFabricated?.baseMaterialCost));
  check('benchtop matrix: Meganite CNC/cut/sand/edge/cut-outs total is itemised', Math.abs((btFabricated?.fabricationCost ?? 0) - 575) < 0.01, String(btFabricated?.fabricationCost));
  check('benchtop matrix: finished top includes material + fabrication', Math.abs((btFabricated?.supplyCost ?? 0) - 1068) < 0.01, String(btFabricated?.supplyCost));
  check('benchtop matrix: sink and cooktop cut-outs are both present',
    ['sink_cutouts', 'cooktop_cutouts'].every(code => btFabricated?.fabricationBreakdown?.some(line => line.code === code)),
    JSON.stringify(btFabricated?.fabricationBreakdown));

  const qMinimumLm = generateQuoteBOM(
    [cabR('base_2_door', 600, 870, 575, 0, 65)],
    dims,
    hw,
    { ...pricingData, benchtop: [{ ...egger, minimum_order_length_mm: 1200 }] },
  );
  check('benchtop matrix: LM supplier minimum length is enforced', Math.abs((qMinimumLm.benchtops[0]?.supplyCost ?? 0) - 1.2 * 76.70) < 0.01, String(qMinimumLm.benchtops[0]?.supplyCost));

  // 9j: Polytec made-to-order rules are depth-banded, rounded to 100mm,
  // and carry finish/account adjustments independently of the list rate.
  const polytecTiers = [
    { min_depth_mm: 250, max_depth_mm: 300, one_edge_price_per_lm: 49.34, two_edge_price_per_lm: 58.81 },
    { min_depth_mm: 301, max_depth_mm: 450, one_edge_price_per_lm: 74.63, two_edge_price_per_lm: 84.11 },
    { min_depth_mm: 451, max_depth_mm: 610, one_edge_price_per_lm: 100.57, two_edge_price_per_lm: 109.75 },
    { min_depth_mm: 611, max_depth_mm: 850, one_edge_price_per_lm: 117.63, two_edge_price_per_lm: 127.14 },
    { min_depth_mm: 851, max_depth_mm: 900, one_edge_price_per_lm: 134.09, two_edge_price_per_lm: 143.25 },
    { min_depth_mm: 901, max_depth_mm: 1200, one_edge_price_per_lm: 201.13, two_edge_price_per_lm: 210.31 },
  ];
  const polytec = {
    ...egger,
    id: 'polytec-hpl',
    brand: 'Polytec',
    range_tier: 'Made to order HPL - Woodmatt / Smooth',
    supply_pathway: 'made_to_order',
    price_status: 'confirmed',
    width_price_tiers: polytecTiers,
    quoted_edge_count: 1,
    surface_surcharge_pct: 5,
    account_discount_pct: null,
    length_rounding_mm: 100,
    price_per_lm: 100.57,
    join_cost: 0,
    finished_end_cost: 0,
  };
  const qPolytec600 = generateQuoteBOM(
    [cabR('base_2_door', 1250, 870, 575, 0, 71)],
    dims,
    hw,
    { ...pricingData, benchtop: [polytec] },
  );
  const btPolytec600 = qPolytec600.benchtops[0];
  check('polytec: 600mm top selects the 451-610mm depth band', btPolytec600?.widthPriceBand === '451-610mm', String(btPolytec600?.widthPriceBand));
  check('polytec: 1250mm run rounds up to 1.3LM', Math.abs((btPolytec600?.billableLinearMetres ?? 0) - 1.3) < 0.001, String(btPolytec600?.billableLinearMetres));
  check('polytec: Woodmatt/Smooth 5% surcharge is applied to the width-band rate',
    Math.abs((btPolytec600?.baseMaterialCost ?? 0) - (1.3 * 100.57 * 1.05)) < 0.01,
    String(btPolytec600?.baseMaterialCost));

  const qPolytec900 = generateQuoteBOM(
    [cabR('base_2_door', 1000, 870, 875, 0, 72)],
    { ...dims, benchtopOverhang: 25 },
    hw,
    { ...pricingData, benchtop: [{ ...polytec, surface_surcharge_pct: 0, account_discount_pct: 10 }] },
  );
  const btPolytec900 = qPolytec900.benchtops[0];
  check('polytec: 900mm top selects the 851-900mm depth band', btPolytec900?.widthPriceBand === '851-900mm', String(btPolytec900?.widthPriceBand));
  check('polytec: confirmed account discount is separate and applies only when populated',
    Math.abs((btPolytec900?.baseMaterialCost ?? 0) - (134.09 * 0.90)) < 0.01,
    String(btPolytec900?.baseMaterialCost));
}

// 10. P5 Reconciliation: per-cabinet material cost = area-share of consolidated sheets
{
  // Two base_1_door cabs with identical dimensions.
  // Each alone would pay for a full sheet; together they can share one sheet.
  const cabs2 = [
    cab('base_1_door', 600, 870, 575, 1),
    cab('base_1_door', 600, 870, 575, 2),
  ];
  const job2 = generateQuoteBOM(cabs2, dims, { ...hw, adjustableLegs: false }, pricingData);

  // Consolidated material cost (cabinet sheets only -- no kick panels since adjustableLegs=false)
  const cabMaterialTotal = job2.consolidatedSheets.reduce((s, sh) => s + sh.totalMaterialCost, 0);

  // Sum of per-cabinet reconciled materials must equal the consolidated total
  const sumCabMaterials = job2.cabinets.reduce((s, c) => s + c.subtotals.materials, 0);
  check('p5: sum(cab.subtotals.materials) = consolidated sheet total',
    Math.abs(sumCabMaterials - cabMaterialTotal) < 0.01,
    `sum=${sumCabMaterials.toFixed(4)} consolidated=${cabMaterialTotal.toFixed(4)}`);

  // Each cabinet totalCost must still equal sum(subtotals) after reconciliation
  for (const [i, c] of job2.cabinets.entries()) {
    const subsSum = Object.values(c.subtotals).reduce((a, b) => a + b, 0);
    check(`p5: cab ${i + 1} totalCost = sum(subtotals) after reconciliation`,
      Math.abs(subsSum - c.totalCost) < 0.01,
      `subsSum=${subsSum.toFixed(4)} totalCost=${c.totalCost.toFixed(4)}`);
  }

  // Two identical cabs should each get exactly half the consolidated cost
  const [c1, c2] = job2.cabinets;
  check('p5: two identical cabs share cost equally',
    Math.abs(c1.subtotals.materials - c2.subtotals.materials) < 0.01,
    `c1=${c1.subtotals.materials.toFixed(4)} c2=${c2.subtotals.materials.toFixed(4)}`);

  // Reconciled per-cabinet cost <= solo cabinet cost (never costs MORE than solo)
  const solo = generateCabinetBOM(cab('base_1_door', 600, 870, 575), dims, hw, pricingData);
  check('p5: reconciled cab cost <= solo per-cabinet cost',
    c1.subtotals.materials <= solo.subtotals.materials + 0.01,
    `reconciled=${c1.subtotals.materials.toFixed(2)} solo=${solo.subtotals.materials.toFixed(2)}`);

  // Three-cabinet mix: sum of reconciled costs = consolidated total
  const cabs3 = [
    cab('base_1_door', 600, 870, 575, 1),
    cab('base_2_door', 900, 870, 575, 2),
    cab('wall_2_door',  900, 720, 350, 3),
  ];
  const job3 = generateQuoteBOM(cabs3, dims, { ...hw, adjustableLegs: false }, pricingData);
  const cabMatTotal3 = job3.consolidatedSheets.reduce((s, sh) => s + sh.totalMaterialCost, 0);
  const sumCabMat3 = job3.cabinets.reduce((s, c) => s + c.subtotals.materials, 0);
  check('p5: 3-cab mix - sum(cab materials) = consolidated total',
    Math.abs(sumCabMat3 - cabMatTotal3) < 0.01,
    `sum=${sumCabMat3.toFixed(4)} consolidated=${cabMatTotal3.toFixed(4)}`);

  for (const [i, c] of job3.cabinets.entries()) {
    const subsSum = Object.values(c.subtotals).reduce((a, b) => a + b, 0);
    check(`p5: 3-cab mix - cab ${i + 1} totalCost = sum(subtotals)`,
      Math.abs(subsSum - c.totalCost) < 0.01,
      `subsSum=${subsSum.toFixed(4)} totalCost=${c.totalCost.toFixed(4)}`);
  }

  // grandTotal.labor must still equal sum of cabinet labor (P5 must not touch labor)
  check('p5: grandTotal.labor unchanged by reconciliation',
    Math.abs(job3.grandTotal.labor - job3.cabinets.reduce((s, c) => s + c.subtotals.labor, 0)) < 0.01);
}

// 4a. Per-part area rates shown in Admin Pricing are additive to flat rates.
{
  const areaRatedPricing = {
    ...pricingData,
    parts: pricingData.parts.map((part) => ({
      ...part,
      area_handling_cost: 10,
      area_machining_cost: 12,
      area_assembly_cost: 14,
    })),
  };
  const bom = generateCabinetBOM(cab('base_1_door', 600, 870, 575), dims, hw, areaRatedPricing);
  const part = bom.parts[0];
  check('part pricing: area handling rate is applied',
    Math.abs(part.handlingCost - (1.5 + part.area * 10)) < 0.001,
    JSON.stringify(part));
  check('part pricing: area machining rate is applied',
    Math.abs(part.machiningCost - (1.2 + part.area * 12)) < 0.001,
    JSON.stringify(part));
  check('part pricing: area assembly rate is applied',
    Math.abs(part.assemblyCost - (2 + part.area * 14)) < 0.001,
    JSON.stringify(part));
}

// 11. Pricing integrity: every cost category reaches the quote authority.
{
  const quote = generateQuoteBOM(
    [cab('base_2_door', 900, 870, 575, 71)],
    dims,
    { ...hw, adjustableLegs: true },
    pricingData,
  );
  const g = quote.grandTotal;
  const completeCost = g.materials + g.edging + g.hardware + g.handling
    + g.machining + g.assembly + g.labor + g.benchtop + g.appliances;
  check('integrity: quote cost includes every category including kick board',
    Math.abs(g.cost - completeCost) < 0.001,
    `cost=${g.cost} categories=${completeCost}`);
  check('integrity: commercial totals are normalized to cents',
    g.subtotalExGst === Math.round(g.subtotalExGst * 100) / 100
      && g.gst === Math.round(g.gst * 100) / 100
      && g.total === Math.round(g.total * 100) / 100,
    JSON.stringify({ subtotal: g.subtotalExGst, gst: g.gst, total: g.total }));
  check('integrity: displayed subtotal + GST equals displayed total exactly',
    Math.round((g.subtotalExGst + g.gst) * 100) === Math.round(g.total * 100));
}

// 12. Catalogue guards: material minimums/yields and fallback prices survive
// job consolidation and remain visible as warnings.
{
  const minAreaPricing = {
    ...pricingData,
    materials: pricingData.materials.map(m => ({ ...m, minimum_job_area: 6 })),
  };
  const minAreaQuote = generateQuoteBOM(
    [cab('base_1_door', 300, 870, 575, 72)],
    dims,
    { ...hw, adjustableLegs: false },
    minAreaPricing,
  );
  check('integrity: material minimum job area survives consolidation',
    minAreaQuote.consolidatedSheets[0]?.sheetsRequired === 3,
    JSON.stringify(minAreaQuote.consolidatedSheets[0]));

  const badYieldPricing = {
    ...pricingData,
    materials: pricingData.materials.map(m => ({ ...m, expected_yield_factor: 5 })),
  };
  const badYieldQuote = generateQuoteBOM(
    [cab('base_1_door', 600, 870, 575, 73)],
    dims,
    { ...hw, adjustableLegs: false },
    badYieldPricing,
  );
  check('integrity: invalid material yield uses safe 85%',
    badYieldQuote.consolidatedSheets[0]?.yieldFactor === 0.85
      && badYieldQuote.consolidatedSheets[0]?.usedDefaultYield === true,
    JSON.stringify(badYieldQuote.consolidatedSheets[0]));
  check('integrity: invalid material yield is surfaced as a pricing warning',
    badYieldQuote.warnings.some(w => /invalid yield/i.test(w)),
    badYieldQuote.warnings.join(' | '));

  const fallbackQuote = generateQuoteBOM(
    [cab('base_2_door', 900, 870, 575, 74)],
    dims,
    hw,
    { ...pricingData, edges: [], hardware: [] },
  );
  check('integrity: fallback hardware is explicitly warned',
    fallbackQuote.warnings.some(w => /Hardware .*fallback/i.test(w)),
    fallbackQuote.warnings.join(' | '));
  check('integrity: fallback edge price is explicitly warned',
    fallbackQuote.warnings.some(w => /Edge tape .*fallback/i.test(w)),
    fallbackQuote.warnings.join(' | '));
}

// 13. Hafele Impact configured-price structure. These assertions mirror the
// live Bower-account quote samples retained in migration 20260802194500.
{
  const impactMirostoneStandard = {
    id: 'impact-mirostone-standard',
    brand: 'Hafele Impact',
    range_tier: 'Mirostone 20mm - Standard',
    material_type: 'solid_surface',
    pricing_method: 'per_lm',
    stock_length_mm: 3200,
    stock_depth_mm: 900,
    price_per_sheet: null,
    price_per_lm: 326.233333,
    trade_supply_per_sqm: 0,
    install_per_lm: 0,
    install_supply_per_sqm: 0,
    supply_pathway: 'supplier_custom',
    is_active: true,
    price_status: 'confirmed',
    quoted_edge_count: 1,
    surface_surcharge_pct: 0,
    account_discount_pct: 0,
    length_rounding_mm: 0,
    minimum_order_length_mm: 0,
    supplier_order_fee: 1132.88,
    sink_cutout_cost: 74.55,
    cooktop_cutout_cost: 74.55,
    finished_end_cost: 0,
    finished_end_per_lm: 0,
    width_price_tiers: [
      { min_depth_mm: 100, max_depth_mm: 600, one_edge_price_per_lm: 326.233333, two_edge_price_per_lm: 326.233333 },
      { min_depth_mm: 601, max_depth_mm: 900, one_edge_price_per_lm: 450.383333, two_edge_price_per_lm: 450.383333 },
    ],
  };
  const impactPricing = { ...pricingData, benchtop: [impactMirostoneStandard] };
  const top900 = calculateBenchtops(
    [cab('base_2_door', 900, 870, 575, 801)],
    dims,
    impactPricing,
    { benchtopPricingId: impactMirostoneStandard.id },
  );
  check('impact: 900x600 Mirostone Standard matches live quote',
    top900[0]?.supplyCost === 1426.49,
    JSON.stringify(top900[0]));

  const top1800WithSink = calculateBenchtops(
    [
      cab('base_2_door', 900, 870, 575, 802),
      cab('sink_base_2_door', 900, 870, 575, 803),
    ],
    dims,
    impactPricing,
    { benchtopPricingId: impactMirostoneStandard.id },
  );
  check('impact: configured allowance is charged once per job',
    top1800WithSink[0]?.fabricationBreakdown?.filter(line => line.code === 'supplier_order').length === 1,
    JSON.stringify(top1800WithSink[0]?.fabricationBreakdown));
  check('impact: 1800x600 plus one sink cut-out matches live quote',
    top1800WithSink[0]?.supplyCost === 1794.65,
    JSON.stringify(top1800WithSink[0]));

  const islandCabs = [
    cab('base_2_door', 900, 870, 875, 804),
    cab('sink_base_2_door', 900, 870, 875, 805),
  ];
  const islandTop = calculateBenchtops(
    islandCabs,
    dims,
    impactPricing,
    { benchtopPricingId: impactMirostoneStandard.id },
  );
  check('impact: 900mm island depth selects the island rate band',
    islandTop[0]?.widthPriceBand === '601-900mm'
      && islandTop[0]?.supplyCost === 2018.12,
    JSON.stringify(islandTop[0]));

  const edgeRateMaterial = {
    ...impactMirostoneStandard,
    id: 'impact-edge-rate',
    price_per_lm: 0,
    width_price_tiers: [
      { min_depth_mm: 100, max_depth_mm: 900, one_edge_price_per_lm: 0, two_edge_price_per_lm: 0 },
    ],
    supplier_order_fee: 0,
    sink_cutout_cost: 0,
    cooktop_cutout_cost: 0,
    finished_end_per_lm: 38.188889,
  };
  const edgeTop = calculateBenchtops(
    [cab('base_2_door', 900, 870, 875, 806)],
    dims,
    { ...pricingData, benchtop: [edgeRateMaterial] },
    { benchtopPricingId: edgeRateMaterial.id },
  );
  const edgeLine = edgeTop[0]?.fabricationBreakdown?.find(line => line.code === 'finished_ends');
  check('impact: depth-based visible side/end edging is priced by LM',
    edgeLine?.unit === 'lm' && edgeLine.quantity === 1.8 && edgeLine.total === 68.74,
    JSON.stringify(edgeLine));
}

console.log(failures === 0 ? '\nAll pricing smoke tests passed.' : '\n' + failures + ' FAULT(S) FOUND.');
process.exit(failures === 0 ? 0 : 1);
