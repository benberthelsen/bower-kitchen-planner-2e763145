/**
 * Characterization and regression fixtures for the pre-v5 designer boundary.
 * Run before and after reorganising designer logic.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = process.cwd();
const OUT = path.join(ROOT, '.tmp-snap-test', 'designer-characterization');
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'package.json'), '{"type":"commonjs"}');
writeFileSync(path.join(OUT, 'types_stub.js'), 'module.exports = new Proxy({}, { get: () => undefined });\n');

const files = [
  'types', 'versions', 'schemas', 'geometry', 'briefConstraints', 'polygon',
  'blindCorner', 'catalogRoles', 'catalogCapabilities', 'styleDNA', 'solveRun', 'compileSpec', 'rules', 'validate', 'defaultSpec',
  'priceDesign', 'wizardAdapter', 'proposalState', 'designScore',
  'candidateGenerator', 'index',
];

function rewrite(source) {
  return source
    .replace(/(['"])@\/constants\1/g, "'./constants'")
    .replace(/(['"])@\/types\1/g, "'./types_stub'")
    .replace(/(['"])(\.\.?\/[^'"]+?)\.ts\1/g, '$1$2$1');
}

function transpile(name, sourcePath) {
  const source = rewrite(readFileSync(sourcePath, 'utf8'));
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: sourcePath,
  });
  writeFileSync(path.join(OUT, `${name}.js`), outputText);
}

transpile('constants', path.join(ROOT, 'src/constants.ts'));
for (const file of files) transpile(file, path.join(ROOT, 'src/lib/layout', `${file}.ts`));

const engine = require(path.join(OUT, 'index.js'));
const { briefFromWizard, compileSpec, defaultSpecFor, generateCandidatePool, validate } = engine;

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${name}\n    ${error.message}`);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function baselineBrief() {
  const brief = briefFromWizard(
    { layoutPreference: 'l-shape', roomWidth: 4800, roomDepth: 4200, layoutStyle: 'standard' },
    {
      openings: [{ id: 'window-n', wall: 'N', type: 'window', offsetMm: 1500, widthMm: 1200, sillHeightMm: 1000 }],
      services: [{ id: 'drain-w', wall: 'W', type: 'drain', offsetMm: 1500 }],
    },
  );
  brief.allowedWalls = ['N', 'W'];
  brief.wallRanges = { N: { startMm: 0, endMm: 4800 }, W: { startMm: 0, endMm: 4200 } };
  brief.appliances = { dishwasher: true, oven: '600', cooktop: 'induction', fridgeWidthMm: 900 };
  brief.priorities = ['storage', 'bench-space'];
  brief.island = 'if-it-fits';
  return brief;
}

function compositionSignature(spec) {
  return JSON.stringify({
    runs: spec.runs.map(run => ({
      wall: run.wall,
      wallCabinets: run.wallCabinets,
      upperPlan: run.upperPlan ?? null,
      roles: run.segments.map(segment => segment.kind === 'cabinet' ? segment.role : segment.kind),
    })),
    island: spec.island ?? null,
  });
}

console.log('designer characterization tests');

check('selected walls and ranges survive default compilation', () => {
  const brief = baselineBrief();
  const spec = defaultSpecFor(brief, 'l-shape');
  const compiled = compileSpec(spec, brief.room);
  assert(spec.runs.every(run => brief.allowedWalls.includes(run.wall)), 'used a wall outside the customer selection');
  assert(compiled.runRanges.every(run => {
    const expected = brief.wallRanges[run.wall];
    return run.startMm === expected.startMm && run.endMm === expected.endMm;
  }), 'lost a customer wall range');
});

check('catalogue compilation remains deterministic and hard-rule checked', () => {
  const brief = baselineBrief();
  const spec = defaultSpecFor(brief, 'l-shape');
  const first = compileSpec(spec, brief.room);
  const second = compileSpec(spec, brief.room);
  assert(
    JSON.stringify(first.items.map(item => [item.definitionId, item.x, item.z, item.width]))
      === JSON.stringify(second.items.map(item => [item.definitionId, item.x, item.z, item.width])),
    'the same brief compiled differently',
  );
  assert(validate(first, brief.room, brief).every(v => v.severity !== 'error'), 'baseline contains a hard-rule error');
});

check('candidate alternatives are deterministic and structurally unique', () => {
  const brief = baselineBrief();
  const first = generateCandidatePool({ brief, maxCandidates: 3 });
  const second = generateCandidatePool({ brief, maxCandidates: 3 });
  assert(first.candidates.length > 0, 'no candidate survived');
  assert(new Set(first.candidates.map(candidate => candidate.fingerprint)).size === first.candidates.length,
    'a duplicate structure survived');
  assert(JSON.stringify(first.candidates.map(candidate => candidate.candidateId))
    === JSON.stringify(second.candidates.map(candidate => candidate.candidateId)), 'candidate ordering changed between runs');
});

// This is the release defect fixture. It intentionally fails against the old
// material-only presets and turns green only when Style DNA reaches composition.
check('style family changes composition, not finishes only', () => {
  const brief = baselineBrief();
  const hamptons = defaultSpecFor(brief, 'l-shape', {
    finishId: 'do-classic-white', benchtopId: 'egger-white-carrara', handleId: 'handle-knob-ss', familyId: 'hamptons',
  });
  const coastal = defaultSpecFor(brief, 'l-shape', {
    finishId: 'do-designer-white', benchtopId: 'egger-white-carrara', handleId: 'handle-bar-ss', familyId: 'coastal',
  });
  assert(compositionSignature(hamptons) !== compositionSignature(coastal),
    'Hamptons and Coastal still share the same cabinet composition');
});

if (failures > 0) {
  console.error(`\n${failures} characterization test(s) failed`);
  process.exit(1);
}
console.log('All designer characterization tests passed');
