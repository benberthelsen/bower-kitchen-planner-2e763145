import assert from 'node:assert/strict';
import { buildScannerEntryUrl } from '../src/lib/roomScan/scannerEntryUrl';

const origin = 'https://scanner.example.com';
const captureId = '11111111-1111-4111-8111-111111111111';
assert.equal(buildScannerEntryUrl(undefined, false, { page: 'corners' }), null, 'unset stays hidden');
assert.equal(buildScannerEntryUrl('', false, { page: 'corners' }), null);
assert.equal(buildScannerEntryUrl(origin, false, { page: 'corners' }),
  'https://scanner.example.com/room-corners/?source=planner-trade');
assert.equal(buildScannerEntryUrl(`${origin}/`, false, { page: 'captures' }),
  'https://scanner.example.com/room-capture/?source=planner-trade');
assert.equal(buildScannerEntryUrl(origin, false, { page: 'capture', captureId }),
  `https://scanner.example.com/room-draft/?capture=${captureId}`);
assert.equal(buildScannerEntryUrl(origin, false, { page: 'capture', captureId: '../other' }), null,
  'only a capture id reaches the draft page');
for (const bad of ['http://scanner.example.com', `${origin}/room-walk/`, `${origin}/?x=1`,
  'https://user:pw@scanner.example.com', 'not a url']) {
  assert.equal(buildScannerEntryUrl(bad, false, { page: 'corners' }), null, `rejects ${bad}`);
}
assert.equal(buildScannerEntryUrl('https://localhost', false, { page: 'corners' }), null,
  'a local origin never ships in a production build');
assert.equal(buildScannerEntryUrl('http://localhost:8196', true, { page: 'corners' }),
  'http://localhost:8196/room-corners/?source=planner-trade', 'dev builds may point at the local preview');
console.log('scanner entry url: exact origin, fixed pages and capture id routing passed');
