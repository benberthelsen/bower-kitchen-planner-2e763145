import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve('dist');
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
const entryMatch = html.match(/<script[^>]+src="\/(assets\/index-[^"]+\.js)"/);
assert.ok(entryMatch, 'production entry chunk was not found in dist/index.html');

const entryPath = resolve(dist, entryMatch[1]);
const entryBytes = statSync(entryPath).size;
// The shared geometry editor, Wizard-to-trade save, exact cabinet-edit
// validation, mobile sheets and the scanner evidence panel add a small
// allowance to the original budget (the release build measured 4,579,840
// bytes on 8 October 2026). The quick scan's floor-ray and two-aim corners,
// confirmed wall-edge ceiling, tracking check and editable saved progress
// take the build to 4,606,193 bytes (9 October 2026), 6.2 KB over the
// previous 4,600,000 budget. Keep the guard tight: splitting the bundle would
// break browsers that block dynamic app modules.
const budgetBytes = 4_612_000;
assert.ok(
  entryBytes <= budgetBytes,
  `self-contained application bundle is ${(entryBytes / 1024).toFixed(1)} KiB; budget is ${(budgetBytes / 1024).toFixed(1)} KiB`,
);

const assets = readdirSync(resolve(dist, 'assets'));
const javascriptAssets = assets.filter((name) => name.endsWith('.js'));
assert.deepEqual(javascriptAssets, [entryMatch[1].replace('assets/', '')],
  'production must remain a single JavaScript bundle so browser protections cannot block lazy route modules');

console.log(
  `bundle budget: self-contained entry ${(entryBytes / 1024).toFixed(1)} KiB`,
);
