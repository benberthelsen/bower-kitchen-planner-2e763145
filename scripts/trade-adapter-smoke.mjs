/**
 * trade-adapter smoke — proposalToTradeRoom round trip (plan §11.1 / D6).
 * Generates a real compiled design with the engine, converts it to a
 * TradeRoom, converts back with the shared cabinetPlacedItem mapping, and
 * proves geometry, identity, materials and PRICE survive the round trip.
 * Run: npm run test:trade-adapter
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = process.cwd();

const OUT = path.join(ROOT, '.tmp-trade-adapter-test');
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'package.json'), '{"type":"commonjs"}');

const LAYOUT = ['types', 'schemas', 'geometry', 'catalogRoles', 'solveRun', 'compileSpec', 'validate', 'defaultSpec', 'priceDesign', 'wizardAdapter', 'proposalState', 'designScore', 'candidateGenerator', 'index'];
const TRADE = ['cabinetPlacedItem', 'proposalToTradeRoom'];

writeFileSync(path.join(OUT, 'types_stub.js'), 'module.exports = new Proxy({}, { get: () => undefined });\n');

function rewrite(src) {
  return src
    .replace(/(['"])@\/lib\/layout\1/g, "'./index'")
    .replace(/(['"])@\/constants\1/g, "'./constants'")
    .replace(/(['"])@\/types\/trade\1/g, "'./types_stub'")
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
for (const f of TRADE) transpileTo(f, path.join(ROOT, 'src/lib/trade', f + '.ts'));

const engine = require(path.join(OUT, 'index.js'));
const { toPlacedItems, categoryForDefinition } = require(path.join(OUT, 'cabinetPlacedItem.js'));
const { proposalToTradeRoom } = require(path.join(OUT, 'proposalToTradeRoom.js'));
const { briefFromWizard, defaultSpecFor, compileSpec, priceDesign, validate } = engine;

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (err) { failures++; console.error(`  ✗ ${name}\n    ${err.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const DEFAULTS = {
  dimensions: { baseHeight: 720, baseDepth: 560, wallHeight: 720, wallDepth: 300, tallHeight: 2100, tallDepth: 560, benchtopThickness: 33, kickHeight: 130 },
  materialDefaults: { exteriorFinish: 'do-designer-white', carcaseFinish: 'white-melamine', doorStyle: 'slab', edgeBanding: 'matching' },
  hardwareDefaults: { handleType: 'handle-bar-ss', handleColor: 'stainless', hingeType: 'soft-close', drawerType: 'standard', softClose: true, supplyHardware: true, adjustableLegs: true },
};
const NOW = new Date('2026-07-14T00:00:00Z');
const LINEAGE = {
  proposalId: 'prop-123', proposalFingerprint: 'fp-abc', sessionId: 'sess-9',
  roomRevision: 2, engineVersion: 'layout-v1.1', catalogVersion: 'role-map-v1-provisional',
};

function makeProposal() {
  const brief = briefFromWizard(
    { layoutPreference: 'l-shape', roomWidth: 4200, roomDepth: 3600, layoutStyle: 'standard' },
    {
      openings: [{ id: 'w1', wall: 'N', type: 'window', offsetMm: 1500, widthMm: 1200, sillHeightMm: 900 }],
      services: [{ id: 's1', wall: 'W', type: 'drain', offsetMm: 1000 }],
    },
  );
  brief.appliances = { ...brief.appliances, dishwasher: true, oven: '600', cooktop: 'gas' };
  const spec = defaultSpecFor(brief, 'l-shape');
  const compiled = compileSpec(spec, brief.room);
  const violations = validate(compiled, brief.room, brief);
  assert(violations.every(v => v.severity !== 'error'), 'fixture design has hard errors');
  return { brief, spec, items: compiled.items };
}

const convert = (p) => proposalToTradeRoom(
  { name: 'AI option', spec: p.spec, items: p.items, room: p.brief.room, lineage: LINEAGE },
  DEFAULTS,
  { now: NOW, roomId: 'room-1' },
);

console.log('trade adapter smoke tests');

check('every convertible placed item becomes a configured cabinet', () => {
  const p = makeProposal();
  const room = convert(p);
  const convertible = p.items.filter(i => i.itemType === 'Cabinet' || i.itemType === 'Appliance');
  assert(room.cabinets.length === convertible.length,
    `expected ${convertible.length} cabinets, got ${room.cabinets.length}`);
  assert(room.cabinets.length > 4, 'suspiciously few cabinets converted');
  const numbers = room.cabinets.map(c => c.cabinetNumber);
  assert(new Set(numbers).size === numbers.length, 'duplicate cabinet numbers');
  for (const c of room.cabinets) {
    assert(['Base', 'Wall', 'Tall', 'Appliance'].includes(c.category), `bad category ${c.category}`);
    assert(c.dimensions.width > 0 && c.dimensions.height > 0 && c.dimensions.depth > 0,
      `${c.definitionId} has invalid dimensions`);
    assert(c.isPlaced && c.position, `${c.definitionId} is not placed`);
  }
});

check('round trip preserves identity, geometry and materials', () => {
  const p = makeProposal();
  const room = convert(p);
  const back = toPlacedItems(room.cabinets, room.materialDefaults);
  const byId = new Map(back.map(i => [i.instanceId, i]));
  const convertible = p.items.filter(i => i.itemType === 'Cabinet' || i.itemType === 'Appliance');
  for (const original of convertible) {
    const r = byId.get(original.instanceId);
    assert(r, `${original.instanceId} lost in round trip`);
    for (const f of ['definitionId', 'x', 'y', 'z', 'rotation', 'width', 'height', 'depth']) {
      assert(r[f] === original[f], `${original.definitionId}.${f}: ${original[f]} -> ${r[f]}`);
    }
    assert(r.itemType === original.itemType, `${original.definitionId} itemType changed`);
  }
});

check('price band survives the round trip', () => {
  const p = makeProposal();
  const room = convert(p);
  const back = toPlacedItems(room.cabinets, room.materialDefaults);
  const a = priceDesign(p.items, p.spec.style);
  const b = priceDesign(back, p.spec.style);
  assert(a.lowAud === b.lowAud && a.highAud === b.highAud,
    `price changed: ${a.lowAud}-${a.highAud} -> ${b.lowAud}-${b.highAud}`);
});

check('style selections propagate into room and cabinet defaults', () => {
  const p = makeProposal();
  const room = convert(p);
  assert(room.materialDefaults.exteriorFinish === p.spec.style.finishId, 'finish not propagated');
  assert(room.hardwareDefaults.handleType === p.spec.style.handleId, 'handle not propagated');
  for (const c of room.cabinets) {
    assert(c.materials.exteriorFinish, `${c.definitionId} missing exterior finish`);
    assert(c.materials.carcaseFinish, `${c.definitionId} missing carcase finish`);
  }
});

check('room config carries geometry, openings and services', () => {
  const p = makeProposal();
  const room = convert(p);
  assert(room.config.width === p.brief.room.width && room.config.depth === p.brief.room.depth
    && room.config.height === p.brief.room.height, 'room dims lost');
  assert(room.config.openings?.length === 1 && room.config.services?.length === 1,
    'openings/services lost');
  assert(room.shape === 'rectangular', 'scanner V1 rooms must stay rectangular');
});

check('lineage is recorded on the room', () => {
  const p = makeProposal();
  const room = convert(p);
  for (const bit of ['prop-123', 'fp-abc', 'sess-9', 'room revision 2', 'layout-v1.1']) {
    assert(room.description.includes(bit), `lineage missing: ${bit}`);
  }
});

check('conversion is deterministic', () => {
  const p = makeProposal();
  const a = JSON.stringify(convert(p));
  const b = JSON.stringify(convert(p));
  assert(a === b, 'same proposal produced different TradeRooms');
});

check('appliance openings get the benchtop top rail and Appliance type', () => {
  const p = makeProposal();
  const room = convert(p);
  const openings = room.cabinets.filter(c => c.definitionId.includes('opening'));
  assert(openings.length >= 2, 'expected dishwasher + fridge openings');
  for (const c of openings) {
    assert(c.category === 'Appliance', `${c.definitionId} should be Appliance`);
    assert(c.construction?.topRail === true, `${c.definitionId} missing top rail`);
    assert(categoryForDefinition(c.definitionId) === 'Appliance', 'shared classifier disagrees');
  }
});

if (failures > 0) {
  console.error(`\n${failures} trade adapter test(s) failed`);
  process.exit(1);
}
console.log('All trade adapter smoke tests passed');
