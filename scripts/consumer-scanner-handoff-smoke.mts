import assert from 'node:assert/strict';
import { consumerScannerRoomConfig, consumerScannerRoomForFastPath } from '../src/lib/trade/consumerScannerHandoff';
import type { RoomDocumentV1 } from '../src/lib/roomDocument';
import type { RoomConfig } from '../src/pages/trade/components/RoomSetupWizard';

const scannedRoom = {
  capture: { captureId: '47ab46c8-13db-4cd6-adc2-f03077874201', source: 'photo-review' },
  chains: [{ id: 'photo-outline', wallIds: ['wall-1', 'wall-2', 'wall-3', 'wall-4'], closed: true }],
  walls: ['wall-1', 'wall-2', 'wall-3', 'wall-4'].map((id, index) => ({
    id,
    geometryEvidence: { source: 'inferred', evidenceIds: [`photo:${String(index).padStart(4, '0')}`] },
    lengthEvidence: { valueMm: index === 0 ? 3180 : 2400, source: index === 0 ? 'measured' : 'inferred' },
  })),
} as RoomDocumentV1;
const initialConfig: Partial<RoomConfig> = {
  name: 'My kitchen', shape: 'custom', roomDocument: scannedRoom,
  roomHeight: 2540,
};
const fastPath = (overrides: Record<string, unknown> = {}) => consumerScannerRoomForFastPath({
  userType: 'consumer', isNewJob: true, importingWizardRoom: false, initialConfig,
  ...overrides,
});

assert.equal(fastPath(), scannedRoom, 'a consumer scan keeps its original editable wall document');
assert.equal(fastPath({ userType: 'trade' }), null, 'trade handoffs keep detailed setup');
assert.equal(fastPath({ isNewJob: false }), null, 'saved jobs do not create another room');
assert.equal(fastPath({ importingWizardRoom: true }), null, 'homeowner wizard handoffs keep their existing flow');
assert.equal(fastPath({ initialConfig: { ...initialConfig, roomDocument: { ...scannedRoom, walls: [] } } }), null,
  'an empty scan cannot skip wall review');
assert.equal(fastPath({ initialConfig: { ...initialConfig, roomDocument: { ...scannedRoom, capture: undefined } } }), null,
  'a manually drawn room is not a scanner handoff');
assert.equal(fastPath({ initialConfig: { ...initialConfig, roomDocument: { ...scannedRoom,
  chains: [{ ...scannedRoom.chains[0], closed: false }] } } }), null,
  'an open photo or AR wall run stays in detailed setup');
assert.equal(fastPath({ initialConfig: { ...initialConfig, roomDocument: { ...scannedRoom,
  capture: { ...scannedRoom.capture!, source: 'webxr' } } } }), null,
  'AR geometry cannot enter the photo room shortcut');
assert.equal(fastPath({ initialConfig: { ...initialConfig, roomDocument: { ...scannedRoom,
  walls: scannedRoom.walls.map(wall => ({ ...wall, geometryEvidence: { source: 'inferred' } })) } } }), null,
  'an AR corner draft without photo-cited walls is not a photo-led room');
assert.equal(fastPath({ initialConfig: { ...initialConfig, roomDocument: { ...scannedRoom,
  walls: scannedRoom.walls.map(wall => ({ ...wall, lengthEvidence: { valueMm: 2400, source: 'inferred' } })) } } }), null,
  'an unmeasured photo outline still needs a site length');
assert.equal(fastPath({ initialConfig: { ...initialConfig, roomDocument: { ...scannedRoom,
  chains: [{ ...scannedRoom.chains[0], wallIds: ['wall-1', 'wall-2', 'wall-3'] }] } } }), null,
  'the closed photo chain must account for every wall');

const defaults = { roomHeight: 2700, baseDepth: 575, shape: 'rectangular' } as RoomConfig;
const ready = consumerScannerRoomConfig(defaults, initialConfig, scannedRoom);
assert.equal(ready.roomDocument, scannedRoom, 'cabinet setup reuses the exact scanned RoomDocument');
assert.equal(ready.roomHeight, 2540, 'reviewed room settings replace defaults');
assert.equal(ready.baseDepth, 575, 'unspecified cabinet settings use wizard defaults');
assert.equal(ready.shape, 'custom', 'the scan remains custom geometry');

console.log('consumer scanner handoff smoke passed');
