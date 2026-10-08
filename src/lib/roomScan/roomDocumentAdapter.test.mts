import assert from 'node:assert/strict';
import { roomCaptureDraftV1Schema } from './contract';
import { captureDraftReadiness, captureDraftRelation, previewCaptureUpdate, resolveRoomCapture, roomDocumentFromCaptureDraft } from './roomDocumentAdapter';
import { parseWebsitePlannerHandoff as parseServerHandoff } from '../../../supabase/functions/_shared/roomScan/contract';

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
const photoObservations = roomCaptureDraftV1Schema.parse({
  ...draft,
  adapterState: {
    captureId: 'capture-123', sourceRevision: 'photo-plan-1', reviewKind: 'photo-wall-plan',
    unresolvedPhotoFeatures: [
      { id: 'door-photo-1', label: 'Entry door', kind: 'door', layer: 'existing',
        placement: 'wall', wallId: 'cooktop-wall', photoIds: ['0032', '0033'], needsCheck: true,
        widthMm: 9999, offsetMm: 100 },
      { id: 'desk-photo-1', label: 'Computer desk', kind: 'desk', layer: 'existing',
        placement: 'wall', wallId: 'unregistered-wall', photoIds: ['0052'], needsCheck: true },
      { id: 'window', label: 'Already placed', kind: 'window', layer: 'existing',
        placement: 'wall', wallId: 'cooktop-wall', photoIds: ['0032'], needsCheck: true },
    ],
  },
});
const photoObservationDocument = roomDocumentFromCaptureDraft(photoObservations, 'photo-observations');
assert.deepEqual(photoObservationDocument.pendingPhotoFeatures, [
  { id: 'door-photo-1', kind: 'door', label: 'Entry door', status: 'needs-placement-and-size',
    wallId: 'cooktop-wall', sourceWallId: 'cooktop-wall', placementHint: 'wall',
    evidenceIds: ['photo:0032', 'photo:0033'] },
  { id: 'desk-photo-1', kind: 'desk', label: 'Computer desk', status: 'needs-placement-and-size',
    sourceWallId: 'unregistered-wall', placementHint: 'wall', evidenceIds: ['photo:0052'] },
]);
assert.equal(photoObservationDocument.openings.length, 1, 'unresolved door is not a physical opening');
assert.equal(photoObservationDocument.objects.length, 1, 'unresolved desk is not a physical object');
assert.deepEqual(JSON.parse(JSON.stringify(photoObservationDocument)).pendingPhotoFeatures,
  photoObservationDocument.pendingPhotoFeatures, 'photo observations survive room JSON persistence');
const incomingObservations = structuredClone(photoObservationDocument);
incomingObservations.capture!.sourceRevision = 'photo-plan-2';
incomingObservations.pendingPhotoFeatures!.push({ id: 'island-photo-1', kind: 'island', label: 'Island bench',
  status: 'needs-placement-and-size', placementHint: 'floor', evidenceIds: ['photo:0056'] });
incomingObservations.pendingPhotoFeatures!.push({ id: 'new-wall-window', kind: 'window', label: 'Other window',
  status: 'needs-placement-and-size', wallId: 'new-wall', sourceWallId: 'new-wall',
  placementHint: 'wall', evidenceIds: ['photo:0060'] });
const observationUpdate = previewCaptureUpdate(photoObservationDocument, incomingObservations);
assert.equal(observationUpdate.addedPhotoObservations, 2);
assert.equal(observationUpdate.document.pendingPhotoFeatures?.length, 4);
assert.equal(observationUpdate.document.pendingPhotoFeatures?.at(-1)?.wallId, undefined,
  'an unresolved feature does not attach to a wall absent from the saved room');
