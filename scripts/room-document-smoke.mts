import { withRunInteriorSide } from '../src/components/roomDocument/interiorSideRun';
import assert from 'node:assert/strict';
import type { TradeRoom } from '../src/types/trade';
import { existingObjectVisual } from '../src/components/3d/roomDocumentVisuals';
import { applyEditedCabinetProjection, syncCabinetProjectionMembership } from '../src/lib/trade/roomDocumentCabinetEdit';
import {
  applyRoomEdit, createRoomDocument, footprintCorners, footprintInsideConfirmedFloor,
  footprintInsidePolygon, footprintsIntersect, migrateTradeRoom, objectPose,
  reconcileTradeRoomCabinets, cabinetFootprintDepthMm, mergeCabinetWrite,
  RoomRevisionConflictError, mergeRoomWrite, saveRoomSetupEdit, selectRoomsForWrite,
  undoRoomEdit, validateRoomDocument, wallGeometry,
} from '../src/lib/roomDocument';

function edit<T extends Parameters<typeof applyRoomEdit>[1]>(document: ReturnType<typeof createRoomDocument>, change: T) {
  const result = applyRoomEdit(document, change);
  assert.equal(result.applied, true, JSON.stringify(result.issues));
  return result.document;
}

// A partial scan is usable as wall segments without inventing a floor.
let open = createRoomDocument('hibiscus', 'Three kitchen walls');
open = edit(open, { type: 'add-wall', lengthMm: 1600, angleDeg: 0, wallId: 'angled', cornerId: 'c2' });
const chainId = open.chains[0].id;
open = edit(open, { type: 'add-wall', chainId, lengthMm: 1645, angleDeg: 45, wallId: 'cooktop', cornerId: 'c3' });
open = edit(open, { type: 'add-wall', chainId, lengthMm: 1585, angleDeg: 135, wallId: 'sink', cornerId: 'c4' });
assert.equal(open.floorBoundary, undefined);
assert.equal(wallGeometry(open, 'cooktop')?.angleDeg, 45);
assert.equal(footprintInsideConfirmedFloor(open, footprintCorners({ xMm: 300, zMm: 300, rotationDeg: 0 }, 200, 200)).status, 'unconfirmed');
open = edit(open, { type: 'upsert-object', object: {
  id: 'fridge', kind: 'appliance', layer: 'existing', existingAction: 'keep',
  placement: { type: 'wall', wallId: 'angled', offsetMm: 200 },
  widthMm: 600, depthMm: 650, heightMm: 1800, sizeLock: 'catalogue', catalogueId: 'real-fridge',
} });
const fridgeBefore = objectPose(open, open.objects[0]);
open = edit(open, { type: 'set-wall-interior-side', wallId: 'angled', side: 'left' });
assert.equal(open.walls.find(wall => wall.id === 'angled')?.interiorSide, 'left');
{
  const run = structuredClone(open);
  run.walls.forEach(wall => { wall.interiorSide = 'unknown'; });
  const chosen = run.walls[0].id;
  const runChain = run.chains.find(chain => chain.wallIds.includes(chosen))!;
  const marked = withRunInteriorSide(run, chosen, 'right').document;
  assert.ok(runChain.wallIds.every(id => marked.walls.find(wall => wall.id === id)?.interiorSide === 'right'),
    'one choice sets the inside face for the whole wall run');
  const corrected = withRunInteriorSide(marked, runChain.wallIds.at(-1)!, 'left').document;
  assert.ok(runChain.wallIds.every(id => corrected.walls.find(wall => wall.id === id)?.interiorSide === 'left'),
    'correcting the side corrects the whole run, so a run never ends up with mixed sides');
}
const lengthResult = applyRoomEdit(open, { type: 'set-wall-length', wallId: 'angled', lengthMm: 1900 });
assert.equal(lengthResult.applied, true);
assert.equal(lengthResult.document.objects[0].widthMm, 600);
assert.deepEqual(objectPose(lengthResult.document, lengthResult.document.objects[0]), fridgeBefore);
assert.equal(wallGeometry(lengthResult.document, 'cooktop')?.lengthMm, 1645);
assert.equal(undoRoomEdit(lengthResult).revision, lengthResult.document.revision + 1);

