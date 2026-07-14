// Auto-placement smoke tests (refine F-6/F-8). Runs after snapping-smoke via
// `npm run test:snapping` on the same esbuild bundle.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const S = await import(pathToFileURL(resolve('.tmp-snap-test/snap.mjs')).href);
const { findAutoWallPlacement } = S;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const room = (openings = []) => ({
  width: 3600, depth: 3000, height: 2700,
  shape: 'Rectangle', cutoutWidth: 0, cutoutDepth: 0, openings, services: [],
});
const base = { width: 600, depth: 575, category: 'Base', obstacles: [] };

// 1. Empty room → back wall, back against it (z = gap + depth/2), rot 0.
{
  const p = findAutoWallPlacement({ room: room(), ...base });
  check('empty room → N wall', p?.wall === 'N' && p.rotation === 0, JSON.stringify(p));
  check('back sits on the wall line', p && Math.abs(p.z - (10 + 575 / 2)) < 1, JSON.stringify(p));
  check('starts at the left corner', p && Math.abs(p.x - (10 + 300)) < 1, JSON.stringify(p));
}

// 2. Second cabinet continues the run with clearance, no overlap.
{
  const first = { x: 310, z: 297.5, rotation: 0, width: 600, depth: 575, blocksFloor: true, blocksWall: false };
  const p = findAutoWallPlacement({ room: room(), ...base, obstacles: [first] });
  check('second base continues N run', p?.wall === 'N' && p.x > 610, JSON.stringify(p));
}

// 3. Door on the N wall → base skips the doorway.
{
  const p = findAutoWallPlacement({
    room: room([{ id: 'd', wall: 'N', type: 'door', offsetMm: 0, widthMm: 900 }]),
    ...base,
  });
  check('base clears N-wall doorway', p?.wall === 'N' && p.x - 300 >= 900, JSON.stringify(p));
}

// 4. Window on the N wall: base ignores it; wall cabinet skips it.
{
  const win = [{ id: 'w', wall: 'N', type: 'window', offsetMm: 0, widthMm: 1500, heightMm: 1200, sillHeightMm: 900 }];
  const pBase = findAutoWallPlacement({ room: room(win), ...base });
  check('base places under window', pBase?.wall === 'N' && pBase.x < 900, JSON.stringify(pBase));
  const pWall = findAutoWallPlacement({ room: room(win), width: 600, depth: 350, category: 'Wall', obstacles: [] });
  check('wall cabinet clears window', pWall?.wall === 'N' && pWall.x - 300 >= 1500, JSON.stringify(pWall));
}

// 5. N wall fully blocked → falls to W wall with rotation 270.
{
  const full = { x: 1800, z: 297.5, rotation: 0, width: 3600, depth: 575, blocksFloor: true, blocksWall: false };
  const p = findAutoWallPlacement({ room: room(), ...base, obstacles: [full] });
  check('full N wall → W wall rot 270', p?.wall === 'W' && p.rotation === 270 && Math.abs(p.x - (10 + 575 / 2)) < 1, JSON.stringify(p));
}

// 6. Wall cabinet ignores base run below (different level).
{
  const baseRun = { x: 1800, z: 297.5, rotation: 0, width: 3600, depth: 575, blocksFloor: true, blocksWall: false };
  const p = findAutoWallPlacement({ room: room(), width: 600, depth: 350, category: 'Wall', obstacles: [baseRun] });
  check('wall cabinet shares wall above base run', p?.wall === 'N', JSON.stringify(p));
}

// 7. Tall respects BOTH levels (blocked by wall cabinets too).
{
  const wallRun = { x: 1800, z: 185, rotation: 0, width: 3600, depth: 350, blocksFloor: false, blocksWall: true };
  const p = findAutoWallPlacement({ room: room(), width: 600, depth: 580, category: 'Tall', obstacles: [wallRun] });
  check('tall avoids wall-cabinet run', p?.wall !== 'N', JSON.stringify(p));
}

// 8. Room too small everywhere → null (caller falls back).
{
  const tiny = { width: 500, depth: 500, height: 2700, shape: 'Rectangle', cutoutWidth: 0, cutoutDepth: 0, openings: [], services: [] };
  const p = findAutoWallPlacement({ room: tiny, ...base });
  check('impossible room returns null', p === null, JSON.stringify(p));
}

console.log(`autoplace smoke: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
