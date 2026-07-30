import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const catalog = await import(pathToFileURL(resolve('.tmp-snap-test/homeowner-catalog.mjs')).href);
const constants = await import(pathToFileURL(resolve('.tmp-snap-test/homeowner-constants.mjs')).href);
const useCatalogSource = readFileSync('src/hooks/useCatalog.ts', 'utf8');
const wizardSource = readFileSync('src/pages/homeowner/Wizard.tsx', 'utf8');
const designStepSource = readFileSync('src/pages/homeowner/steps/StepDesign.tsx', 'utf8');

const families = catalog.HOMEOWNER_CABINET_FAMILIES;
assert.ok(families.length >= 20 && families.length <= 30, 'homeowner catalogue must stay curated');
assert.equal(new Set(families.map(family => family.id)).size, families.length, 'family ids must be unique');

for (const family of families) {
  assert.ok(family.name && family.purpose, `${family.id} requires customer-facing copy`);
  assert.ok(family.variants.length > 0, `${family.id} requires a renderable variant`);
  const supported = family.variants.flatMap(variant => variant.widthsMm);
  assert.ok(supported.includes(family.defaultWidthMm), `${family.id} default width must be supported`);
  for (const variant of family.variants) {
    assert.match(variant.definitionId, /^[a-z0-9_]+$/);
    assert.ok(useCatalogSource.includes(`'${variant.definitionId}'`), `${variant.definitionId} missing from render catalogue`);
    assert.ok(variant.widthsMm.every(width => Number.isInteger(width) && width >= 150 && width <= 1200));
  }
}

assert.equal(constants.FINISH_OPTIONS.length, 10);
assert.equal(constants.BENCHTOP_OPTIONS.length, 8);
for (const material of [...constants.FINISH_OPTIONS, ...constants.BENCHTOP_OPTIONS]) {
  assert.ok(material.supplier && material.supplierCode, `${material.id} requires supplier identity`);
  assert.ok(material.swatchUrl && material.textureUrl, `${material.id} requires visual assets`);
  assert.ok(existsSync(`public${material.swatchUrl}`), `${material.id} swatch asset is missing`);
  assert.ok(existsSync(`public${material.textureUrl}`), `${material.id} texture asset is missing`);
  assert.ok(material.textureRepeatMm?.width > 0 && material.textureRepeatMm?.height > 0);
}

assert.equal(catalog.HOMEOWNER_CABINET_CATALOG_VERSION, 'homeowner-catalog-v1');
assert.ok(!wizardSource.includes('function LeadGate('), '3D design must not be hidden behind contact capture');
assert.ok(wizardSource.includes('{state.step === 5 && ('), 'Design step must render directly at step 5');
assert.ok(wizardSource.includes('Request my free quote'), 'contact capture belongs at the quote request');
assert.ok(designStepSource.includes('OptionPlanPreview'), 'AI alternatives require a visual plan preview');
console.log(`homeowner contracts: ${families.length} cabinet families, ${constants.FINISH_OPTIONS.length} finishes, ${constants.BENCHTOP_OPTIONS.length} benchtops`);
