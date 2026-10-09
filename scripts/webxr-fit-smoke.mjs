// WebXR corner-fit smoke tests (scanner Phase 2 discovery).
// Runs via `npm run roomscan:test` on the bundled webxrFit module.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const F = await import(pathToFileURL(resolve('.tmp-snap-test/webxrFit.mjs')).href);
const {
  buildScanFromCorners, buildScanFromCapture, intersectDetectedWallLines, snapToPlanes,
  aimFromViewerMatrix, floorPointFromRay, floorTargetFromAim, hiddenCornerFromAims, aimSeparationDeg,
  wallPlaneHeightFromRay, ceilingReading, wallTapIssue,
} = F;

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

// 3. Noisy corner within tolerance -> clean. A non-rectangular capture is KEPT
// and loudly flagged, not rejected.
//
// POLICY CHANGE (deliberate). This previously asserted `!rough.ok` — a
// non-rectangular capture was discarded outright. That behaviour lost the
// entire capture, after the customer had already marked corners, height and
// openings, for the most common real case: a kitchen inside an open-plan
// living space, where the walked outline is nothing like a rectangle. The
// contract's §3.7 rule is "never SILENTLY simplify", not "always reject", so
// the capture is now kept, the warning names the deviation in mm, and the
// confidence drops to 0.3 (below manual entry) so staff triage catches it.
// The warning is rendered in Step1Room; it is no longer invisible.
{
  const mild = buildScanFromCorners([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4.02, z: 3 }, { x: 0, z: 3 }]);
  check('20mm noise stays clean', mild.ok && mild.warnings.length === 0, mild.ok ? JSON.stringify(mild.warnings) : mild.reason);
  const rough = buildScanFromCorners([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0.4, z: 1.5 }, { x: 0, z: 3 }]);
  check('L-ish shape is kept, not discarded', rough.ok === true, rough.ok ? '' : rough.reason);
  check('L-ish shape is flagged as not rectangular',
    rough.ok && rough.warnings.some(w => w.includes('not rectangular')),
    rough.ok ? JSON.stringify(rough.warnings) : '');
  check('L-ish shape scores low confidence',
    rough.ok && rough.scan.confidence.overall <= 0.3,
    rough.ok ? String(rough.scan.confidence.overall) : '');
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

// ── Aim-ray geometry, ported from the owner's scanner (tests/corner-scan.test.mjs)
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const v3 = (x, y, z) => ({ x, y, z });
const ROOM = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }];

// 6. The aim ray meets the floor plane only when it points down and lands in range.
{
  const origin = v3(1, 1.4, 2);
  const down = floorPointFromRay({ origin, direction: v3(0, -1.4, -2) });
  check('floor ray: lands on the floor', down && near(down.x, 1) && near(down.z, 0) && near(down.rangeM, Math.hypot(1.4, 2)), JSON.stringify(down));
  check('floor ray: level aim refused', floorPointFromRay({ origin, direction: v3(0, 0, -1) }) === null);
  check('floor ray: upward aim refused', floorPointFromRay({ origin, direction: v3(0, 0.3, -1) }) === null);
  check('floor ray: under 5 degrees down refused', floorPointFromRay({ origin, direction: v3(0, -0.05, -1) }) === null);
  check('floor ray: 6 degrees down from 1.4 m is beyond 12 m', floorPointFromRay({ origin, direction: v3(0, -Math.tan(6 * Math.PI / 180), -1) }) === null);
  check('floor ray: zero direction refused', floorPointFromRay({ origin, direction: v3(0, 0, 0) }) === null);
  const raised = floorPointFromRay({ origin: v3(0, 2, 0), direction: v3(1, -1, 0) }, 0.5);
  check('floor ray: raised floor plane', raised && near(raised.x, 1.5) && near(raised.z, 0), JSON.stringify(raised));

  // The planner's corner rule: a floor-level hit wins; a benchtop hit or no
  // hit falls back to the floor ray; no aim (tracking lost) marks nothing.
  const aim = { origin, direction: v3(0, -1.4, -2) };
  const onFloor = floorTargetFromAim(v3(1.02, 0.01, 0.03), aim);
  check('corner target: floor-level hit is used', onFloor && onFloor.source === 'floor-hit' && near(onFloor.x, 1.02), JSON.stringify(onFloor));
  const bench = floorTargetFromAim(v3(1, 0.9, 0.7), aim);
  check('corner target: benchtop hit falls back to the floor ray', bench && bench.source === 'floor-ray' && near(bench.z, 0), JSON.stringify(bench));
  const noHit = floorTargetFromAim(null, aim);
  check('corner target: no hit uses the floor ray', noHit && noHit.source === 'floor-ray', JSON.stringify(noHit));
  check('corner target: tracking lost marks nothing', floorTargetFromAim(v3(1, 0, 0), null) === null);
  check('corner target: level aim with a bench hit marks nothing', floorTargetFromAim(v3(1, 0.9, 0.7), { origin, direction: v3(0, 0, -1) }) === null);

  // A viewer pose's aim is its -Z axis: the centre of the view, where the
  // reticle sits and where the viewer-space hit test points.
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.5, 1.4, -0.2, 1];
  const a = aimFromViewerMatrix(m);
  check('viewer aim: origin and -Z direction', near(a.origin.y, 1.4) && near(a.origin.x, 0.5) && near(a.direction.z, -1) && near(a.direction.y, 0), JSON.stringify(a));
}

