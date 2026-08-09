import assert from 'node:assert/strict';
import {
  deterministicLocalChoices,
  sanitizeLocalAiRequest,
  validateRankedChoices,
} from './local-ai-ranker.mjs';

const request = sanitizeLocalAiRequest({
  mode: 'refine',
  instruction: 'I would like more storage and drawers',
  room: { shape: 'l-shape', widthMm: 4800, depthMm: 4200, selectedWalls: ['N', 'E'] },
  candidates: [
    {
      candidateId: 'planner:l-shape/workflow',
      existingName: 'Easy workflow',
      existingRationale: 'Balanced prep space.',
      layoutFamily: 'l-shape',
      emphasis: 'workflow',
      engineScore: 94,
      cabinetRoles: ['N:sink', 'E:drawers'],
      priceBand: { lowAud: 15000, highAud: 19000 },
    },
    {
      candidateId: 'planner:l-shape/storage',
      existingName: 'More storage',
      existingRationale: 'Adds drawer and pantry capacity.',
      layoutFamily: 'l-shape',
      emphasis: 'storage',
      engineScore: 88,
      cabinetRoles: ['N:sink', 'E:drawers', 'E:pantry'],
      priceBand: { lowAud: 16000, highAud: 20500 },
    },
  ],
});

assert.deepEqual(
  deterministicLocalChoices(request).map(choice => choice.candidateId),
  ['planner:l-shape/storage', 'planner:l-shape/workflow'],
  'the local simulator should respond to a storage refinement without changing geometry',
);

assert.deepEqual(
  validateRankedChoices({
    choices: [
      { candidateId: 'invented', name: 'Invalid', rationale: 'Must be rejected.' },
      { candidateId: 'planner:l-shape/workflow', name: 'Chef workflow', rationale: 'Keeps prep zones close.' },
    ],
  }, request).map(choice => choice.candidateId),
  ['planner:l-shape/workflow'],
  'model output must be restricted to approved candidate IDs',
);

assert.throws(
  () => sanitizeLocalAiRequest({ candidates: [] }),
  /local_ai_requires_approved_candidates/,
);

console.log('local AI ranker smoke: all assertions passed');
