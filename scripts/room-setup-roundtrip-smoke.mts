import assert from 'node:assert/strict';
import { DEFAULT_GLOBAL_DIMENSIONS } from '../src/constants';
import { applyRoomEdit, createRoomDocument } from '../src/lib/roomDocument';
import { documentForCustomSetup, legacyRoomConfig, roomDimensions, roomSetupExtras, toRoomConfig } from '../src/lib/trade/roomSetupMapping';
import type { RoomConfig as WizardRoomConfig } from '../src/pages/trade/components/RoomSetupWizard';
import type { TradeRoom } from '../src/types/trade';

const source = createRoomDocument('open-kitchen', 'Open kitchen');
const edited = applyRoomEdit(source, { type: 'add-wall', lengthMm: 1645, angleDeg: 45, wallId: 'angled' });
assert.equal(edited.applied, true);
edited.document.pendingPhotoFeatures = [{
  id: 'photo-window', kind: 'window', label: 'Window beside sink', status: 'needs-placement-and-size',
  wallId: 'angled', sourceWallId: 'angled', evidenceIds: ['photo:0032'],
}];

const config: WizardRoomConfig = {
  name: 'Eight Hibiscus kitchen', description: 'Three photographed walls', shape: 'custom', roomDocument: edited.document,
  roomWidth: 4200, roomDepth: 3100, roomHeight: 2720, cutoutWidth: 450, cutoutDepth: 300,
  islandWidth: 1750, islandDepth: 910, peninsulaLength: 1470, peninsulaWidth: 640,
  leftWingDepth: 1220, rightWingDepth: 1330, corridorWidth: 1160,
  openings: [{ id: 'window', wall: 'N', type: 'window', offsetMm: 400, widthMm: 950, sillHeightMm: 920 }],
  services: [{ id: 'power', wall: 'N', type: 'gpo', offsetMm: 600, heightMm: 1100 }],
  exteriorMaterial: 'exterior-id', exteriorEdge: 'edge-id', doorStyle: 'shaker',
  carcaseMaterial: 'carcase-id', carcaseEdge: 'carcase-edge-id',
  hingeStyle: 'saved-hinge-no-longer-listed', drawerStyle: 'saved-drawer-no-longer-listed',
  supplyHardware: false, supplyMethod: 'flat-pack', adjustableLegs: false,
  toeKickHeight: 140, shelfSetback: 8, baseHeight: 740, baseDepth: 580,
  wallHeight: 690, wallDepth: 330, tallHeight: 2250, tallDepth: 620, wallMountHeight: 1430,
  doorGap: 2.2, drawerGap: 2.8, leftGap: 1.4, rightGap: 1.9,
  upperTopMargin: 5, upperBottomMargin: 7, baseTopMargin: 4,
};

const room: TradeRoom = {
  id: 'saved-room', name: config.name, description: config.description, shape: 'rectangular',
  config: legacyRoomConfig(config), dimensions: roomDimensions(config), setupExtras: roomSetupExtras(config),
  materialDefaults: {
    exteriorFinish: config.exteriorMaterial, edgeBanding: config.exteriorEdge, doorStyle: config.doorStyle,
    carcaseFinish: config.carcaseMaterial, carcaseEdge: config.carcaseEdge,
  },
  hardwareDefaults: {
    handleType: 'existing-handle', handleColor: '#123456', hingeType: config.hingeStyle,
    drawerType: config.drawerStyle, softClose: true, supplyHardware: config.supplyHardware,
    adjustableLegs: config.adjustableLegs,
  },
  roomDocument: config.roomDocument, cabinets: [], createdAt: new Date(), updatedAt: new Date(),
};

const reopened = toRoomConfig(JSON.parse(JSON.stringify(room)) as TradeRoom);
assert.deepEqual(reopened.roomDocument?.pendingPhotoFeatures, edited.document.pendingPhotoFeatures,
  'unplaced photo observations survive saved room setup');
for (const key of Object.keys(config) as (keyof WizardRoomConfig)[]) {
  // Rectangle width/depth are explicitly derived compatibility values for custom walls.
  if (key === 'roomWidth' || key === 'roomDepth') continue;
  assert.deepEqual(reopened[key], config[key], `save/reopen lost ${key}`);
}
assert.ok(Math.abs(room.config.width - 1645 / Math.SQRT2) < 1);
assert.ok(Math.abs(room.config.depth - 1645 / Math.SQRT2) < 1);
assert.equal(room.dimensions.topMargin, 5);
assert.equal(room.dimensions.bottomMargin, 7);
assert.deepEqual(roomDimensions(reopened, { ...DEFAULT_GLOBAL_DIMENSIONS, benchtopThickness: 44 }).benchtopThickness, 44);

const preset: WizardRoomConfig = { ...config, shape: 'island', roomDocument: undefined };
const presetRoom: TradeRoom = {
  ...room, config: legacyRoomConfig(preset), roomDocument: undefined,
  setupExtras: roomSetupExtras(preset),
};
assert.equal(presetRoom.config.shape, 'Rectangle');
assert.equal(toRoomConfig(presetRoom).shape, 'island', 'legacy compatibility must not erase the selected setup layout');
assert.equal(toRoomConfig({ ...presetRoom, setupExtras: undefined }).shape, 'rectangular', 'older rooms still reopen');

const savedLegacy: TradeRoom = { ...presetRoom, id: 'legacy-kitchen', cabinets: [{
  instanceId: 'existing-cabinet', definitionId: 'base_2_door', category: 'Base', isPlaced: true,
  dimensions: { width: 600, depth: 580, height: 870 }, position: { x: 900, y: 0, z: 400, rotation: 0 },
} as TradeRoom['cabinets'][number]] };
const converted = documentForCustomSetup(toRoomConfig(savedLegacy), savedLegacy);
assert.equal(converted.floorBoundary?.confirmed, true);
assert.equal(converted.openings.find(opening => opening.id === 'window')?.wallId, 'N');
assert.equal(converted.services.find(service => service.id === 'power')?.placement.type, 'wall');
assert.equal(converted.objects.find(object => object.sourceCabinetId === 'existing-cabinet')?.catalogueId, 'base_2_door');
assert.ok(converted.legacySnapshot, 'the source room remains recoverable after conversion');

console.log('Room setup fields, custom geometry and legacy layout choices survive save/reopen.');
