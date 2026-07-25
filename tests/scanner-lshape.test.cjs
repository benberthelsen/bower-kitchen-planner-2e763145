// L-shape scanner fit — regression test (scanner buildout slice 2).
// Self-transpiling like tests/scanner-two-lane.test.cjs.
// Run from repo root: node tests/scanner-lshape.test.cjs
const ts = require('typescript');
const fs = require('fs');
const os = require('os');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src', 'lib', 'roomScan');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'lfit-'));

fs.writeFileSync(path.join(OUT, 'contract.js'), `
function wallLen(w, W, D) { return w === 'N' || w === 'S' ? W : D; }
exports.parseRoomScan = function (scan) {
  const r = scan.room;
  if (!(r.width > 0 && r.depth > 0 && r.height > 0)) return { ok: false, reason: 'bad dims' };
  if (r.shape === 'Rectangle' && (r.cutoutWidth !== 0 || r.cutoutDepth !== 0)) return { ok: false, reason: 'rect cutout' };
  if (r.shape === 'LShape' && !(r.cutoutWidth > 0 && r.cutoutDepth > 0 && r.cutoutWidth < r.width && r.cutoutDepth < r.depth)) return { ok: false, reason: 'bad L cutout' };
  for (const o of r.openings) {
    if (o.offsetMm + o.widthMm > wallLen(o.wall, r.width, r.depth)) return { ok: false, reason: 'opening exceeds wall' };
  }
  const m = scan.coordinateFrame.sourceToCanonicalMatrix;
  if (!(Math.abs(m[0] * m[4] - m[1] * m[3]) > 1e-6)) return { ok: false, reason: 'bad frame' };
  if (![0, 90, 180, 270].includes(scan.coordinateFrame.snappedQuarterTurnDegrees)) return { ok: false, reason: 'bad quarter turn' };
  return { ok: true, scan };
};
`);
const js = ts.transpileModule(fs.readFileSync(path.join(SRC, 'webxrFit.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText.replace(/require\("\.\/contract"\)/g, 'require("./contract.js")');
fs.writeFileSync(path.join(OUT, 'webxrFit.js'), js);
const { buildScanFromCapture } = require(path.join(OUT, 'webxrFit.js'));

let fail = 0;
const ok = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (c ? '' : '  ' + (x ?? ''))); if (!c) fail++; };

// Source-space builder: local (u,v) → world via yaw + origin + noise.
const mk = (verts, th, O, noise = 0.02) => verts.map(([u, v], i) => ({
  x: O.x + u * Math.cos(th) - v * Math.sin(th) + ((i % 3) - 1) * noise,
  z: O.z + u * Math.sin(th) + v * Math.cos(th) + ((i % 2) - 0.5) * noise,
}));
const th = 25 * Math.PI / 180, O = { x: 1.3, z: 0.7 };

// ── Notch at as-walked SE: canonical unchanged (k=0) ──
const seL = mk([[0, 0], [4.2, 0], [4.2, 2.2], [2.6, 2.2], [2.6, 3.4], [0, 3.4]], th, O);
let r = buildScanFromCapture(seL, {}, '2026-07-25T00:00:00.000Z');
ok('SE-notch: ok', r.ok, r.ok ? '' : r.reason);
if (r.ok) {
  const room = r.scan.room;
  ok('SE-notch: LShape', room.shape === 'LShape');
  ok('SE-notch: 4200×3400', Math.abs(room.width - 4200) <= 40 && Math.abs(room.depth - 3400) <= 40, `${room.width}x${room.depth}`);
  ok('SE-notch: cutout 1600×1200', Math.abs(room.cutoutWidth - 1600) <= 60 && Math.abs(room.cutoutDepth - 1200) <= 60, `${room.cutoutWidth}x${room.cutoutDepth}`);
  ok('SE-notch: 0 quarter turns', r.scan.coordinateFrame.snappedQuarterTurnDegrees === 0);
  // Reflex vertex must land at (W−cutW, D−cutD) through the recorded affine.
  const m = r.scan.coordinateFrame.sourceToCanonicalMatrix;
  const p = seL[3];
  const cu = m[0] * p.x + m[1] * p.z + m[2], cv = m[3] * p.x + m[4] * p.z + m[5];
  ok('SE-notch: affine maps reflex vertex to inner corner',
    Math.abs(cu - (room.width - room.cutoutWidth)) <= 60 && Math.abs(cv - (room.depth - room.cutoutDepth)) <= 60,
    `(${Math.round(cu)},${Math.round(cv)})`);
}

// ── Notch at as-walked NE: one quarter turn → 3400×4200, cutout 1200×1600 ──
const neL = mk([[0, 0], [2.6, 0], [2.6, 1.2], [4.2, 1.2], [4.2, 3.4], [0, 3.4]], th, O);
r = buildScanFromCapture(neL, {}, '2026-07-25T00:00:00.000Z');
ok('NE-notch: ok + LShape', r.ok && r.scan.room.shape === 'LShape', r.ok ? '' : r.reason);
if (r.ok) {
  const room = r.scan.room;
  ok('NE-notch: rotated to 3400×4200', Math.abs(room.width - 3400) <= 40 && Math.abs(room.depth - 4200) <= 40, `${room.width}x${room.depth}`);
  ok('NE-notch: cutout 1200×1600', Math.abs(room.cutoutWidth - 1200) <= 60 && Math.abs(room.cutoutDepth - 1600) <= 60, `${room.cutoutWidth}x${room.cutoutDepth}`);
  ok('NE-notch: 90 quarter turns', r.scan.coordinateFrame.snappedQuarterTurnDegrees === 90);
  const m = r.scan.coordinateFrame.sourceToCanonicalMatrix;
  const p = neL[2];
  const cu = m[0] * p.x + m[1] * p.z + m[2], cv = m[3] * p.x + m[4] * p.z + m[5];
  ok('NE-notch: affine maps reflex vertex to inner corner',
    Math.abs(cu - (room.width - room.cutoutWidth)) <= 60 && Math.abs(cv - (room.depth - room.cutoutDepth)) <= 60,
    `(${Math.round(cu)},${Math.round(cv)})`);
}

// ── Notch at NW and SW: two and three quarter turns ──
const nwL = mk([[1.6, 0], [4.2, 0], [4.2, 3.4], [0, 3.4], [0, 1.2], [1.6, 1.2]], th, O);
r = buildScanFromCapture(nwL, {}, '2026-07-25T00:00:00.000Z');
ok('NW-notch: LShape @180', r.ok && r.scan.room.shape === 'LShape' && r.scan.coordinateFrame.snappedQuarterTurnDegrees === 180, r.ok ? r.scan.coordinateFrame.snappedQuarterTurnDegrees : r.reason);
const swL = mk([[0, 0], [4.2, 0], [4.2, 3.4], [2.6, 3.4], [2.6, 2.2], [0, 2.2]], th, O);
r = buildScanFromCapture(swL, {}, '2026-07-25T00:00:00.000Z');
ok('SW-notch: LShape @270', r.ok && r.scan.room.shape === 'LShape' && r.scan.coordinateFrame.snappedQuarterTurnDegrees === 270, r.ok ? r.scan.coordinateFrame.snappedQuarterTurnDegrees : r.reason);

// ── 4 corners: rectangle path byte-compatible ──
r = buildScanFromCapture(mk([[0, 0], [4, 0], [4, 3], [0, 3]], 0, { x: 0, z: 0 }, 0), {}, '2026-07-25T00:00:00.000Z');
ok('rect: unchanged 4000×3000 Rectangle', r.ok && r.scan.room.shape === 'Rectangle' && r.scan.room.width === 4000 && r.scan.room.depth === 3000);

// ── Sloppy 6 corners: falls back to bounding rectangle with warning ──
// A rectangle walked with two extra near-edge taps: L-fit correctly refuses
// (no notch), the rectangle path absorbs it with the six-corner warning.
const sloppy = mk([[0, 0], [2.0, 0.06], [4.2, 0], [4.2, 3.4], [2.0, 3.35], [0, 3.4]], th, O, 0);
r = buildScanFromCapture(sloppy, {}, '2026-07-25T00:00:00.000Z');
ok('sloppy-6: still ok (fallback)', r.ok, r.ok ? '' : r.reason);
ok('sloppy-6: Rectangle + honest warning', r.ok && r.scan.room.shape === 'Rectangle' && r.warnings.some(w => w.includes('did not fit a clean L')), r.ok ? JSON.stringify(r.warnings) : '');

// ── Opening on the cut-away part of an L wall is skipped ──
r = buildScanFromCapture(seL, {
  openings: [
    { a: mk([[1.0, 0.02]], th, O, 0)[0], b: mk([[1.9, 0.02]], th, O, 0)[0], type: 'door' },      // N wall, valid
    { a: mk([[4.18, 2.6]], th, O, 0)[0], b: mk([[4.18, 3.2]], th, O, 0)[0], type: 'window' },    // E-plane but in the notch void
  ],
}, '2026-07-25T00:00:00.000Z');
ok('L openings: valid door kept', r.ok && r.scan.room.openings.length === 1 && r.scan.room.openings[0].type === 'door', r.ok ? JSON.stringify(r.scan.room.openings) : r.reason);
ok('L openings: void window skipped + warned', r.ok && r.warnings.some(w => w.includes('cut-away')), r.ok ? JSON.stringify(r.warnings) : '');

fs.rmSync(OUT, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILURES` : '\nL-SHAPE SCANNER FIT: all assertions pass');
process.exit(fail ? 1 : 0);
