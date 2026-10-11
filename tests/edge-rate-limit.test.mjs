// Rate-limit identity for the public Edge Functions. A client can write the
// leftmost X-Forwarded-For entry, so every limiter also counts the request
// against Cloudflare's CF-Connecting-IP, and forging the header never buys a
// fresh bucket. Loads the real shared helper with Deno's env stubbed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const source = await readFile(new URL('../supabase/functions/_shared/roomScan/security.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
globalThis.Deno = { env: { get: () => undefined } };
const {
  addressBucket, durableRateLimit, ipKey, ipKeys, rateKeys, rateLimitResponse, rateLimited,
} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const request = (headers = {}) => new Request('https://project.supabase.invalid/functions/v1/fn', {
  method: 'POST', headers,
});
const CLIENT = '198.51.100.7';
const OTHER = '198.51.100.8';
const INTERNAL_HOP = '10.0.0.1';

test('ipKey is the platform address, whatever X-Forwarded-For says', async () => {
  const honest = await ipKey(request({ 'cf-connecting-ip': CLIENT, 'x-forwarded-for': CLIENT }));
  for (const forged of ['203.0.113.1', `203.0.113.1, ${CLIENT}`, `1.1.1.1, 2.2.2.2, ${CLIENT}, ${INTERNAL_HOP}`, 'not-an-ip']) {
    assert.equal(await ipKey(request({ 'cf-connecting-ip': CLIENT, 'x-forwarded-for': forged })), honest, forged);
  }
  assert.notEqual(await ipKey(request({ 'cf-connecting-ip': OTHER, 'x-forwarded-for': CLIENT })), honest);
  assert.match(honest, /^[0-9a-f]{24}$/);
  assert.ok(!honest.includes(CLIENT), 'a key never carries the raw address');
});

test('without CF-Connecting-IP the leftmost entry is the key, as before', async () => {
  const single = await ipKey(request({ 'x-forwarded-for': CLIENT }));
  assert.equal(await ipKey(request({ 'x-forwarded-for': `${CLIENT}, ${OTHER}, ${INTERNAL_HOP}` })), single);
  assert.equal(await ipKey(request({ 'x-forwarded-for': ` ${CLIENT} ,${OTHER}` })), single);
  assert.deepEqual(await ipKeys(request()), await ipKeys(request()), 'no address at all shares one bucket');
  assert.equal((await ipKeys(request())).length, 1);
});

test('ipKeys returns the platform and leftmost addresses, once each, never the rightmost', async () => {
  const keyOf = async (ip) => ipKey(request({ 'cf-connecting-ip': ip }));
  // Supabase's gateway has rebuilt the header as "<client>,<client>,<internal hop>".
  assert.deepEqual(await ipKeys(request({
    'cf-connecting-ip': CLIENT, 'x-forwarded-for': `${CLIENT},${CLIENT}, ${INTERNAL_HOP}`,
  })), [await keyOf(CLIENT)]);
  // An appending gateway passes a forged entry through first: both are counted.
  const forged = await ipKeys(request({
    'cf-connecting-ip': CLIENT, 'x-forwarded-for': `203.0.113.9, ${CLIENT}, ${INTERNAL_HOP}`,
  }));
  assert.deepEqual(forged, [await keyOf(CLIENT), await keyOf('203.0.113.9')]);
  assert.ok(!forged.includes(await keyOf(INTERNAL_HOP)), 'the shared internal hop is never a key');
  assert.deepEqual(await rateKeys(request({ 'cf-connecting-ip': CLIENT }), 'create-planner-handoff'),
    [`create-planner-handoff:${await keyOf(CLIENT)}`]);
});

test('an IPv6 caller is one bucket per /64, and a mapped IPv4 address is the IPv4 address', async () => {
  assert.equal(addressBucket('2001:DB8:0:1:aaaa:bbbb:cccc:dddd'), '2001:db8:0:1::/64');
  assert.equal(addressBucket('2001:0db8:0000:0001::1'), '2001:db8:0:1::/64');
  assert.equal(addressBucket('2001:db8::'), '2001:db8:0:0::/64');
  assert.equal(addressBucket('::1'), '0:0:0:0::/64');
  assert.equal(addressBucket('::ffff:198.51.100.7'), CLIENT);
  assert.equal(addressBucket(` ${CLIENT} `), CLIENT);
  for (const odd of ['1::2::3', '1:2:3:4:5:6:7:8:9', '1:2:3:4::5:6:7:8', 'gggg::1', 'unknown']) {
    assert.equal(addressBucket(odd), odd, odd);
  }
  const a = await ipKey(request({ 'cf-connecting-ip': '2001:db8:0:1::a' }));
  assert.equal(await ipKey(request({ 'cf-connecting-ip': '2001:db8:0:1:ffff::b' })), a);
  assert.notEqual(await ipKey(request({ 'cf-connecting-ip': '2001:db8:0:2::a' })), a);
});