assert.equal(observationUpdate.document.pendingPhotoFeatures?.at(-1)?.sourceWallId, 'new-wall');
assert.equal(observationUpdate.document.capture?.sourceRevision, 'photo-plan-2');
assert.equal(observationUpdate.document.objects.length, 1, 'new photo observation does not become cabinetry');
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
incoming.walls.push({ id: 'angled-wall', startCornerId: 'b', endCornerId: 'd', interiorSide: 'unknown' });
incoming.objects.push({ id: 'new-fridge', layer: 'existing', kind: 'fridge',
  placement: { type: 'wall', wallId: 'angled-wall', offsetMm: 300 }, widthMm: 900, depthMm: 650 });
const update = previewCaptureUpdate(reviewed, incoming);
assert.deepEqual(update.added, { walls: 0, openings: 0, services: 0, objects: 0 });
assert.deepEqual(update.deferred, { walls: 1, openings: 0, services: 0, objects: 1 });
assert.equal(update.cornerConflicts, 1);
assert.equal(update.document.walls[0].lengthEvidence?.valueMm, 3264);
assert.equal(update.document.corners[1].xMm, 3264);
assert.equal(update.document.floorBoundary?.confirmed, true);
assert.equal(update.document.chains.length, reviewed.chains.length);
assert.equal(update.document.walls.some(wall => wall.id === 'angled-wall'), false);
assert.equal(update.document.objects.some(object => object.id === 'new-fridge'), false);
assert.equal(update.document.capture?.sourceRevision, 'etag-1', 'a deferred update remains available for review');
const otherFrame = structuredClone(incoming);
otherFrame.corners = [
  { id: 'new-a', xMm: 10000, zMm: 4000 }, { id: 'new-b', xMm: 12000, zMm: 4000 },
];
otherFrame.walls = [{ id: 'unregistered-wall', startCornerId: 'new-a', endCornerId: 'new-b' }];
otherFrame.objects.push({ id: 'unregistered-island', layer: 'existing', kind: 'island',
  placement: { type: 'free', xMm: 11000, zMm: 4300, rotationDeg: 0 }, widthMm: 900, depthMm: 600 });
const held = previewCaptureUpdate(reviewed, otherFrame);
assert.equal(held.cornerConflicts, 0);
assert.equal(held.deferred.walls, 1);
assert.equal(held.deferred.objects, 2);
assert.equal(held.document.corners.some(corner => corner.id === 'new-a'), false);
assert.equal(held.document.walls.some(wall => wall.id === 'unregistered-wall'), false);
assert.equal(held.document.objects.some(object => object.id === 'unregistered-island'), false);
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

// The server parser used by create-planner-handoff must retain a provisional
// AR-only chain without promoting phone coordinates to site measurements.
const arOnlyDraft = roomCaptureDraftV1Schema.parse({
  schemaVersion: 1, state: 'draft', source: 'webxr', capturedAt: '2026-10-07T00:00:00.000Z',
  coordinateFrame: frame, photos: [],
  adapterState: { captureId: 'ar-capture', sourceRevision: 'ar-review-1' },
  partialGeometry: {
    wallChains: [{ id: 'ar-open-run', closed: false, provenance: 'inferred',
      cornersMm: [
        { id: 'ar-c1', x: 3500, z: 0 }, { id: 'ar-c2', x: 5200, z: 1400 },
        { id: 'ar-c3', x: 4800, z: 2100 }, { id: 'ar-c4', x: 0, z: 3800 },
      ], wallIds: ['ar-w1', 'ar-w2', 'ar-w3'] }],
    wallMeasurements: [],
  },
});
const arHandoff = parseServerHandoff({ handoffSchemaVersion: 1, source: 'scanner',
  roomType: 'kitchen', styleTags: [], materials: {}, roomCaptureDraft: arOnlyDraft });
assert.equal(arHandoff.ok, true, 'reason' in arHandoff ? arHandoff.reason : '');
if (!arHandoff.ok) throw new Error('AR-only handoff was rejected');
const arDocument = roomDocumentFromCaptureDraft(arHandoff.handoff.roomCaptureDraft!, 'ar-doc');
assert.deepEqual(captureDraftReadiness(arHandoff.handoff.roomCaptureDraft!),
  { wallChains: 1, walls: 3, openChains: 1, canDesignWholeRoom: false });
