// The planner's report-only CSP sends violations to the csp-report Edge
// Function, which keeps daily counts through record_csp_report_v1. Runs the
// real handler with the Deno server and supabase-js imports replaced by
// in-memory fakes: both report formats are counted, only origins, keywords
// and masked paths reach the database, and nothing else is kept. Then loads
// the migration into a throwaway PostgreSQL cluster with Supabase's roles
// and default grants: it is idempotent, closed to the browser roles, and
// bounded per day. The cluster tests skip when no PostgreSQL server binaries
// are installed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chownSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
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

let instance = 0;
/** Each call is a cold start: a fresh module with an empty in-memory limiter. */
async function loadHandler() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../supabase/functions/csp-report/index.ts', import.meta.url))],
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
const PLANNER = 'https://bower-kitchen-planner.pages.dev';
const JOB_ID = '11111111-1111-4111-8111-111111111111';
let state;
const reset = ({ rpcError = null, recorded = true } = {}) => { state = { rpcError, recorded, calls: [] }; };

globalThis.Deno = { env: { get: (name) => ({
  SUPABASE_URL: 'https://project.supabase.invalid',
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  SCANNER_ALLOWED_ORIGINS: PLANNER,
})[name] } };
globalThis.__fakeSupabase = {
  createClient(_url, key) {
    assert.equal(key, SERVICE_KEY);
    return {
      async rpc(name, args) {
        state.calls.push({ name, args });
        if (state.rpcError) return { data: null, error: { message: state.rpcError } };
        return { data: state.recorded, error: null };
      },
      from(table) { throw new Error(`csp-report must not touch ${table} directly`); },
    };
  },
};

async function call(handler, body, { method = 'POST', contentType = 'application/csp-report', ip = '198.51.100.7', headers = {} } = {}) {
  const logs = [];
  const original = console.log;
  console.log = (line) => logs.push(String(line));
  try {
    const response = await handler(new Request('https://project.supabase.invalid/functions/v1/csp-report', {
      method,
      headers: { 'Content-Type': contentType, 'cf-connecting-ip': ip, ...headers },
      ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    }));
    return { status: response.status, headers: response.headers, text: await response.text(), logs };
  } finally { console.log = original; }
}
const records = () => state.calls.map(({ name, args }) => {
  assert.equal(name, 'record_csp_report_v1');
  return args;
});
const outcome = (result) => JSON.parse(result.logs.at(-1)).outcome;

test('report-uri: one violation is counted by origin, keyword and masked path only', async () => {
  reset();
  const handler = await loadHandler();
  const result = await call(handler, { 'csp-report': {
    'document-uri': `${PLANNER}/quote/${JOB_ID}?email=jane%40example.com`,
    referrer: 'https://www.bowercabinets.com.au/planner?name=Jane',
    'violated-directive': 'connect-src',
    'effective-directive': 'connect-src',
    'original-policy': "default-src 'self'",
    disposition: 'report',
    'blocked-uri': 'https://tracker.example.net/collect?uid=12345&email=jane@example.com',
    'source-file': `${PLANNER}/assets/index-abc123.js`,
    'line-number': 10,
    'script-sample': 'jane@example.com',
    'status-code': 200,
  } });
  assert.equal(result.status, 204);
  assert.equal(result.text, '');
  assert.deepEqual(records(), [{
    p_disposition: 'report',
    p_directive: 'connect-src',
    p_blocked: 'https://tracker.example.net',
    p_page: `${PLANNER}/quote/:id`,
    p_source: PLANNER,
  }]);
  const stored = JSON.stringify(state.calls);
  for (const secret of ['jane', JOB_ID, '12345', 'collect', 'index-abc123', 'bowercabinets', "default-src"]) {
    assert.ok(!stored.includes(secret), `${secret} reached the database`);
  }
  assert.equal(outcome(result), 'ok');
  assert.ok(!result.logs.join('\n').includes('jane'), 'the log line carries no report content');
});

