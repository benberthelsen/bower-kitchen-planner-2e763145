import assert from 'node:assert/strict';
import {
  applianceRequirementV2Schema,
  cabinetIntentV2Schema,
  catalogItemIdentityV2Schema,
  catalogCapabilityV2Schema,
  fingerprintRuleResults,
  kitchenRuleResultV1Schema,
  regulatoryProfileV1Schema,
  resolveV1Capability,
  selectRegulatoryProfile,
  sinkRequirementV2Schema,
  V1_CATALOG_CAPABILITIES,
} from '../.tmp-snap-test/design-v2.mjs';

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures++;
    console.error(`  ✗ ${name}\n    ${error.message}`);
  }
};

console.log('designer V2 contract smoke tests');

await check('exact catalogue identity requires namespace, version and item ID', () => {
  assert.equal(catalogItemIdentityV2Schema.safeParse({ itemId: 'finish-1' }).success, false);
  assert.equal(catalogItemIdentityV2Schema.safeParse({
    sourceSystem: 'website-flatlay',
    catalogVersion: 'flatlay@2',
    itemId: 'finish-1',
    supplierSourceId: 'laminex-123',
  }).success, true);
});

await check('exact appliance records require product and source evidence', () => {
  const base = {
    requirementId: 'dishwasher-1',
    kind: 'dishwasher',
    strength: 'required',
    product: null,
    dataStatus: 'exact-model',
    quantity: 1,
    envelope: {
      applianceWidthMm: 598, applianceHeightMm: 815, applianceDepthMm: 550,
      openingWidthMm: 600, openingHeightMm: 820, openingDepthMm: 570,
      clearanceLeftMm: 1, clearanceRightMm: 1, clearanceTopMm: 5,
      clearanceRearMm: 20, clearanceFrontMm: 0, doorSwingClearanceMm: 650,
    },
    installation: 'integrated',
    services: ['water-supply', 'drain', 'gpo'],
    sourceReference: null,
  };
  assert.equal(applianceRequirementV2Schema.safeParse(base).success, false);
  assert.equal(applianceRequirementV2Schema.safeParse({
    ...base,
    product: {
      catalogRef: null,
      brand: 'Example',
      modelNumber: 'DW-1',
      name: 'Example dishwasher',
    },
    sourceReference: 'manufacturer-installation-sheet.pdf',
  }).success, true);
});

await check('exact sink records require cutout and internal-base evidence', () => {
  const result = sinkRequirementV2Schema.safeParse({
    requirementId: 'sink-1', strength: 'required', product: null,
    dataStatus: 'exact-model', installation: 'undermount', bowlCount: 2,
    overallWidthMm: 760, overallDepthMm: 440, bowlDepthMm: 200,
    cutoutWidthMm: null, cutoutDepthMm: null, minimumBaseInternalWidthMm: null,
    clipAndRailClearanceMm: null, wasteOutletFromLeftMm: null, sourceReference: null,
  });
  assert.equal(result.success, false);
});

await check('corner and filler intents require executable geometry', () => {
  assert.equal(cabinetIntentV2Schema.safeParse({
    intentId: 'corner-1', role: 'corner-base', wall: 'E', sequence: 0, strength: 'required',
  }).success, false);
  assert.equal(cabinetIntentV2Schema.safeParse({
    intentId: 'corner-1', role: 'corner-base', wall: 'E', sequence: 0, strength: 'required',
    corner: { treatment: 'blind-corner', hand: 'left', returnDepthMm: 900, minimumOpeningMm: 450 },
  }).success, true);
});

await check('current role catalogue resolves deterministically but remains quote-pending', () => {
  for (const capability of V1_CATALOG_CAPABILITIES) catalogCapabilityV2Schema.parse(capability);
  const resolved = resolveV1Capability('sink', 850);
  assert.ok(resolved);
  assert.equal(resolved.capability.definitionId, 'sink_base_2_door');
  assert.equal(resolved.resolvedWidthMm, 900);
  assert.equal(resolved.exactWidth, false);
  assert.equal(resolved.quoteReady, false);
});

await check('regulatory profile selection fails pending when project facts are absent', () => {
  const selected = selectRegulatoryProfile({
    jurisdiction: null,
    projectScope: null,
    effectiveOn: '2026-07-14',
    regulatoryProfileId: null,
  }, []);
  assert.equal(selected.status, 'pending');
});

await check('regulatory profile selection matches jurisdiction, scope and date', () => {
  const profile = regulatoryProfileV1Schema.parse({
    profileId: 'bower-regulatory-au-qld',
    version: 'review-fixture-1',
    jurisdiction: 'AU-QLD',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    projectScopes: ['full-kitchen-renovation'],
    standardsEditions: { gas: 'fixture-only' },
    qualifiedApprover: 'Test fixture approver',
    approvalDate: '2026-01-01',
    contentHash: 'a'.repeat(64),
  });
  const selected = selectRegulatoryProfile({
    jurisdiction: 'AU-QLD',
    projectScope: 'full-kitchen-renovation',
    effectiveOn: '2026-07-14',
    regulatoryProfileId: profile.profileId,
  }, [profile]);
  assert.equal(selected.status, 'matched');
});

await check('rule-result fingerprint excludes staff identity and acceptance timestamp', async () => {
  const base = kitchenRuleResultV1Schema.parse({
    ruleId: 'KRN-DW-001',
    rulePackVersion: 'bower-kitchen-layout@1.0.0',
    stage: 'concept',
    severity: 'blocker',
    status: 'excepted',
    messageKey: 'dishwasher-adjacency',
    entityIds: ['dishwasher-1', 'sink-1'],
    measured: { adjacent: false },
    required: { adjacent: true },
    repairOptions: [{
      operation: { operationId: 'repair-1', type: 'set_role_width', intentId: 'sink-base-1', widthMm: 900 },
      cost: 1,
      reason: 'Fixture repair',
    }],
    exception: {
      staffUserId: 'staff-a', reason: 'Fixture', acceptedAt: '2026-07-14T00:00:00.000Z', policyCode: 'staff-only',
    },
  });
  const changedAudit = {
    ...base,
    exception: { ...base.exception, staffUserId: 'staff-b', acceptedAt: '2026-07-15T00:00:00.000Z' },
  };
  assert.equal(await fingerprintRuleResults([base]), await fingerprintRuleResults([changedAudit]));
});

console.log(failures === 0 ? '\nAll designer V2 contract tests passed' : `\n${failures} test(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
