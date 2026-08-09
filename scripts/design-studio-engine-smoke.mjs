/** v5 Style DNA, professional quality and diversity acceptance tests. */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = process.cwd();
const OUT = path.join(ROOT, '.tmp-snap-test', 'design-studio-engine');
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'package.json'), '{"type":"commonjs"}');
writeFileSync(path.join(OUT, 'types_stub.js'), 'module.exports = new Proxy({}, { get: () => undefined });\n');

const files = [
  'types', 'versions', 'schemas', 'geometry', 'briefConstraints', 'polygon', 'blindCorner', 'catalogRoles',
  'catalogCapabilities', 'styleDNA', 'solveRun', 'compileSpec', 'rules', 'validate', 'defaultSpec',
  'priceDesign', 'wizardAdapter', 'proposalState', 'designScore', 'candidateGenerator', 'index',
];
function rewrite(source) {
  return source
    .replace(/(['"])@\/constants\1/g, "'./constants'")
    .replace(/(['"])@\/types\1/g, "'./types_stub'")
    .replace(/(['"])(\.\.?\/[^'"]+?)\.ts\1/g, '$1$2$1');
}
function transpile(name, sourcePath) {
  const { outputText } = ts.transpileModule(rewrite(readFileSync(sourcePath, 'utf8')), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: sourcePath,
  });
  writeFileSync(path.join(OUT, `${name}.js`), outputText);
}
transpile('constants', path.join(ROOT, 'src/constants.ts'));
for (const file of files) transpile(file, path.join(ROOT, 'src/lib/layout', `${file}.ts`));

const engine = require(path.join(OUT, 'index.js'));
const {
  STYLE_DNA, STYLE_FAMILY_IDS, previewStyleFamilies, styleActivationStatus,
  structuralTraitDifference, briefFromWizard, compileSpec, defaultSpecFor,
  validate, generateCandidatePool, candidateDifference,
} = engine;

let failures = 0;
const check = (name, test) => {
  try { test(); console.log(`  ✓ ${name}`); }
  catch (error) { failures += 1; console.error(`  ✗ ${name}\n    ${error.message}`); }
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function roomyBrief() {
  const brief = briefFromWizard(
    { layoutPreference: 'l-shape', roomWidth: 4800, roomDepth: 4200, layoutStyle: 'standard' },
    { services: [{ id: 'drain-w', wall: 'W', type: 'drain', offsetMm: 1300 }], openings: [] },
  );
  brief.appliances = { dishwasher: true, oven: '600', cooktop: 'induction', fridgeWidthMm: 900 };
  brief.priorities = ['storage', 'bench-space'];
  brief.island = 'if-it-fits';
  return brief;
}

function styleFor(id) {
  const profile = STYLE_DNA[id];
  return { ...profile.defaultStyle, familyId: id, familyVersion: profile.version, variantId: 'balanced' };
}

console.log('design studio engine acceptance tests');

check('all sixteen families are defined and versioned', () => {
  assert(STYLE_FAMILY_IDS.length === 16, `expected 16 families, got ${STYLE_FAMILY_IDS.length}`);
  for (const id of STYLE_FAMILY_IDS) {
    const profile = STYLE_DNA[id];
    assert(profile && profile.version >= 1, `${id} is missing a versioned DNA profile`);
    assert(profile.variants.length === 3, `${id} does not have three variants`);
    assert(profile.referenceReview.requiredReferenceCount === 5, `${id} lost the five-reference review gate`);
  }
});

check('preview exposes only mapped launch families and no dead tiles', () => {
  const visible = previewStyleFamilies();
  const ids = visible.map(profile => profile.id);
  assert(ids.length >= 4 && ids.length <= 6, `expected 4-6 mapped launch families, got ${ids.length}: ${ids.join(', ')}`);
  assert(!ids.includes('hamptons'), 'Hamptons appeared without mapped shaker/crown/pillar capabilities');
  assert(styleActivationStatus(STYLE_DNA.hamptons).releaseReady === false, 'unmapped Hamptons is release-ready');
  assert(!ids.includes('japandi'), 'future catalogue family leaked into launch tiles');
});

check('mapped launch families differ by at least two structural traits', () => {
  const visible = previewStyleFamilies();
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const difference = structuralTraitDifference(visible[i], visible[j]);
      assert(difference >= 2, `${visible[i].id} and ${visible[j].id} differ by only ${difference} structural traits`);
    }
  }
});

check('Hamptons, Scandinavian and Coastal satisfy composition assertions', () => {
  const brief = roomyBrief();
  const hamptons = defaultSpecFor(brief, 'l-shape', styleFor('hamptons'));
  const scandinavian = defaultSpecFor(brief, 'l-shape', styleFor('scandinavian'));
  const coastal = defaultSpecFor(brief, 'l-shape', styleFor('coastal'));
  assert(hamptons.style.compositionFeatureIds.includes('crown-moulding'), 'Hamptons lost crown moulding');
  assert(hamptons.style.compositionFeatureIds.includes('pillar-ends'), 'Hamptons lost pillar ends');
  assert(Math.max(...scandinavian.runs.map(run => run.upperPlan?.coverageRatio ?? 0)) <= .55,
    'Scandinavian has a full overhead run');
  assert(Math.max(...coastal.runs.map(run => run.upperPlan?.openShelfRatio ?? 0)) >= .45,
    'Coastal has no open-shelf-led run');
  const coastalCompiled = compileSpec(coastal, brief.room);
  assert(coastalCompiled.items.some(item => item.definitionId === 'open_wall'), 'Coastal did not compile an exact open_wall product');
  for (const spec of [hamptons, scandinavian, coastal]) {
    const findings = validate(compileSpec(spec, brief.room), brief.room, brief);
    assert(!findings.some(finding => finding.code.startsWith('style-')), `${spec.style.familyId} failed style fidelity`);
  }
});

check('professional candidate gate rejects planning defects and scores at least 80', () => {
  const pool = generateCandidatePool({
    brief: roomyBrief(),
    style: styleFor('scandinavian'),
    preferredStrategy: 'l-shape',
    professionalGate: true,
    maxCandidates: 3,
  });
  assert(pool.candidates.length >= 2, `expected at least two professional alternatives, got ${pool.candidates.length}`);
  assert(pool.candidates[0].strategy === 'l-shape', 'customer preferred layout was not presented first');
  for (const candidate of pool.candidates) {
    assert(candidate.score.total >= 80 && candidate.score.meetsMinimum, `${candidate.candidateId} missed professional score gate`);
    assert(candidate.violations.every(violation => ![
      'cooktop-landing', 'fridge-landing', 'triangle-size',
      'triangle-obstruction', 'prep-space',
    ].includes(violation.code)), `${candidate.candidateId} retained a professional hard finding`);
  }
  for (let i = 0; i < pool.candidates.length; i++) {
    for (let j = i + 1; j < pool.candidates.length; j++) {
      assert(candidateDifference(pool.candidates[i], pool.candidates[j]) >= 3,
        `${pool.candidates[i].candidateId} and ${pool.candidates[j].candidateId} are near-duplicates`);
    }
  }
});

check('back + right wall selection produces a professional appliance-complete layout', () => {
  const brief = roomyBrief();
  brief.allowedWalls = ['E', 'N'];
  brief.room.services = [];
  const pool = generateCandidatePool({
    brief,
    style: styleFor('classic-white'),
    preferredStrategy: 'l-shape',
    professionalGate: true,
    maxCandidates: 3,
  });
  assert(pool.candidates.length > 0, `E + N produced no candidate: ${JSON.stringify(pool.rejected)}`);
  const first = pool.candidates[0];
  assert(first.spec.runs.every(run => brief.allowedWalls.includes(run.wall)), 'candidate escaped the selected E + N walls');
  const roles = new Set(first.spec.runs.flatMap(run => run.segments.flatMap(segment =>
    segment.kind === 'cabinet' ? [segment.role] : [],
  )));
  for (const role of ['oven-tower', 'fridge-gap', 'cooktop', 'sink', 'dishwasher']) {
    assert(roles.has(role), `E + N candidate lost the required ${role} appliance position`);
  }
});

check('short right return still produces a professional Coastal starter with usable fridge doors', () => {
  const brief = roomyBrief();
  brief.allowedWalls = ['E', 'S'];
  brief.wallRanges = {
    E: { startMm: 0, endMm: 1800 },
    S: { startMm: 0, endMm: 4800 },
  };
  brief.room.services = [];
  const pool = generateCandidatePool({
    brief,
    style: styleFor('coastal'),
    preferredStrategy: 'l-shape',
    professionalGate: true,
    maxCandidates: 3,
  });
  assert(pool.candidates.length > 0, `short E + full S produced no candidate: ${JSON.stringify(pool.rejected)}`);
  const first = pool.candidates[0];
  const compiled = compileSpec(first.spec, brief.room);
  const fridge = compiled.rolePositions['fridge-gap'];
  assert(fridge?.wall === 'S', `expected fridge on the full front wall, got ${fridge?.wall ?? 'none'}`);
  assert(fridge.startMm >= 600, `fridge starts only ${fridge.startMm}mm from the room corner`);
  assert(compiled.rolePositions.sink?.wall === 'S', 'sink was exiled to the detached short return');
  assert(compiled.rolePositions.cooktop?.wall === 'S', 'cooktop left the complete working run');
  assert(!first.violations.some(violation => violation.code === 'fridge-room-corner-clearance'),
    'candidate retained a fridge room-corner blocker');
});

check('a pantry inserted mid-run is invalid', () => {
  const brief = roomyBrief();
  const spec = defaultSpecFor(brief, 'single-wall', styleFor('classic-white'));
  const run = spec.runs[0];
  const sink = run.segments.findIndex(segment => segment.kind === 'cabinet' && segment.role === 'sink');
  run.segments.splice(sink + 1, 0, { kind: 'cabinet', role: 'pantry', widthMm: 600 });
  const findings = validate(compileSpec(spec, brief.room), brief.room, brief);
  assert(findings.some(finding => finding.code === 'tall-unit-run-end' || finding.code === 'tall-unit-workflow-break'),
    'mid-run pantry was not rejected');
});

if (failures) {
  console.error(`\n${failures} design studio engine test(s) failed`);
  process.exit(1);
}
console.log('All design studio engine acceptance tests passed');
