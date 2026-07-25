// Plane-detection snapping maths — regression test.
// Run from repo root: node tests/plane-snap.test.cjs
const ts = require('typescript');
const fs = require('fs');
const os = require('os');
const path = require('path');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'psnap-'));
fs.writeFileSync(path.join(OUT, 'contract.js'), 'exports.parseRoomScan = (s) => ({ ok: true, scan: s });');
const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'src/lib/roomScan/webxrFit.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText.replace(/require\("\.\/contract"\)/g, 'require("./contract.js")');
fs.writeFileSync(path.join(OUT, 'webxrFit.js'), js);
const { dominantLine, snapToPlanes } = require(path.join(OUT, 'webxrFit.js'));

let fail = 0;
const ok = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (c ? '' : '  ' + (x ?? ''))); if (!c) fail++; };

// dominantLine: wall polygon → its long axis; noise fragment → null.
const wall = dominantLine([{ x: 0, z: 0.01 }, { x: 3.2, z: -0.01 }, { x: 3.1, z: 0.02 }, { x: 0.2, z: 0 }]);
ok('dominantLine: 3.2m wall found', wall && Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z) > 3.1, JSON.stringify(wall));
ok('dominantLine: 0.3m fragment rejected', dominantLine([{ x: 0, z: 0 }, { x: 0.3, z: 0 }]) === null);

// Two perpendicular walls meeting at (0,0); tap drifts 15cm into the room.
const lines = [
  { a: { x: 0.1, z: 0.01 }, b: { x: 3.0, z: -0.01 } },   // N wall along x, z≈0
  { a: { x: 0.01, z: 0.2 }, b: { x: -0.01, z: 2.5 } },   // W wall along z, x≈0
];
const c = snapToPlanes({ x: 0.15, z: 0.12 }, lines);
ok('corner snap: drifted tap locks to wall intersection', c.kind === 'corner' && Math.abs(c.point.x) < 0.05 && Math.abs(c.point.z) < 0.05, JSON.stringify(c));

// Mid-wall tap: snaps onto the line, keeps its along-wall position.
const w = snapToPlanes({ x: 1.5, z: 0.2 }, lines);
ok('wall snap: pulled onto the wall line', w.kind === 'wall' && Math.abs(w.point.z) < 0.03 && Math.abs(w.point.x - 1.5) < 0.05, JSON.stringify(w));

// Slack: tap just past the detected extent still snaps (planes grow late).
const e = snapToPlanes({ x: 3.3, z: 0.1 }, [lines[0]]);
ok('extent slack: tap 0.3m past detected end still snaps', e.kind === 'wall', JSON.stringify(e));

// Far from any wall: untouched.
const f = snapToPlanes({ x: 1.5, z: 1.5 }, lines);
ok('open floor: no snap, point unchanged', f.kind === 'none' && f.point.x === 1.5 && f.point.z === 1.5);

// Parallel walls close together (e.g. detected twice): no bogus corner.
const par = snapToPlanes({ x: 1.0, z: 0.05 }, [lines[0], { a: { x: 0, z: 0.1 }, b: { x: 3, z: 0.1 } }]);
ok('parallel planes: wall snap, never a fake corner', par.kind === 'wall', JSON.stringify(par));

fs.rmSync(OUT, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILURES` : '\nPLANE SNAP: all assertions pass');
process.exit(fail ? 1 : 0);
