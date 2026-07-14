/**
 * rule-pack smoke — kitchen rule evaluator + QLD draft profile (plan §7.4).
 * Self-contained transpile (same pattern as candidate-generator-smoke.mjs).
 * Run: npm run test:rules
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = process.cwd();

const OUT = path.join(ROOT, '.tmp-rules-test');
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'package.json'), '{"type":"commonjs"}');

const LAYOUT = ['types', 'schemas', 'geometry', 'catalogRoles'];
const DESIGN_V2 = ['contracts', 'fingerprint', 'regulatoryProfiles', 'rulePack', 'evaluateKitchenRules'];

writeFileSync(path.join(OUT, 'types_stub.js'), 'module.exports = new Proxy({}, { get: () => undefined });\n');

function rewrite(src) {
  return src
    .replace(/(['"])@\/lib\/layout\/([A-Za-z]+)\1/g, "'./$2'")
    .replace(/(['"])@\/lib\/layout\1/g, "'./types_stub'") // type-only in practice
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
for (const f of LAYOUT) transpileTo(f, path.join(ROOT, 'src/lib/layout', f + '.ts'));
for (const f of DESIGN_V2) transpileTo(f, path.join(ROOT, 'src/lib/designV2', f + '.ts'));

const rules = require(path.join(OUT, 'evaluateKitchenRules.js'));
const pack = require(path.join(OUT, 'rulePack.js'));
const contracts = require(path.join(OUT, 'contracts.js'));
const { evaluateKitchenRules, hasConceptBlocker, quoteBlockers } = rules;

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (err) { failures++; console.error(`  ✗ ${name}\n    ${err.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const gasBrief = { appliances: { cooktop: 'gas', dishwasher: true, fridgeWidthMm: 940 }, priorities: [], household: {}, island: 'no', room: {} };
const qldContext = { jurisdiction: 'AU-QLD', projectScope: 'new-kitchen', effectiveOn: '2026-07-14', regulatoryProfileId: null };
const base = (violations, projectContext = qldContext, approvedProfiles = []) =>
  evaluateKitchenRules({ brief: gasBrief, spec: { runs: [], style: {}, rationale: '' }, violations, projectContext, approvedProfiles });

console.log('rule pack smoke tests');

check('clean design: no fails, regulated rules pending, no concept blocker', () => {
  const results = base([]);
  assert(results.every(r => r.status !== 'fail'), 'clean design produced a fail');
  assert(!hasConceptBlocker(results), 'clean design has a concept blocker');
  const pending = quoteBlockers(results);
  assert(pending.length >= 3, `expected >=3 pending quote blockers, got ${pending.length}`);
  assert(pending.every(r => r.status === 'pending'), 'quote blockers should be pending, not failed');
  assert(pending.every(r => r.rulePackVersion === pack.REGULATORY_PROFILE_PENDING),
    'pending regulated rules must carry the pending profile version');
});

check('geometry error maps to a concept blocker fail', () => {
  const results = base([{ code: 'overlap', severity: 'error', message: 'items overlap', itemIds: ['a', 'b'] }]);
  const room = results.find(r => r.ruleId === 'KRN-ROOM-001' && r.status === 'fail');
  assert(room, 'overlap did not map to KRN-ROOM-001 fail');
  assert(room.severity === 'blocker' && room.stage === 'concept', 'wrong stage/severity for overlap');
  assert(room.entityIds.join(',') === 'a,b', 'entity IDs lost');
  assert(hasConceptBlocker(results), 'concept blocker not detected');
});

check('dishwasher adjacency and aisle violations use their doc rule IDs', () => {
  const results = base([
    { code: 'dishwasher-not-adjacent', severity: 'error', message: 'dw' },
    { code: 'narrow-aisle', severity: 'error', message: 'aisle' },
  ]);
  assert(results.some(r => r.ruleId === 'KRN-DW-001' && r.status === 'fail'), 'KRN-DW-001 missing');
  assert(results.some(r => r.ruleId === 'KRN-AISLE-001' && r.status === 'fail'), 'KRN-AISLE-001 missing');
});

check('service-move warnings map to quote-stage guidance', () => {
  const results = base([
    { code: 'replumb', severity: 'warn', message: 're-plumbing' },
    { code: 'gas-move', severity: 'warn', message: 'gas work' },
  ]);
  const sink = results.find(r => r.ruleId === 'KRN-SINK-003');
  assert(sink && sink.stage === 'quote' && sink.severity === 'warning', 'replumb mapping wrong');
  const gas = results.find(r => r.ruleId === 'ERG-GAS-MOVE-001');
  assert(gas && gas.severity === 'advisory', 'gas-move mapping wrong');
  assert(!hasConceptBlocker(results), 'warnings must not become concept blockers');
});

check('unknown engine findings surface instead of disappearing', () => {
  const results = base([{ code: 'brand-new-code', severity: 'warn', message: 'x' }]);
  assert(results.some(r => r.messageKey === 'engine.brand-new-code' && r.status === 'fail'),
    'unknown violation was dropped');
});

check('missing project context keeps regulated rules pending', () => {
  const results = evaluateKitchenRules({
    brief: gasBrief, spec: { runs: [], style: {}, rationale: '' },
    violations: [], projectContext: null, approvedProfiles: [],
  });
  const regulated = results.filter(r => r.rulePackVersion === pack.REGULATORY_PROFILE_PENDING);
  assert(regulated.length >= 3, 'regulated rules missing without project context');
  assert(regulated.every(r => r.status === 'pending' || r.status === 'not-applicable'),
    'regulated rules must stay pending without context');
});

check('an approved matching profile is recorded but rules still await appliance data', () => {
  const approved = {
    profileId: 'bower-regulatory-au-qld', version: '1.0.0', jurisdiction: 'AU-QLD',
    effectiveFrom: '2026-01-01', effectiveTo: null,
    projectScopes: ['new-kitchen', 'full-kitchen-renovation'],
    standardsEditions: { 'AS/NZS 5601.1': '2022' },
    qualifiedApprover: 'Test Approver', approvalDate: '2026-01-01',
    contentHash: 'a'.repeat(64),
  };
  const results = base([], qldContext, [approved]);
  const rh = results.find(r => r.ruleId === 'KRN-RH-001');
  assert(rh.rulePackVersion === 'bower-regulatory-au-qld@1.0.0', 'matched profile version not recorded');
  assert(rh.status === 'pending' && rh.messageKey === 'regulatory.rh.awaiting-appliance-data',
    'matched profile must still await exact appliance data');
});

check('every result parses the KitchenRuleResultV1 schema', () => {
  const results = base([
    { code: 'overlap', severity: 'error', message: 'x', itemIds: ['a'] },
    { code: 'replumb', severity: 'warn', message: 'y' },
  ]);
  for (const r of results) contracts.kitchenRuleResultV1Schema.parse(r);
});

check('evaluation is deterministic', () => {
  const a = JSON.stringify(base([{ code: 'replumb', severity: 'warn', message: 'y' }]));
  const b = JSON.stringify(base([{ code: 'replumb', severity: 'warn', message: 'y' }]));
  assert(a === b, 'same input produced different results');
});

check('QLD draft profile cannot pass as an approved profile', () => {
  const draft = pack.QLD_REGULATORY_PROFILE_DRAFT;
  assert(draft.status === 'draft-pending-approval', 'draft status missing');
  assert(draft.jurisdiction === 'AU-QLD', 'wrong jurisdiction');
  assert(!('qualifiedApprover' in draft) && !('contentHash' in draft),
    'draft must not carry approval fields');
  assert(contracts.regulatoryProfileV1Schema.safeParse(draft).success === false,
    'draft unexpectedly satisfies the approved-profile schema');
  assert(draft.seedParameters.every(p => p.bowerApproved === false),
    'draft parameters must not be pre-approved');
});

if (failures > 0) {
  console.error(`\n${failures} rule pack test(s) failed`);
  process.exit(1);
}
console.log('All rule pack smoke tests passed');
