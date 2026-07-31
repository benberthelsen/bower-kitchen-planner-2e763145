import assert from 'node:assert/strict';
import {
  MANUAL_WALL_OPTIONS,
  validateManualOpeningDrafts,
  type ManualOpeningDraft,
} from '../src/lib/roomScan/manualEntry';

const room = { widthMm: 3600, depthMm: 3000, heightMm: 2400 };

assert.deepEqual(
  MANUAL_WALL_OPTIONS.map((wall) => wall.label),
  ['Main wall', 'Right wall', 'Opposite wall', 'Left wall'],
  'manual entry should use customer-facing wall names',
);

assert.deepEqual(
  validateManualOpeningDrafts([], room),
  { openings: [], error: null },
  'doors and windows must remain optional',
);

const multipleOpenings: ManualOpeningDraft[] = [
  { id: 'door-1', type: 'door', wall: 'N', offsetMm: '0', widthMm: '820' },
  { id: 'window-1', type: 'window', wall: 'N', offsetMm: '1200', widthMm: '1400' },
  { id: 'door-2', type: 'door', wall: 'E', offsetMm: '700', widthMm: '870' },
];
const multipleResult = validateManualOpeningDrafts(multipleOpenings, room);
assert.equal(multipleResult.error, null, 'multiple doors and windows should validate');
assert.equal(multipleResult.openings.length, 3, 'all valid openings should be preserved');
assert.equal(multipleResult.openings[2]?.wall, 'E', 'customer wall choices must retain canonical wall IDs');

const missingWall = validateManualOpeningDrafts(
  [{ id: 'door-1', type: 'door', wall: '', offsetMm: '0', widthMm: '820' }],
  room,
);
assert.match(missingWall.error ?? '', /Choose which wall/i, 'an added opening needs a wall');

const pastWall = validateManualOpeningDrafts(
  [{ id: 'window-1', type: 'window', wall: 'E', offsetMm: '2400', widthMm: '1200' }],
  room,
);
assert.match(pastWall.error ?? '', /right wall/i, 'wall-length errors should use customer-facing wall names');

const overlap = validateManualOpeningDrafts(
  [
    { id: 'door-1', type: 'door', wall: 'S', offsetMm: '200', widthMm: '820' },
    { id: 'window-1', type: 'window', wall: 'S', offsetMm: '900', widthMm: '1200' },
  ],
  room,
);
assert.match(overlap.error ?? '', /overlaps/i, 'overlapping openings should be rejected before saving');

console.log('manual room entry smoke: all checks passed');
