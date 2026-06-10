/**
 * Snapping smoke test — runs against the real calculateSnapPosition.
 *
 * Build + run:
 *   npx esbuild src/utils/snapping/index.ts --bundle --format=esm \
 *     --outfile=.tmp-snap-test/snap.mjs "--alias:@=./src" --platform=node
 *   node scripts/snapping-smoke.mjs
 */
import { calculateSnapPosition } from '../.tmp-snap-test/snap.mjs';

const room = { width: 3600, depth: 2400, height: 2400, shape: 'Rectangle', cutoutWidth: 0, cutoutDepth: 0 };

const baseItem = (over = {}) => ({
  instanceId: 'dragged',
  definitionId: 'base-600-1d',
  itemType: 'Cabinet',
  x: 0, y: 0, z: 0, rotation: 0,
  width: 600, depth: 575, height: 870,
  ...over,
});

let failures = 0;
function check(name, actual, expected, tol = 0.01) {
  const pass = Math.abs(actual - expected) <= tol;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  expected=${expected} actual=${actual}`);
}
function checkEq(name, actual, expected) {
  const pass = actual === expected;
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  expected=${expected} actual=${String(actual)}`);
}

// ---------------------------------------------------------------
// 1. Right-wall snap: cabinet must reach the right wall (B1 regression)
{
  const r = calculateSnapPosition(3450, 1200, baseItem(), [], room, 50);
  checkEq('right wall: snappedTo', r.snappedTo, 'wall');
  checkEq('right wall: rotation', r.rotation, 90);
  check('right wall: x = room - depth/2 - wallGap', r.x, 3600 - 575 / 2 - 10);
}

// 2. Back-wall gable run: flush side-by-side (B2 regression)
{
  const target = baseItem({ instanceId: 'target', x: 1000, z: 297.5, rotation: 0 });
  const r = calculateSnapPosition(1620, 290, baseItem(), [target], room, 1);
  check('back wall gable: x flush', r.x, 1600);
  check('back wall gable: z on wall', r.z, 297.5);
  checkEq('back wall gable: snapped item', r.snappedItemId, 'target');
}

// 3. LEFT-wall gable run (rotation 270) — broken before fix (B3 regression)
{
  const target = baseItem({ instanceId: 'target', x: 297.5, z: 1000, rotation: 270 });
  const r = calculateSnapPosition(290, 1640, baseItem({ rotation: 270 }), [target], room, 1);
  checkEq('left wall run: snapped to wall', r.snappedTo, 'wall');
  checkEq('left wall run: rotation', r.rotation, 270);
  check('left wall run: x on wall', r.x, 297.5);
  check('left wall run: z flush with neighbour', r.z, 1600);
  checkEq('left wall run: snapped item', r.snappedItemId, 'target');
}

// 4. Standard cabinet near a corner must NOT corner-snap (B5 regression)
{
  const r = calculateSnapPosition(250, 250, baseItem(), [], room, 50);
  checkEq('standard cabinet: no corner snap', r.snappedTo === 'corner', false);
}

// 5. Corner cabinet near a corner SHOULD corner-snap
{
  const corner = baseItem({ definitionId: 'base_corner_blind_left', width: 900 });
  const r = calculateSnapPosition(250, 250, corner, [], room, 50);
  checkEq('corner cabinet: corner snap', r.snappedTo, 'corner');
  check('corner cabinet: x', r.x, 900 / 2 + 10);
  check('corner cabinet: z', r.z, 575 / 2 + 10);
}

// 6. Corner snap must not overlap an existing cabinet (collision still runs)
{
  const occupier = baseItem({ instanceId: 'occupier', x: 310, z: 297.5, rotation: 0 });
  const corner = baseItem({ definitionId: 'base_corner_blind_left', width: 900 });
  const r = calculateSnapPosition(250, 250, corner, [occupier], room, 50);
  const overlapX = Math.abs(r.x - occupier.x) < (900 + 600) / 2 - 5;
  const overlapZ = Math.abs(r.z - occupier.z) < (575 + 575) / 2 - 5;
  checkEq('corner cabinet: pushed out of collision', overlapX && overlapZ, false);
}

console.log(failures === 0 ? '\nAll snapping smoke tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