test('Reporting API: csp-violation entries are counted, duplicates once, other types ignored', async () => {
  reset();
  const handler = await loadHandler();
  const violation = (body) => ({ type: 'csp-violation', age: 10, url: `${PLANNER}/wizard`, user_agent: 'Mozilla/5.0', body });
  const result = await call(handler, [
    violation({ documentURL: `${PLANNER}/wizard/scan`, effectiveDirective: 'script-src-elem', blockedURL: 'inline',
      disposition: 'report', sourceFile: `${PLANNER}/assets/a.js`, sample: 'alert(1)' }),
    violation({ documentURL: `${PLANNER}/wizard/scan`, effectiveDirective: 'script-src-elem', blockedURL: 'inline',
      disposition: 'report', sourceFile: `${PLANNER}/assets/b.js` }),
    violation({ documentURL: `${PLANNER}/wizard`, effectiveDirective: 'worker-src', blockedURL: `blob:${PLANNER}/${JOB_ID}`,
      disposition: 'enforce' }),
    violation({ documentURL: `${PLANNER}/trade/job/${JOB_ID}/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`, effectiveDirective: 'img-src',
      blockedURL: 'data:image/png;base64,AAAA', disposition: 'odd' }),
    violation({ documentURL: `${PLANNER}/`, effectiveDirective: 'script-src', blockedURL: 'chrome-extension://abcdefghijklmnop/inject.js' }),
    violation({ documentURL: `${PLANNER}/quote/Jane-Smith-at-example-dot-com/x9/trade-planner`, effectiveDirective: 'img-src',
      blockedURL: 'data:,x' }),
    { type: 'deprecation', body: { id: 'x', message: 'ignored' } },
    'not a report',
  ], { contentType: 'application/reports+json' });
  assert.equal(result.status, 204);
  assert.deepEqual(records(), [
    { p_disposition: 'report', p_directive: 'script-src-elem', p_blocked: 'inline', p_page: `${PLANNER}/wizard/scan`, p_source: PLANNER },
    { p_disposition: 'enforce', p_directive: 'worker-src', p_blocked: 'blob', p_page: `${PLANNER}/wizard`, p_source: '' },
    { p_disposition: 'unknown', p_directive: 'img-src', p_blocked: 'data', p_page: `${PLANNER}/trade/job/:id/:value`, p_source: '' },
    { p_disposition: 'unknown', p_directive: 'script-src', p_blocked: 'chrome-extension', p_page: `${PLANNER}/`, p_source: '' },
    { p_disposition: 'unknown', p_directive: 'img-src', p_blocked: 'data', p_page: `${PLANNER}/quote/:value/:value/trade-planner`, p_source: '' },
  ]);
  for (const kept of ['abcdefghijklmnop', 'a1b2c3d4', 'Jane']) {
    assert.ok(!JSON.stringify(state.calls).includes(kept), `${kept} was kept`);
  }
});

test('odd or hostile field values are bounded to safe labels', async () => {
  reset();
  const handler = await loadHandler();
  await call(handler, { 'csp-report': {
    'document-uri': 'javascript:alert(1)',
    'violated-directive': "script-src 'self' https://x.example",
    'blocked-uri': 'not a url at all <script>',
    'source-file': `https://${'a'.repeat(300)}.example/x.js`,
    disposition: 'report',
  } });
  await call(handler, { 'csp-report': {
    'document-uri': `${PLANNER}/wizard`, 'effective-directive': 'Script-Src; DROP TABLE x', 'blocked-uri': '',
  } });
  const [first, second] = records();
  assert.deepEqual(first, { p_disposition: 'report', p_directive: 'script-src', p_blocked: 'other', p_page: 'other',
    p_source: first.p_source });
  assert.ok(first.p_source.length <= 200);
  assert.deepEqual(second, { p_disposition: 'unknown', p_directive: 'other', p_blocked: 'none', p_page: `${PLANNER}/wizard`, p_source: '' });
});

test('at most 20 reports a request, and malformed requests store nothing', async () => {
  reset();
  const handler = await loadHandler();
  const many = Array.from({ length: 50 }, (_, index) => ({ type: 'csp-violation',
    body: { documentURL: `${PLANNER}/wizard`, effectiveDirective: 'img-src', blockedURL: `https://img${index}.example.com/a.png` } }));
  assert.equal((await call(handler, many, { contentType: 'application/reports+json' })).status, 204);
  assert.equal(records().length, 20);

  reset();
  assert.equal((await call(handler, 'not json')).status, 400);
  assert.equal((await call(handler, { 'csp-report': 'x' })).status, 400);
  assert.equal((await call(handler, [])).status, 400);
  assert.equal((await call(handler, { 'csp-report': { 'blocked-uri': 'x'.repeat(70 * 1024) } })).status, 413);
  assert.equal((await call(handler, null, { method: 'GET' })).status, 405);
  assert.deepEqual(state.calls, []);
});

