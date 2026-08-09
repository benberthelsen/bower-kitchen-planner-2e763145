import assert from 'node:assert/strict';
import {
  addKitchenUnit,
  cloneKitchenSpec,
  kitchenUnitWidthError,
  kitchenUnitWidthPolicy,
  moveKitchenUnit,
  removeKitchenUnit,
  replaceKitchenUnit,
  setRunWallCabinets,
  sinkCabinetMinimumWidthMm,
} from '../.tmp-snap-test/kitchen-editor.mjs';

const baseSpec = {
  runs: [{
    wall: 'N',
    wallCabinets: true,
    segments: [
      { kind: 'cabinet', role: 'sink', widthMm: 800 },
      { kind: 'cabinet', role: 'doors', widthMm: 600 },
    ],
  }],
  style: {
    finishId: 'do-designer-white',
    benchtopId: 'egger-white-carrara',
    handleId: 'handle-bar-ss',
  },
  rationale: 'Editor smoke kitchen',
};

const original = cloneKitchenSpec(baseSpec);
const replaced = replaceKitchenUnit(original, { runIndex: 0, segmentIndex: 1 }, 'drawers', 450);
assert.deepEqual(replaced.runs[0].segments[1], { kind: 'cabinet', role: 'drawers', widthMm: 450 });
assert.deepEqual(original, baseSpec, 'replace must not mutate the saved design');

const customSized = replaceKitchenUnit(
  original,
  { runIndex: 0, segmentIndex: 1 },
  'drawers',
  735,
);
assert.equal(customSized.runs[0].segments[1].widthMm, 735);
assert.equal(kitchenUnitWidthError('drawers', 735), null);

const sinkMinimum = sinkCabinetMinimumWidthMm(780, 760);
assert.equal(sinkMinimum, 880);
assert.match(
  kitchenUnitWidthError('sink', 870, sinkMinimum),
  /selected sink needs a cabinet at least 880mm/i,
);
assert.equal(kitchenUnitWidthError('sink', 880, sinkMinimum), null);

assert.equal(kitchenUnitWidthPolicy('oven-tower').custom, false);
assert.match(kitchenUnitWidthError('oven-tower', 650), /selected oven size/i);
assert.equal(kitchenUnitWidthPolicy('dishwasher').custom, false);
assert.match(kitchenUnitWidthError('dishwasher', 750), /dishwasher opening/i);
assert.equal(kitchenUnitWidthPolicy('corner').custom, false);
assert.equal(kitchenUnitWidthError('corner', 900), null);
assert.match(kitchenUnitWidthError('corner', 899), /900mm square bi-fold corner/i);
assert.match(kitchenUnitWidthError('corner', 1127), /900mm square bi-fold corner/i);

const removed = removeKitchenUnit(replaced, { runIndex: 0, segmentIndex: 1 }, 450);
assert.deepEqual(removed.runs[0].segments[1], {
  kind: 'gap',
  reason: 'Open space left by customer',
  widthMm: 450,
});

const refilled = addKitchenUnit(removed, 0, 'doors', 300);
assert.deepEqual(refilled.runs[0].segments.slice(1), [
  { kind: 'cabinet', role: 'doors', widthMm: 300 },
  { kind: 'filler', widthMm: 150 },
]);

const appended = addKitchenUnit(original, 0, 'pantry', 600);
assert.deepEqual(appended.runs[0].segments[2], {
  kind: 'cabinet',
  role: 'pantry',
  widthMm: 600,
});

const moved = moveKitchenUnit(appended, { runIndex: 0, segmentIndex: 2 }, -1);
assert.equal(moved.runs[0].segments[1].role, 'pantry');
assert.equal(moved.runs[0].segments[2].role, 'doors');

const uppersOff = setRunWallCabinets(moved, 0, false);
assert.equal(uppersOff.runs[0].wallCabinets, false);
assert.equal(moved.runs[0].wallCabinets, true, 'toggle must not mutate its input');

console.log('Kitchen editor smoke tests passed');
