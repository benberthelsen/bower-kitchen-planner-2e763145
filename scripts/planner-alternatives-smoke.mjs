import assert from 'node:assert/strict';
import { createPlannerAlternatives } from '../.tmp-snap-test/planner-alternatives.mjs';

const style = {
  finishId: 'polytec-coastal-oak',
  benchtopId: 'caesarstone-frosty-carrina',
  handleId: 'bar-black',
};

function brief(width = 4800, depth = 4200) {
  return {
    room: {
      width,
      depth,
      height: 2400,
      shape: 'Rectangle',
      cutoutWidth: 0,
      cutoutDepth: 0,
      openings: [],
      services: [],
    },
    household: { size: 4, cooks: 'daily' },
    priorities: ['storage'],
    appliances: {
      oven: '600',
      cooktop: 'induction',
      dishwasher: true,
      fridgeWidthMm: 940,
      microwave: 'built-in',
    },
    island: 'if-it-fits',
    styleIds: style,
  };
}

console.log('planner alternatives smoke tests');

{
  const options = createPlannerAlternatives({
    brief: brief(),
    shape: 'l-shape',
    style,
  });
  assert.ok(options.length >= 1, 'expected at least one local alternative');
  assert.ok(options.length <= 3, 'fallback returned too many alternatives');
  assert.ok(options.every(option => option.source === 'planner'), 'fallback source marker missing');
  assert.ok(options.every(option => option.proposalId.startsWith('planner:')), 'fallback proposal id is not namespaced');
  assert.ok(options.every(option => option.violations.every(v => v.severity !== 'error')), 'fallback returned a blocked layout');
  assert.ok(options.every(option => option.spec.style.finishId === style.finishId), 'chosen finish was not preserved');
}

{
  const constrained = brief(4800, 4200);
  constrained.allowedWalls = ['N'];
  constrained.wallRanges = { N: { startMm: 300, endMm: 4300 } };
  const options = createPlannerAlternatives({
    brief: constrained,
    shape: 'single-wall',
    style,
  });
  assert.ok(options.length >= 1, 'valid partial run produced no local alternative');
  for (const option of options) {
    assert.ok(option.spec.runs.every(run => run.wall === 'N'), 'fallback used a wall the customer did not select');
    assert.ok(option.spec.runs.every(run => run.startMm === 300 && run.endMm === 4300), 'fallback changed the selected run range');
  }
}

{
  const impossible = brief(3600, 4200);
  impossible.allowedWalls = ['N'];
  impossible.wallRanges = { N: { startMm: 600, endMm: 3300 } };
  const options = createPlannerAlternatives({
    brief: impossible,
    shape: 'single-wall',
    style,
  });
  assert.deepEqual(options, [], 'impossible run should return no selectable alternative');
}

console.log('All planner alternatives smoke tests passed');