// A site-measured length can coexist with an observed outline. Moving any
// surveyed corner makes the previous outline evidence stale on both sides.
const evidencedOpen = structuredClone(open);
for (const wall of evidencedOpen.walls) wall.geometryEvidence = { source: 'observed', evidenceIds: ['scan-photo'] };
const checkedLength = edit(evidencedOpen, { type: 'set-wall-length', wallId: 'angled',
  lengthMm: 1600, measurement: { valueMm: 1600, source: 'measured' } });
assert.equal(checkedLength.walls[0].lengthEvidence?.source, 'measured');
assert.equal(checkedLength.walls[0].geometryEvidence?.source, 'observed');
const movedOutline = edit(evidencedOpen, { type: 'set-wall-length', wallId: 'angled', lengthMm: 1900 });
assert.deepEqual(movedOutline.walls.map(wall => wall.geometryEvidence?.source), ['unknown', 'unknown', 'unknown']);
assert.equal(movedOutline.walls[1].geometryEvidence?.evidenceIds, undefined);

// The Eight Hibiscus fixture preview uses the recorded angled-wall pose and
// dimensions. Unknown cabinet identity/height never becomes a made-up product.
const visualRoom = structuredClone(open);
visualRoom.objects = [
  { id: 'angled-fridge', layer: 'existing', kind: 'fridge',
    placement: { type: 'wall', wallId: 'cooktop', offsetMm: 120 },
    widthMm: 850, depthMm: 690, heightMm: 1850 },
  { id: 'overhead', layer: 'existing', kind: 'overhead-cabinet',
    placement: { type: 'wall', wallId: 'sink', offsetMm: 50 },
    widthMm: 1250, depthMm: 315, heightMm: 670, elevationMm: 1400 },
  { id: 'catalogued-overhead', layer: 'existing', kind: 'overhead-cabinet', catalogueId: 'wall_2_door',
    placement: { type: 'wall', wallId: 'sink', offsetMm: 75 },
    widthMm: 500, depthMm: 330, heightMm: 680, elevationMm: 1350 },
  { id: 'zero-mount-overhead', layer: 'existing', kind: 'overhead-cabinet', catalogueId: 'wall_2_door',
    placement: { type: 'wall', wallId: 'sink', offsetMm: 75 },
    widthMm: 500, depthMm: 330, heightMm: 680, elevationMm: 0 },
  { id: 'kick', layer: 'existing', kind: 'toe-kick',
    placement: { type: 'wall', wallId: 'sink', offsetMm: 50 },
    widthMm: 1250, depthMm: 65, heightMm: 135, elevationMm: 0 },
  { id: 'unknown-height', layer: 'existing', kind: 'fridge',
    placement: { type: 'wall', wallId: 'cooktop', offsetMm: 120 },
    widthMm: 850, depthMm: 690 },
];
const visualSource = structuredClone(visualRoom);
const visual = visualRoom.objects.map(object => existingObjectVisual(visualRoom, object));
assert.deepEqual(visual.map(entry => entry?.kind),
  ['fridge', 'overhead-shell', 'catalogued-overhead', 'overhead-shell', 'toe-kick', 'footprint-only']);
assert.equal(visual[0]?.pose.rotationDeg, wallGeometry(visualRoom, 'cooktop')?.rotationDeg);
assert.deepEqual(visual.map(entry => entry && [entry.widthMm, entry.depthMm, entry.heightMm, entry.elevationMm]), [
  [850, 690, 1850, 0], [1250, 315, 670, 1400], [500, 330, 680, 1350], [500, 330, 680, 0],
  [1250, 65, 135, 0], [850, 690, undefined, 0],
]);
assert.equal(visual[2]?.catalogueId, 'wall_2_door');
assert.deepEqual(visualRoom, visualSource, '3D decisions cannot change the surveyed existing layer');
const proposedVisual = existingObjectVisual(open, {
  id: 'proposed-base', layer: 'proposed', kind: 'base-cabinet', catalogueId: 'base_2_door',
  placement: { type: 'wall', wallId: 'cooktop', offsetMm: 100 },
  widthMm: 600, depthMm: 580, heightMm: 870,
});
assert.equal(proposedVisual?.kind, 'proposed-catalogue');
assert.equal(proposedVisual?.catalogueId, 'base_2_door');
assert.equal(proposedVisual?.pose.rotationDeg, wallGeometry(open, 'cooktop')?.rotationDeg);

