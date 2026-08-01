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
  entryBytes <= 4_500_000,
  `self-contained application bundle is ${(entryBytes / 1024).toFixed(1)} KiB; budget is 4394.5 KiB`,
);

const assets = readdirSync(resolve(dist, 'assets'));
const javascriptAssets = assets.filter((name) => name.endsWith('.js'));
assert.deepEqual(javascriptAssets, [entryMatch[1].replace('assets/', '')],
  'production must remain a single JavaScript bundle so browser protections cannot block lazy route modules');

console.log(
  `bundle budget: self-contained entry ${(entryBytes / 1024).toFixed(1)} KiB`,
);
