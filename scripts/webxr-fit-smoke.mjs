// WebXR corner-fit smoke tests (scanner Phase 2 discovery).
// Runs via `npm run roomscan:test` on the bundled webxrFit module.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const F = await import(pathToFileURL(resolve('.tmp-snap-test/webxrFit.mjs')).href);
const { buildScanFromCorners } = F;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const apply = (m, p) => ({ x: m[0] * p.x + m[1] * p.z + m[2], z: m[3] * p.x + m[4] * p.z + m[5] });

// 1. Axis-aligned 4×3m room.
{
  const r = buildScanFromCorners([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }]);
  check('square room ok', r.ok, r.ok ? '' : r.reason);
  check('square dims 4000×3000', r.ok && r.scan.room.width === 4000 && r.scan.room.depth === 3000, r.ok ? JSON.stringify(r.scan.room) : '');
  check('square unconfirmed webxr', r.ok && r.scan.state === 'unconfirmed' && r.scan.source === 'webxr');
  check('square no warnings', r.ok && r.warnings.length === 0);
}

// 2. Same room rotated 37° and offset — dims identical, corners map into the box.
{
  const yaw = (37 * Math.PI) / 180;
  const rot = (x, z) => ({ x: x * Math.cos(yaw) - z * Math.sin(yaw) + 2.5, z: x * Math.sin(yaw) + z * Math.cos(yaw) - 1.2 });
  const src = [rot(0, 0), rot(4, 0), rot(4, 3), rot(0, 3)];
  const r = buildScanFromCorners(src);
  check('rotated room ok', r.ok, r.ok ? '' : r.reason);
  check('rotated dims 4000×3000', r.ok && r.scan.room.width === 4000 && r.scan.room.depth === 3000, r.ok ? JSON.stringify(r.scan.room) : '');
  if (r.ok) {
    const m = r.scan.coordinateFrame.sourceToCanonicalMatrix;
    const det = m[0] * m[4] - m[1] * m[3];
    check('rotated det ≈ +1e6', Math.abs(det - 1e6) < 1, String(det));
    let inBox = true;
    for (const p of src) {
      const q = apply(m, p);
      if (q.x < -1 || q.x > 4001 || q.z < -1 || q.z > 3001) inBox = false;
    }
    check('rotated corners map into canonical box', inBox);
  }
}

// 3. Noisy corner within tolerance → clean; big deviation → warned, capped confidence.
{
  const mild = buildScanFromCorners([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4.02, z: 3 }, { x: 0, z: 3 }]);
  check('20mm noise stays clean', mild.ok && mild.warnings.length === 0, mild.ok ? JSON.stringify(mild.warnings) : mild.reason);
  const rough = buildScanFromCorners([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0.4, z: 1.5 }, { x: 0, z: 3 }]);
  check('L-ish shape warns + caps confidence', rough.ok && rough.warnings.length === 1 && rough.scan.confidence.overall === 0.5, rough.ok ? JSON.stringify(rough.warnings) : rough.reason);
}

// 4. Failure modes.
{
  const few = buildScanFromCorners([{ x: 0, z: 0 }, { x: 4, z: 0 }]);
  check('two corners rejected', !few.ok);
  const tiny = buildScanFromCorners([{ x: 0, z: 0 }, { x: 0.8, z: 0 }, { x: 0.8, z: 0.5 }, { x: 0, z: 0.5 }]);
  check('tiny capture rejected', !tiny.ok);
}

console.log(`webxr fit smoke: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
