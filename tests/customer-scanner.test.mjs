// The customer room scanner at /scan/ (copied from the room-scanner repo by
// scanner:sync-customer). Its pages run only in the browser and hand the room
// to /wizard through sessionStorage 'bower.pendingScan', which the wizard
// reads with parseRoomCaptureDraft and roomDocumentFromCaptureDraft.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';

const load = async (entry) => {
  const out = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false, alias: { '@': './src' }, logLevel: 'error' });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
};
const { parseRoomCaptureDraft } = await load('src/lib/roomScan/contract.ts');
const { roomDocumentFromCaptureDraft } = await load('src/lib/roomScan/roomDocumentAdapter.ts');
const fixture = JSON.parse(await readFile(new URL('./fixtures/customer-corner-scan-draft.json', import.meta.url), 'utf8'));

test('the copied customer scanner is complete and names its room-scanner build', async () => {
  const meta = JSON.parse(await readFile('public/scan/BUILD.json', 'utf8'));
  assert.equal(meta.source, 'bower-room-scanner');
  assert.match(meta.commit, /^[0-9a-f]{40}$/);
  for (const page of ['corners', 'plan']) {
    const html = await readFile(`public/scan/${page}/index.html`, 'utf8');
    assert.ok(html.includes(`/scan/${page}/app.js?v=${meta.version}`), `${page} loads its own bundle at this build`);
    assert.match(html, /<meta name="robots" content="noindex">/);
    for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      assert.ok(url.startsWith('/scan/') || url.startsWith('/wizard'), `${page} links outside the planner flow: ${url}`);
    }
  }
});

test('the customer scanner sends nothing anywhere: no request API appears in either bundle', async () => {
  for (const page of ['corners', 'plan']) {
    // The SVG namespace identifier draws the floor plan; it is not a request.
    const code = (await readFile(`public/scan/${page}/app.js`, 'utf8')).replaceAll('http://www.w3.org/2000/svg', '');
    for (const banned of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', '/api/', 'supabase', 'http://', 'https://']) {
      assert.ok(!code.includes(banned), `${page}/app.js contains ${banned}`);
    }
  }
});

test('a room from the customer corner scan is accepted by the wizard and becomes walls in millimetres', () => {
  const parsed = parseRoomCaptureDraft(JSON.parse(JSON.stringify(fixture)));
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.reason);
  const draft = parsed.draft;
  assert.equal(draft.adapterState.access, 'device-only');
  assert.equal(draft.adapterState.captureId, undefined, 'a phone-only scan names no private scanner capture');
  assert.deepEqual(draft.photos, []);
  const document = roomDocumentFromCaptureDraft(draft, '9f1d2c3b-4a5e-4f60-8a7b-6c5d4e3f2a1b');
  const walls = document.wallChains?.flatMap((chain) => chain.walls) ?? document.walls ?? [];
  assert.equal(walls.length, 4, 'the four marked walls arrive');
  const json = JSON.stringify(document);
  assert.ok(json.includes('3600'), 'the tape-measured 3600 mm wall is kept');
});

const { isCustomerCornerScan, roomScanFromCustomerCornerScan } = await load('src/lib/roomScan/customerCornerScan.ts');

test('a customer corner scan becomes a priceable room: the measured width, the scanned depth and the AR ceiling', () => {
  const draft = parseRoomCaptureDraft(JSON.parse(JSON.stringify(fixture))).draft;
  assert.ok(isCustomerCornerScan(draft));
  const result = roomScanFromCustomerCornerScan(draft);
  assert.ok(result.ok, result.ok ? '' : result.reason);
  const { room, state } = result.scan;
  assert.equal(state, 'unconfirmed', 'the customer still confirms it on the Room step');
  assert.equal(room.shape, 'Rectangle');
  assert.equal(room.width, 3600, 'the wall measured with a tape is the width');
  const chain = draft.partialGeometry.wallChains[0].cornersMm;
  const side = (i) => Math.hypot(chain[(i + 1) % 4].x - chain[i].x, chain[(i + 1) % 4].z - chain[i].z);
  assert.ok(Math.abs(room.depth - (side(1) + side(3)) / 2) <= 1, `unmeasured depth is the scanned average (${room.depth})`);
  assert.equal(room.height, 2550, 'the AR ceiling reading is the room height');
});

test('other captures are left alone: a scanner draft, an open outline, a scan without a ceiling', () => {
  const base = parseRoomCaptureDraft(JSON.parse(JSON.stringify(fixture))).draft;
  const owner = { ...base, adapterState: { ...base.adapterState, access: 'scanner-owner-only', captureId: '3b0c5d0e-6f1a-4c2b-9d3e-7a8b9c0d1e2f' } };
  assert.equal(isCustomerCornerScan(owner), false, 'the owner\'s scanner drafts keep the capture-draft path');
  const open = structuredClone(base); open.partialGeometry.wallChains[0].closed = false;
  assert.equal(roomScanFromCustomerCornerScan(open).ok, false);
  const noCeiling = structuredClone(base); delete noCeiling.adapterState.arCeiling;
  const result = roomScanFromCustomerCornerScan(noCeiling);
  assert.ok(result.ok);
  assert.notEqual(result.scan.room.height, 2550, 'without a reading the planner uses its default height');
});
