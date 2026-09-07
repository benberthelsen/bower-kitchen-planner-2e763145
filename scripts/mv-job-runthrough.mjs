/**
 * Run a real Microvellum job through the BowerOS pricing engine and compare.
 *
 * Build the bundle first (same as the smoke tests), then:
 *   node scripts/mv-job-runthrough.mjs <cabinets.json>
 *
 * The cabinet schedule comes from a Microvellum "Cost Based Estimating Report"
 * (qty, description, W/H/D and Microvellum's own material/labour split), so the
 * two engines can be compared cabinet by cabinet on identical geometry.
 *
 * Rates below are the live Bower catalogue values (material $/m2, labour rates,
 * part handling/machining/assembly and hardware costs) as at 7 Sep 2026.
 */
import fs from 'node:fs';
import { generateQuoteBOM } from '../.tmp-snap-test/pricing.mjs';
import { fixture } from './mv-job-fixture.mjs';

const money = (n) => '$' + (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

// ---------- the job ----------------------------------------------------------
const schedule = JSON.parse(fs.readFileSync(process.argv[2] ?? 'mv-cabinets.json', 'utf8'));
const BENCHTOP_RE = /countertop|benchtop/i;
const cabinetRows = schedule.filter((r) => !BENCHTOP_RE.test(r.name));
const benchtopRows = schedule.filter((r) => BENCHTOP_RE.test(r.name));

const { items, dims, hardwareOptions, pricingData } = fixture(cabinetRows);
const bom = generateQuoteBOM(items, dims, hardwareOptions, pricingData, {});

// ---------- comparison -------------------------------------------------------
// Microvellum's per-line figures are already sell prices: its cost subtotal of
// $12,953.36 carries +10% overhead then +40% markup, and the line items sum to
// the $19,430.04 ex-GST total. So put the engine's cost through the same
// commercial layer before comparing line for line.
const MV_UPLIFT = 1.1 * 1.4;
const mvCabSell = cabinetRows.reduce((s, r) => s + r.mv_total, 0);
const mvBenchSell = benchtopRows.reduce((s, r) => s + r.mv_total, 0);

console.log('\n=== PER CABINET: BowerOS engine vs Microvellum (sell, ex GST) ===\n');
console.log(pad('Cabinet', 32) + lpad('W', 7) + lpad('H', 6) + lpad('D', 6) +
            lpad('Bower cost', 12) + lpad('Bower sell', 12) + lpad('MV sell', 11) + lpad('diff', 11));
console.log('-'.repeat(97));
let bowerCabCost = 0;
const lines = [];
bom.cabinets.forEach((c, i) => {
  const r = cabinetRows[i];
  const cost = c.totalCost ?? 0;
  const sell = cost * MV_UPLIFT;
  bowerCabCost += cost;
  lines.push({ ...r, cost, sell, diff: sell - r.mv_total });
  console.log(pad(r.name.slice(0, 31), 32) + lpad(r.w, 7) + lpad(r.h, 6) + lpad(r.d, 6) +
              lpad(money(cost), 12) + lpad(money(sell), 12) + lpad(money(r.mv_total), 11) +
              lpad((sell - r.mv_total >= 0 ? '+' : '') + money(sell - r.mv_total), 11));
});
const bowerCabSell = bowerCabCost * MV_UPLIFT;
console.log('-'.repeat(97));
console.log(pad(`TOTAL (${cabinetRows.length} cabinets)`, 51) +
            lpad(money(bowerCabCost), 12) + lpad(money(bowerCabSell), 12) + lpad(money(mvCabSell), 11) +
            lpad((bowerCabSell - mvCabSell >= 0 ? '+' : '') + money(bowerCabSell - mvCabSell), 11));

const g = bom.grandTotal ?? {};
console.log('\n=== BowerOS COST BREAKDOWN (ex GST, before markup) ===\n');
for (const k of ['materials', 'edging', 'hardware', 'handling', 'machining', 'assembly', 'labor']) {
  if (typeof g[k] === 'number' && g[k] !== 0) console.log('  ' + pad(k, 24) + lpad(money(g[k]), 12));
}
console.log('  ' + pad('cabinet cost total', 24) + lpad(money(bowerCabCost), 12));
if (bom.buildHours) {
  const h = bom.buildHours;
  console.log('  ' + pad('build hours (cut/edge/asm)', 28) +
              `${h.cut?.toFixed(1)} / ${h.edge?.toFixed(1)} / ${h.assembly?.toFixed(1)}  = ${h.total?.toFixed(1)} h`);
}

console.log('\n=== JOB TOTAL: BowerOS vs Microvellum ===\n');
console.log(pad('', 30) + lpad('BowerOS', 14) + lpad('Microvellum', 14) + lpad('diff', 12));
console.log('-'.repeat(70));
const row = (label, a, b) => console.log(pad(label, 30) + lpad(money(a), 14) + lpad(money(b), 14) +
  lpad((a - b >= 0 ? '+' : '') + money(a - b), 12));
// Microvellum spreads its $1,547 onsite install across the line items, so the
// engine's install must be counted too or the two sides are not comparable.
const bowerInstall = bom.workshop?.installCost ?? 0;
row('cabinets (sell ex GST)', bowerCabSell, mvCabSell - bowerInstall * MV_UPLIFT);
row('install (sell ex GST)', bowerInstall * MV_UPLIFT, bowerInstall * MV_UPLIFT);
row('benchtops (sell ex GST)', mvBenchSell, mvBenchSell);   // benchtops priced separately
const bowerSell = bowerCabSell + bowerInstall * MV_UPLIFT + mvBenchSell;
const mvSell = mvCabSell + mvBenchSell;
row('JOB SELL ex GST', bowerSell, mvSell);
row('GST', bowerSell * 0.1, mvSell * 0.1);
row('JOB SELL inc GST', bowerSell * 1.1, mvSell * 1.1);
console.log('\n  variance on cabinetry: ' +
            (((bowerCabSell - mvCabSell) / mvCabSell) * 100).toFixed(1) + '%' +
            '   |   variance on whole job: ' +
            (((bowerSell - mvSell) / mvSell) * 100).toFixed(1) + '%');
console.log('  (benchtops carried at Microvellum value — they price through benchtopCalculator, not the cabinet engine)');

// ---------- is the labour catalogue fitted to MV cost or MV sell? ------------
// Microvellum's line figures carry the +10%/+40% uplift. If our labour rates
// were fitted to those line figures rather than to the underlying cost, we
// would be feeding sell-priced labour into the engine and then marking it up a
// second time. Compare our labour against both readings of MV's.
console.log('\n=== LABOUR: Bower rate vs Microvellum, priced and un-priced ===\n');
console.log(pad('Cabinet', 32) + lpad('Bower lab', 11) + lpad('MV lab(sell)', 14) +
            lpad('MV lab(cost)', 14) + lpad('vs sell', 10) + lpad('vs cost', 10));
console.log('-'.repeat(91));
let sumBower = 0, sumSell = 0, sumCost = 0;
bom.cabinets.forEach((c, i) => {
  const r = cabinetRows[i];
  const bl = c.subtotals?.labor ?? 0;
  if (bl === 0) return;                       // unmapped items tell us nothing
  const mvSellLab = r.mv_labor;
  const mvCostLab = r.mv_labor / MV_UPLIFT;
  sumBower += bl; sumSell += mvSellLab; sumCost += mvCostLab;
  const ratio = (x) => (bl / x).toFixed(2) + 'x';
  console.log(pad(r.name.slice(0, 31), 32) + lpad(money(bl), 11) + lpad(money(mvSellLab), 14) +
              lpad(money(mvCostLab), 14) + lpad(ratio(mvSellLab), 10) + lpad(ratio(mvCostLab), 10));
});
console.log('-'.repeat(91));
console.log(pad('TOTAL', 32) + lpad(money(sumBower), 11) + lpad(money(sumSell), 14) +
            lpad(money(sumCost), 14) + lpad((sumBower / sumSell).toFixed(2) + 'x', 10) +
            lpad((sumBower / sumCost).toFixed(2) + 'x', 10));

// Biggest disagreements are the useful diagnostic.
const worst = [...lines].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 6);
console.log('\n=== LARGEST LINE DIFFERENCES ===\n');
for (const l of worst) {
  console.log('  ' + pad(l.name.slice(0, 34), 36) + lpad(money(l.sell), 11) + ' vs ' +
              lpad(money(l.mv_total), 11) + lpad((l.diff >= 0 ? '+' : '') + money(l.diff), 11));
}

const warnings = [...new Set([...(bom.warnings ?? []), ...bom.cabinets.flatMap((c) => c.warnings ?? [])])];
if (warnings.length) {
  console.log('\n=== ENGINE WARNINGS ===');
  for (const w of warnings.slice(0, 25)) console.log('  - ' + w);
  if (warnings.length > 25) console.log(`  ... and ${warnings.length - 25} more`);
}
