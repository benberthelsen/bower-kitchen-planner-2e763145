/**
 * Full pricing-engine run-through — a realistic kitchen end to end.
 * Build the bundle first (same as smoke), then:  node scripts/pricing-runthrough.mjs
 * Prints: per-cabinet breakdown, job totals, ordering list, packing list, cut list.
 */
import { generateQuoteBOM, generateCabinetBOM } from '../.tmp-snap-test/pricing.mjs';

const money = (n) => '$' + (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

// ---------- realistic pricing data (shop-representative) ----------
const P = (name, lf, wf, edging = '1/-/-/-') => ({
  name, part_type: 'Carcase', length_function: lf, width_function: wf, edging,
  handling_cost: 1.5, area_handling_cost: 0, machining_cost: 1.2, area_machining_cost: 0,
  assembly_cost: 2.0, area_assembly_cost: 0, visibility_status: 'Available',
});
const pricingData = {
  parts: [
    P('Base Left Side','CabHeight-ToeKickHeight','CabDepth','1/-/1/-'),
    P('Base Right Side','CabHeight-ToeKickHeight','CabDepth','1/-/1/-'),
    P('Base Bottom','CabWidth-CarcaseThick*2','CabDepth-BackThickness','1/-/-/-'),
    P('Base Back','CabWidth-CarcaseThick*2','CabHeight-ToeKickHeight','-/-/-/-'),
    P('Rail On Flat','CabWidth-CarcaseThick*2','80','1/-/-/-'),
    P('Adjustable Shelf','CabWidth-CarcaseThick*2-4','CabDepth-ShelfOffset','1/-/-/-'),
    P('Door','CabHeight-ToeKickHeight-DoorGap','CabWidth/NumDoors-DoorGap','1/1/1/1'),
    P('Drawer Front','CabWidth-DrawerGap','180','1/1/1/1'),
    P('Drawer Left Side','CabDepth-50','120','1/-/-/-'),
    P('Drawer Right Side','CabDepth-50','120','1/-/-/-'),
    P('Drawer Back','CabWidth-100','120','1/-/-/-'),
    P('Drawer Bottom','CabWidth-80','CabDepth-60','-/-/-/-'),
    P('Upper Left Side','CabHeight','CabDepth','1/-/1/-'),
    P('Upper Right Side','CabHeight','CabDepth','1/-/1/-'),
    P('Upper Bottom','CabWidth-CarcaseThick*2','CabDepth','1/-/-/-'),
    P('Upper Top','CabWidth-CarcaseThick*2','CabDepth','1/-/-/-'),
    P('Upper Back','CabWidth-CarcaseThick*2','CabHeight','-/-/-/-'),
    P('Tall Left Side','CabHeight-ToeKickHeight','CabDepth','1/-/1/-'),
    P('Tall Right Side','CabHeight-ToeKickHeight','CabDepth','1/-/1/-'),
    P('Tall Bottom','CabWidth-CarcaseThick*2','CabDepth','1/-/-/-'),
    P('Tall Top','CabWidth-CarcaseThick*2','CabDepth','1/-/-/-'),
    P('Tall Back','CabWidth-CarcaseThick*2','CabHeight-ToeKickHeight','-/-/-/-'),
    P('Ls Base Left Side','CabHeight-ToeKickHeight','CabDepth','1/-/1/-'),
    P('Ls Base Right Side','CabHeight-ToeKickHeight','CabLeftDepth','1/-/1/-'),
    P('Ls Base Left Back','CabWidth-CarcaseThick','CabHeight-ToeKickHeight','-/-/-/-'),
    P('Ls Base Right Back','CabLeftDepth-CarcaseThick','CabHeight-ToeKickHeight','-/-/-/-'),
    P('Ls Base Bottom','CabWidth-CarcaseThick*2','CabLeftDepth-CarcaseThick','1/-/-/-'),
    P('Ls Rail On Edge','CabWidth-CarcaseThick*2','80','1/-/-/-'),
    P('L Shape Shelf','CabWidth-CarcaseThick*2-4','CabLeftDepth-ShelfOffset','1/-/-/-'),
  ],
  materials: [
    { id:'m1', item_code:'WHT16', name:'White Melamine 16mm (carcase)', material_type:'Melamine',
      area_cost:34.5, area_handling_cost:3.15, area_assembly_cost:4.5,
      sheet_length:3600, sheet_width:1800, expected_yield_factor:0.85, visibility_status:'Available' },
    { id:'m2', item_code:'WG18', name:'Woodgrain Laminate 18mm (doors)', material_type:'Laminate',
      area_cost:58.0, area_handling_cost:3.5, area_assembly_cost:5.0,
      sheet_length:3600, sheet_width:1800, expected_yield_factor:0.82, visibility_status:'Available' },
  ],
  edges: [
    { id:'e1', item_code:'EW1', name:'White ABS 1mm', edge_type:'standard', thickness:1,
      length_cost:1.5, handling_cost:0.5, application_cost:0.9, visibility_status:'Available' },
  ],
  hardware: [
    { id:'h1', item_code:'HNG-S200', name:'Salice Series 200 110 KnockIn Hinge', hardware_type:'hinge', series:'Salice Knock In', unit_cost:6.2, machining_cost:1.4, assembly_cost:1.2 },
    { id:'h2', item_code:'PLT-S200', name:'Salice Knock In Mounting Plate', hardware_type:'hinge plate', series:'Salice Knock In', unit_cost:2.1, machining_cost:0, assembly_cost:0.4 },
    { id:'h3', item_code:'RUN-ALTO500', name:'Hafele Alto Slim 500 Runner Pair', hardware_type:'runner', series:'Alto Slim', runner_depth:500, unit_cost:28, machining_cost:2, assembly_cost:3 },
    { id:'h4', item_code:'HDL-BAR160', name:'Bar Handle 160mm', hardware_type:'handle', unit_cost:9.5, machining_cost:0, assembly_cost:0.5 },
    { id:'h5', item_code:'LEG-ADJ', name:'Adjustable Leg 100-150mm', hardware_type:'leg', unit_cost:1.35, machining_cost:0, assembly_cost:0 },
    { id:'h6', item_code:'PIN-SHELF', name:'Shelf Pin Nickel', hardware_type:'shelf_pin', unit_cost:0.18, machining_cost:0, assembly_cost:0 },
    { id:'h7', item_code:'SCR-28', name:'28mm Screws', hardware_type:'consumable', unit_cost:0.035 },
    { id:'h8', item_code:'SCR-45', name:'45mm Screws', hardware_type:'consumable', unit_cost:0.05 },
    { id:'h9', item_code:'SCR-70', name:'70mm Screws', hardware_type:'consumable', unit_cost:0.07 },
  ],
  labor: [
    { name:'Labor Base Per Cabinet', rate:235 },
    { name:'Labor Per Door', rate:36 },
    { name:'Labor Per Drawer', rate:102 },
    { name:'Labor Tall Extra', rate:162 },
    { name:'Labor Per Metre Width', rate:86 },
  ],
  doorDrawer: [], benchtop: [],
};

const dims = {
  toeKickHeight:135, shelfSetback:5, baseHeight:730, baseDepth:575, wallHeight:720, wallDepth:350,
  tallHeight:2100, tallDepth:580, benchtopThickness:33, benchtopOverhang:25, splashbackHeight:600,
  doorGap:2, drawerGap:2, leftGap:1.5, rightGap:1.5, topMargin:0, bottomMargin:0, wallGap:10,
  boardThickness:18, backPanelSetback:16, topReveal:3, sideReveal:2, handleDrillSpacing:32,
};
const hw = { hingeType:'Salice', drawerType:'Alto', cabinetTop:'rail', supplyHardware:true, adjustableLegs:true, handleId:'HDL-BAR160' };

const cab = (n, definitionId, w, h, d) => ({
  instanceId:`c${n}`, definitionId, itemType:'Cabinet', cabinetNumber:`C${n}`,
  x:0, y:0, z:0, rotation:0, width:w, height:h, depth:d,
  carcaseMaterialId:'WHT16', exteriorMaterialId:'WG18',
});

// A representative L-shaped kitchen: run of bases + a corner + sink + drawers, a pantry tower, uppers.
const KITCHEN = [
  cab(1,'base_3_drawer',600,870,575),
  cab(2,'base_2_door',800,870,575),
  cab(3,'sink_base_2_door',900,870,575),
  cab(4,'base_corner_pie_cut_2_door',900,870,900),
  cab(5,'base_2_door_1_drawer',900,870,575),
  cab(6,'base_4_drawer',450,870,575),
  cab(7,'tall_2_door_pantry',600,2100,580),
  cab(8,'wall_2_door',900,720,350),
  cab(9,'wall_2_door',800,720,350),
  cab(10,'upper_1_door',450,720,350),
];

const names = {
  base_3_drawer:'Base 3-Drawer', base_2_door:'Base 2-Door', sink_base_2_door:'Sink Base 2-Door',
  base_corner_pie_cut_2_door:'Corner Pie-Cut', base_2_door_1_drawer:'Base 2-Door 1-Drawer',
  base_4_drawer:'Base 4-Drawer', tall_2_door_pantry:'Tall Pantry', wall_2_door:'Wall 2-Door',
  upper_1_door:'Upper 1-Door',
};

const commercial = { marginPct:0.30, designFeePct:0.05, deliveryFlat:350, installFlat:1200, clientMarkupPct:0.10, gstPct:0.10 };
const job = generateQuoteBOM(KITCHEN, dims, hw, pricingData, commercial);

const line = (c='=') => console.log(c.repeat(78));
console.log('\nBOWER KITCHEN — FULL PRICING RUN-THROUGH');
console.log(`${KITCHEN.length} cabinets · material: ${pricingData.materials[0].name} · ${pricingData.materials[0].sheet_length}x${pricingData.materials[0].sheet_width}mm sheets`);

// ---- 1. Per-cabinet breakdown ----
line();
console.log('PER-CABINET BREAKDOWN');
line('-');
console.log(pad('#',4)+pad('Type',22)+pad('W×H×D',16)+lpad('Parts',6)+lpad('Mat',9)+lpad('Edge',8)+lpad('HW',8)+lpad('Labor',9)+lpad('Total',11));
for (const c of job.cabinets) {
  const s = c.subtotals;
  console.log(
    pad(c.cabinetNumber,4)+
    pad((names[c.cabinetSku]||c.cabinetSku).slice(0,21),22)+
    pad(`${c.dimensions.width}x${c.dimensions.height}x${c.dimensions.depth}`,16)+
    lpad(c.parts.reduce((a,p)=>a+p.quantity,0),6)+
    lpad(money(s.materials),9)+lpad(money(s.edging),8)+lpad(money(s.hardware),8)+
    lpad(money(s.labor),9)+lpad(money(c.totalCost),11));
}

// ---- 2. Job totals ----
const g = job.grandTotal;
line();
console.log('JOB TOTALS');
line('-');
for (const [k,v] of [['Materials (board)',g.materials],['Edging',g.edging],['Hardware',g.hardware],
  ['Handling',g.handling],['Machining',g.machining],['Assembly',g.assembly],['Labor',g.labor]]) {
  console.log(pad(k,28)+lpad(money(v),14));
}
line('-');
console.log(pad('COST subtotal (ex GST)',28)+lpad(money(g.cost),14));

// ---- 2a. Commercial layer (P3): cost -> sell ----
line();
console.log('COMMERCIAL  (per-client: margin '+(commercial.marginPct*100)+'%, design '+(commercial.designFeePct*100)+'%, markup '+(commercial.clientMarkupPct*100)+'%)');
line('-');
console.log(pad('Cost (ex GST)',28)+lpad(money(g.cost),14));
console.log(pad('+ Margin',28)+lpad(money(g.margin),14));
console.log(pad('+ Design fee',28)+lpad(money(g.designFee),14));
console.log(pad('+ Delivery',28)+lpad(money(g.delivery),14));
console.log(pad('+ Install',28)+lpad(money(g.install),14));
console.log(pad('+ Client markup',28)+lpad(money(g.clientMarkup),14));
line('-');
console.log(pad('SELL (ex GST)',28)+lpad(money(g.subtotalExGst),14));
console.log(pad('GST '+(commercial.gstPct*100)+'%',28)+lpad(money(g.gst),14));
console.log(pad('TOTAL (inc GST)',28)+lpad(money(g.total),14));

// ---- 2b. Build hours (P2 time model) ----
const bh = job.buildHours;
line();
console.log('BUILD HOURS  (scheduling + cross-check vs calibrated labor)');
line('-');
console.log(pad('#',4)+pad('Type',22)+lpad('Cut h',9)+lpad('Edge h',9)+lpad('Asm h',9)+lpad('Total h',10)+lpad('Hrs $',11));
for (const c of job.cabinets) {
  const h=c.buildHours;
  console.log(pad(c.cabinetNumber,4)+pad((names[c.cabinetSku]||c.cabinetSku).slice(0,21),22)+
    lpad(h.cut.toFixed(2),9)+lpad(h.edge.toFixed(2),9)+lpad(h.assembly.toFixed(2),9)+
    lpad(h.total.toFixed(2),10)+lpad(money(h.cost),11));
}
line('-');
console.log(pad('JOB',26)+lpad(bh.cut.toFixed(2),9)+lpad(bh.edge.toFixed(2),9)+lpad(bh.assembly.toFixed(2),9)+lpad(bh.total.toFixed(2),10)+lpad(money(bh.cost),11));
console.log(`  Build time: ${bh.total.toFixed(1)}h  ·  hours-cost ${money(bh.cost)} vs calibrated labor ${money(g.labor)}  (cross-check)`);

// ---- 3. Ordering list (what to buy) ----
line();
console.log('ORDERING LIST (supplier)');
line('-');
console.log('Board:');
for (const sh of job.consolidatedSheets)
  console.log('  '+pad(sh.materialName,30)+lpad(sh.sheetsRequired+' sheets',14)+lpad(money(sh.totalMaterialCost),12)+
    `   (parts ${sh.totalPartArea.toFixed(2)}m² / yield ${sh.yieldFactor})`);
console.log('Edge tape:');
for (const e of job.consolidatedEdgeTape)
  console.log('  '+pad(e.edgeName,30)+lpad(e.rollsRequired+` x ${e.rollLengthM}m`,14)+lpad(money(e.totalCost),12)+
    `   (${e.linearMeters.toFixed(1)} LM)`);
console.log('Hardware:');
for (const h of job.consolidatedHardware.filter(h=>!String(h.hardwareType).startsWith('consumable')))
  console.log('  '+pad(h.name,30)+lpad(h.quantity+' ea',14)+lpad(money(h.totalCost),12));
console.log('Consumables:');
for (const h of job.consolidatedHardware.filter(h=>String(h.hardwareType).startsWith('consumable')))
  console.log('  '+pad(h.name,30)+lpad(h.quantity+' ea',14)+lpad(money(h.totalCost),12));

// ---- 4. Packing list (per cabinet: parts + hardware bag) ----
line();
console.log('PACKING LIST (per cabinet)');
for (const c of job.cabinets) {
  line('-');
  console.log(`${c.cabinetNumber}  ${names[c.cabinetSku]||c.cabinetSku}  (${c.dimensions.width}x${c.dimensions.height}x${c.dimensions.depth})`);
  console.log('  Panels:');
  for (const p of c.parts)
    console.log(`    ${pad(p.name,26)} ${lpad(p.quantity+'x',4)} ${lpad(Math.round(p.length)+'x'+Math.round(p.width),12)}mm`);
  const bag = c.hardware.filter(h=>h.quantity>0);
  if (bag.length) {
    console.log('  Hardware bag:');
    for (const h of bag)
      console.log(`    ${pad(h.name,26)} ${lpad(h.quantity+'x',4)}`);
  }
}

// ---- 5. Cut list (every panel, flattened) ----
line();
console.log('CUT LIST (all panels)');
line('-');
const cuts = new Map();
for (const c of job.cabinets)
  for (const p of c.parts) {
    const key = `${p.name}|${Math.round(p.length)}x${Math.round(p.width)}`;
    cuts.set(key, (cuts.get(key)||0) + p.quantity);
  }
console.log(pad('Panel',28)+pad('Size (mm)',16)+lpad('Qty',6));
let totalPanels = 0;
for (const [key,qty] of [...cuts.entries()].sort()) {
  const [name,size] = key.split('|');
  totalPanels += qty;
  console.log(pad(name,28)+pad(size,16)+lpad(qty,6));
}
line('-');
console.log(pad(`TOTAL PANELS`,28)+pad('',16)+lpad(totalPanels,6));
line();
console.log(`Quote total: ${money(g.total)} inc GST  ·  ${totalPanels} panels  ·  ${job.consolidatedSheets.reduce((a,s)=>a+s.sheetsRequired,0)} sheets  ·  ${job.consolidatedEdgeTape.reduce((a,e)=>a+e.rollsRequired,0)} tape rolls\n`);