assert.equal(arDocument.chains[0].closed, false);
assert.equal(arDocument.floorBoundary, undefined);
assert.deepEqual(arDocument.walls.map(wall => wall.lengthEvidence?.source), ['inferred', 'inferred', 'inferred']);
assert.deepEqual(arDocument.walls.map(wall => wall.geometryEvidence?.source), ['inferred', 'inferred', 'inferred']);
assert.equal(arDocument.walls.every(wall => wall.lengthEvidence?.source !== 'measured'), true);

// A photo-first whole-room proposal may close geometrically without asserting
// a confirmed floor or promoting image/AR estimates to site measurements.
const provisionalOutline = roomCaptureDraftV1Schema.parse({
  schemaVersion: 1, state: 'draft', source: 'photo-review', capturedAt: '2026-10-07T00:00:00.000Z',
  coordinateFrame: frame, photos: [],
  partialGeometry: {
    wallChains: [{ id: 'provisional-outline', closed: true, provenance: 'inferred',
      cornersMm: [
        { id: 'p1', x: 0, z: 0 }, { id: 'p2', x: 3000, z: 0 },
        { id: 'p3', x: 3000, z: 2400 }, { id: 'p4', x: 0, z: 2400 },
      ], wallIds: ['site-wall', 'photo-wall', 'inferred-wall', 'unchecked-wall'] }],
    wallMeasurements: [{ wallId: 'site-wall', millimetres: 3000 }],
    wallEvidence: [
      { wallId: 'site-wall', source: 'inferred', uncertaintyMm: 250, evidenceIds: ['photo-1'],
        reason: 'Wall turn inferred from the photos despite its checked length.' },
      { wallId: 'photo-wall', source: 'observed', uncertaintyMm: 120, evidenceIds: ['photo-2'] },
      { wallId: 'inferred-wall', source: 'inferred', uncertaintyMm: 350, reason: 'Corner hidden by a cabinet.' },
      { wallId: 'unchecked-wall', source: 'measured', evidenceIds: ['ar-3'] },
    ],
  },
});
const provisionalHandoff = parseServerHandoff({ handoffSchemaVersion: 1, source: 'scanner',
  roomType: 'kitchen', styleTags: [], materials: {}, roomCaptureDraft: provisionalOutline });
assert.equal(provisionalHandoff.ok, true, 'reason' in provisionalHandoff ? provisionalHandoff.reason : '');
if (!provisionalHandoff.ok) throw new Error('Provisional outline was rejected');
const provisionalDocument = roomDocumentFromCaptureDraft(provisionalHandoff.handoff.roomCaptureDraft!, 'provisional-doc');
assert.equal(provisionalDocument.chains[0].closed, true);
assert.equal(provisionalDocument.floorBoundary, undefined);
assert.deepEqual(provisionalDocument.walls.map(wall => wall.lengthEvidence?.source),
  ['measured', 'observed', 'inferred', 'unknown']);
assert.deepEqual(provisionalDocument.walls.map(wall => wall.geometryEvidence?.source),
  ['inferred', 'observed', 'inferred', 'measured']);
assert.equal(provisionalDocument.walls[0].geometryEvidence?.uncertaintyMm, 250);
assert.equal(provisionalDocument.walls[0].lengthEvidence?.source, 'measured');
assert.deepEqual(provisionalDocument.walls[1].geometryEvidence?.evidenceIds, ['photo-2']);
assert.equal(provisionalDocument.walls[2].geometryEvidence?.reason, 'Corner hidden by a cabinet.');
assert.deepEqual(captureDraftReadiness(provisionalOutline),
  { wallChains: 1, walls: 4, openChains: 0, canDesignWholeRoom: false });
