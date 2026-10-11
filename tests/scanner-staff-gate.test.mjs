// The scanner's planner paths are staff-only while the scanner admits only its
// owner. Runs the real scanner-private-bridge and get-planner-handoff handlers
// with the Deno server and supabase-js imports replaced by in-memory fakes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const stubs = {
  'https://deno.land/std@0.168.0/http/server.ts':
    'export function serve(handler) { globalThis.__servedHandler = handler; }',
  'npm:@supabase/supabase-js@2':
    'export function createClient(...args) { return globalThis.__fakeSupabase.createClient(...args); }',
};
const edgeStubs = {
  name: 'edge-stubs',
  setup(builder) {
    builder.onResolve({ filter: /^(https:|npm:)/ }, (args) => ({ path: args.path, namespace: 'edge-stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'edge-stub' }, (args) => {
      if (!stubs[args.path]) throw new Error(`unexpected remote import ${args.path}`);
      return { contents: stubs[args.path], loader: 'js' };
    });
  },
};

async function loadHandler(entry) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
    plugins: [edgeStubs],
  });
  globalThis.__servedHandler = undefined;
  await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  assert.equal(typeof globalThis.__servedHandler, 'function');
  return globalThis.__servedHandler;
}

const STAFF_ID = '33333333-3333-4333-8333-333333333333';
const CUSTOMER_ID = '44444444-4444-4444-8444-444444444444';
const STAFF_JWT = `staff.jwt.${'s'.repeat(32)}`;
const CUSTOMER_JWT = `customer.jwt.${'c'.repeat(32)}`;
const ANON_KEY = `anon.key.${'a'.repeat(32)}`;
const SERVICE_KEY = `service.key.${'k'.repeat(32)}`;
const users = new Map([[STAFF_JWT, { id: STAFF_ID }], [CUSTOMER_JWT, { id: CUSTOMER_ID }]]);
const staffIds = new Set([STAFF_ID]);

const captureId = '11111111-1111-4111-8111-111111111111';
const staffJobId = '22222222-2222-4222-8222-222222222222';
const customerJobId = '55555555-5555-4555-8555-555555555555';
const roomId = 'room-1';
const savedRoom = { tradeRooms: [{ id: roomId, roomDocument: {
  capture: { captureId, sourceRevision: 'revision-1' },
} }] };
const jobs = new Map([
  [staffJobId, { customer_id: STAFF_ID, design_data: savedRoom }],
  [customerJobId, { customer_id: CUSTOMER_ID, design_data: savedRoom }],
]);

const TOKEN = 't'.repeat(43);
const tokenHash = createHash('sha256').update(TOKEN).digest('hex');
const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();
const handoffRow = (id, source, expires_at = future) => ({
  id, source, payload: { handoffSchemaVersion: 1, source, roomType: 'kitchen', styleTags: [], materials: {} },
  lead_name: null, consumed_at: null, expires_at, public_token_hash: tokenHash,
});
const websiteId = '66666666-6666-4666-8666-666666666666';
const scannerId = '77777777-7777-4777-8777-777777777777';
const expiredScannerId = '88888888-8888-4888-8888-888888888888';
const unknownId = '99999999-9999-4999-8999-999999999999';
const handoffs = new Map([
  [websiteId, handoffRow(websiteId, 'website')],
  [scannerId, handoffRow(scannerId, 'scanner')],
  [expiredScannerId, handoffRow(expiredScannerId, 'scanner', past)],
]);

let env = {};
let calls = [];
// While set, every identity lookup waits for this promise (a slow auth server).
let identityHold = null;
globalThis.Deno = { env: { get: (name) => env[name] } };
globalThis.__fakeSupabase = {
  createClient(_url, key, options) {
    const callerJwt = options?.global?.headers?.Authorization?.replace(/^Bearer /, '');
    const caller = key === SERVICE_KEY ? null : users.get(callerJwt);
    return {
      auth: {
        async getUser(jwt) {
          calls.push({ op: 'getUser', key });
          if (identityHold) await identityHold;
          const user = users.get(jwt);
          return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } };
        },
      },
      async rpc(name, args) {
        calls.push({ op: 'rpc', name, key, args });
        if (name !== 'is_bower_staff') return { data: null, error: { message: 'unknown function' } };
        return { data: staffIds.has(args.p_user), error: null };
      },
      from(table) {
        return { select: () => ({ eq: (_column, id) => ({ async maybeSingle() {
          calls.push({ op: 'select', table, key });
          if (table === 'planner_handoffs')
            return { data: key === SERVICE_KEY ? handoffs.get(id) ?? null : null, error: null };
          // jobs RLS: a caller sees their own jobs, and staff see every job.
          const job = jobs.get(id);
          const visible = job && caller && (job.customer_id === caller.id || staffIds.has(caller.id));
          return { data: visible ? job : null, error: null };
        } }) }) };
      },
    };
  },
};

