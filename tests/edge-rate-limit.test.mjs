// Rate-limit identity for the public Edge Functions. A client can write the
// leftmost X-Forwarded-For entry, so every limiter also counts the request
// against Cloudflare's CF-Connecting-IP, and forging the header never buys a
// fresh bucket. Keys are an HMAC under a server-side secret, so a stored key
// cannot be reversed by hashing every address, and a fail-closed limiter
// allows a request only on a `true` answer. Loads the real shared helper
// with Deno's env stubbed.
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const source = await readFile(new URL('../supabase/functions/_shared/roomScan/security.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const SERVICE_KEY = `service.key.${'k'.repeat(32)}`;
let env = { SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY };
globalThis.Deno = { env: { get: (name) => env[name] } };
/** A fresh copy of the module: its own per-instance limiter and secret. */
const loadSecurity = (() => {
  let copy = 0;
  return () => import(`data:text/javascript;base64,${Buffer.from(`${code}\n// copy ${copy += 1}\n`).toString('base64')}`);
})();
const {
  addressBucket, durableRateLimit, ipKey, ipKeys, rateKeys, rateLimitResponse, rateLimited,
} = await loadSecurity();

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

test('a fail-closed limiter allows only a `true` answer: any other value is unavailable', async () => {
  const answering = (data) => ({ async rpc() { return { data, error: null }; } });
  const unexpected = [null, undefined, 0, 1, 21, '', 'f', 'true', {}, { allowed: false }, { allowed: true }, [], [{ allowed: false }]];
  for (const [index, data] of unexpected.entries()) {
    const closed = await quietly(() => durableRateLimit(answering(data), [`odd-closed:${index}`], 5,
      { fn: 'fn-closed', failClosed: true }));
    assert.equal(closed.result, 'unavailable', `${JSON.stringify(data)} must not count as allowed`);
    assert.ok(closed.errors.some((line) => line.includes('[fn-closed] durable rate limit unavailable')
      && line.includes('unexpected result')), JSON.stringify(data));
    // The fail-open default keeps today's outcome, but now logs the degradation.
    const open = await quietly(() => durableRateLimit(answering(data), [`odd-open:${index}`], 5, { fn: 'fn-open' }));
    assert.equal(open.result, 'allowed', JSON.stringify(data));
    assert.ok(open.errors.some((line) => line.includes('[fn-open] durable rate limit unavailable')), JSON.stringify(data));
  }
  // Every key must answer `true`: one odd answer beside a `true` is unavailable.
  let call = 0;
  const mixed = { async rpc() { call += 1; return { data: call === 1 ? true : null, error: null }; } };
  assert.equal((await quietly(() => durableRateLimit(mixed, ['odd-mixed:a', 'odd-mixed:b'], 5,
    { fn: 'fn-closed', failClosed: true }))).result, 'unavailable');
  // A `false` from any key still throttles, whatever the other key said.
  call = 0;
  const throttledBeside = { async rpc() { call += 1; return call === 1 ? { data: false, error: null } : { data: null, error: { message: 'down' } }; } };
  assert.equal((await quietly(() => durableRateLimit(throttledBeside, ['odd-false:a', 'odd-false:b'], 5,
    { fn: 'fn-closed', failClosed: true }))).result, 'throttled');
  // And `true` from every key is allowed, silently.
  const allowed = await quietly(() => durableRateLimit(answering(true), ['odd-true:a', 'odd-true:b'], 5,
    { fn: 'fn-closed', failClosed: true }));
  assert.equal(allowed.result, 'allowed');
  assert.deepEqual(allowed.errors, []);
});

const day = () => new Date().toISOString().slice(0, 10);
const plainHash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 24);
const hmacKey = (secret, address) => createHmac('sha256', secret).update(`rate-key-v2:${day()}:${address}`)
  .digest('hex').slice(0, 24);

test('a stored key cannot be reversed by hashing candidate addresses without the server secret', async () => {
  const VICTIM = '203.0.113.77';
  const key = await ipKey(request({ 'cf-connecting-ip': VICTIM }));
  assert.equal(key, hmacKey(SERVICE_KEY, VICTIM), 'the key is an HMAC under the service role key');
  // The reviewer's attack: hash "<public day>:<ip>" (and other unkeyed forms)
  // for every address in the victim's /24. None of them reproduces the key.
  for (let host = 0; host < 256; host += 1) {
    const address = `203.0.113.${host}`;
    for (const guess of [`${day()}:${address}`, `rate-key-v2:${day()}:${address}`, address]) {
      assert.notEqual(plainHash(guess), key, guess);
    }
  }
  // A dedicated secret takes precedence, and a different secret gives a different key.
  env = { SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, RATE_LIMIT_KEY_SECRET: 'r'.repeat(48) };
  try {
    const dedicated = await ipKey(request({ 'cf-connecting-ip': VICTIM }));
    assert.equal(dedicated, hmacKey('r'.repeat(48), VICTIM));
    assert.notEqual(dedicated, key);
  } finally {
    env = { SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY };
  }
  assert.equal(await ipKey(request({ 'cf-connecting-ip': VICTIM })), key, 'the key follows the configured secret');
});

test('without any secret a function uses a random per-instance one, and says so once', async () => {
  env = {};
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const first = await loadSecurity();
    const a = await first.ipKey(request({ 'cf-connecting-ip': CLIENT }));
    assert.equal(await first.ipKey(request({ 'cf-connecting-ip': CLIENT })), a, 'stable within an instance');
    assert.notEqual(a, plainHash(`${day()}:${CLIENT}`));
    assert.notEqual(a, hmacKey('', CLIENT));
    const second = await loadSecurity();
    assert.notEqual(await second.ipKey(request({ 'cf-connecting-ip': CLIENT })), a, 'another instance has another secret');
    assert.equal(errors.filter((line) => line.includes('caller keys are per-instance')).length, 2, 'one line per instance');
  } finally {
    console.error = original;
    env = { SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY };
  }
});
