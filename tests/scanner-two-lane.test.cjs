// Scanner two-lane buildout — geometry regression test.
//
// Self-contained: transpiles src/lib/roomScan/{webxrFit,roomplanImport}.ts
// with ts.transpileModule and runs them against a stub contract module that
// re-implements the schema's key invariants (offset+width ≤ wall length,
// sill+height ≤ room height, Rectangle ⇒ zero cutouts). The real zod schema
// still runs in the app; this proves the GEOMETRY is right.
//
// Run from the repo root:  node backups/scanner-two-lane.test.cjs

const ts = require('typescript');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'lib', 'roomScan');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'scan2lane-'));

// ── Stub contract with real invariant checks ────────────────────────────────
fs.writeFileSync(path.join(OUT, 'contract.js'), `
function wallLen(wall, w, d) { return wall === 'N' || wall === 'S' ? w : d; }
exports.parseRoomScan = function parseRoomScan(scan) {
  const r = scan.room;
  if (!r || !(r.width > 0) || !(r.depth > 0) || !(r.height > 0)) return { ok: false, reason: 'bad dims' };
  if (r.shape === 'Rectangle' && (r.cutoutWidth !== 0 || r.cutoutDepth !== 0)) return { ok: false, reason: 'rect cutout' };
  const ids = new Set();
  for (const o of r.openings) {
    if (ids.has(o.id)) return { ok: false, reason: 'dup id ' + o.id };
    ids.add(o.id);
    if (!['N','E','S','W'].includes(o.wall)) return { ok: false, reason: 'bad wall' };
    if (o.offsetMm < 0 || o.widthMm <= 0) return { ok: false, reason: 'bad span' };
    if (o.offsetMm + o.widthMm > wallLen(o.wall, r.width, r.depth)) return { ok: false, reason: 'opening ' + o.id + ' exceeds wall' };
    const h = o.heightMm ?? (o.type === 'window' ? 1200 : 2040);
    const sill = o.type === 'window' ? (o.sillHeightMm ?? 900) : 0;
    if (sill + h > r.height) return { ok: false, reason: 'opening ' + o.id + ' vertical extent exceeds room height' };
  }
  const m = scan.coordinateFrame.sourceToCanonicalMatrix;
  const det = m[0] * m[4] - m[1] * m[3];
  if (!(Math.abs(det) > 1e-6)) return { ok: false, reason: 'non-invertible frame' };
  return { ok: true, scan };
};
`);

for (const name of ['webxrFit', 'roomplanImport']) {
  const js = ts.transpileModule(fs.readFileSync(path.join(SRC, name + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
    .replace(/require\("\.\/contract"\)/g, 'require("./contract.js")')
    .replace(/require\("\.\/webxrFit"\)/g, 'require("./webxrFit.js")');
  fs.writeFileSync(path.join(OUT, name + '.js'), js);
}

const { buildScanFromCapture, buildScanFromCorners, intersectWallLines } = require(path.join(OUT, 'webxrFit.js'));
const { importRoomPlanJson } = require(path.join(OUT, 'roomplanImport.js'));

let fail = 0;
const ok = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (c ? '' : '  ' + (x ?? ''))); if (!c) fail++; };

// ── Lane 1: WebXR extras ────────────────────────────────────────────────────
const rect = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }];

// Back-compat: corners-only path unchanged.
const plain = buildScanFromCorners(rect, '2026-07-23T00:00:00.000Z');
ok('corners-only still works', plain.ok === true);
ok('corners-only: default height 2700', plain.ok && plain.scan.room.height === 2700);
ok('corners-only: no openings', plain.ok && plain.scan.room.openings.length === 0);
ok('corners-only: 4000×3000', plain.ok && plain.scan.room.width === 4000 && plain.scan.room.depth === 3000);