// 7. Two aims at a hidden corner edge intersect; parallel, behind-camera and
// straight-down aims are refused.
{
  const corner = { x: 4, z: 3 };
  const from = (x, z) => ({ origin: v3(x, 1.4, z), direction: v3(corner.x - x, -0.2, corner.z - z) });
  const hit = hiddenCornerFromAims(from(1, 1), from(2.5, 0.5));
  check('two aims: corner found', hit && near(hit.x, 4, 1e-9) && near(hit.z, 3, 1e-9) && hit.angleDeg >= 15, JSON.stringify(hit));
  check('two aims: barely moved refused', hiddenCornerFromAims(from(1, 1), from(1.05, 1.02)) === null);
  check('two aims: lines meeting behind the second camera refused',
    hiddenCornerFromAims(from(1, 1), { origin: v3(2, 1.4, 1), direction: v3(1, 0, 0) }) === null);
  check('two aims: straight-down aim refused',
    hiddenCornerFromAims({ origin: v3(1, 1.4, 1), direction: v3(0, -1, 0) }, from(2.5, 0.5)) === null);
  const live = aimSeparationDeg(from(1, 1), from(2.5, 0.5));
  check('two aims: live separation matches the result', live !== null && near(live, hit.angleDeg, 1e-9));
}

// 8. Ceiling height from the aim at the wall-ceiling line of a marked wall.
{
  const aim = { origin: v3(2, 1.4, 2), direction: v3(0, 2.7 - 1.4, -2) }; // toward wall z=0 at a 2.7 m ceiling
  const result = wallPlaneHeightFromRay(aim, ROOM);
  check('wall-edge ceiling: 2700 from wall 0', result && result.heightMm === 2700 && result.wallIndex === 0 && near(result.rangeM, Math.hypot(1.3, 2)), JSON.stringify(result));
  check('wall-edge ceiling: straight up refused', wallPlaneHeightFromRay({ origin: v3(2, 1.4, 2), direction: v3(0, 1, 0) }, ROOM) === null);
  check('wall-edge ceiling: meets the wall below ceiling range', wallPlaneHeightFromRay({ origin: v3(2, 1.4, 2), direction: v3(0, 0.1, -2) }, ROOM) === null);
  check('wall-edge ceiling: needs two corners', wallPlaneHeightFromRay(aim, ROOM.slice(0, 1)) === null);
  check('wall-edge ceiling: too high refused', wallPlaneHeightFromRay({ origin: v3(2, 1.4, 2), direction: v3(0, 4, -2) }, ROOM) === null);
  const byHit = ceilingReading(v3(2, 2.55, 2), aim, ROOM);
  check('ceiling reading: a ceiling hit wins', byHit && byHit.heightMm === 2550 && byHit.source === 'ceiling-hit', JSON.stringify(byHit));
  const byWall = ceilingReading(v3(2, 1.6, 0), aim, ROOM);
  check('ceiling reading: a wall hit falls back to the wall top edge', byWall && byWall.heightMm === 2700 && byWall.source === 'wall-edge', JSON.stringify(byWall));
  check('ceiling reading: nothing without an aim or a ceiling hit', ceilingReading(v3(2, 1.6, 0), null, ROOM) === null);
}