let upstreamRequests = [];
globalThis.fetch = async (url, init) => {
  upstreamRequests.push({ url: String(url), init });
  return new Response(JSON.stringify({ captureId, sourceRevision: 'revision-1', photos: [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

const configuredEnv = () => ({
  SUPABASE_URL: 'https://project.supabase.invalid',
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  SCANNER_SITES_ACCESS_TOKEN: 'sites-token',
  SCANNER_ORIGIN: 'https://scanner.example.com',
  PLANNER_ORIGIN: 'https://planner.example.com',
});

let ip = 0;
async function call(handler, body, bearer) {
  calls = [];
  upstreamRequests = [];
  const logs = [];
  const log = console.log;
  console.log = (line) => logs.push(String(line));
  try {
    const response = await handler(new Request('https://project.supabase.invalid/functions/v1/fn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': `203.0.113.${(ip += 1) % 250}`,
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
    }));
    const text = await response.text();
    return { status: response.status, text, body: JSON.parse(text), logs };
  } finally { console.log = log; }
}

const bridge = await loadHandler('../supabase/functions/scanner-private-bridge/index.ts');
const getHandoff = await loadHandler('../supabase/functions/get-planner-handoff/index.ts');

const manifest = (jobId) => ({ action: 'manifest', jobId, roomId, captureId,
  sourceRevision: 'revision-1', token: 'e'.repeat(43) });

test('bridge: a non-staff owner of the job gets 403 and the scanner is never called', async () => {
  env = configuredEnv();
  const result = await call(bridge, manifest(customerJobId), CUSTOMER_JWT);
  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: 'not_authorized' });
  assert.equal(upstreamRequests.length, 0);
  assert.ok(result.logs.some((line) => JSON.parse(line).outcome === 'not_staff'));
  const staffCheck = calls.find((entry) => entry.op === 'rpc');
  assert.deepEqual(staffCheck, { op: 'rpc', name: 'is_bower_staff', key: SERVICE_KEY,
    args: { p_user: CUSTOMER_ID } }, 'staff is checked for the caller, with the service client');
  assert.ok(calls.findIndex((entry) => entry.op === 'rpc') > calls.findIndex((entry) => entry.op === 'select'),
    'the staff check follows the job ownership check');
});

test('bridge: staff who own the job reach the scanner at the configured origins', async () => {
  env = configuredEnv();
  const result = await call(bridge, manifest(staffJobId), STAFF_JWT);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { captureId, sourceRevision: 'revision-1', photos: [] });
  assert.equal(upstreamRequests.length, 1);
  assert.equal(upstreamRequests[0].url,
    `https://scanner.example.com/api/room-capture/jobs/${captureId}/planner-evidence`);
  assert.equal(upstreamRequests[0].init.headers.Origin, 'https://planner.example.com');
});

test('bridge: staff still need to own the job, and a bad JWT is still 401', async () => {
  env = configuredEnv();
  const otherJob = await call(bridge, manifest(customerJobId), STAFF_JWT);
  assert.equal(otherJob.status, 403);
  assert.deepEqual(otherJob.body, { error: 'not_authorized' });
  const forged = await call(bridge, manifest(staffJobId), `forged.jwt.${'f'.repeat(32)}`);
  assert.equal(forged.status, 401);
  assert.equal(upstreamRequests.length, 0);
});

test('bridge: a missing SCANNER_ORIGIN or PLANNER_ORIGIN gives 503 with no default host', async () => {
  for (const unset of ['SCANNER_ORIGIN', 'PLANNER_ORIGIN']) {
    env = configuredEnv();
    delete env[unset];
    const result = await call(bridge, manifest(staffJobId), STAFF_JWT);
    assert.equal(result.status, 503, `${unset} unset`);
    assert.deepEqual(result.body, { error: 'scanner_unavailable' });
    assert.equal(upstreamRequests.length, 0, `${unset} unset must not call any host`);
  }
});

test('get-planner-handoff: website rows open with the token alone', async () => {
  env = configuredEnv();
  for (const bearer of [undefined, ANON_KEY, CUSTOMER_JWT, STAFF_JWT]) {
    const result = await call(getHandoff, { handoffId: websiteId, token: TOKEN }, bearer);
    assert.equal(result.status, 200, `website row with ${bearer ?? 'no Authorization'}`);
    assert.equal(result.body.payload.source, 'website');
  }
  const noStaffCheck = await call(getHandoff, { handoffId: websiteId, token: TOKEN });
  assert.equal(calls.some((entry) => entry.op === 'getUser' || entry.op === 'rpc'), false,
    'without Authorization there is no identity to look up');
  assert.equal(noStaffCheck.status, 200);
});

test('get-planner-handoff: a scanner row looks like a bad token to anyone but staff', async () => {
  env = configuredEnv();
  const wrongToken = await call(getHandoff, { handoffId: unknownId, token: TOKEN });
  assert.equal(wrongToken.status, 404);
  assert.deepEqual(wrongToken.body, { error: 'invalid_capability' });
  for (const handoffId of [scannerId, expiredScannerId]) {
    for (const bearer of [undefined, ANON_KEY, CUSTOMER_JWT, `forged.jwt.${'f'.repeat(32)}`]) {
      const result = await call(getHandoff, { handoffId, token: TOKEN }, bearer);
      const label = `${handoffId} with ${bearer ?? 'no Authorization'}`;
      assert.equal(result.status, wrongToken.status, label);
      assert.equal(result.text, wrongToken.text, label);
    }
  }
});

// A scanner row's 404 must not take longer than a wrong token's: the identity
// lookup is a network round trip, so it runs for every request or none.
const notFoundCases = [
  { handoffId: unknownId, token: TOKEN },
  { handoffId: websiteId, token: 'w'.repeat(43) },
  { handoffId: scannerId, token: 'w'.repeat(43) },
  { handoffId: scannerId, token: TOKEN },
  { handoffId: expiredScannerId, token: TOKEN },
];

test('get-planner-handoff: every 404 makes the same lookups, whatever the row', async () => {
  env = configuredEnv();
  for (const bearer of [ANON_KEY, CUSTOMER_JWT]) {
    const lookups = [];
    for (const body of notFoundCases) {
      const result = await call(getHandoff, body, bearer);
      assert.equal(result.status, 404, `${body.handoffId} with ${bearer}`);
      assert.deepEqual(result.body, { error: 'invalid_capability' });
      assert.ok(calls.some((entry) => entry.op === 'getUser'), 'the caller is looked up for every request');
      lookups.push(JSON.stringify(calls.map(({ op, name, key }) => ({ op, name, key }))));
    }
    assert.equal(new Set(lookups).size, 1, `lookups differ by row for ${bearer}: ${lookups.join(' | ')}`);
  }
});

test('get-planner-handoff: no 404 answers before the identity lookup finishes', async () => {
  env = configuredEnv();
  for (const body of notFoundCases) {
    let release;
    identityHold = new Promise((resolve) => { release = resolve; });
    let answered = false;
    const pending = call(getHandoff, body, ANON_KEY).then((result) => { answered = true; return result; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert.equal(answered, false, `${body.handoffId} answered before the identity lookup`);
    } finally {
      release();
      identityHold = null;
    }
    assert.equal((await pending).status, 404);
  }
});

test('get-planner-handoff: staff open a scanner row and see its expiry', async () => {
  env = configuredEnv();
  const result = await call(getHandoff, { handoffId: scannerId, token: TOKEN }, STAFF_JWT);
  assert.equal(result.status, 200);
  assert.equal(result.body.payload.source, 'scanner');
  assert.deepEqual(calls.find((entry) => entry.op === 'rpc'),
    { op: 'rpc', name: 'is_bower_staff', key: SERVICE_KEY, args: { p_user: STAFF_ID } });
  const expired = await call(getHandoff, { handoffId: expiredScannerId, token: TOKEN }, STAFF_JWT);
  assert.equal(expired.status, 410);
  assert.deepEqual(expired.body, { error: 'expired_handoff' });
});
