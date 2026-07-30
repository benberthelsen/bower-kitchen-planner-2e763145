import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ar = await import(pathToFileURL(resolve('.tmp-snap-test/ar-surfaces.mjs')).href);

const selected = ar.resolveArSurfaceSelection('do-natural-oak', 'egger-black');
assert.equal(selected.cabinet.id, 'do-natural-oak');
assert.equal(selected.cabinet.supplier, 'Polytec');
assert.equal(selected.benchtop.id, 'egger-black');
assert.equal(selected.benchtop.supplier, 'EGGER');

const fallback = ar.resolveArSurfaceSelection('unknown-finish', 'unknown-benchtop');
assert.ok(fallback.cabinet.textureUrl);
assert.ok(fallback.benchtop.textureUrl);

const item = (patch) => ({
  instanceId: 'test',
  definitionId: 'base_1_door',
  itemType: 'Cabinet',
  x: 0,
  y: 0,
  z: 0,
  rotation: 0,
  width: 600,
  height: 730,
  depth: 575,
  ...patch,
});

assert.equal(ar.shouldAddArBenchtop(item({})), true, 'base cabinet needs a benchtop');
assert.equal(ar.shouldAddArBenchtop(item({ itemType: 'Appliance' })), true, 'dishwasher opening needs a benchtop');
assert.equal(ar.shouldAddArBenchtop(item({ y: 1350, height: 720 })), false, 'wall cabinet must not get a benchtop');
assert.equal(ar.shouldAddArBenchtop(item({ height: 2100 })), false, 'tall cabinet must not get a benchtop');
assert.equal(ar.shouldAddArBenchtop(item({ itemType: 'Structure' })), false, 'structure is already its own surface');

const designSource = readFileSync('src/pages/homeowner/steps/StepDesign.tsx', 'utf8');
const androidSource = readFileSync('src/pages/homeowner/ViewInRoomAr.tsx', 'utf8');
const iosSource = readFileSync('src/lib/ar/exportSceneUsdz.ts', 'utf8');

assert.match(designSource, /finishId: style\.finishId,\s+benchtopId: style\.benchtopId,/);
assert.ok(androidSource.includes('createArBoxMaterials'), 'Android AR must apply supplier textures');
assert.ok(androidSource.includes('beforexrselect'), 'AR controls must not create phantom anchors');
assert.ok(androidSource.includes('cleanupArResources();'), 'Android AR must clean up ended sessions');
assert.ok(iosSource.includes('quickLookCompatible: true'), 'iOS export must use Quick Look compatibility');
assert.ok(iosSource.includes('shouldAddArBenchtop(item)'), 'iOS model must include benchtop slabs');

console.log('AR fidelity: material propagation, benchtops, lifecycle, and Quick Look guards pass');