// 9. Four-point fallback: a benchtop top, the floor or the ceiling is not a wall point.
{
  check('wall tap: wall above the benchtop accepted', wallTapIssue({ y: 1.3, normalY: 0.02 }) === null);
  check('wall tap: benchtop top refused by its normal', wallTapIssue({ y: 1.05, normalY: 0.99 }) !== null);
  check('wall tap: benchtop height refused', wallTapIssue({ y: 0.9 }) !== null);
  check('wall tap: floor refused', wallTapIssue({ y: 0.0, normalY: 1 }) !== null);
  check('wall tap: ceiling refused', wallTapIssue({ y: 2.6 }) !== null);
}

// 10. The first marked wall is canonical N whichever way round the room is
// walked. Walking the other way used to put it at S: a door on it came out
// as S, offset 2100, instead of N, offset 1000.
{
  const yaw = (23 * Math.PI) / 180;
  const T = (x, z) => ({ x: x * Math.cos(yaw) - z * Math.sin(yaw) + 1.7, z: x * Math.sin(yaw) + z * Math.cos(yaw) - 0.6 });
  const [A, B, C, D] = [T(0, 0), T(4, 0), T(4, 3), T(0, 3)];
  const doorAB = { a: T(1.0, 0.01), b: T(1.9, 0.01), type: 'door' };
  const doorAD = { a: T(0.01, 1.0), b: T(0.01, 1.9), type: 'door' };
  const at = '2026-10-09T00:00:00.000Z';
  const same = (r1, r2) => r1.ok && r2.ok
    && JSON.stringify(r1.scan.room) === JSON.stringify(r2.scan.room)
    && r1.scan.coordinateFrame.sourceToCanonicalMatrix.every((v, i) => Math.abs(v - r2.scan.coordinateFrame.sourceToCanonicalMatrix[i]) < 1e-6);
  const walks = [
    ['A→B clockwise', [A, B, C, D], [B, A, D, C], doorAB, 4000, 3000, 1000],
    ['A→D the other way', [A, D, C, B], [D, A, B, C], doorAD, 3000, 4000, 1100],
  ];
  for (const [name, forward, back, door, w, d, offset] of walks) {
    const r1 = buildScanFromCapture(forward, { openings: [door] }, at);
    const r2 = buildScanFromCapture(back, { openings: [door] }, at);
    check(`walk ${name}: both directions ok`, r1.ok && r2.ok, `${r1.reason ?? ''} ${r2.reason ?? ''}`);
    if (!r1.ok || !r2.ok) continue;
    check(`walk ${name}: first wall is the width`, r1.scan.room.width === w && r1.scan.room.depth === d, JSON.stringify(r1.scan.room));
    const o = r1.scan.room.openings[0];
    check(`walk ${name}: door on the first wall lands on N`, o && o.wall === 'N' && Math.abs(o.offsetMm - offset) <= 25 && Math.abs(o.widthMm - 900) <= 25, JSON.stringify(o));
    check(`walk ${name}: walking the same wall the other way gives the same scan`, same(r1, r2), JSON.stringify([r1.scan.room.openings, r2.scan.room.openings]));
    const m = r2.scan.coordinateFrame.sourceToCanonicalMatrix;
    check(`walk ${name}: reverse walk is a rotation, not a mirror`, Math.abs(m[0] * m[4] - m[1] * m[3] - 1e6) < 1);
  }
  // Every starting wall, both directions: the first wall is always N.
  const ring = [A, B, C, D];
  for (let start = 0; start < 4; start++) {
    const cw = [0, 1, 2, 3].map((k) => ring[(start + k) % 4]);
    const ccw = [0, 1, 2, 3].map((k) => ring[(start - k + 4) % 4]);
    for (const [dir, order] of [['clockwise', cw], ['anticlockwise', ccw]]) {
      const first = { a: { x: order[0].x * 0.7 + order[1].x * 0.3, z: order[0].z * 0.7 + order[1].z * 0.3 }, b: { x: order[0].x * 0.45 + order[1].x * 0.55, z: order[0].z * 0.45 + order[1].z * 0.55 }, type: 'door' };
      const r = buildScanFromCapture(order, { openings: [first] }, at);
      check(`walk from corner ${start} ${dir}: door on first wall is N`, r.ok && r.scan.room.openings[0]?.wall === 'N', r.ok ? JSON.stringify(r.scan.room.openings) : r.reason);
    }
  }
  // An L walked either way round from the same first wall fits identically.
  const L = [[0, 0], [4.2, 0], [4.2, 2.2], [2.6, 2.2], [2.6, 3.4], [0, 3.4]].map(([x, z]) => T(x, z));
  const l1 = buildScanFromCapture(L, {}, at);
  const l2 = buildScanFromCapture([L[1], L[0], L[5], L[4], L[3], L[2]], {}, at);
  check('walk L-shape: LShape both ways', l1.ok && l2.ok && l1.scan.room.shape === 'LShape' && l2.scan.room.shape === 'LShape');
  check('walk L-shape: same fit both ways', same(l1, l2), JSON.stringify([l1.scan?.room, l2.scan?.room]));
}