// Full capture: height + 2 good openings + 1 mid-room (skip) + 1 narrow (widened).
const cap = buildScanFromCapture(rect, {
  heightMm: 2550,
  openings: [
    { a: { x: 1.0, z: 0.02 }, b: { x: 1.9, z: -0.01 }, type: 'door' },     // N wall
    { a: { x: 0.01, z: 1.0 }, b: { x: 0.02, z: 2.2 }, type: 'window' },    // W wall
    { a: { x: 2.0, z: 1.5 }, b: { x: 2.5, z: 1.5 }, type: 'walkway' },     // mid-room → skipped
    { a: { x: 3.0, z: 0.0 }, b: { x: 3.1, z: 0.0 }, type: 'door' },        // 100mm → widened to 300
  ],
}, '2026-07-23T00:00:00.000Z');
ok('capture: ok', cap.ok === true, cap.ok ? '' : cap.reason);
if (cap.ok) {
  const r = cap.scan.room;
  ok('capture: measured height 2550', r.height === 2550);
  ok('capture: height field measured', cap.scan.confidence.fields.height === 'measured');
  ok('capture: 3 openings kept (mid-room skipped)', r.openings.length === 3, JSON.stringify(r.openings));
  const door = r.openings.find(o => o.type === 'door' && o.offsetMm < 2000);
  ok('capture: door on N', door && door.wall === 'N');
  ok('capture: door span ~1000-1900', door && Math.abs(door.offsetMm - 1000) <= 25 && Math.abs(door.widthMm - 900) <= 40, JSON.stringify(door));
  const win = r.openings.find(o => o.type === 'window');
  ok('capture: window on W', win && win.wall === 'W');
  // W-wall offsets are measured from the SOUTH corner (see the clockwise
  // convention in src/lib/layout/geometry.ts), so marks at z=1.0..2.2 in a
  // 3000mm-deep room sit at 3000-2200 = 800, not 1000.
  ok('capture: window span ~800+1200 (W wall measured from S corner)', win && Math.abs(win.offsetMm - 800) <= 25 && Math.abs(win.widthMm - 1200) <= 40, JSON.stringify(win));

  const narrow = r.openings.find(o => o.type === 'door' && o.offsetMm >= 2000);
  ok('capture: narrow door widened to min 300', narrow && narrow.widthMm === 300, JSON.stringify(narrow));
  ok('capture: skip produced a warning', cap.warnings.some(w => w.includes('not near any wall')));
  ok('capture: openings field user-marked', cap.scan.confidence.fields.openings === 'user-marked');
}

// Wall-offset convention, all four walls. Canonical offsets run clockwise:
// N from the W corner, E from the N corner, S from the E corner, W from the S
// corner (src/lib/layout/geometry.ts). Room here is 4000 x 3000.
{
  const quad = buildScanFromCapture(rect, {
    openings: [
      { a: { x: 1.0, z: 0.01 }, b: { x: 1.9, z: 0.01 }, type: 'door' },    // N
      { a: { x: 3.99, z: 0.5 }, b: { x: 3.99, z: 1.1 }, type: 'window' },  // E
      { a: { x: 1.0, z: 2.99 }, b: { x: 1.9, z: 2.99 }, type: 'walkway' }, // S
      { a: { x: 0.01, z: 1.0 }, b: { x: 0.01, z: 2.2 }, type: 'door' },    // W
    ],
  }, '2026-07-23T00:00:00.000Z');
  ok('walls: capture ok', quad.ok === true, quad.ok ? '' : quad.reason);
  if (quad.ok) {
    const by = {};
    for (const o of quad.scan.room.openings) by[o.wall] = o;
    const near = (a, b) => Math.abs(a - b) <= 25;
    ok('walls: N offset 1000 (from W corner)',
      by.N && near(by.N.offsetMm, 1000) && near(by.N.widthMm, 900), JSON.stringify(by.N));
    ok('walls: E offset 500 (from N corner)',
      by.E && near(by.E.offsetMm, 500) && near(by.E.widthMm, 600), JSON.stringify(by.E));
    ok('walls: S offset 2100 (from E corner, mirrored)',
      by.S && near(by.S.offsetMm, 2100) && near(by.S.widthMm, 900), JSON.stringify(by.S));
    ok('walls: W offset 800 (from S corner, mirrored)',
      by.W && near(by.W.offsetMm, 800) && near(by.W.widthMm, 1200), JSON.stringify(by.W));
    // Every span must sit inside its wall.
    for (const o of quad.scan.room.openings) {
      const len = o.wall === 'N' || o.wall === 'S' ? 4000 : 3000;
      ok('walls: ' + o.wall + ' span within wall', o.offsetMm >= 0 && o.offsetMm + o.widthMm <= len, JSON.stringify(o));
    }
  }
}

