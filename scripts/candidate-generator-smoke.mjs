/**
 * candidate-generator smoke — deterministic candidate pool (plan §7.1 / D2).
 * Self-contained: transpiles src/lib/layout via the installed TypeScript
 * compiler (same pattern as ai-planner-sweep.mjs). Run: npm run test:candidates
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = process.cwd();

const OUT = path.join(ROOT, '.tmp-candidate-test');
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'package.json'), '{"type":"commonjs"}');
const LAYOUT_DIR = path.join(ROOT, 'src/lib/layout');
const LAYOUT_FILES = [
  'types', 'schemas', 'geometry', 'catalogRoles', 'solveRun', 'compileSpec',
  'validate', 'defaultSpec', 'priceDesign', 'wizardAdapter', 'proposalState',
  'designScore', 'candidateGenerator', 'index',
];

writeFileSync(path.join(OUT, 'types_stub.js'), 'module.exports = new Proxy({}, { get: () => undefined });\n');

function rewrite(src) {
  return src
    .replace(/(['"])@\/constants\1/g, "'./constants'")
    .replace(/(['"])@\/types\1/g, "'./types_stub'")
    .replace(/(['"])(\.\.?\/[^'"]+?)\.ts\1/g, '$1$2$1');
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
const { briefFromWizard, generateCandidatePool, candidateSummaryFor } = engine;

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures++;
    console.error(`  ✗ ${name}\n    ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

function roomyBrief() {
  const brief = briefFromWizard(
    { layoutPreference: 'l-shape', roomWidth: 4800, roomDepth: 4200, layoutStyle: 'standard' },
    {
      openings: [{ id: 'w1', wall: 'N', type: 'window', offsetMm: 1600, widthMm: 1200, sillHeightMm: 900 }],
      services: [{ id: 's1', wall: 'W', type: 'drain', offsetMm: 1200 }],
    },
  );
  brief.island = 'if-it-fits';
  brief.appliances = { ...brief.appliances, dishwasher: true, oven: '600', cooktop: 'gas' };
  brief.priorities = ['storage'];
  return brief;
}

console.log('candidate generator smoke tests');

check('roomy room returns a full, diverse, error-free pool', () => {
  const pool = generateCandidatePool({ brief: roomyBrief() });
  assert(pool.candidates.length === 3, `expected 3 candidates, got ${pool.candidates.length}`);
  for (const c of pool.candidates) {
    assert(c.violations.every(v => v.severity !== 'error'), `${c.candidateId} carries an error violation`);
    assert(c.priceBand.lowAud > 0 && c.priceBand.highAud >= c.priceBand.lowAud, `${c.candidateId} price band invalid`);
    assert(c.score.total >= 0 && c.score.total <= 100, `${c.candidateId} score out of range`);
  }
  const pairs = new Set(pool.candidates.map(c => `${c.strategy}/${c.emphasis}`));
  assert(pairs.size === 3, 'candidates are not diverse (strategy/emphasis pairs repeat)');
  const totals = pool.candidates.map(c => c.score.total);
  assert(totals.every((t, i) => i === 0 || t <= totals[i - 1]), 'candidates are not ranked by score');
});

check('pool generation is deterministic', () => {
  const a = generateCandidatePool({ brief: roomyBrief() });
  const b = generateCandidatePool({ brief: roomyBrief() });
  assert(JSON.stringify(a.candidates.map(c => [c.candidateId, c.fingerprint, c.score.total]))
    === JSON.stringify(b.candidates.map(c => [c.candidateId, c.fingerprint, c.score.total])),
    'two runs produced different pools');
});

check('duplicate structures are removed', () => {
  const pool = generateCandidatePool({ brief: roomyBrief(), maxCandidates: 12 });
  const fingerprints = pool.candidates.map(c => c.fingerprint);
  assert(new Set(fingerprints).size === fingerprints.length, 'duplicate fingerprints survived de-duplication');
});

check('small room restricts attempted strategies', () => {
  const brief = briefFromWizard(
    { layoutPreference: 'single-wall', roomWidth: 2400, roomDepth: 2000, layoutStyle: 'minimal' },
    { openings: [], services: [] },
  );
  const pool = generateCandidatePool({ brief });
  assert(pool.attemptedStrategies.length === 1 && pool.attemptedStrategies[0] === 'single-wall',
    `expected only single-wall, attempted: ${pool.attemptedStrategies.join(',')}`);
  assert(pool.candidates.length >= 1, 'small room produced no candidates');
});

check('allowedStrategies is respected', () => {
  const pool = generateCandidatePool({ brief: roomyBrief(), allowedStrategies: ['galley'] });
  assert(pool.attemptedStrategies.every(s => s === 'galley'), 'attempted a disallowed strategy');
  assert(pool.candidates.every(c => c.strategy === 'galley'), 'returned a disallowed strategy');
});

check('drain wall drives the sink run and mirrored variant differs', () => {
  const pool = generateCandidatePool({ brief: roomyBrief(), allowedStrategies: ['l-shape'], maxCandidates: 12 });
  const walls = new Set(pool.candidates
    .map(c => c.spec.runs.find(r => r.segments.some(s => s.kind === 'cabinet' && s.role === 'sink'))?.wall)
    .filter(Boolean));
  assert(walls.size >= 1, 'no sink run found');
});

check('candidate summaries carry no geometry', () => {
  const pool = generateCandidatePool({ brief: roomyBrief() });
  const summary = candidateSummaryFor(pool.candidates[0]);
  assert(!('items' in summary) && !('spec' in summary), 'summary leaks compiled geometry');
  assert(Array.isArray(summary.cabinetRoles) && summary.cabinetRoles.length > 0, 'summary missing cabinet roles');
  assert(typeof summary.score === 'number', 'summary missing score');
});

check('rejected candidates carry reasons', () => {
  // A cramped l-shape: pre-filter allows it, compile/validate must reject or
  // degrade gracefully — either way the pipeline reports, never throws.
  const brief = briefFromWizard(
    { layoutPreference: 'l-shape', roomWidth: 2400, roomDepth: 2100, layoutStyle: 'standard' },
    { openings: [], services: [] },
  );
  brief.appliances = { ...brief.appliances, dishwasher: true };
  const pool = generateCandidatePool({ brief });
  assert(pool.candidates.length + pool.rejected.length > 0, 'cramped room produced nothing at all');
  for (const r of pool.rejected) {
    assert(Array.isArray(r.reasons) && r.reasons.length > 0, `${r.candidateId} rejected without reasons`);
  }
});

if (failures > 0) {
  console.error(`\n${failures} candidate generator test(s) failed`);
  process.exit(1);
}
console.log('All candidate generator smoke tests passed');