// Physical offsets move to the second wall when a segment is split.
let split = createRoomDocument('split');
split = edit(split, { type: 'add-wall', lengthMm: 1000, angleDeg: 0, wallId: 'w1', cornerId: 'end' });
const crossingOpening = edit(split, { type: 'upsert-opening', opening: {
  id: 'crossing-window', wallId: 'w1', kind: 'window', offsetMm: 450, widthMm: 100,
} });
const rejectedOpeningSplit = applyRoomEdit(crossingOpening, { type: 'split-wall', wallId: 'w1', offsetMm: 500 });
assert.equal(rejectedOpeningSplit.applied, false);
assert.match(rejectedOpeningSplit.issues[0].message, /opening crosses the split/i);
assert.deepEqual(rejectedOpeningSplit.document, crossingOpening);
const crossingItem = edit(split, { type: 'upsert-object', object: {
  id: 'crossing-cabinet', layer: 'existing', kind: 'cabinet',
  placement: { type: 'wall', wallId: 'w1', offsetMm: 400 },
  widthMm: 200, depthMm: 600,
} });
assert.match(applyRoomEdit(crossingItem, { type: 'split-wall', wallId: 'w1', offsetMm: 500 })
  .issues[0].message, /attached item crosses the split/i);
split = edit(split, { type: 'upsert-opening', opening: { id: 'window', wallId: 'w1', kind: 'window', offsetMm: 600, widthMm: 100 } });
split.walls[0].geometryEvidence = { source: 'observed', evidenceIds: ['scan-photo'] };
split = edit(split, { type: 'split-wall', wallId: 'w1', offsetMm: 500, newWallId: 'w2', newCornerId: 'middle' });
assert.equal(split.openings[0].wallId, 'w2');
assert.equal(split.openings[0].offsetMm, 100);
assert.equal(split.chains[0].closed, false);
assert.deepEqual(split.walls.map(wall => wall.geometryEvidence?.source), ['unknown', 'unknown']);

// Deliberate closure and floor confirmation are distinct transactions.
let rectangle = createRoomDocument('rectangle');
rectangle = edit(rectangle, { type: 'add-wall', lengthMm: 1000, angleDeg: 0, wallId: 'N' });
const rectangularChain = rectangle.chains[0].id;
rectangle = edit(rectangle, { type: 'add-wall', chainId: rectangularChain, lengthMm: 1000, angleDeg: 90, wallId: 'E' });
rectangle = edit(rectangle, { type: 'add-wall', chainId: rectangularChain, lengthMm: 1000, angleDeg: 180, wallId: 'S' });
rectangle = edit(rectangle, { type: 'close-chain', chainId: rectangularChain, wallId: 'W' });
assert.equal(rectangle.chains[0].closed, true);
assert.equal(rectangle.floorBoundary, undefined);
rectangle = edit(rectangle, { type: 'set-floor-boundary', cornerIds: rectangle.chains[0].wallIds.map(id => rectangle.walls.find(w => w.id === id)!.startCornerId) });
assert.equal(footprintInsideConfirmedFloor(rectangle, footprintCorners({ xMm: 500, zMm: 500, rotationDeg: 30 }, 200, 200)).status, 'inside');

