import assert from 'node:assert/strict';
import {
  ENGINE_VERSION,
  defaultSpecFor,
  toRoomSpec,
} from '../src/lib/layout';
import {
  createWizardDesign,
  shouldRegenerateAutomaticStarterForStyle,
  shouldRefreshAutomaticStarter,
  upgradeWizardDesign,
} from '../src/pages/homeowner/wizardBrief';

const spec = defaultSpecFor({
  room: toRoomSpec({ width: 4800, depth: 4200, height: 2400 }),
  priorities: [],
  appliances: { dishwasher: true, fridgeWidthMm: 940 },
  island: 'if-it-fits',
  styleIds: {},
}, 'l-shape');

const oldStarter = {
  ...createWizardDesign({
    name: 'Designer recommended',
    spec,
    aiGenerated: false,
  }),
  engineVersion: 'layout-v1.1',
};

assert.equal(
  shouldRefreshAutomaticStarter(oldStarter),
  true,
  'an automatic starter from an older engine must be regenerated',
);
assert.equal(
  upgradeWizardDesign(oldStarter),
  null,
  'restoring an outdated automatic starter should clear it for candidate regeneration',
);

const currentStarter = { ...oldStarter, engineVersion: ENGINE_VERSION };
assert.equal(
  shouldRefreshAutomaticStarter(currentStarter),
  false,
  'the current automatic starter must remain stable across a reload',
);

const scandinavianStyle = {
  ...spec.style,
  familyId: 'scandinavian',
  familyVersion: 1,
  variantId: 'balanced',
};
assert.equal(
  shouldRegenerateAutomaticStarterForStyle(currentStarter, scandinavianStyle),
  true,
  'a short-link style override must rebuild an automatic starter composition',
);
const currentScandinavianStarter = {
  ...currentStarter,
  spec: { ...currentStarter.spec, style: scandinavianStyle },
};
assert.equal(
  shouldRegenerateAutomaticStarterForStyle(currentScandinavianStarter, scandinavianStyle),
  false,
  'a starter already using the selected composition must remain stable',
);

const manualEdit = {
  ...oldStarter,
  name: 'Designer recommended (edited)',
  customerEdited: true,
};
assert.equal(
  shouldRefreshAutomaticStarter(manualEdit),
  false,
  'manual cabinet edits must survive an engine upgrade',
);
assert.equal(
  shouldRegenerateAutomaticStarterForStyle(manualEdit, scandinavianStyle),
  false,
  'manual cabinet edits must not be silently replaced by a style URL',
);
assert.equal(
  upgradeWizardDesign(manualEdit)?.customerEdited,
  true,
  'manual-edit lineage must survive state migration',
);

const selectedAlternative = { ...oldStarter, name: 'Entertainer storage' };
assert.equal(
  shouldRefreshAutomaticStarter(selectedAlternative),
  false,
  'a deliberately selected alternative must not be silently replaced',
);

console.log('wizard design migration smoke: all checks passed');