test('the Reporting API preflight passes for the planner origin only', async () => {
  reset();
  const handler = await loadHandler();
  const preflight = await call(handler, null, { method: 'OPTIONS', headers: {
    Origin: PLANNER, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type',
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), PLANNER);
  assert.match(preflight.headers.get('access-control-allow-headers'), /content-type/);
  assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
  const other = await call(handler, null, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});

test('a flood is limited per instance, and no caller key is ever stored', async () => {
  reset();
  const handler = await loadHandler();
  const report = { 'csp-report': { 'document-uri': `${PLANNER}/`, 'effective-directive': 'img-src', 'blocked-uri': 'https://x.example/a' } };
  const statuses = [];
  for (let index = 0; index < 301; index += 1) statuses.push((await call(handler, report)).status);
  assert.deepEqual(statuses, [...Array(300).fill(204), 429]);
  assert.equal(state.calls.length, 300);
  assert.ok(state.calls.every(({ name }) => name === 'record_csp_report_v1'), 'no bump_edge_rate_limit_v1 call');
  assert.equal((await call(handler, report, { ip: '198.51.100.8' })).status, 204, 'another caller is not limited');
});

test('a store failure or a full day is logged, and the browser still gets 204', async () => {
  const report = { 'csp-report': { 'document-uri': `${PLANNER}/`, 'effective-directive': 'img-src', 'blocked-uri': 'https://x.example/a' } };
  reset({ rpcError: 'function record_csp_report_v1 does not exist' });
  let result = await call(await loadHandler(), report);
  assert.equal(result.status, 204);
  assert.equal(outcome(result), 'store_failed');
  reset({ recorded: false });
  result = await call(await loadHandler(), report);
  assert.equal(result.status, 204);
  assert.equal(outcome(result), 'day_full');
});

// ---- The migration, in a throwaway PostgreSQL cluster ----

const MIGRATION = 'supabase/migrations/20261011090000_csp_report_counts.sql';

function findServerBin() {
  const config = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
  const versions = existsSync('/usr/lib/postgresql')
    ? readdirSync('/usr/lib/postgresql').sort((a, b) => Number(b) - Number(a)) : [];
  return [config.status === 0 ? config.stdout.trim() : '', ...versions.map((v) => `/usr/lib/postgresql/${v}/bin`)]
    .find((dir) => dir && ['initdb', 'pg_ctl', 'psql'].every((tool) => existsSync(join(dir, tool)))) ?? null;
}

// initdb refuses to run as root, so a root user runs the server as postgres.
const bin = findServerBin();
const asRoot = process.getuid?.() === 0;
const postgresUser = asRoot ? spawnSync('id', ['-u', 'postgres'], { encoding: 'utf8' }) : null;
const skip = !bin ? 'no PostgreSQL server binaries installed'
  : postgresUser && postgresUser.status !== 0 ? 'running as root without a postgres user' : false;

let dir = null;
let port = 0;
function server(tool, args) {
  const [command, argv] = asRoot
    ? ['runuser', ['-u', 'postgres', '--', join(bin, tool), ...args]] : [join(bin, tool), args];
  const result = spawnSync(command, argv, { encoding: 'utf8' });
  assert.equal(result.status, 0, `${tool} failed: ${result.stderr}`);
}
function psql(args) {
  return spawnSync(join(bin, 'psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres',
    '-d', 'postgres', '-q', '-At', '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8' });
}
/** Runs one session; returns the last output line, or the error message. */
function sql(statements) {
  const result = psql(['-c', statements]);
  if (result.status !== 0) {
    const error = result.stderr.match(/ERROR:\s+(.+)/)?.[1];
    assert.ok(error, result.stderr);
    return { error };
  }
  return { value: result.stdout.trim().split('\n').at(-1) };
}
function load(file) {
  const result = psql(['-f', file]);
  assert.equal(result.status, 0, `${file}: ${result.stderr}`);
}

before(async () => {
  if (skip) return;
  port = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port: free } = probe.address();
      probe.close(() => resolve(free));
    });
  });
  dir = mkdtempSync(join(tmpdir(), 'bower-csp-'));
  if (asRoot) {
    const uid = Number(postgresUser.stdout.trim());
    chownSync(dir, uid, Number(spawnSync('id', ['-g', 'postgres'], { encoding: 'utf8' }).stdout.trim()));
  }
  server('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-sync']);
  server('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-w', '-o',
    `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories='' -c fsync=off`, 'start']);
  // Supabase's roles, and its default grants of new public tables and
  // functions to every API role, which the migration must take back.
  const base = sql(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;`);
  assert.equal(base.error, undefined);
  // Applied twice: it must be safe to apply on its own, again.
  load(MIGRATION);
  load(MIGRATION);
});

after(() => {
  if (!dir) return;
  try { server('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', 'stop']); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

const record = (args, role = 'service_role') => sql(`SET ROLE ${role};
  SELECT public.record_csp_report_v1(${args.map((value) => (value === null ? 'NULL' : `'${value}'`)).join(', ')});`);
const hits = (blocked) => sql(`SELECT coalesce(sum(hits), 0) FROM public.csp_report_counts
  WHERE day = (now() AT TIME ZONE 'UTC')::date AND blocked = '${blocked}';`).value;
const today = (count = 'count(*)') => sql(`SELECT ${count} FROM public.csp_report_counts
  WHERE day = (now() AT TIME ZONE 'UTC')::date;`).value;

test('db: the browser roles can neither read the counts nor record one', { skip }, () => {
  for (const role of ['anon', 'authenticated']) {
    assert.match(record(['report', 'img-src', 'https://x.example', 'https://p/', ''], role).error, /permission denied for function/);
    assert.match(sql(`SET ROLE ${role}; SELECT count(*) FROM public.csp_report_counts;`).error, /permission denied for table/);
    assert.match(sql(`SET ROLE ${role}; INSERT INTO public.csp_report_counts (day, disposition, directive, blocked, page, source)
      VALUES (current_date, 'report', 'x', 'x', 'x', 'x');`).error, /permission denied for table/);
  }
  assert.equal(sql(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.csp_report_counts'::regclass;`).value, 't');
});