// All four corners can be in a concave L room while the centre of one edge
// passes through the missing corner. A bounding-box/corner-only test misses it.
const lPolygon = [
  { xMm: 0, zMm: 0 }, { xMm: 4000, zMm: 0 }, { xMm: 4000, zMm: 2000 },
  { xMm: 2000, zMm: 2000 }, { xMm: 2000, zMm: 4000 }, { xMm: 0, zMm: 4000 },
];
const bridge = [
  { xMm: 1000, zMm: 3500 }, { xMm: 3500, zMm: 1000 },
  { xMm: 3600, zMm: 1100 }, { xMm: 1100, zMm: 3600 },
];
assert.equal(footprintInsidePolygon(bridge, lPolygon), false);
assert.equal(footprintsIntersect(
  footprintCorners({ xMm: 100, zMm: 100, rotationDeg: 45 }, 300, 500),
  footprintCorners({ xMm: 400, zMm: 100, rotationDeg: -30 }, 300, 500),
), true);
assert.equal(footprintsIntersect(
  footprintCorners({ xMm: 100, zMm: 100, rotationDeg: 45 }, 300, 500),
  footprintCorners({ xMm: 2000, zMm: 2000, rotationDeg: -30 }, 300, 500),
), false);

// Legacy conversion preserves IDs, catalogue identity, cabinet size, settings
// and original data without claiming a measured length.
const legacy = {
  id: 'legacy', name: 'Saved kitchen', description: '', shape: 'l-shaped',
  config: { width: 4000, depth: 4000, height: 2600, shape: 'LShape', cutoutWidth: 2000, cutoutDepth: 2000,
    openings: [{ id: 'old-window', wall: 'N', type: 'window', offsetMm: 500, widthMm: 900 }], services: [] },
  cabinets: [{ instanceId: 'old-cabinet', definitionId: 'base-600', category: 'Base', isPlaced: true,
    dimensions: { width: 600, depth: 600, height: 900 }, position: { x: 500, y: 0, z: 300, rotation: 0 } }],
  dimensions: { toeKickHeight: 150 }, materialDefaults: { exteriorFinish: 'oak' }, hardwareDefaults: { adjustableLegs: true },
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
} as unknown as TradeRoom;
const migrated = migrateTradeRoom(legacy);
assert.equal(migrated.floorBoundary?.confirmed, true);
assert.equal(migrated.walls.length, 6);
assert.equal(migrated.walls[0].lengthEvidence?.source, 'unknown');
assert.equal(migrated.openings[0].id, 'old-window');
assert.equal(migrated.objects[0].catalogueId, 'base-600');
assert.equal(migrated.objects[0].sizeLock, 'confirmed');
assert.equal((migrated.legacySnapshot as TradeRoom).materialDefaults.exteriorFinish, 'oak');
assert.equal(validateRoomDocument(migrated).filter(issue => issue.severity === 'error').length, 0);
const sameCabinets = reconcileTradeRoomCabinets(migrated, legacy.cabinets, legacy.dimensions);
assert.equal(sameCabinets.objects.filter(object => object.sourceCabinetId === 'old-cabinet').length, 1);
assert.equal(reconcileTradeRoomCabinets(sameCabinets, legacy.cabinets, legacy.dimensions), sameCabinets);
const fitted = reconcileTradeRoomCabinets(sameCabinets, [{ ...legacy.cabinets[0],
  dimensions: { ...legacy.cabinets[0].dimensions, width: 700 },
  dimensionStatus: 'inferred',
}]);
assert.equal(fitted.objects.find(object => object.id === 'old-cabinet')?.widthMm, 700);
assert.equal(fitted.objects.find(object => object.id === 'old-cabinet')?.dimensionEvidence?.widthMm.source, 'inferred');
assert.equal(fitted.revision, sameCabinets.revision + 1);
assert.equal(reconcileTradeRoomCabinets(fitted, []).objects.some(object => object.id === 'old-cabinet'), false);
const withSurveyed = { ...fitted, objects: [...fitted.objects, { ...open.objects[0], id: 'surveyed-fridge' }] };
assert.equal(reconcileTradeRoomCabinets(withSurveyed, []).objects.some(object => object.id === 'surveyed-fridge'), true);

