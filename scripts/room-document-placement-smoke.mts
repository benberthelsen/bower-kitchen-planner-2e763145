import assert from 'node:assert/strict';
import type { RoomDocumentV1 } from '../src/lib/roomDocument/types';
import { findRoomWallPlacement, placeWithinRoomDocument, snapRoomDocumentPlacement,
  validateRoomWallPlacement } from '../src/lib/trade/roomDocumentPlacement';

const angled: RoomDocumentV1 = {
  version: 1, id: 'angled', revision: 0,
  corners: [{ id: 'a', xMm: 0, zMm: 0 }, { id: 'b', xMm: 3000, zMm: 3000 }],
  walls: [{ id: 'angled-wall', startCornerId: 'a', endCornerId: 'b', interiorSide: 'left' }],
  chains: [{ id: 'chain', wallIds: ['angled-wall'], closed: false }],
  openings: [], services: [], objects: [],
};
const request = { document: angled, widthMm: 600, depthMm: 580, category: 'Base' as const, obstacles: [] };
const first = findRoomWallPlacement(request);
assert.equal(first.status, 'placed');
if (first.status === 'placed') {
  assert.equal(first.wallId, 'angled-wall');
  assert.ok(Math.abs(first.rotationDeg - 45) < 0.001);
  assert.ok(first.offsetMm! + 600 <= Math.hypot(3000, 3000));
}
assert.equal(placeWithinRoomDocument({ ...request, point: { xMm: 500, zMm: 500 }, rotationDeg: 22 }).status, 'unplaced');
const exact = validateRoomWallPlacement({ ...request, wallId: 'angled-wall', offsetMm: 500,
  depthOffsetMm: 10 });
assert.equal(exact.status, 'placed');
if (exact.status === 'placed') assert.ok(Math.abs(exact.rotationDeg - 45) < 0.001);
assert.equal(validateRoomWallPlacement({ ...request, wallId: 'angled-wall', offsetMm: 4000 }).status,
  'unplaced', 'exact edit cannot extend beyond an angled wall');

const doorway: RoomDocumentV1 = {
  ...angled,
  openings: [{ id: 'door', wallId: 'angled-wall', kind: 'door', offsetMm: 0, widthMm: 1700 }],
};
const pastDoor = findRoomWallPlacement({ ...request, document: doorway });
assert.equal(pastDoor.status, 'placed');
if (pastDoor.status === 'placed') assert.ok(pastDoor.offsetMm! >= 1700);
assert.equal(validateRoomWallPlacement({ ...request, document: doorway,
  wallId: 'angled-wall', offsetMm: 1200 }).status, 'unplaced',
  'exact edit cannot fill across a door');
assert.equal(validateRoomWallPlacement({ ...request, wallId: 'angled-wall', offsetMm: 500,
  obstacles: [{ id: 'other', xMm: exact.status === 'placed' ? exact.xMm : 0,
    zMm: exact.status === 'placed' ? exact.zMm : 0, rotationDeg: 45,
    widthMm: 600, depthMm: 580, category: 'Base' }] }).status, 'unplaced',
  'exact edit cannot overlap a placed cabinet');

const fullyBlocked: RoomDocumentV1 = {
  ...angled,
  openings: [{ id: 'door', wallId: 'angled-wall', kind: 'door', offsetMm: 0, widthMm: 4300 }],
};
assert.deepEqual(findRoomWallPlacement({ ...request, document: fullyBlocked }),
  { status: 'unplaced', reason: 'No measured wall has enough clear space for this item.' });
const sidesUnknown: RoomDocumentV1 = { ...angled, walls: angled.walls.map(wall => ({ ...wall, interiorSide: 'unknown' as const })) };
const noSide = findRoomWallPlacement({ ...request, document: sidesUnknown });
assert.equal(noSide.status, 'unplaced');
assert.match(noSide.status === 'unplaced' ? noSide.reason : '', /which side of the walls faces into the room/,
  'an unplaced item names the missing inside face instead of blaming wall space');

const moved = snapRoomDocumentPlacement({
  ...request, point: { xMm: 1400, zMm: 1800 }, rotationDeg: 13,
});
assert.equal(moved.status, 'placed');
if (moved.status === 'placed') assert.equal(moved.rotationDeg, 45);

const closed: RoomDocumentV1 = {
  ...angled,
  corners: [
    { id: 'a', xMm: 0, zMm: 0 }, { id: 'b', xMm: 4000, zMm: 0 },
    { id: 'c', xMm: 4000, zMm: 4000 }, { id: 'd', xMm: 0, zMm: 4000 },
  ],
  walls: [
    { id: 'ab', startCornerId: 'a', endCornerId: 'b', interiorSide: 'left' },
    { id: 'bc', startCornerId: 'b', endCornerId: 'c', interiorSide: 'left' },
    { id: 'cd', startCornerId: 'c', endCornerId: 'd', interiorSide: 'left' },
    { id: 'da', startCornerId: 'd', endCornerId: 'a', interiorSide: 'left' },
  ],
  chains: [{ id: 'perimeter', wallIds: ['ab', 'bc', 'cd', 'da'], closed: true }],
  floorBoundary: { cornerIds: ['a', 'b', 'c', 'd'], confirmed: true },
};
const atCentre = { document: closed, widthMm: 600, depthMm: 580,
  point: { xMm: 2000, zMm: 2000 }, rotationDeg: 0 };
const obstacle = { id: 'tall', xMm: 2000, zMm: 2000, rotationDeg: 0,
  widthMm: 600, depthMm: 580, category: 'Tall' as const };
assert.equal(placeWithinRoomDocument({ ...atCentre, category: 'Wall', obstacles: [obstacle] }).status, 'unplaced');
assert.equal(placeWithinRoomDocument({ ...atCentre, category: 'Tall', obstacles: [{ ...obstacle, category: 'Wall' }] }).status, 'unplaced');
assert.equal(placeWithinRoomDocument({ ...atCentre, category: 'Wall', elevationMm: 1350, heightMm: 720,
  obstacles: [{ ...obstacle, category: 'Base', elevationMm: 0, heightMm: 900 }] }).status, 'placed');
assert.equal(placeWithinRoomDocument({ ...atCentre, category: 'Wall', elevationMm: 1350, heightMm: 720,
  obstacles: [{ ...obstacle, category: 'Appliance', elevationMm: 0, heightMm: 2000 }] }).status, 'unplaced');
const furnished = { ...closed, objects: [{ id: 'existing-fridge', layer: 'existing' as const,
  kind: 'fridge', existingAction: 'keep' as const,
  placement: { type: 'free' as const, xMm: 2000, zMm: 2000, rotationDeg: 25 },
  widthMm: 900, depthMm: 750, heightMm: 1900, elevationMm: 0 }] };
assert.equal(placeWithinRoomDocument({ ...atCentre, document: furnished, category: 'Base',
  heightMm: 870, obstacles: [] }).status, 'unplaced', 'saved existing objects block placement');

console.log('Room document placement smoke tests passed');
