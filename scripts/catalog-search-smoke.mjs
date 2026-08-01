import { matchesCatalogSearch } from '../.tmp-snap-test/catalog-search.mjs';

const fields = ['Base Applied Panel', 'Panels', 'BASE_APPLIED_PANEL', 'end gable side panel'];
const checks = [
  ['misspelt panel', matchesCatalogSearch('base end panle', fields)],
  ['alternate gable name', matchesCatalogSearch('base gable', fields)],
  ['misspelt cabinet', matchesCatalogSearch('base cabnet', [...fields, 'base cabinet'])],
  ['rangehood aliases', matchesCatalogSearch('rhange hoo', ['wall rangehood cabinet', 'extractor'])],
  ['unrelated product excluded', !matchesCatalogSearch('drawer runner', fields)],
];

let failures = 0;
for (const [name, passed] of checks) {
  if (!passed) failures += 1;
  console.log(`${passed ? 'PASS' : 'FAIL'}  catalog search: ${name}`);
}
if (failures) process.exit(1);

