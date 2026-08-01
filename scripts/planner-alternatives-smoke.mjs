import assert from 'node:assert/strict';
import {
  createPlannerAlternatives,
  mergeDistinctPlannerAlternatives,
  plannerAlternativeSignature,
} from '../.tmp-snap-test/planner-alternatives.mjs';

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
  const plannerOptions = createPlannerAlternatives({ brief: brief(), shape: 'l-shape', style });
  assert.ok(plannerOptions.length >= 2, 'merge test needs distinct local alternatives');
  const serverOption = {
    ...plannerOptions[0],
    proposalId: 'ai:first',
    source: 'ai',
  };
  const duplicateServerOption = {
    ...serverOption,
    proposalId: 'ai:duplicate',
    name: 'Different wording, same kitchen',
    rationale: 'Cosmetic wording must not disguise a duplicate layout.',
  };
  const merged = mergeDistinctPlannerAlternatives(
    [serverOption, duplicateServerOption],
    plannerOptions,
    3,
  );
  assert.equal(merged[0].proposalId, 'ai:first', 'server-ranked option should remain first');
  assert.ok(merged.some(option => option.source === 'planner'), 'duplicate AI slots should be filled locally');
  assert.equal(
    new Set(merged.map(plannerAlternativeSignature)).size,
    merged.length,
    'merged alternatives must remain structurally distinct',
  );
}

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
  assert.equal(
    new Set(options.map(option => option.spec.runs.map(run =>
      `${run.wall}:${run.segments.map(segment => segment.kind === 'cabinet' ? segment.role : segment.kind).join(',')}`,
    ).join('|'))).size,
    options.length,
    'alternatives should be structurally distinct',
  );
  if (options.length >= 2) {
    const zoneSignatures = options.map(option => option.spec.runs.map(run => {
      const roles = run.segments.flatMap(segment => segment.kind === 'cabinet' ? [segment.role] : []);
      return `${run.wall}:${roles.includes('sink') ? 'sink' : ''}:${roles.includes('cooktop') ? 'cooktop' : ''}`;
    }).join('|'));
    assert.ok(new Set(zoneSignatures).size >= 2, 'comparison should include a different work-zone arrangement');
  }
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