test('rateLimited counts every key: rotating a forged X-Forwarded-For does not escape the limit', async () => {
  const limit = 5;
  const results = [];
  for (let i = 0; i < limit + 1; i += 1) {
    const keys = await rateKeys(request({ 'cf-connecting-ip': CLIENT, 'x-forwarded-for': `203.0.113.${i}` }), 'forge');
    assert.equal(keys.length, 2);
    results.push(rateLimited(keys, limit));
  }
  assert.deepEqual(results, [false, false, false, false, false, true]);
  // One key over the limit throttles even beside a fresh key.
  assert.equal(rateLimited(['forge-solo:a'], 1), false);
  assert.equal(rateLimited(['forge-solo:fresh', 'forge-solo:a'], 1), true);
  // A single string key still works for existing callers.
  assert.equal(rateLimited('forge-string', 1), false);
  assert.equal(rateLimited('forge-string', 1), true);
});

function fakeStore({ failWith = null, throwError = false, counts = new Map() } = {}) {
  const calls = [];
  return {
    calls,
    counts,
    async rpc(name, args) {
      calls.push({ name, args });
      if (throwError) throw new Error('network down');
      if (failWith) return { data: null, error: { message: failWith } };
      const hits = (counts.get(args.p_key) ?? 0) + 1;
      counts.set(args.p_key, hits);
      return { data: hits <= args.p_limit, error: null };
    },
  };
}

async function quietly(fn) {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try { return { result: await fn(), errors }; } finally { console.error = original; }
}

test('durableRateLimit bumps every key through bump_edge_rate_limit_v1', async () => {
  const store = fakeStore({ counts: new Map([['durable:b', 3]]) });
  assert.equal(await durableRateLimit(store, ['durable:a', 'durable:b'], 3, { fn: 'fn-a' }), 'throttled');
  assert.deepEqual(store.calls, [
    { name: 'bump_edge_rate_limit_v1', args: { p_key: 'durable:a', p_limit: 3, p_window_seconds: 3600 } },
    { name: 'bump_edge_rate_limit_v1', args: { p_key: 'durable:b', p_limit: 3, p_window_seconds: 3600 } },
  ]);
  const fresh = fakeStore();
  assert.equal(await durableRateLimit(fresh, ['durable:c'], 3, { fn: 'fn-a', windowSeconds: 60 }), 'allowed');
  assert.equal(fresh.calls[0].args.p_window_seconds, 60);
});

test('durableRateLimit fails open by default and closed when asked', async () => {
  const open = await quietly(() => durableRateLimit(fakeStore({ failWith: 'relation missing' }), ['fail:a'], 5, { fn: 'fn-open' }));
  assert.equal(open.result, 'allowed');
  assert.ok(open.errors.some((line) => line.includes('[fn-open] durable rate limit unavailable')));

  const closed = await quietly(() => durableRateLimit(fakeStore({ failWith: 'relation missing' }), ['fail:b'], 5,
    { fn: 'fn-closed', failClosed: true }));
  assert.equal(closed.result, 'unavailable');

  const thrown = await quietly(() => durableRateLimit(fakeStore({ throwError: true }), ['fail:c'], 5,
    { fn: 'fn-closed', failClosed: true }));
  assert.equal(thrown.result, 'unavailable', 'a thrown RPC error counts as unavailable');

  // A fail-open limiter still has the per-instance fallback.
  const store = fakeStore({ failWith: 'down' });
  const outcomes = [];
  for (let i = 0; i < 3; i += 1) {
    outcomes.push((await quietly(() => durableRateLimit(store, ['fail:d'], 2, { fn: 'fn-open' }))).result);
  }
  assert.deepEqual(outcomes, ['allowed', 'allowed', 'throttled']);
});

test('rateLimitResponse: 429 when throttled, 503 when a fail-closed limiter is down', async () => {
  const req = request();
  const throttled = rateLimitResponse(req, 'throttled');
  assert.equal(throttled.status, 429);
  assert.deepEqual(await throttled.json(), { error: 'rate_limited' });
  const unavailable = rateLimitResponse(req, 'unavailable');
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: 'rate_limit_unavailable' });
});
