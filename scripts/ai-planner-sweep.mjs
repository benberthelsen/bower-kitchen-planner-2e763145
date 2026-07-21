/**
 * AI Kitchen Planner - placement & layout sweep.
 * Loops the deterministic layout engine (same one the ai-designer edge function
 * compiles against) across a matrix of room sizes, shapes, services, openings,
 * appliances, and islands. Aggregates placement errors, layout-quality warnings,
 * essentials survival, and price-band sanity.
 * Self-contained: transpiles src/lib/layout (+ src/constants) to CommonJS via the
 * installed TypeScript compiler - no esbuild bundle needed.  Run: npm run ai:sweep
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = process.cwd();

const OUT = path.join(ROOT, '.tmp-sweep'); mkdirSync(OUT, { recursive: true }); writeFileSync(path.join(OUT, 'package.json'), '{"type":"commonjs"}');
const LAYOUT_DIR = path.join(ROOT, 'src/lib/layout');
const LAYOUT_FILES = ['types','schemas','geometry','polygon','catalogRoles','solveRun','compileSpec','rules','validate','defaultSpec','priceDesign','wizardAdapter','proposalState','designScore','candidateGenerator','index'];

writeFileSync(path.join(OUT, 'types_stub.js'), 'module.exports = new Proxy({}, { get: () => undefined });\n');

function rewrite(src) {
  return src
    .replace(/(['"])@\/constants\1/g, "'./constants'")
    .replace(/(['"])@\/types\1/g, "'./types_stub'")
    .replace(/(['"])(\.\.?\/[^'"]+?)\.ts\1/g, "$1$2$1");
}
function transpileTo(destName, srcPath) {
  const src = rewrite(readFileSync(srcPath, 'utf8'));
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: srcPath,
  });
  writeFileSync(path.join(OUT, destName + '.js'), outputText);
}
transpileTo('constants', path.join(ROOT, 'src/constants.ts'));
for (const f of LAYOUT_FILES) transpileTo(f, path.join(LAYOUT_DIR, f + '.ts'));

const engine = require(path.join(OUT, 'index.js'));
const { briefFromWizard, compileSpec, defaultSpecFor, priceDesign, validate, kitchenSpecSchema } = engine;

const SHAPES = ['single-wall', 'l-shape', 'u-shape', 'galley'];
const WIDTHS = [2400, 2700, 3000, 3600, 4200, 4800, 5400];
const DEPTHS = [2400, 3000, 3200, 3800, 4200];
const STYLES = ['minimal', 'standard', 'full-storage'];
const ISLANDS = ['no', 'if-it-fits', 'want'];

// usable N-wall intervals after subtracting doors/walkways (base cabinets can
// sit under windows, so windows do not fragment the base run).
function usableN(w, openings) {
  const blocked = openings.filter(o => o.wall === 'N' && (o.type === 'door' || o.type === 'walkway'))
    .map(o => [Math.max(0, o.offsetMm - 25), Math.min(w, o.offsetMm + o.widthMm + 25)])
    .sort((a, b) => a[0] - b[0]);
  const iv = []; let c = 0;
  for (const [bs, be] of blocked) { if (bs > c) iv.push({ s: c, e: bs }); c = Math.max(c, be); }
  if (c < w) iv.push({ s: c, e: w });
  return iv.map(x => x.e - x.s);
}
// A single-wall room is "reasonable" only if the three essentials (fridge 940,
// sink 600, cooktop 600) can actually be placed in the usable intervals - a
// mid-wall door can fragment a nominally wide wall below that.
function essentialsFitSingleWall(w, openings, dishwasher) {
  const iv = usableN(w, openings).sort((a, b) => b - a);
  // Sink + dishwasher must share an interval and touch, so model them as one
  // 1200 mm block when the appliance is required.
  for (const need of [940, dishwasher ? 1200 : 600, 600]) {
    const idx = iv.findIndex(len => len >= need);
    if (idx === -1) return false;
    iv[idx] -= need; iv.sort((a, b) => b - a);
  }
  return true;
}
function isReasonable(shape, w, d, openings, dishwasher) {
  if (shape === 'single-wall') return w >= 3000 && essentialsFitSingleWall(w, openings, dishwasher);
  if (shape === 'galley') return w >= 3000 && d >= 2400 + 2 * 650 + 1200;
  return w >= 3200 && d >= 3000;
}
const OPENING_SETS = [
  { tag: 'none', openings: [] },
  { tag: 'door-mid', openings: [{ id: 'd1', wall: 'N', type: 'door', offsetMm: 2000, widthMm: 900, swing: 'in-left' }] },
  { tag: 'window-N', openings: [{ id: 'w1', wall: 'N', type: 'window', offsetMm: 1600, widthMm: 1200, sillHeightMm: 900 }] },
  { tag: 'door+window', openings: [
    { id: 'd1', wall: 'S', type: 'door', offsetMm: 300, widthMm: 870, swing: 'in-left' },
    { id: 'w1', wall: 'N', type: 'window', offsetMm: 1500, widthMm: 1200, sillHeightMm: 900 } ] },
];
const SERVICE_SETS = [
  { tag: 'none', services: [] },
  { tag: 'drain-N', services: [{ id: 's1', wall: 'N', type: 'drain', offsetMm: 1500 }] },
  { tag: 'drain-E+gas', services: [
    { id: 's1', wall: 'E', type: 'drain', offsetMm: 1400 },
    { id: 's2', wall: 'N', type: 'gas', offsetMm: 2600 } ] },
];
const APPLIANCE_SETS = [
  { tag: 'base', patch: { dishwasher: true, fridgeWidthMm: 940 } },
  { tag: 'gas+oven', patch: { dishwasher: true, fridgeWidthMm: 940, oven: '600', cooktop: 'gas' } },
  { tag: 'no-dw', patch: { dishwasher: false, fridgeWidthMm: 800 } },
];

const errorsByCode = {}, warnsByCode = {};
const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
let total = 0, reasonable = 0;
const bugs = [], essentialsGaps = [], priceProblems = [], guardHits = [];

for (const shape of SHAPES)
for (const w of WIDTHS)
for (const d of DEPTHS)
for (const style of STYLES)
for (const island of ISLANDS)
for (const op of OPENING_SETS)
for (const sv of SERVICE_SETS)
for (const ap of APPLIANCE_SETS) {
  total++;
  const label = shape+' '+w+'x'+d+' '+style+' island='+island+' op='+op.tag+' sv='+sv.tag+' ap='+ap.tag;
  try {
    const brief = briefFromWizard(
      { layoutPreference: shape, roomWidth: w, roomDepth: d, layoutStyle: style },
      { openings: structuredClone(op.openings), services: structuredClone(sv.services) });
    brief.island = island;
    brief.appliances = { ...brief.appliances, ...ap.patch };
    const spec = defaultSpecFor(brief, shape);
    kitchenSpecSchema.parse(spec);
    const design = compileSpec(spec, brief.room);
    const vio = validate(design, brief.room, brief);
    const errs = vio.filter(x => x.severity === 'error');
    const warns = vio.filter(x => x.severity === 'warn');
    errs.forEach(e => bump(errorsByCode, e.code));
    warns.forEach(e => bump(warnsByCode, e.code));
    const good = isReasonable(shape, w, brief.room.depth, op.openings, brief.appliances.dishwasher);
    if (good) reasonable++;
    if (good && errs.length) bugs.push(label+' -> '+errs.map(e => e.code).join(','));
    else if (!good && errs.length) guardHits.push(label);
    if (good) {
      const r = design.rolePositions;
      const missing = ['sink','cooktop','fridge-gap'].filter(k => !r[k]);
      if (missing.length) essentialsGaps.push(label+' -> missing '+missing.join(','));
    }
    const band = priceDesign(design.items, spec.style);
    if (!(band.lowAud > 0 && band.highAud > band.lowAud)) priceProblems.push(label+' -> band '+band.lowAud+'-'+band.highAud);
  } catch (e) {
    bugs.push(label+' -> THREW '+e.message);
  }
}

const top = (o) => Object.entries(o).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+':'+v).join('  ') || '(none)';
console.log('=== AI Planner sweep ===');
console.log('combos: '+total+'   reasonable(should be clean): '+reasonable);
console.log('\nerror codes (all combos):   '+top(errorsByCode));
console.log('warning codes (all combos): '+top(warnsByCode));
console.log('\nPLACEMENT BUGS in reasonable rooms: '+bugs.length);
bugs.slice(0,25).forEach(b => console.log('  x '+b));
if (bugs.length > 25) console.log('  ... +'+(bugs.length-25)+' more');
console.log('\nEssentials missing in reasonable rooms: '+essentialsGaps.length);
essentialsGaps.slice(0,15).forEach(b => console.log('  ! '+b));
console.log('\nPrice-band problems: '+priceProblems.length);
priceProblems.slice(0,10).forEach(b => console.log('  $ '+b));
console.log('\nGuard hits in cramped rooms (expected): '+guardHits.length);
const failed = bugs.length + essentialsGaps.length + priceProblems.length;
console.log(failed === 0 ? '\nOK: no placement bugs, no missing essentials, prices sane across the reasonable matrix.' : '\nFAIL: '+failed+' issue(s) need attention (see above).');
process.exit(failed === 0 ? 0 : 1);
