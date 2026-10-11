// The public handoff functions hold no contact details and share a durable
// limit. Runs the real create-planner-handoff and get-planner-handoff
// handlers with the Deno server and supabase-js imports replaced by
// in-memory fakes: create ignores any 'lead' in the body and stores NULL
// contact fields, get never returns leadName, and both count every caller
// through bump_edge_rate_limit_v1 (20 and 60 an hour).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const stubs = {
  'https://deno.land/std@0.168.0/http/server.ts':
    'export function serve(handler) { globalThis.__servedHandler = handler; }',
  'npm:@supabase/supabase-js@2':
    'export function createClient(...args) { return globalThis.__fakeSupabase.createClient(...args); }',
};
const edgeStubs = {
  name: 'edge-stubs',
  setup(builder) {
    builder.onResolve({ filter: /^npm:zod@/ }, () =>
      builder.resolve('zod', { kind: 'import-statement', resolveDir: repoRoot }));
    builder.onResolve({ filter: /^(https:|npm:)/ }, (args) => ({ path: args.path, namespace: 'edge-stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'edge-stub' }, (args) => {
      if (!stubs[args.path]) throw new Error(`unexpected remote import ${args.path}`);
      return { contents: stubs[args.path], loader: 'js' };
    });
  },
};

let instance = 0;
/** Each call is a cold start: a fresh module with an empty in-memory limiter. */
async function loadHandler(entry) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
    plugins: [edgeStubs],
  });
  globalThis.__servedHandler = undefined;
  const text = `${result.outputFiles[0].text}\n// instance ${instance += 1}\n`;
  await import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
  assert.equal(typeof globalThis.__servedHandler, 'function');
  return globalThis.__servedHandler;
}

const SERVICE_KEY = `service.key.${'k'.repeat(32)}`;
const STAFF_JWT = `staff.jwt.${'s'.repeat(32)}`;
const STAFF_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN = 't'.repeat(43);
const tokenHash = createHash('sha256').update(TOKEN).digest('hex');
const future = new Date(Date.now() + 86_400_000).toISOString();
const websitePayload = {
  handoffSchemaVersion: 1, source: 'website', roomType: 'kitchen',
  dimensions: { widthMm: 3600, depthMm: 3000 }, styleTags: ['Modern'], materials: {},
  notes: 'Pathway: design | Budget: 30k',
};
const legacyId = '66666666-6666-4666-8666-666666666666';
const scannerId = '77777777-7777-4777-8777-777777777777';
const legacyContact = { lead_name: 'Legacy Lead', lead_email: 'legacy@example.com', lead_phone: '0400 000 000' };

let state;
function reset({ rpcError = null } = {}) {
  state = {
    rpcError,
    rateCounts: new Map(),
    inserted: [],
    selectedColumns: [],
    calls: [],
    handoffs: new Map([
      // A row written before contact fields were dropped still holds them.
      [legacyId, { id: legacyId, source: 'website', payload: websitePayload, ...legacyContact,
        consumed_at: null, expires_at: future, public_token_hash: tokenHash }],
      [scannerId, { id: scannerId, source: 'scanner', payload: { ...websitePayload, source: 'scanner' },
        lead_name: null, lead_email: null, lead_phone: null,
        consumed_at: null, expires_at: future, public_token_hash: tokenHash }],
    ]),
  };
}

globalThis.Deno = { env: { get: (name) => ({
  SUPABASE_URL: 'https://project.supabase.invalid',
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
})[name] } };
globalThis.__fakeSupabase = {
  createClient(_url, key) {
    assert.equal(key, SERVICE_KEY);
    return {
      auth: {
        async getUser(jwt) {
          state.calls.push({ op: 'getUser' });
          return jwt === STAFF_JWT
            ? { data: { user: { id: STAFF_ID } }, error: null }
            : { data: { user: null }, error: { message: 'invalid JWT' } };
        },
      },
      async rpc(name, args) {
        state.calls.push({ op: 'rpc', name, args });
        if (name === 'is_bower_staff') return { data: args.p_user === STAFF_ID, error: null };
        assert.equal(name, 'bump_edge_rate_limit_v1');
        if (state.rpcError) return { data: null, error: { message: state.rpcError } };
        const hits = (state.rateCounts.get(args.p_key) ?? 0) + 1;
        state.rateCounts.set(args.p_key, hits);
        return { data: hits <= args.p_limit, error: null };
      },
      from(table) {
        assert.equal(table, 'planner_handoffs');
        return {
          insert(row) {
            state.calls.push({ op: 'insert' });
            const id = `00000000-0000-4000-8000-${String(state.inserted.length + 1).padStart(12, '0')}`;
            state.inserted.push({ id, ...row });
            return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
          },
          select(columns) {
            state.selectedColumns.push(columns);
            const names = columns.split(',').map((name) => name.trim());
            return { eq: (_column, id) => ({ async maybeSingle() {
              state.calls.push({ op: 'select' });
              const row = state.handoffs.get(id);
              return { data: row ? Object.fromEntries(names.map((name) => [name, row[name]])) : null, error: null };
            } }) };
          },
        };
      },
    };
  },
};

