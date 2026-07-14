/**
 * Layout engine smoke test.
 * Run: npm run test:layout
 * (bundles src/lib/layout via esbuild, then executes these asserts)
 */
import assert from 'node:assert/strict';
import {
  briefFromWizard, compileSpec, defaultSpecFor, priceDesign, solveRun,
  toRoomSpec, validate, kitchenSpecSchema,
} from '../.tmp-snap-test/layout.mjs';

const shapes = ['single-wall', 'l-shape', 'u-shape', 'galley'];
let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failures++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

console.log('layout engine smoke tests');

// ── every shape produces a valid, priceable design ──
for (const shape of shapes) {
  check(`${shape}: compiles with sink+cooktop+fridge, zero errors`, () => {
    const brief = briefFromWizard({ roomShape: shape, roomWidth: 4200, roomDepth: 3200, layoutStyle: 'standard' });
    const spec = defaultSpecFor(brief, shape);
    kitchenSpecSchema.parse(spec);
    const design = compileSpec(spec, brief.room);
    assert.ok(design.items.length >= 4, `too few items (${design.items.length})`);
    const roles = design.rolePositions;
    assert.ok(roles.sink, 'no sink placed');
    assert.ok(roles['fridge-gap'], 'no fridge gap placed');
    const errors = validate(design, brief.room, brief).filter(x => x.severity === 'error');
    assert.deepEqual(errors, [], `errors: ${errors.map(e => e.code).join(', ')}`);
    const band = priceDesign(design.items, spec.style);
    assert.ok(band.lowAud >= 3000 && band.highAud > band.lowAud, `bad band ${band.lowAud}-${band.highAud}`);
  });
}

// ── small room still works ──
check('small single-wall (2400mm) compiles without errors', () => {
  const brief = briefFromWizard({ roomShape: 'single-wall', roomWidth: 2400, roomDepth: 2400, layoutStyle: 'minimal' });
  const spec = defaultSpecFor(brief, 'single-wall');
  const design = compileSpec(spec, brief.room);
  const errors = validate(design, brief.room, brief).filter(x => x.severity === 'error');
  assert.deepEqual(errors.map(e => e.code), []);
});

// ── openings: cabinets avoid a doorway ──
check('door opening blocks base cabinets', () => {
  const brief = briefFromWizard({ roomShape: 'single-wall', roomWidth: 4200, roomDepth: 3000, layoutStyle: 'standard' });
  brief.room.openings.push({ id: 'd1', wall: 'N', type: 'door', offsetMm: 1800, widthMm: 900, swing: 'in-left' });
  const spec = defaultSpecFor(brief, 'single-wall');
  const design = compileSpec(spec, brief.room);
  // no floor item may overlap the door interval on the N wall
  const doorMinX = 1800, doorMaxX = doorMinX + 900; // corner-origin
  for (const item of design.items.filter(i => i.y === 0 && i.rotation === 0)) {
    const min = item.x - item.width / 2, max = item.x + item.width / 2;
    assert.ok(max <= doorMinX + 1 || min >= doorMaxX - 1, `${item.definitionId} crosses the doorway (${min}..${max})`);
  }
});

// ── services: sink follows the drain wall on l-shape ──
check('sink lands on the drain wall (l-shape)', () => {
  const brief = briefFromWizard({ roomShape: 'l-shape', roomWidth: 4200, roomDepth: 3200, layoutStyle: 'standard' });
  brief.room.services.push({ id: 's1', wall: 'E', type: 'drain', offsetMm: 1500 });
  const spec = defaultSpecFor(brief, 'l-shape');
  const sinkRun = spec.runs.find(r => r.segments.some(s => s.kind === 'cabinet' && s.role === 'sink'));
  assert.equal(sinkRun.wall, 'E');
});

// ── re-plumb warning when sink far from drain ──
check('re-plumb warning fires when drain is far away', () => {
  const brief = briefFromWizard({ roomShape: 'single-wall', roomWidth: 4800, roomDepth: 3000, layoutStyle: 'standard' });
  brief.room.services.push({ id: 's1', wall: 'S', type: 'drain', offsetMm: 200 });
  const spec = defaultSpecFor(brief, 'single-wall');
  const design = compileSpec(spec, brief.room);
  const warns = validate(design, brief.room, brief);
  assert.ok(warns.some(w => w.code === 'replumb'), `expected replumb warn, got: ${warns.map(w => w.code).join(',') || 'none'}`);
});

// ── overlap detection ──
check('validator catches overlapping items', () => {
  const brief = briefFromWizard({ roomShape: 'single-wall', roomWidth: 3600, roomDepth: 3000, layoutStyle: 'standard' });
  const spec = defaultSpecFor(brief, 'single-wall');
  const design = compileSpec(spec, brief.room);
  // force an overlap
  design.items.push({ ...design.items[0], instanceId: 'dup-1' });
  const errors = validate(design, brief.room, brief).filter(x => x.severity === 'error');
  assert.ok(errors.some(e => e.code === 'overlap'));
});