// A linked room created before geometry evidence was stored can accept the new
// interpretation without losing a checked length, user fitting or floor edit.
const legacyLinkedRoom = structuredClone(provisionalDocument);
legacyLinkedRoom.capture!.sourceRevision = 'old-transform';
for (const wall of legacyLinkedRoom.walls) delete wall.geometryEvidence;
legacyLinkedRoom.walls[0].lengthEvidence = { valueMm: 3050, source: 'measured' };
legacyLinkedRoom.objects.push({ id: 'user-cabinet', layer: 'proposed', kind: 'cabinet-run',
  placement: { type: 'wall', wallId: 'site-wall', offsetMm: 400 }, widthMm: 600, depthMm: 600 });
legacyLinkedRoom.floorBoundary = { cornerIds: ['p1', 'p2', 'p3', 'p4'], confirmed: true };
const reinterpretedScan = structuredClone(provisionalDocument);
reinterpretedScan.capture!.sourceRevision = 'new-transform';
const migrated = previewCaptureUpdate(legacyLinkedRoom, reinterpretedScan);
assert.equal(migrated.updatedWallEvidence, 4);
assert.equal(migrated.document.walls[0].geometryEvidence?.source, 'inferred');
assert.equal(migrated.document.walls[0].lengthEvidence?.source, 'measured');
assert.equal(migrated.document.walls[0].lengthEvidence?.valueMm, 3050);
assert.equal(migrated.document.objects[0].id, 'user-cabinet');
assert.equal(migrated.document.floorBoundary?.confirmed, true);
assert.equal(migrated.document.capture?.sourceRevision, 'new-transform');
const movedLinkedRoom = structuredClone(legacyLinkedRoom);
movedLinkedRoom.corners[0].xMm = 200;
const movedPreview = previewCaptureUpdate(movedLinkedRoom, reinterpretedScan);
assert.equal(movedPreview.updatedWallEvidence, 2);
assert.equal(movedPreview.document.walls[0].geometryEvidence, undefined);
assert.equal(movedPreview.document.walls[3].geometryEvidence, undefined);
assert.equal(movedPreview.cornerConflicts, 1);
const duplicateEvidence = structuredClone(provisionalOutline);
duplicateEvidence.partialGeometry!.wallEvidence!.push(duplicateEvidence.partialGeometry!.wallEvidence![0]);
assert.equal(roomCaptureDraftV1Schema.safeParse(duplicateEvidence).success, false);
const orphanEvidence = structuredClone(provisionalOutline);
orphanEvidence.partialGeometry!.wallEvidence![1].wallId = 'missing-wall';
const invalidEvidence = roomCaptureDraftV1Schema.safeParse(orphanEvidence);
assert.equal(invalidEvidence.success, false);
if (!invalidEvidence.success) assert.deepEqual(invalidEvidence.error.issues[0].path,
  ['partialGeometry', 'wallEvidence', 1, 'wallId']);
const orphanMeasurement = structuredClone(provisionalOutline);
orphanMeasurement.partialGeometry!.wallMeasurements![0].wallId = 'missing-wall';
const invalidMeasurement = roomCaptureDraftV1Schema.safeParse(orphanMeasurement);
assert.equal(invalidMeasurement.success, false);
if (!invalidMeasurement.success) assert.deepEqual(invalidMeasurement.error.issues[0].path,
  ['partialGeometry', 'wallMeasurements', 0, 'wallId']);

const legacyMeasuredClaim = structuredClone(arOnlyDraft);
legacyMeasuredClaim.partialGeometry!.wallChains![0].provenance = 'measured';
assert.deepEqual(roomDocumentFromCaptureDraft(legacyMeasuredClaim, 'legacy-measured').walls
  .map(wall => wall.lengthEvidence?.source), ['unknown', 'unknown', 'unknown']);

const conflicting = structuredClone(draft);
conflicting.partialGeometry!.wallChains!.push({
  id: 'conflict', closed: false, cornersMm: [{ id: 'a', x: 5, z: 0 }, { id: 'd', x: 5, z: 1000 }], wallIds: ['extra'], provenance: 'unknown',
});
const retained = resolveRoomCapture({ roomCaptureDraft: conflicting }, 'doc-2');
assert.equal(retained.kind, 'draft');
if (retained.kind !== 'draft') throw new Error('conflicting draft was ignored');
assert.equal(retained.document, undefined);
assert.equal(retained.draft, conflicting);

