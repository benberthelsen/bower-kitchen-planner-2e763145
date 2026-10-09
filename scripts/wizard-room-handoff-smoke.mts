import assert from 'node:assert/strict';
import { createRoomDocument, applyRoomEdit } from '../src/lib/roomDocument';
import { readWizardRoomHandoff } from '../src/lib/homeowner/wizardRoomHandoff';

let document = createRoomDocument('hibiscus', 'Hibiscus kitchen');
const added = applyRoomEdit(document, { type: 'add-wall', wallId: 'angled', cornerId: 'end',
  lengthMm: 1600, angleDeg: 45 });
assert.equal(added.applied, true);
document = added.document;
const proposal = applyRoomEdit(document, { type: 'upsert-object', object: {
  id: 'proposed-base', layer: 'proposed', kind: 'base-cabinet',
  placement: { type: 'wall', wallId: 'angled', offsetMm: 100 },
  widthMm: 600, depthMm: 600, catalogueId: 'base_600', sizeLock: 'catalogue',
} });
assert.equal(proposal.applied, true);
document = { ...proposal.document, capture: { captureId: 'f30a8568-3e5d-420a-a4a9-90a592403937',
  sourceRevision: 'scan-v2', photoIds: ['photo-1'] } };
const now = Date.now();
const saved = { v: 5, savedAt: now, state: { roomDocument: document,
  handoffContext: { handoffId: 'handoff-1' }, roomHeight: 2633 } };
const storage = { getItem: (key: string) => key === 'bower.wizard.state.v5'
  ? JSON.stringify(saved) : null };
const imported = readWizardRoomHandoff(storage, 'handoff-1', now);
assert.ok(imported);
assert.equal(imported.document.capture?.captureId, document.capture?.captureId);
assert.equal(imported.document.capture?.photoIds?.[0], 'photo-1');
assert.equal(imported.document.objects[0].catalogueId, 'base_600');
assert.equal(imported.document.floorBoundary, undefined);
assert.equal(imported.heightMm, 2633);
assert.equal(readWizardRoomHandoff(storage, 'different-handoff', now), null);
assert.equal(readWizardRoomHandoff(storage, 'handoff-1', now + 24 * 60 * 60 * 1000 + 1), null);
assert.equal(readWizardRoomHandoff({ getItem: () => JSON.stringify({ ...saved,
  state: { ...saved.state, useManualRoomInstead: true } }) }, 'handoff-1', now), null);
console.log('Wizard wall-plan handoff preserved the open chain, proposed cabinet and capture evidence.');