test('db: service_role counts each distinct report per day and rejects unbounded input', { skip }, () => {
  const args = ['report', 'connect-src', 'https://tracker.example.net', 'https://p/wizard', ''];
  assert.deepEqual(record(args), { value: 't' });
  assert.deepEqual(record(args), { value: 't' });
  assert.equal(hits('https://tracker.example.net'), '2');
  assert.deepEqual(record(['report', 'img-src', 'https://tracker.example.net', 'https://p/wizard', '']), { value: 't' });
  assert.equal(hits('https://tracker.example.net'), '3');
  assert.equal(sql(`SELECT count(*) FROM public.csp_report_counts WHERE blocked = 'https://tracker.example.net';`).value, '2');
  for (const bad of [
    [null, 'img-src', 'x', 'p', ''],
    ['report', 'img-src', 'x'.repeat(201), 'p', ''],
    ['report', 'img-src', 'x', 'p'.repeat(201), ''],
    ['x'.repeat(17), 'img-src', 'x', 'p', ''],
  ]) {
    assert.match(record(bad).error, /invalid_csp_report/);
  }
});

test('db: a day holds at most 2,000 distinct rows; known rows still count', { skip }, () => {
  const before = Number(today());
  const fill = sql(`INSERT INTO public.csp_report_counts (day, disposition, directive, blocked, page, source)
    SELECT (now() AT TIME ZONE 'UTC')::date, 'report', 'img-src', 'https://fill' || n || '.example', 'https://p/', ''
    FROM generate_series(1, ${2000 - before - 1}) AS n;`);
  assert.equal(fill.error, undefined);
  assert.deepEqual(record(['report', 'img-src', 'https://last.example', 'https://p/', '']), { value: 't' });
  assert.equal(today(), '2000');
  assert.deepEqual(record(['report', 'img-src', 'https://one-too-many.example', 'https://p/', '']), { value: 'f' });
  assert.equal(today(), '2000');
  assert.equal(hits('https://one-too-many.example'), '0');
  assert.deepEqual(record(['report', 'img-src', 'https://last.example', 'https://p/', '']), { value: 't' });
  assert.equal(hits('https://last.example'), '2');
});

test('db: the first new row of a day removes rows older than 30 days', { skip }, () => {
  const seeded = sql(`DELETE FROM public.csp_report_counts;
    INSERT INTO public.csp_report_counts (day, disposition, directive, blocked, page, source) VALUES
      ((now() AT TIME ZONE 'UTC')::date - 31, 'report', 'img-src', 'https://old.example', 'https://p/', ''),
      ((now() AT TIME ZONE 'UTC')::date - 30, 'report', 'img-src', 'https://kept.example', 'https://p/', ''),
      ((now() AT TIME ZONE 'UTC')::date - 1, 'report', 'img-src', 'https://yesterday.example', 'https://p/', '');`);
  assert.equal(seeded.error, undefined);
  assert.deepEqual(record(['report', 'img-src', 'https://today.example', 'https://p/', '']), { value: 't' });
  assert.equal(sql(`SELECT string_agg(blocked, ',' ORDER BY day) FROM public.csp_report_counts;`).value,
    'https://kept.example,https://yesterday.example,https://today.example');
});