// A reduced, synthetic version of the reviewed three-wall angled kitchen.
// The fourth 200 mm return is real, but does not close or define a floor.
const angledKitchen = roomCaptureDraftV1Schema.parse({
  schemaVersion: 1, state: 'draft', source: 'photo-review', capturedAt: '2026-10-06T00:00:00.000Z',
  photos: [], coordinateFrame: frame,
  adapterState: { captureId: 'synthetic-angled', sourceRevision: 'review-1' },
  partialGeometry: {
    wallChains: [{ id: 'reviewed-open-run', closed: false, provenance: 'inferred',
      cornersMm: [
        { id: 'c1', x: 0, z: 1131 }, { id: 'c2', x: 1131, z: 0 },
        { id: 'c3', x: 2776, z: 0 }, { id: 'c4', x: 2776, z: 1585 },
        { id: 'c5', x: 2917, z: 1726 },
      ], wallIds: ['angled', 'cooktop', 'sink', 'short-return'] }],
    wallMeasurements: [
      { wallId: 'angled', millimetres: 1600 }, { wallId: 'cooktop', millimetres: 1645 },
      { wallId: 'sink', millimetres: 1585 }, { wallId: 'short-return', millimetres: 200 },
    ],
    featureCandidates: [
      { id: 'fridge', kind: 'fridge', placement: 'wall', wallId: 'angled', offsetMm: 80,
        widthMm: 850, depthMm: 690, heightMm: 1850, elevationMm: 0,
        placementProvenance: { source: 'user-correction', note: 'User moved fridge to angled wall.',
          previousWallId: 'cooktop' } },
      { id: 'window', kind: 'window', placement: 'wall', wallId: 'sink', offsetMm: 250,
        widthMm: 1000, depthMm: 120, heightMm: 900, elevationMm: 900 },
      { id: 'overheads', kind: 'overhead-cabinet', placement: 'wall', wallId: 'sink', offsetMm: 150,
        widthMm: 1100, depthMm: 340, heightMm: 700, elevationMm: 1450 },
      { id: 'kicks', kind: 'toe-kick', placement: 'wall', wallId: 'sink', offsetMm: 100,
        widthMm: 1200, depthMm: 65, heightMm: 135, elevationMm: 0 },
    ],
  },
});
const angledDocument = roomDocumentFromCaptureDraft(angledKitchen, 'angled-doc');
assert.deepEqual(angledDocument.walls.map(wall => [wall.id, wall.lengthEvidence?.valueMm,
  wall.lengthEvidence?.source]), [
  ['angled', 1600, 'measured'], ['cooktop', 1645, 'measured'],
  ['sink', 1585, 'measured'], ['short-return', 200, 'measured'],
]);
assert.equal(angledDocument.chains[0].closed, false);
assert.equal(angledDocument.floorBoundary, undefined);
assert.equal(angledDocument.objects.find(object => object.id === 'fridge')?.placementProvenance?.previousWallId, 'cooktop');
assert.equal(angledDocument.objects.find(object => object.id === 'fridge')?.placement.type, 'wall');
assert.equal(angledDocument.openings.find(opening => opening.id === 'window')?.wallId, 'sink');
assert.deepEqual(angledDocument.objects.map(object => object.kind), ['fridge', 'overhead-cabinet', 'toe-kick']);

const correctedHandoff = parseServerHandoff({ handoffSchemaVersion: 1, source: 'scanner',
  roomType: 'kitchen', styleTags: [], materials: {}, roomCaptureDraft: angledKitchen });
assert.equal(correctedHandoff.ok, true, 'reason' in correctedHandoff ? correctedHandoff.reason : '');
if (!correctedHandoff.ok) throw new Error('corrected feature handoff was rejected');
assert.equal(correctedHandoff.handoff.roomCaptureDraft?.partialGeometry?.featureCandidates?.[0]
  .placementProvenance?.previousWallId, 'cooktop');

