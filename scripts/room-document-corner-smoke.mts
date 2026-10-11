import assert from 'node:assert/strict';
import type { RoomDocumentV1 } from '../src/lib/roomDocument/types';
import { findRoomDocumentCornerPlacement } from '../src/lib/trade/roomDocumentCornerPlacement';

const open: RoomDocumentV1 = {
  version: 1, id: 'corner-test', revision: 0,
  corners: [
    { id: 'a', xMm: 0, zMm: 0 },
    { id: 'b', xMm: 3000, zMm: 0 },
    { id: 'c', xMm: 3000, zMm: 3000 },
  ],
  walls: [
    { id: 'north', startCornerId: 'a', endCornerId: 'b', interiorSide: 'left' },
    { id: 'east', startCornerId: 'b', endCornerId: 'c', interiorSide: 'left' },
  ],
  chains: [{ id: 'partial', wallIds: ['north', 'east'], closed: false }],
  openings: [], services: [], objects: [],
};
const request = { document: open, footprintMm: 900, category: 'Base' as const, heightMm: 900,
  preferredPoint: { xMm: 2500, zMm: 500 } };
const first = findRoomDocumentCornerPlacement(request);
assert.equal(first.status, 'placed', 'a verified right-angle join accepts a corner product');
if (first.status === 'placed') {
  assert.equal(first.wallAttachment.wallId, 'east');
  assert.equal(first.joinedWallId, 'north');
  assert.equal(first.wallAttachment.offsetMm, 0);
  assert.equal(first.wallAttachment.depthOffsetMm, 0);
  assert.equal(first.cornerId, 'b');
  assert.equal(first.cornerReturnSide, 'Left');
  assert.equal(first.rotationDeg, 90);
  assert.equal(first.xMm, 2550);
  assert.equal(first.zMm, 450);
  assert.equal(first.floorBoundaryConfirmed, false, 'open chain does not claim a measured floor');
}

const angled = structuredClone(open);
angled.corners[2].xMm = 4200;
assert.equal(findRoomDocumentCornerPlacement({ ...request, document: angled }).status, 'unplaced',
  'a 135-degree corner needs separate straight runs');

const reflex = structuredClone(open);
reflex.walls[1].interiorSide = 'right';
assert.equal(findRoomDocumentCornerPlacement({ ...request, document: reflex }).status, 'unplaced',
  'a reflex join is not a 90-degree inside corner');

const short = structuredClone(open);
short.corners[2].zMm = 700;
assert.equal(findRoomDocumentCornerPlacement({ ...request, document: short }).status, 'unplaced',
  'both physical wall segments must support the catalogue footprint');

const doorway = structuredClone(open);
doorway.openings.push({ id: 'door', wallId: 'east', kind: 'door', offsetMm: 100, widthMm: 800 });
assert.equal(findRoomDocumentCornerPlacement({ ...request, document: doorway }).status, 'unplaced',
  'an opening prevents a corner cabinet at its wall end');

const overhead = structuredClone(open);
overhead.objects.push({ id: 'upper', layer: 'existing', kind: 'upper',
  placement: { type: 'wall', wallId: 'east', offsetMm: 0 },
  widthMm: 900, depthMm: 400, heightMm: 600, elevationMm: 1500, existingAction: 'keep' });
assert.equal(findRoomDocumentCornerPlacement({ ...request, document: overhead }).status, 'placed',
  'an overhead may share floor area with a base unit');
overhead.objects[0].elevationMm = 0;
assert.equal(findRoomDocumentCornerPlacement({ ...request, document: overhead }).status, 'unplaced',
  'a kept base-height object blocks the corner footprint');

const confirmed = structuredClone(open);
confirmed.corners.push({ id: 'd', xMm: 0, zMm: 3000 });
confirmed.floorBoundary = { confirmed: true, cornerIds: ['a', 'b', 'c', 'd'] };
assert.equal(findRoomDocumentCornerPlacement({ ...request, document: confirmed }).status, 'placed');
confirmed.corners.push({ id: 'e', xMm: 3000, zMm: 200 });
confirmed.floorBoundary.cornerIds = ['a', 'b', 'e'];
assert.equal(findRoomDocumentCornerPlacement({ ...request, document: confirmed }).status, 'unplaced',
  'the actual floor polygon rejects a corner that crosses its edge');

console.log('room document corner placement: right-angle pose, angle, opening, length and vertical clearance checks passed');