// 11. The rectangle fit is unbiased. A bounding box of noisy corners reads
// the room too large (+42 mm wide, +25 mm deep at 30 mm per-axis noise);
// the mean-line fit must hold the average error near zero. Seeded, so the
// run is identical every time; the bounding box of the same corners is
// measured too, to prove the simulation can see a bias when there is one.
{
  let seed = 20261009;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const RUNS = 4000;
  for (const sigma of [0.03, 0.05]) {
    let errW = 0, errD = 0, boxW = 0, failed = 0;
    for (let i = 0; i < RUNS; i++) {
      const W = 3 + rand() * 2;
      const D = 2.4 + rand() * 1.6;
      const th = rand() * 2 * Math.PI;
      const ox = rand() * 4 - 2;
      const oz = rand() * 4 - 2;
      const local = rand() < 0.5 ? [[0, 0], [W, 0], [W, D], [0, D]] : [[W, 0], [0, 0], [0, D], [W, D]];
      const corners = local.map(([x, z]) => ({
        x: ox + x * Math.cos(th) - z * Math.sin(th) + gauss() * sigma,
        z: oz + x * Math.sin(th) + z * Math.cos(th) + gauss() * sigma,
      }));
      const r = buildScanFromCorners(corners, '2026-10-09T00:00:00.000Z');
      if (!r.ok) { failed += 1; continue; }
      errW += r.scan.room.width - W * 1000;
      errD += r.scan.room.depth - D * 1000;
      const m = r.scan.coordinateFrame.sourceToCanonicalMatrix;
      const us = corners.map((p) => m[0] * p.x + m[1] * p.z + m[2]);
      boxW += Math.max(...us) - Math.min(...us) - W * 1000;
    }
    const n = RUNS - failed;
    const mm = Math.round(sigma * 1000);
    check(`unbiased fit ${mm}mm: every run fits`, failed === 0, String(failed));
    check(`unbiased fit ${mm}mm: mean width error near 0`, Math.abs(errW / n) < 4, (errW / n).toFixed(1));
    check(`unbiased fit ${mm}mm: mean depth error near 0`, Math.abs(errD / n) < 4, (errD / n).toFixed(1));
    check(`unbiased fit ${mm}mm: a bounding box of the same corners is biased`, boxW / n > 25, (boxW / n).toFixed(1));
    console.log(`  ${mm}mm corner noise, ${n} runs: mean width ${(errW / n).toFixed(1)}mm, depth ${(errD / n).toFixed(1)}mm (bounding box width ${(boxW / n).toFixed(1)}mm)`);
  }
}

console.log(`webxr fit smoke: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