// Which side faces into the room comes from the drawn chain: a closed outline
// by its winding, an open run only when every turn bends the same way.
const sides = (closed: boolean, corners: Array<[number, number]>) => {
  const ids = corners.map((_, index) => `k${index}`);
  const wallIds = (closed ? ids : ids.slice(1)).map((_, index) => `w${index}`);
  const doc = roomDocumentFromCaptureDraft(roomCaptureDraftV1Schema.parse({
    schemaVersion: 1, state: 'draft', source: 'webxr', capturedAt: '2026-10-08T00:00:00.000Z', photos: [],
    coordinateFrame: frame, adapterState: { captureId: 'sides', reviewKind: 'photo-draft', access: 'scanner-owner-only' },
    partialGeometry: { wallChains: [{ id: 'chain', closed, provenance: 'inferred',
      cornersMm: corners.map(([x, z], index) => ({ id: ids[index], x, z })), wallIds }] },
  }), 'sides');
  return doc.walls.map(wall => wall.interiorSide);
};
const square: Array<[number, number]> = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]];
assert.deepEqual(sides(true, square), ['left', 'left', 'left', 'left'], 'a counter-clockwise outline faces left of each wall');
assert.deepEqual(sides(true, [...square].reverse()), ['right', 'right', 'right', 'right'], 'the reverse winding faces right');
assert.deepEqual(sides(false, [[0, 0], [3000, 0], [3000, 2000]]), ['left', 'left'], 'an L scanned from inside faces its turn');
assert.deepEqual(sides(false, [[0, 0], [3000, 0], [3000, 2000], [3000, 2600]]), ['left', 'left', 'left'],
  'a straight continuation does not change the side');
assert.deepEqual(sides(false, [[0, 0], [3000, 0], [3000, 500], [4000, 500]]), ['unknown', 'unknown', 'unknown'],
  'a run that turns both ways is left for the person to decide');
assert.deepEqual(sides(false, [[0, 0], [3000, 0]]), ['unknown'], 'one straight wall cannot tell which side is the room');

// A room saved before inside faces were set gets them from a newer scan of
// the same walls; a side the person already chose is never overwritten.
const squareDoc = (sourceRevision: string, wallMm?: number) => roomDocumentFromCaptureDraft(roomCaptureDraftV1Schema.parse({
  schemaVersion: 1, state: 'draft', source: 'photo-review', capturedAt: '2026-10-08T00:00:00.000Z', photos: [],
  coordinateFrame: frame, adapterState: { captureId: 'older-room', sourceRevision, reviewKind: 'photo-draft', access: 'scanner-owner-only' },
  partialGeometry: { wallChains: [{ id: 'room', closed: true, provenance: 'inferred',
    cornersMm: square.map(([x, z], index) => ({ id: `q${index}`, x, z })), wallIds: ['q-a', 'q-b', 'q-c', 'q-d'] }],
    wallMeasurements: [{ wallId: 'q-a', millimetres: wallMm ?? 4000 }] },
}), 'older-room');
const olderRoom = squareDoc('rev-1');
olderRoom.walls = olderRoom.walls.map((wall, index) => ({ ...wall, interiorSide: index === 1 ? 'right' as const : 'unknown' as const }));
const sideUpdate = previewCaptureUpdate(olderRoom, squareDoc('rev-2'));
assert.deepEqual(sideUpdate.document.walls.map(wall => wall.interiorSide), ['left', 'right', 'left', 'left'],
  'unknown sides are filled from the scan; the side the person chose stays');
assert.ok(sideUpdate.updatedWallEvidence >= 3, 'filling sides counts as something the update adds');
const remeasured = previewCaptureUpdate(squareDoc('rev-1'), squareDoc('rev-3', 4200));
assert.deepEqual(remeasured.lengthDifferences, [{ wallId: 'q-a', currentMm: 4000, scanMm: 4200, scanSource: 'measured' }],
  'a re-measured wall is reported with its measured source');

console.log('room document handoff smoke passed');