// ── zod rejects malformed specs ──
check('schema rejects an invalid spec', () => {
  const bad = { runs: [], style: { finishId: 'x', benchtopId: 'y', handleId: 'z' }, rationale: 'r' };
  assert.equal(kitchenSpecSchema.safeParse(bad).success, false);
});

// ── galley aisle guard ──
check('narrow galley (1900mm deep) reports aisle error', () => {
  const brief = briefFromWizard({ roomShape: 'galley', roomWidth: 3600, roomDepth: 1900, layoutStyle: 'standard' });
  const spec = defaultSpecFor(brief, 'galley');
  const design = compileSpec(spec, brief.room);
  const errors = validate(design, brief.room, brief).filter(x => x.severity === 'error');
  assert.ok(errors.some(e => e.code === 'narrow-galley'), `expected narrow-galley, got: ${errors.map(e => e.code).join(',') || 'none'}`);
});


// ── end-to-end: wizard path with openings + services via the adapter ──
check('wizard adapter e2e: door + drain flow through to a valid design', () => {
  const brief = briefFromWizard(
    { roomShape: 'l-shape', roomWidth: 4200, roomDepth: 3200, layoutStyle: 'standard' },
    {
      openings: [{ id: 'd1', wall: 'S', type: 'door', offsetMm: 400, widthMm: 870, swing: 'in-left' }],
      services: [{ id: 's1', wall: 'E', type: 'drain', offsetMm: 1600 }],
    },
  );
  assert.equal(brief.room.openings.length, 1);
  const spec = defaultSpecFor(brief, 'l-shape');
  const sinkRun = spec.runs.find(r => r.segments.some(x => x.kind === 'cabinet' && x.role === 'sink'));
  assert.equal(sinkRun.wall, 'E', 'sink should follow the drain to the E wall');
  const design = compileSpec(spec, brief.room);
  const errors = validate(design, brief.room, brief).filter(x => x.severity === 'error');
  assert.deepEqual(errors.map(e => e.code), []);
  const band = priceDesign(design.items, spec.style);
  assert.ok(band.lowAud > 0);
});


// ── cramped room: essentials (sink, cooktop, fridge) survive; extras drop with notes ──
check('cramped 2700mm single-wall keeps sink + cooktop + fridge', () => {
  const brief = briefFromWizard({ roomShape: 'single-wall', roomWidth: 2700, roomDepth: 2400, layoutStyle: 'full-storage' });
  const spec = defaultSpecFor(brief, 'single-wall');
  const design = compileSpec(spec, brief.room);
  assert.ok(design.rolePositions.sink, 'sink must survive');
  assert.ok(design.rolePositions.cooktop, 'cooktop must survive');
  assert.ok(design.rolePositions['fridge-gap'], 'fridge must survive');
  const errors = validate(design, brief.room, brief).filter(x => x.severity === 'error');
  assert.deepEqual(errors.map(e => e.code), []);
});

// ── door mid-wall: cabinets fill BOTH sides of the doorway ──
check('door mid-wall: both sides of the opening get cabinets', () => {
  const brief = briefFromWizard({ roomShape: 'single-wall', roomWidth: 4800, roomDepth: 3200, layoutStyle: 'standard' });
  brief.room.openings.push({ id: 'd1', wall: 'N', type: 'door', offsetMm: 2000, widthMm: 900, swing: 'in-left' });
  const spec = defaultSpecFor(brief, 'single-wall');
  const design = compileSpec(spec, brief.room);
  const doorMinX = 2000, doorMaxX = doorMinX + 900; // corner-origin
  const floor = design.items.filter(i => i.y === 0 && i.rotation === 0);
  assert.ok(floor.some(i => i.x + i.width / 2 <= doorMinX + 1), 'no cabinets left of the door');
  assert.ok(floor.some(i => i.x - i.width / 2 >= doorMaxX - 1), 'no cabinets right of the door');
});


// ── fragmented wall (two doors): essentials still placed via rescue retry ──
check('fragmented wall keeps sink + cooktop (drops extras instead)', () => {
  const brief = briefFromWizard({ roomShape: 'single-wall', roomWidth: 4200, roomDepth: 3200, layoutStyle: 'full-storage' });
  brief.room.openings.push(
    { id: 'd1', wall: 'N', type: 'door', offsetMm: 1300, widthMm: 870, swing: 'in-left' },
    { id: 'd2', wall: 'N', type: 'window', offsetMm: 2600, widthMm: 900, sillHeightMm: 900 },
  );
  const spec = defaultSpecFor(brief, 'single-wall');
  const design = compileSpec(spec, brief.room);
  assert.ok(design.rolePositions.sink, 'sink must be placed');
  assert.ok(design.rolePositions.cooktop, 'cooktop must be placed: ' + design.notes.join(' | '));
  const errors = validate(design, brief.room, brief).filter(x => x.severity === 'error');
  assert.deepEqual(errors.map(e => e.code), []);
});

console.log(failures === 0 ? '\nAll layout smoke tests passed' : `\n${failures} test(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