// Editing a proposed cabinet in the room plan must update its catalogue
// record before projection reconciliation, including arbitrary wall turns.
const inferredCabinet = { ...legacy.cabinets[0], dimensionStatus: 'inferred' as const,
  wallAttachment: { wallId: open.walls[0].id, offsetMm: 100 },
  position: { x: 400, y: 0, z: 300, rotation: 0 } };
const planBefore = reconcileTradeRoomCabinets(open, [inferredCabinet]);
const projectionBefore = planBefore.objects.find(object => object.sourceCabinetId === inferredCabinet.instanceId)!;
const planEdited = edit(planBefore, { type: 'upsert-object', object: {
  ...projectionBefore, widthMm: 720,
  placement: { type: 'wall', wallId: open.walls[1].id, offsetMm: 250 },
  placementProvenance: { source: 'user-correction', previousWallId: open.walls[0].id,
    note: 'Moved to the photographed angled wall.' },
} });
const synced = applyEditedCabinetProjection(planBefore, planEdited, inferredCabinet);
assert.equal(synced.directlyEdited, true);
assert.equal(synced.cabinet.dimensions.width, 720);
assert.deepEqual(synced.cabinet.wallAttachment,
  { wallId: open.walls[1].id, offsetMm: 250, depthOffsetMm: undefined });
const planAfterSync = reconcileTradeRoomCabinets(planEdited, [synced.cabinet]);
const projectionAfterSync = planAfterSync.objects.find(object => object.sourceCabinetId === inferredCabinet.instanceId)!;
assert.equal(projectionAfterSync.widthMm, 720);
assert.equal(projectionAfterSync.placement.type === 'wall' && projectionAfterSync.placement.wallId, open.walls[1].id);
assert.equal(projectionAfterSync.placement.type === 'wall' && projectionAfterSync.placement.offsetMm, 250);
assert.deepEqual(projectionAfterSync.placementProvenance, planEdited.objects.find(object => object.id === projectionBefore.id)?.placementProvenance);
assert.equal(synced.cabinet.position?.rotation, wallGeometry(planEdited, open.walls[1].id)?.rotationDeg);
const freeEdited = edit(planAfterSync, { type: 'upsert-object', object: {
  ...projectionAfterSync, placement: { type: 'free', xMm: 900, zMm: 700, rotationDeg: 45 },
} });
const freed = applyEditedCabinetProjection(planAfterSync, freeEdited, synced.cabinet);
assert.equal(freed.cabinet.wallAttachment, undefined);
assert.deepEqual(freed.cabinet.position, { x: 900, y: 0, z: 700, rotation: 45 });
const confirmedPlan = reconcileTradeRoomCabinets(migrated, [legacy.cabinets[0]]);
const confirmedObject = confirmedPlan.objects.find(object => object.sourceCabinetId === legacy.cabinets[0].instanceId)!;
const tamperedSize = edit(confirmedPlan, { type: 'upsert-object', object: { ...confirmedObject, widthMm: 999 } });
assert.equal(applyEditedCabinetProjection(confirmedPlan, tamperedSize, legacy.cabinets[0]).cabinet.dimensions.width, 600,
  'confirmed cabinet dimensions remain locked even if a caller bypasses the UI');

