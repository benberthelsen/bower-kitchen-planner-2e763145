/**
 * Price a kitchen through the BowerOS engine and emit a Build Flow import file.
 *
 *   node scripts/price-kitchen.mjs <schedule.json> <pricing-data.json> [out.xlsx]
 *
 * schedule.json      cabinet schedule parsed from the Microvellum estimating
 *                    report: [{ room, qty, name, w, h, d }]
 * pricing-data.json  live catalogue pulled from the planner Supabase project
 *                    (materials, parts, edges, hardware, labor)
 *
 * Writes a workbook in the exact row shape Build Flow's Microvellum importer
 * reads — "Room Name:" section headers, then
 * Qty | Description | W | H | D | Material | Labor | Other | Total — but with
 * BowerOS costs in place of Microvellum's. Import it through Quote →
 * Import from Microvellum.
 *
 * Prices are SELL ex GST. Build Flow adds GST itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { generateQuoteBOM } from '../.tmp-snap-test/pricing.mjs';

const [schedulePath, pricingPath, outPathArg] = process.argv.slice(2);
if (!schedulePath || !pricingPath) {
  console.error('usage: node scripts/price-kitchen.mjs <schedule.json> <pricing-data.json> [out.xlsx]');
  process.exit(1);
}
const outPath = outPathArg ?? 'bower-quote.xlsx';

const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
const pricing = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));

const money = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const fmt = (n) => '$' + money(n).toFixed(2);

// ---------------------------------------------------------------------------
// Commercial layer. Cost -> sell. Override per job with --margin / --markup.
// Defaults mirror what Microvellum applied: 10% overhead then 40% markup.
const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? Number(process.argv[i + 1]) : dflt;
};
const OVERHEAD = arg('--overhead', 0.10);
const MARKUP = arg('--markup', 0.40);
const UPLIFT = (1 + OVERHEAD) * (1 + MARKUP);
const SUPPLY_MODE = process.argv.includes('--flat-pack') ? 'flat_pack'
  : process.argv.includes('--no-install') ? 'assembled'
  : 'assembled_installed';

// ---------------------------------------------------------------------------
const BENCHTOP_RE = /countertop|benchtop/i;
const cabinetRows = [];
const otherRows = [];
for (const r of schedule) {
  (BENCHTOP_RE.test(r.name) ? otherRows : cabinetRows).push(r);
}

// One PlacedItem per unit, so a qty-3 line prices as three cabinets.
const items = [];
const originOf = [];
cabinetRows.forEach((r, idx) => {
  const qty = Math.max(1, Math.round(r.qty ?? 1));
  for (let n = 0; n < qty; n++) {
    originOf.push(idx);
    items.push({
      instanceId: `line-${idx}-${n}`,
      definitionId: r.name,
      itemType: 'Cabinet',
      productName: r.name,
      cabinetNumber: `C${String(items.length + 1).padStart(2, '0')}`,
      x: r.x ?? 0, y: r.y ?? 0, z: r.z ?? 0, rotation: r.rotation ?? 0,
      width: r.w, height: r.h, depth: r.d,
      carcaseMaterialId: r.carcaseMaterialId ?? pricing.defaults?.carcaseMaterialId,
      exteriorMaterialId: r.exteriorMaterialId ?? pricing.defaults?.exteriorMaterialId,
      edgeId: r.edgeId ?? pricing.defaults?.edgeId,
    });
  }
});

const dims = pricing.dimensions ?? {
  toeKickHeight: 135, shelfSetback: 5, baseHeight: 880, baseDepth: 555,
  wallHeight: 879, wallDepth: 330, tallHeight: 2400, tallDepth: 580,
  benchtopThickness: 24, benchtopOverhang: 25, splashbackHeight: 600,
  doorGap: 2, drawerGap: 2, leftGap: 1.5, rightGap: 1.5,
  topMargin: 0, bottomMargin: 0, wallGap: 10,
  boardThickness: 16, backPanelSetback: 16, topReveal: 3, sideReveal: 2,
  handleDrillSpacing: 32,
};

const bom = generateQuoteBOM(items, dims, pricing.hardwareOptions ?? {}, {
  parts: pricing.parts ?? [],
  materials: pricing.materials ?? [],
  edges: pricing.edges ?? [],
  hardware: pricing.hardware ?? [],
  labor: pricing.labor ?? [],
  doorDrawer: pricing.doorDrawer ?? [],
  benchtop: pricing.benchtop ?? [],
}, { supplyMode: SUPPLY_MODE });

// Fold per-unit costs back onto their schedule line.
const lineCost = new Array(cabinetRows.length).fill(0);
const lineSplit = cabinetRows.map(() => ({ material: 0, labor: 0 }));
bom.cabinets.forEach((c, i) => {
  const idx = originOf[i];
  lineCost[idx] += c.totalCost ?? 0;
  lineSplit[idx].material += c.subtotals.materials + c.subtotals.edging + c.subtotals.hardware;
  lineSplit[idx].labor += c.subtotals.labor + c.subtotals.handling
    + c.subtotals.machining + c.subtotals.assembly;
});

const installCost = bom.workshop?.installCost ?? 0;
const cabinetCost = lineCost.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// Build the workbook rows in Build Flow's expected shape.
// Microvellum leaves the room blank on the first product of a report; anything
// unlabelled belongs with the main run rather than in a room of its own.
// Rooms are matched case-insensitively — a report that says "kitchen" on one
// product and "Kitchen" on the next means one room, not two.
const roomKeys = new Map();
const roomName = (r) => {
  const raw = String(r.room ?? '').trim();
  const name = !raw || /^\(?unnamed\)?$/i.test(raw) ? (process.env.BOWER_ROOM ?? 'Kitchen') : raw;
  const key = name.toLowerCase();
  if (!roomKeys.has(key)) roomKeys.set(key, name);
  return roomKeys.get(key);
};
const byRoom = new Map();
cabinetRows.forEach((r, idx) => {
  const room = roomName(r);
  if (!byRoom.has(room)) byRoom.set(room, []);
  byRoom.get(room).push(idx);
});

const biggestRoom = [...byRoom.entries()]
  .sort((a, b) => b[1].length - a[1].length)[0]?.[0];

const rows = [];
rows.push(['Bower Cabinets — quote priced by BowerOS']);
rows.push([`Quote#: ${process.env.BOWER_QUOTE_NO ?? 'BOWER-' + new Date().toISOString().slice(0, 10)}`]);
if (process.env.BOWER_PROJECT) rows.push([`Project: ${process.env.BOWER_PROJECT}`]);
if (process.env.BOWER_CONTACT) rows.push([`Your Contact: ${process.env.BOWER_CONTACT}`]);
rows.push([]);

let grandSell = 0;
for (const [room, idxs] of byRoom) {
  rows.push([`Room Name: ${room}`]);
  rows.push(['Qty', 'Description', 'Width', 'Height', 'Depth', 'Material', 'Labor', 'Other', 'Total']);
  let roomSell = 0;
  for (const idx of idxs) {
    const r = cabinetRows[idx];
    const mat = money(lineSplit[idx].material * UPLIFT);
    const lab = money(lineSplit[idx].labor * UPLIFT);
    const total = money(lineCost[idx] * UPLIFT);
    roomSell += total;
    rows.push([
      Math.max(1, Math.round(r.qty ?? 1)), r.name,
      Math.round(r.w), Math.round(r.h), Math.round(r.d),
      mat, lab, money(total - mat - lab), total,
    ]);
  }
  // Items the cabinet engine does not price (stone, appliances) pass through at
  // whatever the source report carried, so nothing silently vanishes.
  for (const r of otherRows.filter((o) => roomName(o) === room)) {
    const total = money(r.mv_total ?? 0);
    if (total <= 0) continue;
    roomSell += total;
    rows.push([1, r.name, Math.round(r.w), Math.round(r.h), Math.round(r.d), total, 0, 0, total]);
  }
  // Install is a job-level charge; it sits in the largest room.
  if (room === biggestRoom && installCost > 0) {
    const total = money(installCost * UPLIFT);
    roomSell += total;
    rows.push([1, 'Installation — onsite', 0, 0, 0, 0, 0, total, total]);
  }
  rows.push(['', 'Room Cost', '', '', '', '', '', '', money(roomSell)]);
  rows.push([]);
  grandSell += roomSell;
}

const gst = money(grandSell * 0.1);
rows.push(['', 'Sub Total', '', '', '', '', '', '', money(grandSell)]);
rows.push(['', 'GST', '', '', '', '', '', '', gst]);
rows.push([`Total amount: $${money(grandSell + gst).toFixed(2)}`]);

// ---------------------------------------------------------------------------
// Write it. SheetJS lives in the build-flow workspace; fall back to CSV.
let written = outPath;
try {
  const require = createRequire(path.resolve('../build-flow/package.json'));
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Quote');
  XLSX.writeFile(wb, outPath);
} catch {
  written = outPath.replace(/\.xlsx$/i, '.csv');
  fs.writeFileSync(written, rows.map((r) => r
    .map((c) => (typeof c === 'string' && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c ?? ''))
    .join(',')).join('\n'), 'utf8');
  console.error(`(SheetJS unavailable — wrote CSV instead: ${written})`);
}

// ---------------------------------------------------------------------------
console.log('\n=== BowerOS QUOTE ===\n');
console.log('  ' + pad('cabinets', 26) + lpad(String(items.length), 6) +
            '   from ' + cabinetRows.length + ' schedule lines');
if (bom.workshop) {
  const w = bom.workshop;
  console.log('  ' + pad('shop time', 26) +
              lpad(`${Math.floor(w.shopMinutes / 60)}:${String(Math.round(w.shopMinutes % 60)).padStart(2, '0')}`, 6));
  console.log('  ' + pad('install time', 26) +
              lpad(`${Math.floor(w.installMinutes / 60)}:${String(Math.round(w.installMinutes % 60)).padStart(2, '0')}`, 6));
}
console.log('');
const g = bom.grandTotal;
for (const [label, v] of [['board', g.materials], ['edge tape', g.edging],
  ['hardware', g.hardware], ['shop labour', g.labor],
  ['handling/machining/asm', g.handling + g.machining + g.assembly]]) {
  if (v) console.log('  ' + pad(label, 26) + lpad(fmt(v), 12));
}
console.log('  ' + pad('cabinet cost', 26) + lpad(fmt(cabinetCost), 12));
console.log('  ' + pad('install cost', 26) + lpad(fmt(installCost), 12));
console.log('  ' + '-'.repeat(38));
console.log('  ' + pad(`sell ex GST (+${(OVERHEAD * 100).toFixed(0)}% / +${(MARKUP * 100).toFixed(0)}%)`, 26) +
            lpad(fmt(grandSell), 12));
console.log('  ' + pad('GST', 26) + lpad(fmt(gst), 12));
console.log('  ' + pad('TOTAL inc GST', 26) + lpad(fmt(grandSell + gst), 12));

if (bom.warnings?.length) {
  console.log('\n=== WARNINGS — check these before sending ===');
  for (const w of bom.warnings.slice(0, 15)) console.log('  - ' + w);
}
console.log(`\nWrote ${written} — import via Quote → Import from Microvellum.\n`);
