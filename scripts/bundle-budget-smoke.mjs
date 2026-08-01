import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve('dist');
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
const entryMatch = html.match(/<script[^>]+src="\/(assets\/index-[^"]+\.js)"/);
assert.ok(entryMatch, 'production entry chunk was not found in dist/index.html');

const entryPath = resolve(dist, entryMatch[1]);
const entryBytes = statSync(entryPath).size;
assert.ok(
  entryBytes <= 600_000,
  `initial application chunk is ${(entryBytes / 1024).toFixed(1)} KiB; budget is 585.9 KiB`,
);

const assets = readdirSync(resolve(dist, 'assets'));
const blockerProneRouteNames = assets.filter((name) =>
  /(?:Dashboard|Analytics|Trade|Admin|JobEditor|RoomPlanner).*\.js$/i.test(name),
);
assert.deepEqual(
  blockerProneRouteNames,
  [],
  `route chunks expose blocker-prone names: ${blockerProneRouteNames.join(', ')}`,
);
const wizard = assets.find((name) => /^Wizard-.*\.js$/.test(name));
assert.ok(wizard, 'homeowner wizard route chunk is missing');
const wizardBytes = statSync(resolve(dist, 'assets', wizard)).size;
assert.ok(
  wizardBytes <= 150_000,
  `homeowner wizard route chunk is ${(wizardBytes / 1024).toFixed(1)} KiB; budget is 146.5 KiB`,
);

console.log(
  `bundle budget: entry ${(entryBytes / 1024).toFixed(1)} KiB, wizard ${(wizardBytes / 1024).toFixed(1)} KiB`,
);