// Removing a projected trade cabinet removes its complete catalogue record in
// the same plan transaction. Undo restores the archived record, not a sketch
// reconstructed from the lean plan object; redo removes it again.
const richCabinet = { ...synced.cabinet,
  materials: { exteriorFinish: 'oak', carcaseFinish: 'birch', doorStyle: 'shaker', edgeBanding: 'abs' },
  hardware: { handleType: 'bar', handleColor: 'brass', hingeType: 'concealed', drawerType: 'soft', softClose: true },
  accessories: { shelfCount: 3, adjustableShelves: true, dividers: true, softCloseUpgrade: false, specialFittings: ['bin'] },
  construction: { leftFillerWidth: 20 },
};
const richPlan = reconcileTradeRoomCabinets(planAfterSync, [richCabinet]);
const removal = applyRoomEdit(richPlan, { type: 'delete-object', objectId: projectionAfterSync.id });
assert.equal(removal.applied, true);
const archive = new Map();
const removed = syncCabinetProjectionMembership(richPlan, removal.document, [richCabinet], archive);
assert.deepEqual(removed.removedIds, [richCabinet.instanceId]);
assert.equal(removed.cabinets.length, 0);
const withoutCabinet = reconcileTradeRoomCabinets(removal.document, removed.cabinets);
assert.equal(withoutCabinet.objects.some(object => object.sourceCabinetId === richCabinet.instanceId), false);
const undoDocument = undoRoomEdit(removal);
const restored = syncCabinetProjectionMembership(withoutCabinet, undoDocument, removed.cabinets, archive);
assert.deepEqual(restored.restoredIds, [richCabinet.instanceId]);
assert.deepEqual(restored.cabinets[0].materials, richCabinet.materials);
assert.deepEqual(restored.cabinets[0].hardware, richCabinet.hardware);
assert.deepEqual(restored.cabinets[0].accessories, richCabinet.accessories);
assert.deepEqual(restored.cabinets[0].construction, richCabinet.construction);
const restoredPose = applyEditedCabinetProjection(withoutCabinet, undoDocument, restored.cabinets[0]);
const restoredPlan = reconcileTradeRoomCabinets(undoDocument, [restoredPose.cabinet]);
assert.equal(restoredPlan.objects.some(object => object.sourceCabinetId === richCabinet.instanceId), true);
const redone = syncCabinetProjectionMembership(restoredPlan, withoutCabinet, [restoredPose.cabinet], archive);
assert.deepEqual(redone.removedIds, [richCabinet.instanceId]);
assert.equal(redone.cabinets.length, 0);

// A room save merges against fresh server rooms and rejects stale revisions
// while preserving both the local draft and another room edited elsewhere.
const anotherRoom = { ...legacy, id: 'other-room', name: 'Bathroom' };
const draftRoom = { ...legacy, roomDocument: { ...migrated, revision: 2 }, name: 'New local name' };
const mergedRooms = mergeRoomWrite([legacy, anotherRoom], draftRoom, null);
assert.equal(mergedRooms.find(room => room.id === 'other-room')?.name, 'Bathroom');
assert.equal(mergedRooms.find(room => room.id === 'legacy')?.name, 'New local name');
const remoteRoom = { ...legacy, roomDocument: { ...migrated, revision: 3 }, name: 'Remote name' };
assert.throws(() => mergeRoomWrite([remoteRoom, anotherRoom], draftRoom, 2), RoomRevisionConflictError);
assert.equal(draftRoom.name, 'New local name', 'conflict cannot mutate the local draft');
assert.throws(() => mergeRoomWrite([], draftRoom, null), RoomRevisionConflictError);

// A stale room-setup wizard cannot overwrite geometry saved while it was open.
// Its edited settings and walls remain in the wizard until the user reviews
// the newer room, and no rejected write is copied into local room state.
const wizardDraft = { ...draftRoom, name: 'Unsaved kitchen setup',
  roomDocument: { ...draftRoom.roomDocument!, revision: 4 } };
const wizardSnapshot = structuredClone(wizardDraft);
let wizardLocalRoom = remoteRoom;
let setupWriteRevision: number | null | undefined;
const persistWizard = async (input: { jobId: string; room: TradeRoom; expectedRoomRevision: number | null }) => {
  setupWriteRevision = input.expectedRoomRevision;
  mergeRoomWrite([remoteRoom], input.room, input.expectedRoomRevision);
};
await assert.rejects(
  saveRoomSetupEdit('job-1', draftRoom, wizardDraft, persistWizard,
    (_id, room) => { wizardLocalRoom = room; }),
  RoomRevisionConflictError,
);
assert.equal(setupWriteRevision, 2);
assert.equal(wizardLocalRoom, remoteRoom, 'a failed save cannot replace the newer local room');
assert.deepEqual(wizardDraft, wizardSnapshot, 'conflict leaves unsaved wizard edits intact');
await saveRoomSetupEdit('job-1', remoteRoom, wizardDraft, persistWizard,
  (_id, room) => { wizardLocalRoom = room; });
