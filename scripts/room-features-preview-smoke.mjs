import assert from 'node:assert/strict';
import {
  resolveCabinetPreviewRuns,
  resolveCabinetPreviewWalls,
} from '../.tmp-snap-test/room-features-preview.mjs';

assert.deepEqual(
  resolveCabinetPreviewWalls('l-shape', ['E', 'N']),
  ['E', 'N'],
  'back + right must stay back + right in the room diagram',
);
assert.deepEqual(
  resolveCabinetPreviewWalls('l-shape', ['N', 'W']),
  ['N', 'W'],
  'back + left must stay back + left in the room diagram',
);
assert.deepEqual(
  resolveCabinetPreviewWalls('l-shape'),
  ['N', 'W'],
  'generic L-shape callers retain the original back + left preview',
);
assert.deepEqual(
  resolveCabinetPreviewWalls('u-shape', ['E', 'N', 'E']),
  ['E', 'N'],
  'exact wall input is de-duplicated and remains authoritative',
);

assert.deepEqual(
  resolveCabinetPreviewRuns(3600, 3000, 'l-shape', ['S', 'E'], {
    E: { startMm: 0, endMm: 1800 },
  }),
  [
    { wall: 'S', startMm: 0, endMm: 3600 },
    { wall: 'E', startMm: 0, endMm: 1800 },
  ],
  'the cabinet shadow must use the exact right-wall run instead of the full wall',
);

assert.deepEqual(
  resolveCabinetPreviewRuns(3600, 3000, 'l-shape', ['S'], {
    S: { startMm: 275, endMm: 3275 },
  }),
  [{ wall: 'S', startMm: 275, endMm: 3275 }],
  'front-wall clearances must remain exact to the millimetre',
);

console.log('room features wall preview: exact walls and measured runs preserved');