// Bad height falls back with warning, scan still ok.
const badH = buildScanFromCapture(rect, { heightMm: 900 }, '2026-07-23T00:00:00.000Z');
ok('capture: implausible height → 2700 + warning', badH.ok && badH.scan.room.height === 2700 && badH.warnings.some(w => w.includes('looked wrong')));

// Overlapping marks: second dropped with warning.
const overlap = buildScanFromCapture(rect, {
  openings: [
    { a: { x: 1.0, z: 0.0 }, b: { x: 1.9, z: 0.0 }, type: 'door' },
    { a: { x: 1.5, z: 0.0 }, b: { x: 2.4, z: 0.0 }, type: 'walkway' },
  ],
}, '2026-07-23T00:00:00.000Z');
ok('capture: overlap keeps first only', overlap.ok && overlap.scan.room.openings.length === 1 && overlap.warnings.some(w => w.includes('overlap')));

// ── Lane 2: RoomPlan import ─────────────────────────────────────────────────
// Synthetic CapturedRoom: 4m×3m room rotated 30°, origin at (1,2). Y-up.
const th = Math.PI / 6;
const uw = { x: Math.cos(th), z: Math.sin(th) };        // width direction
const ud = { x: -Math.sin(th), z: Math.cos(th) };       // depth direction
const O = { x: 1, z: 2 };
const at = (sw, sd) => ({ x: O.x + uw.x * sw + ud.x * sd, z: O.z + uw.z * sw + ud.z * sd });
const wallT = (c, dir, cy) => [dir.x, 0, dir.z, 0, 0, 1, 0, 0, -dir.z, 0, dir.x, 0, c.x, cy, c.z, 1];
const mkWall = (c, dir, len, h) => ({ dimensions: [len, h], transform: wallT(c, dir, h / 2) });

const roomplan = {
  version: 2,
  walls: [
    mkWall(at(2, 0), uw, 4, 2.4),    // N
    mkWall(at(2, 3), uw, 4, 2.4),    // S
    mkWall(at(0, 1.5), ud, 3, 2.4),  // W
    mkWall(at(4, 1.5), ud, 3, 2.4),  // E
  ],
  doors: [
    { dimensions: [0.9, 2.04], transform: wallT(at(1.2, 0), uw, 1.02) },   // N wall, centre 1.2m
  ],
  windows: [
    { dimensions: [1.2, 1.2], transform: wallT(at(4, 1.5), ud, 1.5) },     // E wall, sill 0.9
  ],
  openings: [
    { dimensions: [1.4, 2.1], transform: wallT(at(2.0, 3), uw, 1.05) },    // S wall walkway
  ],
};

const rp = importRoomPlanJson(roomplan, '2026-07-23T00:00:00.000Z');
ok('roomplan: ok', rp.ok === true, rp.ok ? '' : rp.reason);
if (rp.ok) {
  const r = rp.scan.room;
  ok('roomplan: source roomplan', rp.scan.source === 'roomplan');
  ok('roomplan: 4000×3000 despite 30° rotation', Math.abs(r.width - 4000) <= 5 && Math.abs(r.depth - 3000) <= 5, `${r.width}x${r.depth}`);
  ok('roomplan: height 2400 measured', r.height === 2400 && rp.scan.confidence.fields.height === 'measured');
  ok('roomplan: 3 openings', r.openings.length === 3, JSON.stringify(r.openings));
  const door = r.openings.find(o => o.type === 'door');
  ok('roomplan: door on N at ~750 width 900', door && door.wall === 'N' && Math.abs(door.offsetMm - 750) <= 5 && Math.abs(door.widthMm - 900) <= 5, JSON.stringify(door));
  const win = r.openings.find(o => o.type === 'window');
  ok('roomplan: window on E at ~900 width 1200 sill 900', win && win.wall === 'E' && Math.abs(win.offsetMm - 900) <= 5 && Math.abs(win.widthMm - 1200) <= 5 && Math.abs((win.sillHeightMm ?? -1) - 900) <= 5, JSON.stringify(win));
  const walk = r.openings.find(o => o.type === 'walkway');
  ok('roomplan: walkway on S', walk && walk.wall === 'S', JSON.stringify(walk));
  ok('roomplan: openings detected', rp.scan.confidence.fields.openings === 'detected');
  ok('roomplan: confidence 0.85 no warnings', rp.scan.confidence.overall === 0.85 && rp.warnings.length === 0, JSON.stringify(rp.warnings));
}

