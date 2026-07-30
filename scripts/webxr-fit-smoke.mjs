// WebXR corner-fit smoke tests (scanner Phase 2 discovery).
// Runs via `npm run roomscan:test` on the bundled webxrFit module.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const F = await import(pathToFileURL(resolve('.tmp-snap-test/webxrFit.mjs')).href);
const { buildScanFromCorners, intersectDetectedWallLines, snapToPlanes } = F;

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

// 3. Noisy corner within tolerance → clean; a non-rectangular capture is rejected.
{
  const mild = buildScanFromCorners([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4.02, z: 3 }, { x: 0, z: 3 }]);
  check('20mm noise stays clean', mild.ok && mild.warnings.length === 0, mild.ok ? JSON.stringify(mild.warnings) : mild.reason);
  const rough = buildScanFromCorners([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0.4, z: 1.5 }, { x: 0, z: 3 }]);
  check('L-ish shape is rejected rather than inflated to a rectangle', !rough.ok, rough.ok ? JSON.stringify(rough.scan.room) : '');
}

// 4. Failure modes.
{
  const few = buildScanFromCorners([{ x: 0, z: 0 }, { x: 4, z: 0 }]);
  check('two corners rejected', !few.ok);
  const triangle = buildScanFromCorners([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 2, z: 3 }]);
  check('three-corner bounding box rejected', !triangle.ok);
  const tiny = buildScanFromCorners([{ x: 0, z: 0 }, { x: 0.8, z: 0 }, { x: 0.8, z: 0.5 }, { x: 0, z: 0.5 }]);
  check('tiny capture rejected', !tiny.ok);
  const shallow = buildScanFromCorners([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 0.9 }, { x: 0, z: 0.9 }]);
  check('planner-incompatible 900mm depth rejected', !shallow.ok);
  const duplicate = buildScanFromCorners([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 4.05, z: 3.02 }, { x: 0, z: 3 }]);
  check('duplicate corner rejected', !duplicate.ok);
  const crossed = buildScanFromCorners([{ x: 0, z: 0 }, { x: 4, z: 3 }, { x: 4, z: 0 }, { x: 0, z: 3 }]);
  check('self-crossing corner order rejected', !crossed.ok);
}

// 5. Assisted wall lock: one recognised plane per adjoining wall is enough
// to recover a corner hidden behind an existing kitchen.
{
  const north = { a: { x: 0.5, z: 0.01 }, b: { x: 3.6, z: -0.01 } };
  const west = { a: { x: 0.01, z: 0.4 }, b: { x: -0.01, z: 2.8 } };
  const onWall = snapToPlanes({ x: 1.4, z: 0.14 }, [north, west]);
  check('smart lock exposes the recognised wall', onWall.kind === 'wall' && onWall.line === north);

  const atCorner = snapToPlanes({ x: 0.08, z: 0.09 }, [north, west]);
  check(
    'smart lock recognises adjoining planes as a corner',
    atCorner.kind === 'corner'
      && Array.isArray(atCorner.cornerLines)
      && Math.abs(atCorner.point.x) < 0.08
      && Math.abs(atCorner.point.z) < 0.08,
    JSON.stringify(atCorner),
  );

  const assisted = intersectDetectedWallLines(north, west, { x: 0.1, z: 0.1 });
  check(
    'two detected wall planes recover the hidden corner',
    assisted !== null && Math.abs(assisted.x) < 0.08 && Math.abs(assisted.z) < 0.08,
    JSON.stringify(assisted),
  );
  check(
    'far-away plane intersections are rejected',
    intersectDetectedWallLines(north, west, { x: 4, z: 4 }, 0.5) === null,
  );
}

console.log(`webxr fit smoke: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
