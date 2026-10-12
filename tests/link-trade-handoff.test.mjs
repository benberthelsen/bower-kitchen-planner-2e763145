// link-trade-handoff sends only the sha256 of the handoff token to
// link_trade_handoff_v2, as the caller, and the planner's linkTradeHandoff
// sends the token it captured. Runs the real edge handler and the real hook
// module with the Deno server, supabase-js and the planner's client replaced
// by in-memory fakes.
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
  '@/integrations/supabase/client': 'export const supabase = globalThis.__fakePlannerClient;',
  '@tanstack/react-query': 'export function useQuery() { throw new Error("not used here"); }',
};
const stubPlugin = {
  name: 'stubs',
  setup(builder) {
    builder.onResolve({ filter: /^(https:|npm:|@\/integrations\/|@tanstack\/)/ },
      (args) => ({ path: args.path, namespace: 'stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
      if (!stubs[args.path]) throw new Error(`unexpected import ${args.path}`);
      return { contents: stubs[args.path], loader: 'js' };
    });
  },
};

async function bundle(entry) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
    plugins: [stubPlugin],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const ANON_KEY = `anon.key.${'a'.repeat(32)}`;
const SERVICE_KEY = `service.key.${'k'.repeat(32)}`;
const CALLER_JWT = `caller.jwt.${'c'.repeat(32)}`;
const handoffId = '66666666-6666-4666-8666-666666666666';
const jobId = '55555555-5555-4555-8555-555555555555';
const TOKEN = 't'.repeat(43);

let calls = [];
let rpcResult = { data: { linked: true }, error: null };
globalThis.Deno = { env: { get: (name) => ({
  SUPABASE_URL: 'https://project.supabase.invalid',
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
})[name] } };
globalThis.__fakeSupabase = {
  createClient(_url, key, options) {
    const authorization = options?.global?.headers?.Authorization ?? null;
    return {
      async rpc(name, args) {
        calls.push({ name, args, key, authorization });
        return rpcResult;
      },
    };
  },
};

globalThis.__servedHandler = undefined;
await bundle('../supabase/functions/link-trade-handoff/index.ts');
const handler = globalThis.__servedHandler;
assert.equal(typeof handler, 'function');

async function call(body, bearer = CALLER_JWT) {
  calls = [];
  const log = console.log;
  console.log = () => {};
  try {
    const response = await handler(new Request('https://project.supabase.invalid/functions/v1/link-trade-handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() };
  } finally { console.log = log; }
}

test('function: the token is hashed and v2 is called as the caller', async () => {
  rpcResult = { data: { linked: true }, error: null };
  const result = await call({ handoffId, jobId, token: TOKEN });
  assert.deepEqual(result, { status: 200, body: { linked: true } });
  assert.deepEqual(calls, [{
    name: 'link_trade_handoff_v2',
    args: { p_handoff_id: handoffId, p_job_id: jobId,
      p_token_hash: createHash('sha256').update(TOKEN).digest('hex') },
    key: ANON_KEY,
    authorization: `Bearer ${CALLER_JWT}`,
  }]);
  assert.ok(!JSON.stringify(calls).includes(TOKEN), 'the raw token never reaches the database');
});

test('function: without a token v2 gets a null hash (only staff pass)', async () => {
  rpcResult = { data: { linked: true }, error: null };
  assert.equal((await call({ handoffId, jobId })).status, 200);
  assert.equal(calls[0].args.p_token_hash, null);
  assert.equal((await call({ handoffId, jobId, token: null })).status, 200);
  assert.equal(calls[0].args.p_token_hash, null);
});

test('function: a malformed token or id is refused before the database', async () => {
  for (const body of [{ handoffId, jobId, token: 'short' }, { handoffId, jobId, token: 12345 },
    { handoffId, jobId, token: 'x'.repeat(129) }, { handoffId: 'nope', jobId, token: TOKEN }]) {
    assert.deepEqual(await call(body), { status: 400, body: { error: 'invalid_request' } }, JSON.stringify(body));
    assert.equal(calls.length, 0);
  }
  assert.deepEqual(await call({ handoffId, jobId, token: TOKEN }, null),
    { status: 401, body: { error: 'not_authorized' } });
  assert.equal(calls.length, 0);
});

test('function: RPC refusals keep their public codes', async () => {
  rpcResult = { data: null, error: { message: 'invalid_handoff' } };
  assert.deepEqual(await call({ handoffId, jobId, token: TOKEN }), { status: 400, body: { error: 'invalid_request' } });
  rpcResult = { data: null, error: { message: 'not_authorized' } };
  assert.deepEqual(await call({ handoffId, jobId, token: TOKEN }), { status: 403, body: { error: 'not_authorized' } });
});

const invokes = [];
let invokeFails = false;
globalThis.__fakePlannerClient = {
  functions: {
    async invoke(name, options) {
      invokes.push({ name, body: options.body });
      if (invokeFails) throw new Error('network down');
      return { data: { linked: true }, error: null };
    },
  },
};
const { linkTradeHandoff } = await bundle('../src/hooks/usePlannerHandoff.ts');

test('planner: linkTradeHandoff sends the captured token, and omits it when there is none', async () => {
  invokes.length = 0;
  await linkTradeHandoff(handoffId, jobId, TOKEN);
  await linkTradeHandoff(handoffId, jobId, null);
  assert.deepEqual(invokes, [
    { name: 'link-trade-handoff', body: { handoffId, jobId, token: TOKEN } },
    { name: 'link-trade-handoff', body: { handoffId, jobId } },
  ]);
  invokeFails = true;
  await linkTradeHandoff(handoffId, jobId, TOKEN);
  invokeFails = false;
});
