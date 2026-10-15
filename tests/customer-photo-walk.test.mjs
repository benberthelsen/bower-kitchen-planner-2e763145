// The customer photo walk at https://scan.bowercabinets.com. The customer's
// browser posts the room to create-planner-handoff and opens
// /wizard?handoff=<id>#handoffToken=<token>; the wizard reads it with
// parseLegacyWebsitePlannerHandoff and resolveRoomCapture. Bower staff then
// read the walk's photos from that scanner with their own sign-in.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';

const load = async (entry) => {
  const out = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false, alias: { '@': './src' }, logLevel: 'error' });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
};
const contract = await load('src/lib/roomScan/contract.ts');
const { resolveRoomCapture } = await load('src/lib/roomScan/roomDocumentAdapter.ts');
const { CUSTOMER_PHOTOS_SAVED, customerRoomOutcome, isCustomerScannerDraft } = await load('src/lib/roomScan/customerCornerScan.ts');
const { roomStepReady } = await load('src/lib/homeowner/roomStepGate.ts');
const layout = await load('src/lib/layout/index.ts');
const photos = await load('src/lib/roomScan/customerScanPhotos.ts');

const fixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
/** The hand-over exactly as the scanner sends it (shared interface). */
const handOver = async (name) => {
  const parsed = contract.parseWebsitePlannerHandoff({
    handoffSchemaVersion: contract.HANDOFF_SCHEMA_VERSION, source: 'website', roomType: 'kitchen',
    styleTags: [], materials: {}, roomCaptureDraft: await fixture(name),
  });
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.reason);
  // The wizard reads it through the tolerant reader; nothing is stripped.
  const read = contract.parseLegacyWebsitePlannerHandoff(JSON.parse(JSON.stringify(parsed.handoff)));
  assert.ok(read.ok);
  assert.deepEqual(read.issues, []);
  return read.handoff;
};
const complete = await handOver('customer-photo-walk-complete');
const incomplete = await handOver('customer-photo-walk-incomplete');

/** What the wizard's hand-over effect does with the capture. */
function wizardReceives(handoff) {
  const capture = resolveRoomCapture(handoff, 'handoff-id');
  assert.equal(capture.kind, 'draft');
  const outcome = customerRoomOutcome(capture.draft);
  return { capture, outcome };
}

test('a complete photo walk becomes an unconfirmed room scan the customer checks and prices', () => {
  const { capture, outcome } = wizardReceives(complete);
  assert.ok(isCustomerScannerDraft(capture.draft));
  assert.equal(outcome?.kind, 'scan');
  const scan = outcome.scan;
  assert.ok(contract.parseRoomScan(scan).ok, 'a valid RoomScanV1');
  assert.equal(scan.state, 'unconfirmed', 'the customer still checks it on the Room step');
  assert.equal(scan.room.shape, 'Rectangle');
  assert.equal(scan.room.width, 4200, 'the tape-measured wall is the width');
  const corners = capture.draft.partialGeometry.wallChains[0].cornersMm;
  const side = (i) => Math.hypot(corners[(i + 1) % 4].x - corners[i].x, corners[(i + 1) % 4].z - corners[i].z);
  assert.ok(Math.abs(scan.room.depth - (side(1) + side(3)) / 2) <= 1, `unmeasured depth is the scanned average (${scan.room.depth})`);
  assert.equal(scan.room.height, 2580, 'the AR ceiling reading is the room height');

  // Sending the enquiry confirms the room on screen, as the wizard does; the
  // server's boundary check accepts it.
  const confirmed = { ...scan, state: 'confirmed', confirmedRevision: scan.roomRevision, confirmedAt: new Date().toISOString() };
  assert.ok(contract.confirmedRoomScanV1Schema.safeParse(confirmed).success);
  // And the room prices: the starter layout for it compiles to cabinets with a price band.
  const room = layout.toRoomSpec(scan.room);
  const spec = layout.defaultSpecFor({ room, priorities: [], appliances: { dishwasher: true, fridgeWidthMm: 940 },
    island: 'if-it-fits', styleIds: {} }, 'l-shape');
  const compiled = layout.compileSpec(spec, room);
  assert.ok(compiled.items.length > 0, 'cabinets are placed in the scanned room');
  const band = layout.priceDesign(compiled.items, spec.style);
  assert.ok(band.lowAud > 0 && band.highAud > band.lowAud, `priced ${band.lowAud}–${band.highAud}`);
});

