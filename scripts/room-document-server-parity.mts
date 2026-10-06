import assert from 'node:assert/strict';
import type { RoomDocumentV1 } from '../src/lib/roomDocument/types';
import { generateRoomDocumentCandidates as browserCandidates } from '../src/lib/layout/roomDocumentCandidates';
import { generateRoomDocumentCandidates as serverCandidates } from '../supabase/functions/_shared/layout/roomDocumentCandidates';

const open: RoomDocumentV1 = {
  version: 1, id: 'parity-open', revision: 2,
  corners: [
    { id: 'a', xMm: 0, zMm: 0 },
    { id: 'b', xMm: 2200, zMm: 0 },
    { id: 'c', xMm: 3200, zMm: 1000 },
    { id: 'd', xMm: 3200, zMm: 3800 },
  ],
  walls: [
    { id: 'sink', startCornerId: 'a', endCornerId: 'b', interiorSide: 'left' },
    { id: 'angled', startCornerId: 'b', endCornerId: 'c', interiorSide: 'left' },
    { id: 'cooktop', startCornerId: 'c', endCornerId: 'd', interiorSide: 'left' },
  ],
  chains: [{ id: 'open', wallIds: ['sink', 'angled', 'cooktop'], closed: false }],
  openings: [{ id: 'window', wallId: 'sink', kind: 'window', offsetMm: 500, widthMm: 900, sillHeightMm: 900 }],
  services: [{ id: 'water', kind: 'water-supply', placement: { type: 'wall', wallId: 'sink', offsetMm: 800 } }],
  objects: [{ id: 'existing-fridge', layer: 'existing', kind: 'fridge', existingAction: 'keep',
    placement: { type: 'wall', wallId: 'angled', offsetMm: 0 },
    widthMm: 750, depthMm: 700, heightMm: 1850, elevationMm: 0 }],
};

const closed: RoomDocumentV1 = {
  ...open, id: 'parity-concave', revision: 3,
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
  chains: [{ id: 'perimeter', wallIds: ['ab', 'bc', 'cd', 'de', 'ef', 'fa'], closed: true }],
  floorBoundary: { cornerIds: ['a', 'b', 'c', 'd', 'e', 'f'], confirmed: true },
  openings: [], services: [], objects: [],
};

for (const document of [open, closed]) {
  assert.deepEqual(browserCandidates({ document, maxCandidates: 5 }),
    serverCandidates({ document, maxCandidates: 5 }),
    `${document.id}: browser and backend must accept, reject and rank the same candidates`);
}
console.log('Room document browser/backend candidate parity passed');
