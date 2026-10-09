// Quick-scan progress (sessionStorage 'bower.quickScan.progress') smoke tests.
// Runs via `npm run roomscan:test` on the bundled quickScanProgress module.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const P = await import(pathToFileURL(resolve('.tmp-snap-test/quickScanProgress.mjs')).href);
const { QUICK_SCAN_PROGRESS_KEY, parseQuickScanProgress, serializeQuickScanProgress } = P;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const now = new Date('2026-10-09T03:00:00.000Z');
const capture = {
  corners: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }],
  heightMm: 2650,
  openings: [{ a: { x: 1, z: 0 }, b: { x: 1.9, z: 0 }, type: 'door' }],
};

check('key matches the documented name', QUICK_SCAN_PROGRESS_KEY === 'bower.quickScan.progress');

const raw = serializeQuickScanProgress(capture, now);
const back = parseQuickScanProgress(raw, now.getTime() + 60_000);
check('round trip keeps corners, height and openings',
  back !== null
    && JSON.stringify(back.corners) === JSON.stringify(capture.corners)
    && back.heightMm === 2650
    && JSON.stringify(back.openings) === JSON.stringify(capture.openings),
  JSON.stringify(back));

const extra = JSON.parse(raw);
extra.corners[0].source = 'floor-ray';
extra.secret = 'x';
const stripped = parseQuickScanProgress(JSON.stringify(extra), now.getTime());
check('unknown fields are dropped', stripped && !('secret' in stripped) && !('source' in stripped.corners[0]), JSON.stringify(stripped));

check('stale progress (over 24 h) is ignored', parseQuickScanProgress(raw, now.getTime() + 25 * 3600_000) === null);
check('missing progress is null', parseQuickScanProgress(null) === null);
check('malformed JSON is null', parseQuickScanProgress('{', now.getTime()) === null);

const bad = (mutate) => {
  const value = JSON.parse(raw);
  mutate(value);
  return parseQuickScanProgress(JSON.stringify(value), now.getTime());
};
check('wrong version is refused', bad((v) => { v.version = 2; }) === null);
check('missing savedAt is refused', bad((v) => { delete v.savedAt; }) === null);
check('non-numeric corner is refused', bad((v) => { v.corners[1].x = '4'; }) === null);
check('null corner coordinate is refused', bad((v) => { v.corners[1].z = null; }) === null);
check('far-off corner is refused', bad((v) => { v.corners[1].x = 1e6; }) === null);
check('too many corners are refused', bad((v) => { v.corners = Array.from({ length: 40 }, (_, i) => ({ x: i, z: 0 })); }) === null);
check('unknown opening type is refused', bad((v) => { v.openings[0].type = 'hatch'; }) === null);
check('implausible height becomes null, corners kept', (() => {
  const r = bad((v) => { v.heightMm = -5; });
  return r !== null && r.heightMm === null && r.corners.length === 4;
})());

console.log(`quick scan progress smoke: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