test('an L-shaped photo walk uses the planner\'s L fit', async () => {
  const draft = structuredClone(await fixture('customer-photo-walk-complete'));
  const chain = draft.partialGeometry.wallChains[0];
  chain.cornersMm = [[0, 0], [4200, 0], [4200, 1800], [2400, 1800], [2400, 3200], [0, 3200]]
    .map(([x, z], index) => ({ id: `corner-c${index + 1}`, x, z }));
  chain.wallIds = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
  draft.partialGeometry.wallEvidence = [];
  const parsed = contract.parseRoomCaptureDraft(draft);
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.reason);
  const outcome = customerRoomOutcome(parsed.draft);
  assert.equal(outcome?.kind, 'scan');
  assert.equal(outcome.scan.room.shape, 'LShape');
});

test('an incomplete photo walk stays a draft: customer wording and typed sizes are priced', () => {
  const { capture, outcome } = wizardReceives(incomplete);
  assert.equal(outcome?.kind, 'type-sizes');
  assert.equal(capture.draft.partialGeometry, undefined, 'no walls arrive');
  assert.equal(CUSTOMER_PHOTOS_SAVED, 'Your photos are saved for Bower. Type your room sizes below to get your price.');
  for (const staffWords of ['private', 'trade planner', 'source photos']) {
    assert.ok(!CUSTOMER_PHOTOS_SAVED.toLowerCase().includes(staffWords), staffWords);
  }
  // The wizard keeps the draft with the enquiry and starts on typed sizes, so
  // the Room step continues to a quote once sensible sizes are in.
  const typed = { incomingCaptureDraft: capture.draft, roomDocument: undefined, useManualRoomInstead: true,
    roomWidth: 3600, roomDepth: 3000, roomHeight: 2400 };
  assert.equal(roomStepReady(typed, false), true);
  assert.equal(roomStepReady({ ...typed, roomWidth: 900 }, false), false, 'sizes are still checked');
  assert.equal(roomStepReady({ ...typed, useManualRoomInstead: false }, false), false,
    'without typed sizes a capture draft would block the quote');
});

