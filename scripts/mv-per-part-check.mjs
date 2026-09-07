/**
 * Does Microvellum price per part rather than per job of work?
 *
 *   node scripts/mv-per-part-check.mjs <cabinets.json>
 *
 * If MV bills a flat-ish amount per part, its cost-per-part sits in a narrow
 * band whatever the part actually is — a 2.1m under panel costing the same per
 * part as a drawer box side. BowerOS prices the work (cut length, edge metres,
 * holes, hardware fit minutes), so its cost-per-part should vary with what the
 * part takes to make.
 */
import fs from 'node:fs';
import { generateQuoteBOM } from '../.tmp-snap-test/pricing.mjs';
import { fixture } from './mv-job-fixture.mjs';

const MV_UPLIFT = 1.1 * 1.4;
const money = (n) => '$' + (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

const schedule = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const rows = schedule.filter((r) => !/countertop|benchtop/i.test(r.name));
const { items, dims, hardwareOptions, pricingData } = fixture(rows);
const bom = generateQuoteBOM(items, dims, hardwareOptions, pricingData, {});

const stats = [];
bom.cabinets.forEach((c, i) => {
  const r = rows[i];
  const partCount = c.parts.reduce((s, p) => s + Math.max(1, p.quantity ?? 1), 0);
  const hwCount = c.hardware.reduce((s, h) => s + Math.max(0, h.quantity ?? 0), 0);
  if (partCount === 0) return;
  stats.push({
    name: r.name, partCount, hwCount,
    mvPerPart: (r.mv_total / MV_UPLIFT) / partCount,
    bowerPerPart: c.totalCost / partCount,
  });
});

console.log('\n=== COST PER PART: Microvellum vs BowerOS ===\n');
console.log('  ' + pad('Cabinet', 34) + lpad('parts', 7) + lpad('hw', 5) +
            lpad('MV $/part', 12) + lpad('Bower $/part', 14));
console.log('  ' + '-'.repeat(72));
for (const s of [...stats].sort((a, b) => a.partCount - b.partCount)) {
  console.log('  ' + pad(s.name.slice(0, 33), 34) + lpad(s.partCount, 7) + lpad(s.hwCount, 5) +
              lpad(money(s.mvPerPart), 12) + lpad(money(s.bowerPerPart), 14));
}

const spread = (key) => {
  const v = stats.map((s) => s[key]).sort((a, b) => a - b);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  return { mean, sd, cv: sd / mean, min: v[0], max: v[v.length - 1] };
};
const mv = spread('mvPerPart');
const bw = spread('bowerPerPart');
console.log('  ' + '-'.repeat(72));
console.log('\n=== SPREAD ===\n');
const showSpread = (label, s) => console.log(
  '  ' + pad(label, 14) + 'mean ' + lpad(money(s.mean), 9) +
  '   range ' + lpad(money(s.min), 8) + ' - ' + lpad(money(s.max), 9) +
  '   variation ' + (s.cv * 100).toFixed(0) + '%');
showSpread('Microvellum', mv);
showSpread('BowerOS', bw);
console.log('\n  A flat per-part biller shows LOW variation: every part costs about the');
console.log('  same no matter what it is. A work-based model shows HIGH variation,');
console.log('  because a drawer box with a runner is not a shelf.\n');
