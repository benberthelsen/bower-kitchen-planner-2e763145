import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { RoomDocumentV1 } from '../src/lib/roomDocument/types';
import { generateRoomDocumentCandidates } from '../src/lib/layout/roomDocumentCandidates';
import { generateCandidatePool } from '../src/lib/layout/candidateGenerator';
import { compileSpec } from '../src/lib/layout/compileSpec';

const open: RoomDocumentV1 = {
  version: 1, id: 'eight-hibiscus-test', revision: 4,
  corners: [
    { id: 'c1', xMm: 0, zMm: 0 },
    { id: 'c2', xMm: 3000, zMm: 0 },
    { id: 'c3', xMm: 4200, zMm: 1200 },
    { id: 'c4', xMm: 4200, zMm: 4400 },
  ],
  walls: [
    { id: 'sink', startCornerId: 'c1', endCornerId: 'c2', interiorSide: 'left' },
    { id: 'angled', startCornerId: 'c2', endCornerId: 'c3', interiorSide: 'left' },
    { id: 'cooktop', startCornerId: 'c3', endCornerId: 'c4', interiorSide: 'left' },
  ],
  chains: [{ id: 'open-chain', wallIds: ['sink', 'angled', 'cooktop'], closed: false }],
  openings: [{ id: 'window', wallId: 'sink', kind: 'window', offsetMm: 900, widthMm: 1100, sillHeightMm: 900 }],
  services: [{ id: 'water', kind: 'water-supply', placement: { type: 'wall', wallId: 'sink', offsetMm: 1200 } }],
  objects: [],
};

const first = generateRoomDocumentCandidates({ document: open, maxCandidates: 20 });
const repeat = generateRoomDocumentCandidates({ document: structuredClone(open), maxCandidates: 20 });
assert.deepEqual(first, repeat, 'candidate generation is deterministic');
assert(first.candidates.length > 0, 'open angled chain yields wall-run suggestions');
assert(first.candidates.every(candidate => candidate.roomRevision === 4));
assert(first.candidates.every(candidate => candidate.unresolved.some(note => note.includes('floor boundary'))));
assert(!first.islandOption && first.islandReason, 'an open chain cannot yield an island');
assert(first.candidates.flatMap(candidate => candidate.items).some(({ wallId, item }) => wallId === 'angled' && Math.abs(item.rotation % 90) > 1), 'angled wall keeps exact rotation');

const uncertain = structuredClone(open);
uncertain.walls[1].interiorSide = 'unknown';
const uncertaintyPool = generateRoomDocumentCandidates({ document: uncertain, maxCandidates: 20 });
assert(uncertaintyPool.rejected.some(candidate => candidate.candidateId === 'wall:angled'));
assert(uncertaintyPool.candidates.every(candidate => !candidate.wallIds.includes('angled')));

const overhead = structuredClone(open);
overhead.objects.push({ id: 'upper', layer: 'existing', kind: 'overhead-cabinet',
  placement: { type: 'wall', wallId: 'sink', offsetMm: 200 },
  widthMm: 600, depthMm: 300, heightMm: 600, elevationMm: 1400, existingAction: 'keep' });
const overheadPool = generateRoomDocumentCandidates({ document: overhead, allowedWallIds: ['sink'] });
assert(overheadPool.candidates.length > 0, 'overhead does not occupy base cabinet height');

const full = structuredClone(overhead);
full.objects.push({ id: 'full-run', layer: 'existing', kind: 'base-cabinet',
  placement: { type: 'wall', wallId: 'sink', offsetMm: 0 },
  widthMm: 3000, depthMm: 600, heightMm: 900, elevationMm: 0, existingAction: 'keep' });
assert.equal(generateRoomDocumentCandidates({ document: full, allowedWallIds: ['sink'] }).candidates.length, 0,
  'kept base cabinets block that wall run');

const bigRoom: RoomDocumentV1 = {
  version: 1, id: 'large-room', revision: 0,
  corners: [
    { id: 'a', xMm: 0, zMm: 0 }, { id: 'b', xMm: 8000, zMm: 0 },
    { id: 'c', xMm: 8000, zMm: 6000 }, { id: 'd', xMm: 0, zMm: 6000 },
  ],
  walls: [
    { id: 'north', startCornerId: 'a', endCornerId: 'b', interiorSide: 'left' },
    { id: 'east', startCornerId: 'b', endCornerId: 'c', interiorSide: 'left' },
    { id: 'south', startCornerId: 'c', endCornerId: 'd', interiorSide: 'left' },
    { id: 'west', startCornerId: 'd', endCornerId: 'a', interiorSide: 'left' },
  ],
  chains: [{ id: 'perimeter', wallIds: ['north', 'east', 'south', 'west'], closed: true }],
  floorBoundary: { confirmed: true, cornerIds: ['a', 'b', 'c', 'd'] },
  openings: [], services: [], objects: [],
};
const largePool = generateRoomDocumentCandidates({ document: bigRoom, allowedWallIds: ['north'] });
assert(largePool.islandOption, 'confirmed large floor supports a checked island');
assert.equal(largePool.islandOption?.items.length, 2);
const catalogSource = readFileSync('src/hooks/useCatalog.ts', 'utf8');
for (const definitionId of new Set([...first.candidates.flatMap(candidate => candidate.items.map(({ item }) => item.definitionId)),
  ...(largePool.islandOption?.items.map(item => item.definitionId) ?? [])])) {
  assert(catalogSource.includes(`id: '${definitionId}'`), `suggested product ${definitionId} resolves to the planner catalog`);
}

const legacyRoom = { width: 8000, depth: 6000, height: 2600, shape: 'Rectangle' as const,
  cutoutWidth: 0, cutoutDepth: 0, openings: [], services: [], roomDocument: bigRoom };
const legacyBrief = { room: legacyRoom, household: {}, priorities: [], appliances: { dishwasher: false }, island: 'no' as const };
const legacyPool = generateCandidatePool({ brief: legacyBrief });
assert.equal(legacyPool.candidates.length, 0, 'cardinal generator never boxes a RoomDocument');
assert(legacyPool.rejected[0].reasons[0].includes('wall-run'));
assert.throws(() => compileSpec({ runs: [], style: { finishId: '', benchtopId: '', handleId: '' }, rationale: '' }, legacyRoom), /wall-ID layout compiler/);

console.log('room document wall candidates: deterministic open, angled, height-aware, island and legacy gates passed');