// Wrapper unwrapping + rejects.
const wrapped = importRoomPlanJson({ capturedRoom: roomplan }, '2026-07-23T00:00:00.000Z');
ok('roomplan: unwraps {capturedRoom:...}', wrapped.ok === true);
ok('roomplan: rejects non-scan JSON', importRoomPlanJson({ hello: 1 }).ok === false);
ok('roomplan: rejects <2 walls', importRoomPlanJson({ walls: [roomplan.walls[0]] }).ok === false);


// ── Hidden-corner derivation (renovation case: floor corner blocked) ────────
// Taps on the N wall (z≈0) and W wall (x≈0), above the bench, Y dropped.
const hc = intersectWallLines({ x: 1.0, z: 0.01 }, { x: 2.0, z: -0.01 }, { x: 0.01, z: 1.0 }, { x: -0.01, z: 2.0 });
ok('hidden corner: perpendicular walls intersect near (0,0)', hc && Math.abs(hc.x) < 0.06 && Math.abs(hc.z) < 0.06, JSON.stringify(hc));
ok('hidden corner: near-parallel walls rejected', intersectWallLines({ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 0, z: 1 }, { x: 2, z: 1.1 }) === null);
ok('hidden corner: too-close taps rejected', intersectWallLines({ x: 0, z: 0 }, { x: 0.05, z: 0 }, { x: 0, z: 1 }, { x: 0, z: 2 }) === null);
const hc2 = intersectWallLines({ x: 3.0, z: 0.02 }, { x: 3.9, z: 0.0 }, { x: 4.0, z: 0.5 }, { x: 3.98, z: 1.8 });
ok('hidden corner: NE corner of 4x3 room derived', hc2 && Math.abs(hc2.x - 4.0) < 0.12 && Math.abs(hc2.z - 0.0) < 0.12, JSON.stringify(hc2));
const withHidden = buildScanFromCapture([hc, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }], {}, '2026-07-23T00:00:00.000Z');
ok('hidden corner: derived corner feeds the normal fit', withHidden.ok && Math.abs(withHidden.scan.room.width - 4000) < 80 && Math.abs(withHidden.scan.room.depth - 3000) < 80, withHidden.ok ? withHidden.scan.room.width + 'x' + withHidden.scan.room.depth : withHidden.reason);

// UI safety rails: the camera session must clean up on both normal and system
// endings, manual openings must be bounded, and every new scan must return the
// wizard to the room-confirmation step instead of reusing a stale design.
const scanRoomSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'homeowner', 'ScanRoom.tsx'), 'utf8');
const manualEntrySource = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'roomScan', 'manualEntry.ts'), 'utf8');
const wizardSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'homeowner', 'Wizard.tsx'), 'utf8');
ok('scanner UI: central session cleanup is wired', scanRoomSource.includes("session.addEventListener('end'") && scanRoomSource.includes('cleanupSessionResources();'));
ok('scanner UI: imports are size bounded', scanRoomSource.includes('MAX_ROOMPLAN_FILE_BYTES') && scanRoomSource.includes('file.size > MAX_ROOMPLAN_FILE_BYTES'));
ok(
  'scanner UI: manual openings cannot exceed a wall',
  scanRoomSource.includes('validateManualOpeningDrafts')
    && manualEntrySource.includes('offsetMm + widthMm > lengthMm'),
);
ok(
  'scanner UI: assisted wall lock keeps a manual fallback',
  scanRoomSource.includes('Smart wall lock')
    && scanRoomSource.includes('intersectDetectedWallLines')
    && scanRoomSource.includes('Use 4-point fallback'),
);
ok(
  'scanner UI: makes floor and wall plane acquisition visible',
  scanRoomSource.includes('Floor locked')
    && scanRoomSource.includes('wall plane')
    && scanRoomSource.includes('Plane matching runs on your phone'),
);
ok(
  'scanner handoff: forces room confirmation and clears stale design',
  (wizardSource.match(/step: 1,\s+design: null,\s+incomingScan: scan,/g) ?? []).length >= 2,
);

fs.rmSync(OUT, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILURES` : '\nSCANNER TWO-LANE: all assertions pass');
process.exit(fail ? 1 : 0);
