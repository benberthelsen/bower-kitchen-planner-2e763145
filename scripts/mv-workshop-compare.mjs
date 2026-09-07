/**
 * Price a Microvellum job through the process-based workshop model — minutes
 * per part / metre / product at real station rates — instead of the flat
 * per-cabinet labour regression, and show the working.
 *
 *   node scripts/mv-workshop-compare.mjs <cabinets.json>
 */
import fs from 'node:fs';
import { generateQuoteBOM } from '../.tmp-snap-test/pricing.mjs';
import { fixture } from './mv-job-fixture.mjs';

const money = (n) => '$' + (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
const hhmm = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

const schedule = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const rows = schedule.filter((r) => !/countertop|benchtop/i.test(r.name));
const { items, dims, hardwareOptions, pricingData } = fixture(rows);

const MODE = process.argv[3] ?? 'assembled_installed';
const bom = generateQuoteBOM(items, dims, hardwareOptions, pricingData, { supplyMode: MODE });
const ws = bom.workshop;
const g = bom.grandTotal;

console.log(`\n=== PROCESS-BASED SHOP LABOUR (${MODE}) ===\n`);
console.log('  ' + pad('Station', 30) + lpad('units', 10) + lpad('time', 9) +
            lpad('$/hr', 8) + lpad('cost', 11));
console.log('  ' + '-'.repeat(68));
for (const l of ws.lines) {
  console.log('  ' + pad(l.station.slice(0, 29), 30) +
              lpad(l.units.toFixed(1) + ' ' + l.unitLabel, 10) + lpad(hhmm(l.minutes), 9) +
              lpad('$' + l.rate, 8) + lpad(money(l.cost), 11));
}
console.log('  ' + '-'.repeat(68));
console.log('  ' + pad('SHOP', 30) + lpad('', 10) + lpad(hhmm(ws.shopMinutes), 9) +
            lpad('', 8) + lpad(money(ws.shopCost), 11));
console.log('  ' + pad('INSTALL (on site)', 30) + lpad('', 10) + lpad(hhmm(ws.installMinutes), 9) +
            lpad('', 8) + lpad(money(ws.installCost), 11));

console.log('\n  inputs: ' + Object.entries(ws.inputs)
  .map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 10) / 10 : v}`).join('  '));

console.log('\n=== JOB COST, BUILT BOTTOM-UP ===\n');
const line = (label, v) => console.log('  ' + pad(label, 30) + lpad(money(v), 12));
line('board', g.materials);
line('edge tape', g.edging);
line('hardware', g.hardware);
line('shop labour (process)', g.labor);
line('COST ex GST', g.cost);
console.log('  ' + pad('install (billed separately)', 30) + lpad(money(ws.installCost), 12));

// Microvellum, for reference only — it was a best guess, not the target.
const MV_UPLIFT = 1.1 * 1.4;
const mvSell = rows.reduce((s, r) => s + r.mv_total, 0);
console.log('\n=== REFERENCE: what Microvellum guessed for the same cabinets ===\n');
console.log('  ' + pad('MV cabinets, sell ex GST', 30) + lpad(money(mvSell), 12));
console.log('  ' + pad('MV cabinets, implied cost', 30) + lpad(money(mvSell / MV_UPLIFT), 12));
console.log('  ' + pad('BowerOS cost + install', 30) + lpad(money(g.cost + ws.installCost), 12));
console.log('\n  MV total project time was 62:06. BowerOS shop+install here: ' +
            hhmm(ws.shopMinutes + ws.installMinutes) +
            ' for the cabinets alone (no benchtops).');

const warnings = bom.warnings ?? [];
if (warnings.length) {
  console.log('\n=== WARNINGS ===');
  for (const w of warnings.slice(0, 10)) console.log('  - ' + w);
}