test('the wizard shows the customer wording, not the staff notes, for a photo walk', async () => {
  const wizard = await readFile('src/pages/homeowner/Wizard.tsx', 'utf8');
  assert.match(wizard, /customerDraft && \(\s*<p[^>]*>\{CUSTOMER_PHOTOS_SAVED\}<\/p>/);
  assert.match(wizard, /captureDraft && !customerDraft && !state\.useManualRoomInstead && \(/,
    'the staff banner about private source photos is not shown for a photo walk');
  assert.match(wizard, /useManualRoomInstead: customer\?\.kind === 'type-sizes'/, 'the hand-over starts on typed sizes');
  assert.match(wizard, /roomStepReady\(state, step1Invalid\)/);
});

test('other drafts keep their paths: the owner\'s scanner draft and a corner scan without an outline', async () => {
  const draft = contract.parseRoomCaptureDraft(await fixture('customer-photo-walk-incomplete')).draft;
  const owner = { ...draft, adapterState: { ...draft.adapterState, access: 'scanner-owner-only' } };
  assert.equal(customerRoomOutcome(owner), null);
  const corner = { ...draft, adapterState: { access: 'device-only', reviewKind: 'corner-scan' } };
  assert.equal(customerRoomOutcome(corner), null, 'a phone-only corner scan without an outline stays a capture draft');
});

// ── Staff photo view ─────────────────────────────────────────────────────────
const CAPTURE = '5b7e2f1c-9a4d-4c3e-8f2a-1d6b0c9e8a7f';
const TOKEN = 'staff.access.token';

test('the capture comes from the hand-over or the enquiry, only for a customer photo walk', async () => {
  assert.equal(photos.customerScanCaptureId(complete), CAPTURE);
  assert.equal(photos.customerScanCaptureId({ roomCaptureDraft: incomplete.roomCaptureDraft }), '8c1d4e2a-6b3f-4a5c-9d7e-2f0a1b3c4d5e');
  const owner = structuredClone(complete);
  owner.roomCaptureDraft.adapterState.access = 'scanner-owner-only';
  assert.equal(photos.customerScanCaptureId(owner), null, 'the owner\'s private captures are never read here');
  const unsafe = structuredClone(complete);
  unsafe.roomCaptureDraft.adapterState.captureId = '../../api/room-capture/jobs';
  assert.equal(photos.customerScanCaptureId(unsafe), null);
  assert.equal(photos.customerScanCaptureId(null), null);

  const queries = [];
  const client = { from(table) { return { select(columns) { return { in(column, values) {
    queries.push({ table, columns, column, values });
    return Promise.resolve({ data: values.map((jobId, index) => ({ job_id: jobId,
      adapterState: index === 0 ? complete.roomCaptureDraft.adapterState : { access: 'scanner-owner-only', captureId: CAPTURE } })), error: null });
  } }; } }; } };
  const ids = Array.from({ length: 150 }, (_, index) => `job-${index}`);
  const found = await photos.customerScanCapturesForJobs(client, ids);
  assert.deepEqual([...found], [['job-0', CAPTURE], ['job-100', CAPTURE]]);
  assert.deepEqual(queries.map(({ table, columns, column, values }) => [table, columns, column, values.length]), [
    ['planner_handoffs', 'job_id, adapterState:payload->roomCaptureDraft->adapterState', 'job_id', 100],
    ['planner_handoffs', 'job_id, adapterState:payload->roomCaptureDraft->adapterState', 'job_id', 50],
  ], 'only the adapter state is read, in bounded batches');
});

test('the photo requests: the staff token as a bearer, no cookies, no referrer, only the room-admin API', async () => {
  const calls = [];
  const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith(`/captures/${CAPTURE}`)) {
      return Response.json({ id: CAPTURE, title: 'Kitchen', status: 'awaiting-review', created: '2026-10-15T02:30:00Z',
        photos: [{ id: '0000' }, { id: '0001' }, { id: '../x' }, { id: 7 }] });
    }
    return new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } });
  };
  const capture = await photos.loadCustomerScan(CAPTURE, TOKEN, fetcher);
  assert.deepEqual(capture, { id: CAPTURE, title: 'Kitchen', status: 'awaiting-review', created: '2026-10-15T02:30:00Z',
    photos: [{ id: '0000' }, { id: '0001' }] }, 'only well-formed photo ids are kept');
  const blob = await photos.loadCustomerScanPhoto(CAPTURE, '0001', TOKEN, fetcher);
  assert.equal(blob.type, 'image/jpeg');
  assert.deepEqual(calls.map((call) => call.url), [
    `https://scan.bowercabinets.com/api/room-admin/captures/${CAPTURE}`,
    `https://scan.bowercabinets.com/api/room-admin/captures/${CAPTURE}/photos/0001`,
  ]);
  for (const { init } of calls) {
    assert.deepEqual(init, { method: 'GET', headers: { Authorization: `Bearer ${TOKEN}` }, credentials: 'omit',
      cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
  }
  await assert.rejects(photos.loadCustomerScanPhoto(CAPTURE, '../../x', TOKEN, fetcher), /no longer on the scanner/);
  await assert.rejects(photos.loadCustomerScan('not-a-capture', TOKEN, fetcher), /no longer on the scanner/);
  assert.equal(calls.length, 2, 'malformed ids are never requested');
});

test('the staff view explains 401, 403 and 404 plainly and refuses anything but a photo', async () => {
  for (const [status, words] of [[401, /sign in again/i], [403, /Only Bower staff/], [404, /no longer on the scanner/], [500, /could not be reached/]]) {
    await assert.rejects(photos.loadCustomerScan(CAPTURE, TOKEN, async () => new Response('{}', { status })),
      (error) => error.status === status && words.test(error.message));
  }
  await assert.rejects(photos.loadCustomerScan(CAPTURE, TOKEN, async () => { throw new TypeError('network'); }), /could not be reached/);
  await assert.rejects(photos.loadCustomerScan(CAPTURE, TOKEN, async () => Response.json({ id: 'another', photos: [] })), /could not be reached/);
  await assert.rejects(photos.loadCustomerScanPhoto(CAPTURE, '0000', TOKEN,
    async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } })), /could not be reached/);
});

test('the staff view is opened before it fetches, uses the current sign-in, and releases its photos', async () => {
  const component = await readFile('src/components/admin/CustomerScanPhotos.tsx', 'utf8');
  assert.match(component, /supabase\.auth\.getSession\(\)/);
  assert.match(component, /if \(!open \|\| capture \|\| error\) return;/, 'nothing is fetched until it is opened');
  assert.match(component, /URL\.revokeObjectURL/);
  for (const page of ['src/pages/admin/JobDetail.tsx', 'src/pages/admin/Leads.tsx']) {
    assert.match(await readFile(page, 'utf8'), /<CustomerScanPhotos key=\{[^}]+\} captureId=/, page);
  }
});
