import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RoomDocumentEditor from '../src/components/roomDocument/RoomDocumentEditor';
import { wallEditForPlanClick } from '../src/components/roomDocument/roomPlanPlacement';
import { applyRoomEdit, createRoomDocument, undoRoomEdit, validateRoomDocument } from '../src/lib/roomDocument/core';

const blank = createRoomDocument('manual-room');
const firstTap = wallEditForPlanClick(blank, null, 'end', { xMm: 500, zMm: 500 }, null, 'wall-1');
assert.equal(firstTap.kind, 'start');
if (firstTap.kind !== 'start') throw new Error('Start point was not accepted.');
const firstWall = wallEditForPlanClick(blank, null, 'end', { xMm: 3000, zMm: 500 }, firstTap.point, 'wall-1');
assert.equal(firstWall.kind, 'edit');
if (firstWall.kind !== 'edit') throw new Error('First wall edit was not created.');
const addedFirst = applyRoomEdit(blank, firstWall.edit);
assert.equal(addedFirst.applied, true);
assert.equal(addedFirst.document.walls.length, 1);
assert.equal(addedFirst.document.floorBoundary, undefined, 'drawing a wall never confirms a floor');

const secondWall = wallEditForPlanClick(addedFirst.document, 'wall-1', 'end', { xMm: 3000, zMm: 2500 }, null, 'wall-2');
assert.equal(secondWall.kind, 'edit');
if (secondWall.kind !== 'edit') throw new Error('Second wall edit was not created.');
const addedSecond = applyRoomEdit(addedFirst.document, secondWall.edit);
assert.equal(addedSecond.applied, true);
assert.deepEqual(addedSecond.document.chains[0].wallIds, ['wall-1', 'wall-2']);
assert.equal(addedSecond.document.chains[0].closed, false);
assert.equal(Math.round(addedSecond.document.corners.at(-1)!.zMm), 2500);
assert.equal(undoRoomEdit(addedSecond).walls.length, 1, 'the pointer addition is one undoable transaction');

const prependedWall = wallEditForPlanClick(addedSecond.document, 'wall-1', 'start',
  { xMm: 500, zMm: 2000 }, null, 'wall-0');
assert.equal(prependedWall.kind, 'edit');
if (prependedWall.kind !== 'edit') throw new Error('Start-end wall edit was not created.');
const addedAtStart = applyRoomEdit(addedSecond.document, prependedWall.edit);
assert.equal(addedAtStart.applied, true);
assert.deepEqual(addedAtStart.document.chains[0].wallIds, ['wall-0', 'wall-1', 'wall-2']);
const startCorner = addedAtStart.document.corners.find(corner => corner.id === addedAtStart.document.walls.find(wall => wall.id === 'wall-0')!.startCornerId);
assert.ok(startCorner && Math.abs(startCorner.xMm - 500) < 0.01 && Math.abs(startCorner.zMm - 2000) < 0.01);

const separateStart = wallEditForPlanClick(addedSecond.document, 'wall-2', 'separate', { xMm: 4000, zMm: 4000 }, null, 'wall-3');
assert.equal(separateStart.kind, 'start');
if (separateStart.kind !== 'start') throw new Error('Separate start point was not accepted.');
const separateWall = wallEditForPlanClick(addedSecond.document, 'wall-2', 'separate',
  { xMm: 5000, zMm: 4500 }, separateStart.point, 'wall-3');
assert.equal(separateWall.kind, 'edit');
if (separateWall.kind !== 'edit') throw new Error('Separate wall edit was not created.');
const addedSeparate = applyRoomEdit(addedSecond.document, separateWall.edit);
assert.equal(addedSeparate.applied, true);
assert.equal(addedSeparate.document.chains.length, 2, 'separate wall remains its own open chain');

const tooShort = wallEditForPlanClick(addedFirst.document, 'wall-1', 'end', { xMm: 3020, zMm: 500 }, null, 'bad-wall');
assert.equal(tooShort.kind, 'error');

const floorService = {
  id: 'floor-drain-1', kind: 'drain' as const,
  placement: { type: 'free' as const, xMm: 1200, zMm: 1800, rotationDeg: 0 }, heightMm: 0,
};
const addedService = applyRoomEdit(addedSecond.document, { type: 'upsert-service', service: floorService });
assert.equal(addedService.applied, true);
assert.equal(addedService.document.services[0].placement.type, 'free');
assert.equal(validateRoomDocument(addedService.document).filter(issue => issue.severity === 'error').length, 0);
assert.equal(undoRoomEdit(addedService).services.length, 0, 'floor service placement is undoable');

const blankMarkup = renderToStaticMarkup(<RoomDocumentEditor document={blank} onChange={() => {}} />);
assert.match(blankMarkup, /Draw walls on plan/);
assert.match(blankMarkup, /Place floor drain/);
assert.match(blankMarkup, /Place floor power point/);
const serviceMarkup = renderToStaticMarkup(<RoomDocumentEditor document={addedService.document} onChange={() => {}} />);
assert.match(serviceMarkup, /Edit drain/);
const pendingMarkup = renderToStaticMarkup(<RoomDocumentEditor document={{ ...addedSecond.document,
  pendingPhotoFeatures: [
    { id: 'seen-window', label: 'Window beside sink', kind: 'window', status: 'needs-placement-and-size',
      wallId: 'wall-2', sourceWallId: 'wall-2', evidenceIds: ['photo:0032'] },
    { id: 'seen-desk', label: 'Desk', kind: 'desk', status: 'needs-placement-and-size',
      sourceWallId: 'unknown-wall', evidenceIds: ['photo:0040'] },
  ],
}} onChange={() => {}} />);
assert.match(pendingMarkup, /Seen in photos · needs placement\/size/);
assert.match(pendingMarkup, /Window beside sink/);
assert.match(pendingMarkup, /Wall 2 · wall-2/);
assert.match(pendingMarkup, /Source wall unknown-wall · not matched to this plan/);
assert.match(pendingMarkup, /Seen in photo 33/, "photo citations read as photo numbers, not storage ids");
assert.doesNotMatch(pendingMarkup, /Edit window/, 'pending feature is not rendered as a physical opening');

console.log('room document editor parity passed');
