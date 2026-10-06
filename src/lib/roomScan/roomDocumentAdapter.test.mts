import assert from 'node:assert/strict';
import { roomCaptureDraftV1Schema } from './contract';
import { captureDraftReadiness, captureDraftRelation, previewCaptureUpdate, resolveRoomCapture, roomDocumentFromCaptureDraft } from './roomDocumentAdapter';

const frame = {
  assignment: 'source-orientation', sourcePlanAxes: 'x-z', sourceUnits: 'millimetres',
  sourceToCanonicalMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], snappedQuarterTurnDegrees: 0,
  originDescription: 'north-west-corner-in-canonical-plan',
};
const draft = roomCaptureDraftV1Schema.parse({
  schemaVersion: 1, state: 'draft', source: 'photo-review', capturedAt: '2026-10-06T00:00:00.000Z',
  photos: [], coordinateFrame: frame,
  adapterState: { captureId: 'capture-123', sourceRevision: 'etag-1', reviewKind: 'wall-run-draft', access: 'scanner-owner-only' },
  partialGeometry: {
    wallChains: [{ id: 'open-run', closed: false, provenance: 'inferred',
      cornersMm: [{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 3000, z: 0 }, { id: 'c', x: 3000, z: 2000 }],
      wallIds: ['cooktop-wall', 'sink-wall'] }],
    wallMeasurements: [{ wallId: 'cooktop-wall', millimetres: 3000 }],
    featureCandidates: [
      { id: 'window', kind: 'window', placement: 'wall', wallId: 'cooktop-wall', offsetMm: 400, widthMm: 900, depthMm: 100, heightMm: 1200, elevationMm: 900 },
      { id: 'bench', kind: 'cabinet-run', placement: 'wall', wallId: 'sink-wall', offsetMm: 100, widthMm: 1500, depthMm: 600, heightMm: 900, elevationMm: 450 },
    ],
  },
});

const resolved = resolveRoomCapture({ roomCaptureDraft: draft }, 'doc-1');
assert.equal(resolved.kind, 'draft');
if (resolved.kind !== 'draft') throw new Error('valid draft was ignored');
assert.equal(resolved.document?.capture?.captureId, 'capture-123');
assert.equal(resolved.document?.capture?.sourceRevision, 'etag-1');
assert.equal(resolved.document?.chains[0].closed, false);
assert.equal(resolved.document?.walls.length, 2);
assert.equal(resolved.document?.floorBoundary, undefined);
assert.equal(resolved.document?.walls[0].lengthEvidence?.source, 'measured');
assert.equal(resolved.document?.walls[1].lengthEvidence?.source, 'inferred');
assert.equal(resolved.document?.openings[0].wallId, 'cooktop-wall');
assert.equal(resolved.document?.objects[0].kind, 'cabinet-run');
assert.equal(resolved.document?.objects[0].elevationMm, 450);
assert.deepEqual(captureDraftReadiness(draft), { wallChains: 1, walls: 2, openChains: 1, canDesignWholeRoom: false });
assert.equal(captureDraftRelation(draft,draft),'same-revision');
const laterReview=structuredClone(draft);
laterReview.adapterState={captureId:'capture-123',sourceRevision:'etag-2'};
assert.equal(captureDraftRelation(draft,laterReview),'changed-revision');
assert.equal(captureDraftRelation(undefined,laterReview,'capture-123'),'changed-revision');
assert.equal(captureDraftRelation(draft,{...laterReview,adapterState:{captureId:'different',sourceRevision:'etag-2'}}),'new-capture');

const reviewed = structuredClone(resolved.document!);
reviewed.corners[1].xMm = 3264;
reviewed.walls[0].lengthEvidence = { valueMm: 3264, source: 'measured' };
reviewed.floorBoundary = { cornerIds: ['a', 'b', 'c'], confirmed: true };
const incoming = structuredClone(resolved.document!);
incoming.capture!.sourceRevision = 'etag-2';
incoming.corners.push({ id: 'd', xMm: 4200, zMm: 2000 });
incoming.walls.push({ id: 'angled-wall', startCornerId: 'c', endCornerId: 'd', interiorSide: 'unknown' });
incoming.objects.push({ id: 'new-fridge', layer: 'existing', kind: 'fridge',
  placement: { type: 'wall', wallId: 'angled-wall', offsetMm: 300 }, widthMm: 900, depthMm: 650 });
const update = previewCaptureUpdate(reviewed, incoming);
assert.deepEqual(update.added, { walls: 1, openings: 0, services: 0, objects: 1 });
assert.equal(update.cornerConflicts, 1);
assert.equal(update.document.walls[0].lengthEvidence?.valueMm, 3264);
assert.equal(update.document.corners[1].xMm, 3264);
assert.equal(update.document.floorBoundary?.confirmed, true);
assert.equal(update.document.chains.at(-1)?.closed, false);
assert.equal(update.document.objects.find(object => object.id === 'new-fridge')?.placement.type, 'wall');
assert.equal(update.document.capture?.sourceRevision, 'etag-2');
assert.throws(() => previewCaptureUpdate(reviewed,
  { ...incoming, capture: { captureId: 'another-room' } }), /different room/);

const legacy = roomCaptureDraftV1Schema.parse({
  schemaVersion: 1, state: 'draft', source: 'webxr', capturedAt: '2026-09-01T00:00:00.000Z',
  coordinateFrame: frame, photos: [], partialGeometry: { cornersMm: [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 1000 }] },
});
const oldDocument = roomDocumentFromCaptureDraft(legacy, 'old-doc');
assert.equal(oldDocument.chains[0].closed, false);
assert.equal(oldDocument.walls.length, 2);
assert.equal(oldDocument.floorBoundary, undefined);

const conflicting = structuredClone(draft);
conflicting.partialGeometry!.wallChains!.push({
  id: 'conflict', closed: false, cornersMm: [{ id: 'a', x: 5, z: 0 }, { id: 'd', x: 5, z: 1000 }], wallIds: ['extra'], provenance: 'unknown',
});
const retained = resolveRoomCapture({ roomCaptureDraft: conflicting }, 'doc-2');
assert.equal(retained.kind, 'draft');
if (retained.kind !== 'draft') throw new Error('conflicting draft was ignored');
assert.equal(retained.document, undefined);
assert.equal(retained.draft, conflicting);

console.log('room document handoff smoke passed');
