import assert from 'node:assert/strict';
import type { RoomDocumentV1 } from '../src/lib/roomDocument/types';
import { generateRoomDocumentCandidates } from '../src/lib/layout/roomDocumentCandidates';
import { evaluateRoomDocumentCandidateRequest as browser } from '../src/lib/layout/roomDocumentCandidateApi';
import { evaluateRoomDocumentCandidateRequest as backend } from '../supabase/functions/_shared/layout/roomDocumentCandidateApi';

const open: RoomDocumentV1 = {
  version: 1, id: 'three-wall-angle', revision: 7,
  corners: [{ id: 'a', xMm: 0, zMm: 0 }, { id: 'b', xMm: 3000, zMm: 0 },
    { id: 'c', xMm: 4200, zMm: 1200 }, { id: 'd', xMm: 4200, zMm: 4800 }],
  walls: [{ id: 'sink', startCornerId: 'a', endCornerId: 'b', interiorSide: 'left' },
    { id: 'angled', startCornerId: 'b', endCornerId: 'c', interiorSide: 'left' },
    { id: 'cooktop', startCornerId: 'c', endCornerId: 'd', interiorSide: 'left' }],
  chains: [{ id: 'observed', wallIds: ['sink', 'angled', 'cooktop'], closed: false }],
  openings: [{ id: 'window', wallId: 'sink', kind: 'window', offsetMm: 900, widthMm: 900, sillHeightMm: 1000 }],
  services: [{ id: 'supply', kind: 'water-supply', placement: { type: 'wall', wallId: 'sink', offsetMm: 1350 } }],
  objects: [{ id: 'fridge', layer: 'existing', kind: 'fridge', existingAction: 'keep',
    placement: { type: 'wall', wallId: 'angled', offsetMm: 0 }, widthMm: 800, depthMm: 700, heightMm: 1800,
    placementProvenance: { source: 'user-correction', note: 'Fridge is on the angled wall.' } }],
};
const request = { document: open, allowedWallIds: ['sink', 'angled', 'cooktop'], maxCandidates: 5,
  style: { finishId: 'do-designer-white', benchtopId: 'bt-white', handleId: 'handle-bar-ss' } };
const result = browser(request);
assert.deepEqual(result, backend(request), 'browser and backend request boundaries must agree');
assert(result.ok && result.status === 'preliminary');
if (result.ok) {
  assert.equal(result.roomRevision, open.revision);
  assert.deepEqual(result.pool, generateRoomDocumentCandidates(request), 'API returns the same checked wall-run pool');
  assert.equal(result.pool.capability.floorConfirmed, false);
  assert(result.pool.candidates.length > 0);
  assert(result.pool.candidates.every(candidate => candidate.unresolved.some(note => note.includes('floor boundary'))));
  assert(result.pool.candidates.every(candidate => candidate.wallIds.every(id => open.walls.some(wall => wall.id === id))));
  assert(result.pool.candidates.every(candidate => candidate.items.every(({ item }) => item.rotation !== undefined)));
  assert.equal(open.chains[0].closed, false, 'request evaluation never closes a partial scan');
}

const blocked = { ...open, openings: [{ id: 'door', wallId: 'sink', kind: 'door' as const,
  offsetMm: 0, widthMm: 3000 }] };
const rejected = backend({ document: blocked, allowedWallIds: ['sink'] });
assert(rejected.ok && rejected.pool.candidates.length === 0);
if (rejected.ok) assert(rejected.pool.unplaced.some(item => item.reason.includes('largest clear span is 0 mm')));

const concave: RoomDocumentV1 = {
  ...open, id: 'closed-concave', revision: 8,
  corners: [
    { id: 'a', xMm: 0, zMm: 0 }, { id: 'b', xMm: 7000, zMm: 0 },
    { id: 'c', xMm: 7000, zMm: 2500 }, { id: 'd', xMm: 4800, zMm: 2500 },
    { id: 'e', xMm: 4800, zMm: 6000 }, { id: 'f', xMm: 0, zMm: 6000 },
  ],
  walls: [
    { id: 'ab', startCornerId: 'a', endCornerId: 'b', interiorSide: 'left' },
    { id: 'bc', startCornerId: 'b', endCornerId: 'c', interiorSide: 'left' },
    { id: 'cd', startCornerId: 'c', endCornerId: 'd', interiorSide: 'left' },
    { id: 'de', startCornerId: 'd', endCornerId: 'e', interiorSide: 'left' },
    { id: 'ef', startCornerId: 'e', endCornerId: 'f', interiorSide: 'left' },
    { id: 'fa', startCornerId: 'f', endCornerId: 'a', interiorSide: 'left' },
  ],
  chains: [{ id: 'outline', wallIds: ['ab', 'bc', 'cd', 'de', 'ef', 'fa'], closed: true }],
  floorBoundary: { confirmed: true, cornerIds: ['a', 'b', 'c', 'd', 'e', 'f'] },
  openings: [], services: [], objects: [],
};
const closedResult = backend({ document: concave, maxCandidates: 5 });
assert.deepEqual(closedResult, browser({ document: concave, maxCandidates: 5 }));
assert(closedResult.ok && closedResult.pool.capability.floorConfirmed);
if (closedResult.ok) assert(closedResult.pool.candidates.length > 0);

const unknown = backend({ document: { ...open, walls: open.walls.map(wall => ({ ...wall, interiorSide: 'unknown' })) } });
assert(unknown.ok && !unknown.pool.capability.supported && unknown.pool.candidates.length === 0);

for (const invalid of [
  null,
  { document: { ...open, walls: 'not an array' } },
  { document: { ...open, version: 2 } },
  { document: { ...open, objects: [{ ...open.objects[0], placement: null }] } },
  { document: { ...open, corners: open.corners.map(corner => ({ ...corner, xMm: corner.xMm * 10 })) } },
  { ...request, maxCandidates: 100 },
]) assert.deepEqual(backend(invalid), { ok: false, error: 'invalid_room_document_request' });

console.log('room document candidate API: bounded input, preliminary output and browser/backend parity passed');