async function call(handler, body, { cf = '198.51.100.7', xff, bearer } = {}) {
  const logs = [];
  const errors = [];
  const [log, error] = [console.log, console.error];
  console.log = (line) => logs.push(String(line));
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const response = await handler(new Request('https://project.supabase.invalid/functions/v1/fn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cf ? { 'cf-connecting-ip': cf } : {}),
        ...(xff ? { 'x-forwarded-for': xff } : {}),
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
    }));
    const text = await response.text();
    return { status: response.status, text, body: JSON.parse(text), logs, errors };
  } finally { [console.log, console.error] = [log, error]; }
}

const contactFields = ['lead_name', 'lead_email', 'lead_phone'];
const rateCalls = () => state.calls.filter((entry) => entry.name === 'bump_edge_rate_limit_v1');

test('create-planner-handoff: the website body {payload} returns {id, token, expiresAt}', async () => {
  reset();
  const create = await loadHandler('../supabase/functions/create-planner-handoff/index.ts');
  const result = await call(create, { payload: websitePayload });
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body).sort(), ['expiresAt', 'id', 'token']);
  assert.equal(result.body.id, state.inserted[0].id);
  assert.ok(result.body.token.length >= 32);
  const row = state.inserted[0];
  assert.equal(row.public_token_hash, createHash('sha256').update(result.body.token).digest('hex'));
  for (const field of contactFields) assert.equal(row[field], null, field);
});

test('create-planner-handoff: any lead in the body is ignored and nothing of it is stored', async () => {
  reset();
  const create = await loadHandler('../supabase/functions/create-planner-handoff/index.ts');
  const lead = { name: 'Jane Customer', email: 'jane@example.com', phone: '0412 345 678' };
  const result = await call(create, { payload: websitePayload, lead });
  assert.equal(result.status, 200);
  const row = state.inserted[0];
  for (const field of contactFields) assert.equal(row[field], null, field);
  const stored = JSON.stringify(row);
  for (const value of Object.values(lead)) assert.ok(!stored.includes(value), `${value} was stored`);
  assert.deepEqual(row.payload, websitePayload);
});

test('create-planner-handoff: 20 an hour per caller through bump_edge_rate_limit_v1', async () => {
  reset();
  let create = await loadHandler('../supabase/functions/create-planner-handoff/index.ts');
  const first = await call(create, { payload: websitePayload });
  assert.equal(first.status, 200);
  const [bump] = rateCalls();
  assert.match(bump.args.p_key, /^create-planner-handoff:[0-9a-f]{24}$/);
  assert.equal(bump.args.p_limit, 20);
  assert.equal(bump.args.p_window_seconds, 3600);
  assert.ok(state.calls.findIndex((entry) => entry.op === 'rpc') < state.calls.findIndex((entry) => entry.op === 'insert'),
    'the limit is checked before anything is stored');

  for (let i = 1; i < 20; i += 1) assert.equal((await call(create, { payload: websitePayload })).status, 200);
  // A cold start forgets the per-instance count; the durable store does not.
  create = await loadHandler('../supabase/functions/create-planner-handoff/index.ts');
  const inserts = state.inserted.length;
  const throttled = await call(create, { payload: websitePayload });
  assert.equal(throttled.status, 429);
  assert.deepEqual(throttled.body, { error: 'rate_limited' });
  assert.equal(state.inserted.length, inserts, 'a throttled call stores nothing');
  assert.ok(throttled.logs.some((line) => JSON.parse(line).outcome === 'throttled'));
  assert.equal((await call(create, { payload: websitePayload }, { cf: '198.51.100.8' })).status, 200,
    'another caller has its own bucket');
});