assert.equal(setupWriteRevision, 3);
assert.equal(wizardLocalRoom, wizardDraft, 'the accepted room is copied locally only after persistence');

// Quote/totals saves keep freshly loaded rooms even when a stale component
// supplies its old room array. Cabinet changes merge into that same fresh room
// and reconcile only the proposed cabinet projection.
assert.equal(selectRoomsForWrite([remoteRoom, anotherRoom], [draftRoom], {
  retainLatestRooms: true, hasServerJob: true,
})[0].name, 'Remote name');
assert.equal(selectRoomsForWrite([], [draftRoom], {
  retainLatestRooms: true, hasServerJob: false,
})[0], draftRoom);
const addedCabinet = { ...legacy.cabinets[0], instanceId: 'new-cabinet', definitionId: 'base-900' };
const savedCabinetRooms = mergeCabinetWrite([remoteRoom, anotherRoom], {
  type: 'upsert', roomId: 'legacy', cabinet: addedCabinet,
  roomFallback: { ...legacy, cabinets: [], name: 'Stale fallback' },
});
assert.equal(savedCabinetRooms[0].name, 'Remote name');
assert.equal(savedCabinetRooms[0].cabinets.length, 2);
assert.equal(savedCabinetRooms[0].roomDocument?.objects.some(object => object.sourceCabinetId === 'new-cabinet'), true);
assert.equal(savedCabinetRooms[1], anotherRoom, 'other rooms remain untouched');
const removedCabinetRooms = mergeCabinetWrite(savedCabinetRooms, {
  type: 'remove', roomId: 'legacy', instanceId: 'new-cabinet',
});
assert.equal(removedCabinetRooms[0].cabinets.length, 1);
assert.equal(removedCabinetRooms[0].roomDocument?.objects.some(object => object.sourceCabinetId === 'new-cabinet'), false);
assert.equal(removedCabinetRooms[0].roomDocument?.revision, savedCabinetRooms[0].roomDocument!.revision + 1);
assert.equal(selectRoomsForWrite([remoteRoom], [draftRoom], {
  roomWrite: { roomId: 'legacy', expectedRoomRevision: 3 }, hasServerJob: true,
})[0].name, 'New local name');

const pieCut = { ...legacy.cabinets[0], definitionId: 'base_corner_pie_cut_2_door', productName: 'Pie cut corner',
  dimensions: { ...legacy.cabinets[0].dimensions, width: 900, depth: 600 } };
assert.equal(cabinetFootprintDepthMm(pieCut), 900);
assert.equal(cabinetFootprintDepthMm({ ...pieCut, definitionId: 'base_corner_blind_left', productName: 'Blind corner' }), 600);
assert.equal(reconcileTradeRoomCabinets(migrated, [pieCut]).objects.find(object => object.id === pieCut.instanceId)?.depthMm, 900);

let measured = createRoomDocument('measured');
measured = edit(measured, { type: 'add-wall', lengthMm: 1000, angleDeg: 0, wallId: 'one' });
measured = edit(measured, { type: 'add-wall', chainId: measured.chains[0].id, lengthMm: 1000, angleDeg: 90, wallId: 'two' });
measured = edit(measured, { type: 'set-wall-length', wallId: 'one', lengthMm: 1000,
  measurement: { valueMm: 1000, source: 'measured', evidenceIds: ['tape-1'] } });
const firstCornerId = measured.walls[0].startCornerId;
assert.equal(applyRoomEdit(measured, { type: 'move-corner', cornerId: firstCornerId, xMm: 100, zMm: 0 }).applied, false);
const rejectedMeasuredSplit = applyRoomEdit(measured, { type: 'split-wall', wallId: 'one', offsetMm: 500 });
assert.equal(rejectedMeasuredSplit.applied, false);
assert.match(rejectedMeasuredSplit.issues[0].message, /site-measured full length/i);
assert.equal(rejectedMeasuredSplit.document.walls[0].lengthEvidence?.evidenceIds?.[0], 'tape-1');

console.log('room document geometry and migration checks passed');
