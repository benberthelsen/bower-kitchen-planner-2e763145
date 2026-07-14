// Category/height-aware opening warning matrix (master plan §12.3).
// Run via `npm run test:openings` (esbuild bundles the module first).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { computeOpeningWarnings } = await import(pathToFileURL(resolve('.tmp-snap-test/openingWarnings.mjs')).href);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const dims = { toeKickHeight: 135, wallMountHeight: 1350 };
const mkCab = (category, x, z, over = {}) => ({
  instanceId: `c-${category}-${x}-${z}`,
  cabinetNumber: 'B01',
  productName: `${category} test`,
  category,
  dimensions: { width: 600, height: category === 'Wall' ? 600 : category === 'Tall' ? 2100 : 732, depth: category === 'Wall' ? 300 : 575 },
  position: { x, y: 0, z, rotation: 0 },
  isPlaced: true,
  ...over,
});

const room = {
  width: 3600,
  depth: 3000,
  openings: [
    // Door on the FRONT (S) wall: offset from east end → x span [2630, 3500].
    { id: 'door-s', wall: 'S', type: 'door', offsetMm: 100, widthMm: 870 },
    // Window on the BACK (N) wall: x span [1200, 2400], sill 900, height 1200.
    { id: 'win-n', wall: 'N', type: 'window', offsetMm: 1200, widthMm: 1200, heightMm: 1200, sillHeightMm: 900 },
  ],
};

// 1. Base cabinet parked across the S door → warns (doors block everything).
const w1 = computeOpeningWarnings(room, dims, [mkCab('Base', 3000, 2702)]);
check('base across doorway warns', w1.length === 1 && w1[0].openingId === 'door-s', JSON.stringify(w1));

// 2. Base under the N window → NO warning (top ~907 vs sill 900, tolerance).
const w2 = computeOpeningWarnings(room, dims, [mkCab('Base', 1800, 297)]);
check('base below window does not warn', w2.length === 0, JSON.stringify(w2));

// 3. Wall cabinet across the N window → warns (1350-1950 vs 900-2100).
const w3 = computeOpeningWarnings(room, dims, [mkCab('Wall', 1800, 160)]);
check('wall cabinet across window warns', w3.length === 1 && w3[0].openingId === 'win-n', JSON.stringify(w3));

// 4. Tall cabinet across the N window → warns (0-2235 overlaps glazing).
const w4 = computeOpeningWarnings(room, dims, [mkCab('Tall', 1800, 310)]);
check('tall cabinet across window warns', w4.length === 1 && w4[0].openingId === 'win-n', JSON.stringify(w4));

// 5. Base far from every opening → clean.
const w5 = computeOpeningWarnings(room, dims, [mkCab('Base', 600, 297)]);
check('clear placement has no warnings', w5.length === 0, JSON.stringify(w5));

// 6. Wall cabinet horizontally clear of the window → clean.
const w6 = computeOpeningWarnings(room, dims, [mkCab('Wall', 3000, 160)]);
check('wall cabinet beside window is clean', w6.length === 0, JSON.stringify(w6));

// 7. Unplaced cabinets are ignored.
const w7 = computeOpeningWarnings(room, dims, [mkCab('Base', 3000, 2702, { isPlaced: false, position: undefined })]);
check('unplaced cabinets ignored', w7.length === 0, JSON.stringify(w7));

// 8. Rotated (90°) tall cabinet on the E wall near a door there — swap check.
const roomE = { width: 3600, depth: 3000, openings: [{ id: 'door-e', wall: 'E', type: 'door', offsetMm: 400, widthMm: 900 }] };
// E-wall door z span [400, 1300]; tall cabinet snapped to E wall at z 850.
const w8 = computeOpeningWarnings(roomE, dims, [mkCab('Tall', 3302, 850, { position: { x: 3302, y: 0, z: 850, rotation: 90 } })]);
check('rotated tall blocks E-wall door', w8.length === 1 && w8[0].openingId === 'door-e', JSON.stringify(w8));

// 9. Legacy room without openings array → no warnings, no crash.
const w9 = computeOpeningWarnings({ width: 3600, depth: 3000 }, dims, [mkCab('Base', 3000, 2702)]);
check('legacy room (no openings) is clean', w9.length === 0, JSON.stringify(w9));

console.log(`opening warnings smoke: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