test('create-planner-handoff: forging X-Forwarded-For does not reset the limit', async () => {
  reset();
  let create = await loadHandler('../supabase/functions/create-planner-handoff/index.ts');
  const statuses = [];
  for (let i = 0; i < 20; i += 1) {
    statuses.push((await call(create, { payload: websitePayload }, { xff: `203.0.113.${i}, 198.51.100.7` })).status);
  }
  // The 21st arrives at a cold instance, so only the durable store can refuse it.
  create = await loadHandler('../supabase/functions/create-planner-handoff/index.ts');
  statuses.push((await call(create, { payload: websitePayload }, { xff: '203.0.113.99, 198.51.100.7' })).status);
  assert.deepEqual(statuses, [...Array(20).fill(200), 429]);
  assert.equal(new Set(rateCalls().map((entry) => entry.args.p_key)).size, 22,
    'each forged entry is counted beside the platform address');
});

test('create-planner-handoff: an unavailable store still falls back to the per-instance limit', async () => {
  reset({ rpcError: 'relation "edge_rate_limits" does not exist' });
  const create = await loadHandler('../supabase/functions/create-planner-handoff/index.ts');
  const statuses = [];
  let errors = [];
  for (let i = 0; i < 21; i += 1) {
    const result = await call(create, { payload: websitePayload });
    statuses.push(result.status);
    errors = errors.concat(result.errors);
  }
  assert.deepEqual(statuses, [...Array(20).fill(200), 429]);
  assert.ok(errors.some((line) => line.includes('[create-planner-handoff] durable rate limit unavailable')));
});

test('get-planner-handoff: returns payload, consumedAt and expiresAt, never leadName', async () => {
  reset();
  const get = await loadHandler('../supabase/functions/get-planner-handoff/index.ts');
  const result = await call(get, { handoffId: legacyId, token: TOKEN });
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body).sort(), ['consumedAt', 'expiresAt', 'payload']);
  assert.deepEqual(result.body.payload, websitePayload);
  for (const value of Object.values(legacyContact)) assert.ok(!result.text.includes(value), `${value} was returned`);
  assert.ok(state.selectedColumns.every((columns) => !columns.includes('lead_')), 'contact columns are not even read');
});

test('get-planner-handoff: 60 an hour per caller through bump_edge_rate_limit_v1', async () => {
  reset();
  let get = await loadHandler('../supabase/functions/get-planner-handoff/index.ts');
  assert.equal((await call(get, { handoffId: legacyId, token: TOKEN })).status, 200);
  const [bump] = rateCalls();
  assert.match(bump.args.p_key, /^get-planner-handoff:[0-9a-f]{24}$/);
  assert.equal(bump.args.p_limit, 60);
  assert.equal(bump.args.p_window_seconds, 3600);
  for (let i = 1; i < 60; i += 1) assert.equal((await call(get, { handoffId: legacyId, token: TOKEN })).status, 200);
  get = await loadHandler('../supabase/functions/get-planner-handoff/index.ts');
  state.calls = [];
  const throttled = await call(get, { handoffId: legacyId, token: TOKEN });
  assert.equal(throttled.status, 429);
  assert.deepEqual(throttled.body, { error: 'rate_limited' });
  assert.deepEqual(state.calls.map((entry) => entry.op), ['rpc'], 'a throttled caller reaches no row and no identity lookup');
});

test('get-planner-handoff: the staff rule for scanner rows still holds', async () => {
  reset();
  const get = await loadHandler('../supabase/functions/get-planner-handoff/index.ts');
  const anonymous = await call(get, { handoffId: scannerId, token: TOKEN });
  assert.equal(anonymous.status, 404);
  assert.deepEqual(anonymous.body, { error: 'invalid_capability' });
  const staff = await call(get, { handoffId: scannerId, token: TOKEN }, { bearer: STAFF_JWT });
  assert.equal(staff.status, 200);
  assert.deepEqual(Object.keys(staff.body).sort(), ['consumedAt', 'expiresAt', 'payload']);
});
