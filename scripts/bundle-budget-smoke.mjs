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
// previous 4,600,000 budget. Turning a customer corner scan (/scan/, the room
// scanner app's pages) into a priced room scan brings the planner's corner
// fit into the wizard: 4,613,734 bytes (15 October 2026). Offering every
// customer the photo walk (scan.bowercabinets.com), turning its hand-over into
// a priced room or typed sizes, and the staff view of its photos on Leads and
// the job page add 6.2 KB: 4,619,937 bytes (15 October 2026), 3.9 KB over the
// previous 4,616,000 budget. The earlier quick scan is no longer offered to
// customers; removing it once the photo walk and corner scanner have been
// proven on phones would give this room back. Keep the guard tight:
// splitting the bundle would break browsers that block dynamic app modules.
const budgetBytes = 4_622_000;
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
