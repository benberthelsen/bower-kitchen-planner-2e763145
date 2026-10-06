import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { RoomDocumentV1 } from '../src/lib/roomDocument/types';
import { generateRoomDocumentCandidates } from '../src/lib/layout/roomDocumentCandidates';
import { applyRoomDocumentProposal } from '../src/lib/homeowner/roomDocumentProposal';
import { applyRoomEdit } from '../src/lib/roomDocument/edit';
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
const chosen = first.candidates[0];
const chosenStyle = { finishId: 'do-designer-white', benchtopId: 'bt-white', handleId: 'handle-bar-ss' };
const applied = applyRoomDocumentProposal(open, chosen, chosenStyle);
assert(applied.ok, 'a current rule-checked open-wall idea can be applied');
if (applied.ok) {
  assert.equal(applied.document.revision, open.revision + 1);
  assert.deepEqual(applied.document.chains, open.chains, 'the observed open chain is unchanged');
  assert.equal(applied.document.floorBoundary, undefined, 'an idea never invents a floor boundary');
  assert.equal(applied.count, chosen.items.length);
  assert(applied.document.objects.every(object => object.layer === 'proposed' && object.placement.type === 'wall'
    && !!object.catalogueId && object.sizeLock === 'catalogue'));
  const proposed = applied.document.objects[0];
  assert.deepEqual(proposed.placement, { type: 'wall', wallId: chosen.items[0].wallId, offsetMm: chosen.items[0].offsetMm });
  const moved = applyRoomEdit(applied.document, { type: 'upsert-object', object: {
    ...proposed, placement: { ...proposed.placement, offsetMm: proposed.placement.offsetMm + 10 },
  } });
  assert(moved.applied, 'a proposed cabinet remains editable through the room document editor');
  assert(!applyRoomDocumentProposal(applied.document, chosen, chosenStyle).ok,
    'a stale suggestion cannot be applied after the room revision changes');
}
assert.equal(open.objects.length, 0, 'applying an idea does not mutate the source document');
const altered = { ...chosen, items: chosen.items.map(entry => ({ ...entry, offsetMm: entry.offsetMm + 100 })) };
const checked = applyRoomDocumentProposal(open, altered, chosenStyle);
assert(checked.ok && checked.document.objects[0].placement.type === 'wall'
  && checked.document.objects[0].placement.offsetMm === chosen.items[0].offsetMm,
  'application recomputes the rule-checked candidate rather than trusting displayed offsets');
const shortWall = structuredClone(open);
shortWall.corners.find(corner => corner.id === 'c3')!.xMm = 3200;
shortWall.corners.find(corner => corner.id === 'c3')!.zMm = 0;
shortWall.corners.find(corner => corner.id === 'c4')!.xMm = 3200;
shortWall.corners.find(corner => corner.id === 'c4')!.zMm = 3200;
const shortPool = generateRoomDocumentCandidates({ document: shortWall, style: chosenStyle });
assert(shortPool.candidates.length > 0, 'a 200 mm segment does not block design on longer captured walls');
assert(shortPool.candidates.every(candidate => !candidate.wallIds.includes('angled')),
  'a 200 mm segment is retained but cannot receive a cabinet run');
const shortApplied = applyRoomDocumentProposal(shortWall, shortPool.candidates[0], chosenStyle);
assert(shortApplied.ok && shortApplied.document.chains[0].wallIds.includes('angled'),
  'applying a viable wall idea retains the short measured segment');

const uncertain = structuredClone(open);
uncertain.walls[1].interiorSide = 'unknown';
const uncertaintyPool = generateRoomDocumentCandidates({ document: uncertain, maxCandidates: 20 });
assert(uncertaintyPool.rejected.some(candidate => candidate.candidateId === 'wall:angled'));
assert(uncertaintyPool.candidates.every(candidate => !candidate.wallIds.includes('angled')));
const noInterior = structuredClone(open);
noInterior.walls.forEach(wall => { wall.interiorSide = 'unknown'; });
assert(!applyRoomDocumentProposal(noInterior, chosen, chosenStyle).ok,
  'unknown room-facing sides cannot receive automatic cabinets');

const overhead = structuredClone(open);
overhead.objects.push({ id: 'upper', layer: 'existing', kind: 'overhead-cabinet',
  placement: { type: 'wall', wallId: 'sink', offsetMm: 200 },
  widthMm: 600, depthMm: 300, heightMm: 600, elevationMm: 1400, existingAction: 'keep' });
const overheadPool = generateRoomDocumentCandidates({ document: overhead, allowedWallIds: ['sink'] });
assert(overheadPool.candidates.length > 0, 'overhead does not occupy base cabinet height');
const overheadIdea = generateRoomDocumentCandidates({ document: overhead, style: chosenStyle, maxCandidates: 3 }).candidates[0];
assert(overheadIdea, 'a room with an existing overhead item still has a cabinet idea');
const withExisting = applyRoomDocumentProposal(overhead, overheadIdea, chosenStyle);
assert(withExisting.ok && withExisting.document.objects[0].id === 'upper',
  'applying a cabinet idea preserves an existing photographed item');

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
