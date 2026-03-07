import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom,
  addCabinet,
  moveCabinet,
  editCabinet,
  duplicateCabinet,
  deleteCabinet,
  saveAndReload,
  quotePdfPayloadShape,
  xmlTradeRoomShape,
} from '../workflowModel.js';

function buildInitialState() {
  return {
    rooms: [],
  };
}

function buildRoom() {
  return {
    id: 'room-1',
    name: 'Kitchen',
    config: { width: 4000, depth: 3000, height: 2400 },
    cabinets: [],
  };
}

function buildCabinet(id = 'cab-1') {
  return {
    instanceId: id,
    definitionId: 'def-1',
    cabinetNumber: 'C01',
    productName: 'Base Cabinet 600',
    category: 'Base',
    dimensions: { width: 600, depth: 580, height: 870 },
    position: { x: 10, y: 0, z: 10, rotation: 0 },
    isPlaced: false,
  };
}

test('phase6 required flow: create/add/move/edit/duplicate/delete/save-reload/pdf/xml', () => {
  let state = buildInitialState();

  state = createRoom(state, buildRoom());
  assert.equal(state.rooms.length, 1, 'create room');

  state = addCabinet(state, 'room-1', buildCabinet());
  assert.equal(state.rooms[0].cabinets.length, 1, 'add cabinet');

  state = moveCabinet(state, 'room-1', 'cab-1', { x: 99999, y: 0, z: -50, rotation: 90 });
  assert.equal(state.rooms[0].cabinets[0].position.x, 3400, 'move cabinet x clamped to room bounds');
  assert.equal(state.rooms[0].cabinets[0].position.z, 0, 'move cabinet z clamped to room bounds');

  state = editCabinet(state, 'room-1', 'cab-1', {
    productName: 'Edited Base Cabinet',
    dimensions: { width: 800, depth: 580, height: 870 },
  });
  assert.equal(state.rooms[0].cabinets[0].productName, 'Edited Base Cabinet', 'edit cabinet');

  state = duplicateCabinet(state, 'room-1', 'cab-1');
  assert.equal(state.rooms[0].cabinets.length, 2, 'duplicate cabinet');

  state = deleteCabinet(state, 'room-1', 'cab-1-copy');
  assert.equal(state.rooms[0].cabinets.length, 1, 'delete cabinet');

  const reloaded = saveAndReload(state);
  assert.deepEqual(reloaded, state, 'save and reload');

  const quoteShape = quotePdfPayloadShape(reloaded);
  assert.equal(quoteShape.rooms, 1, 'export quote pdf shape includes rooms');
  assert.equal(quoteShape.cabinets, 1, 'export quote pdf shape includes cabinets');
  assert.ok(quoteShape.totals.total > 0, 'quote totals computed');

  const xmlShape = xmlTradeRoomShape(reloaded);
  assert.equal(xmlShape.length, 1, 'xml export from tradeRooms: one room');
  assert.equal(xmlShape[0].cabinets.length, 1, 'xml export from tradeRooms: one cabinet');
  assert.equal(xmlShape[0].cabinets[0].definitionId, 'def-1', 'xml export uses cabinet definition mapping');
});
