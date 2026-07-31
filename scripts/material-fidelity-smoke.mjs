import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cloneTextureForSurface,
  getPhysicalTextureSize,
  setPhysicalTextureSize,
  withOptionalSurfaceTexture,
} from '../.tmp-snap-test/physical-texture.mjs';

const source = new THREE.Texture();
setPhysicalTextureSize(source, { width: 1200, height: 2400 });
assert.deepEqual(getPhysicalTextureSize(source), { width: 1200, height: 2400 });

const door = cloneTextureForSurface(source, 0.6, 0.72);
assert.ok(door);
assert.equal(Number(door.repeat.x.toFixed(3)), 0.5);
assert.equal(Number(door.repeat.y.toFixed(3)), 0.3);
assert.notEqual(door, source);

const drawer = cloneTextureForSurface(source, 0.9, 0.24, { rotateQuarterTurn: true });
assert.ok(drawer);
assert.equal(Number(drawer.repeat.x.toFixed(3)), 0.2);
assert.equal(Number(drawer.repeat.y.toFixed(3)), 0.375);
assert.equal(drawer.rotation, Math.PI / 2);

const procedural = new THREE.Texture();
const fallback = cloneTextureForSurface(procedural, 0.6, 0.72);
assert.ok(fallback);
assert.equal(fallback.repeat.x, 1);
assert.equal(Number(fallback.repeat.y.toFixed(1)), 1.2);

const proceduralMaterial = { color: '#c5aa82', roughness: 0.58, map: procedural };
const whileLoading = withOptionalSurfaceTexture(proceduralMaterial, null);
assert.equal(
  whileLoading.map,
  procedural,
  'dishwasher slab must retain the same procedural benchtop while supplier texture loads',
);

const supplier = new THREE.Texture();
const afterLoading = withOptionalSurfaceTexture(proceduralMaterial, supplier);
assert.equal(afterLoading.map, supplier);
assert.equal(afterLoading.color, proceduralMaterial.color);
assert.equal(afterLoading.roughness, proceduralMaterial.roughness);

console.log('material fidelity: physical scale, grain orientation, and shared appliance fallback passed');
