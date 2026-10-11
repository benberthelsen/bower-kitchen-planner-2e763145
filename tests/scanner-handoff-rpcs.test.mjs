// A scanner handoff is staff-only in the database RPCs as well as in
// get-planner-handoff. Loads the real migrations into a throwaway PostgreSQL
// cluster, with Supabase's roles and auth.uid() stubbed, and checks that a
// caller who is not staff can neither link, submit nor detect a scanner row.
// The cluster tests skip when no PostgreSQL server binaries are installed;
// the source check below always runs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chownSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const MIGRATIONS = 'supabase/migrations';
const migrationFiles = readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql')).sort();
const RPCS = ['submit_planner_enquiry_v1', 'link_trade_handoff_v1'];
const defines = (file, name) => readFileSync(join(MIGRATIONS, file), 'utf8')
  .includes(`CREATE OR REPLACE FUNCTION public.${name}(`);

test('the latest definition of each RPC refuses a scanner row like an unknown id', () => {
  const latest = (name) => {
    const file = migrationFiles.filter((candidate) => defines(candidate, name)).at(-1);
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    return sql.slice(start, sql.indexOf('\n$$;', start));
  };
  const submit = latest('submit_planner_enquiry_v1');
  assert.match(submit, /IF NOT FOUND OR v_handoff\.source = 'scanner' THEN\s+RAISE EXCEPTION 'invalid_handoff'/);
  assert.ok(submit.indexOf("'scanner'") < submit.indexOf("'expired_handoff'"),
    'the scanner refusal comes before expiry and consumption');
  assert.match(latest('link_trade_handoff_v1'),
    /IF NOT FOUND OR \(v_source = 'scanner' AND NOT v_is_staff\) THEN\s+RAISE EXCEPTION 'invalid_handoff'/);
});

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
/** Runs one session; returns the last output line, or the raised error code. */
function sql(statements) {
  const result = psql(['-c', statements]);
  if (result.status !== 0) {
    const error = result.stderr.match(/ERROR:\s+(\S+)/)?.[1];
    assert.ok(error, result.stderr);
    return { error };
  }
  return { value: result.stdout.trim().split('\n').at(-1) };
}
function load(file) {
  const result = psql(['-f', file]);
  assert.equal(result.status, 0, `${file}: ${result.stderr}`);
}

const STAFF = '33333333-3333-4333-8333-333333333333';
const CUSTOMER = '44444444-4444-4444-8444-444444444444';
const staffJob = '22222222-2222-4222-8222-222222222222';
const customerJob = '55555555-5555-4555-8555-555555555555';
const hash = (char) => char.repeat(64);
const rows = {
  website: ['66666666-6666-4666-8666-666666666666', 'website', hash('a'), '1 day'],
  websiteToSubmit: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'website', hash('e'), '1 day'],
  websiteExpired: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'website', hash('f'), '-1 day'],
  scanner: ['77777777-7777-4777-8777-777777777777', 'scanner', hash('b'), '1 day'],
  scannerExpired: ['88888888-8888-4888-8888-888888888888', 'scanner', hash('c'), '-1 day'],
  scannerForStaff: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'scanner', hash('d'), '1 day'],
};
const unknownId = '99999999-9999-4999-8999-999999999999';

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
  dir = mkdtempSync(join(tmpdir(), 'bower-rpcs-'));
  if (asRoot) {
    const uid = Number(postgresUser.stdout.trim());
    chownSync(dir, uid, Number(spawnSync('id', ['-g', 'postgres'], { encoding: 'utf8' }).stdout.trim()));
  }
  server('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-sync']);
  server('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-w', '-o',
    `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories='' -c fsync=off`, 'start']);

  const base = sql(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
    CREATE TABLE public.user_roles (user_id uuid NOT NULL, role public.app_role NOT NULL);
    CREATE TABLE public.jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, notes text,
      design_data jsonb, cost_excl_tax numeric, cost_incl_tax numeric, status text,
      delivery_method text, customer_id uuid);`);
  assert.equal(base.error, undefined);
  // The table and staff helper, the RPCs' first definitions, then every later
  // migration that redefines either RPC, so a redefinition is tested too.
  const required = ['20260708110000_planner_handoffs.sql', '20260714100000_app_role_staff.sql',
    '20260714100100_handoff_hardening.sql', '20260714100200_submit_enquiry_rpc.sql'];
  const redefinitions = migrationFiles.filter((file) => file > required.at(-1)
    && RPCS.some((name) => defines(file, name)));
  assert.ok(redefinitions.length > 0, 'the staff-only redefinition is loaded');
  for (const file of [...required, ...redefinitions]) load(join(MIGRATIONS, file));

  const seeded = sql(`
    INSERT INTO public.user_roles VALUES ('${STAFF}', 'staff');
    INSERT INTO public.jobs (id, name, customer_id) VALUES
      ('${staffJob}', 'Staff job', '${STAFF}'), ('${customerJob}', 'Customer job', '${CUSTOMER}');
    INSERT INTO public.planner_handoffs (id, source, payload, public_token_hash, expires_at) VALUES
      ${Object.values(rows).map(([id, source, tokenHash, expiry]) =>
        `('${id}', '${source}', '{}', '${tokenHash}', now() + interval '${expiry}')`).join(', ')};`);
  assert.equal(seeded.error, undefined);
});

after(() => {
  if (!dir) return;
  try { server('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', 'stop']); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

const link = (user, [handoffId], jobId) => sql(`SET ROLE authenticated;
  SET request.jwt.claim.sub = '${user}';
  SELECT public.link_trade_handoff_v1('${handoffId}', '${jobId}');`);
const submit = (handoffId, tokenHash) => sql(`SET ROLE service_role;
  SELECT public.submit_planner_enquiry_v1(gen_random_uuid(), '${hash('0')}', '{"name": "Enquiry"}',
    '${handoffId}', '${tokenHash}');`);
const state = ([handoffId]) => JSON.parse(sql(`SELECT json_build_object('consumed', consumed_at IS NOT NULL,
  'jobId', job_id) FROM public.planner_handoffs WHERE id = '${handoffId}';`).value);
const jobCount = () => Number(sql('SELECT count(*) FROM public.jobs;').value);

test('link: a job owner who is not staff cannot link a scanner row or tell it exists', { skip }, () => {
  assert.deepEqual(link(CUSTOMER, rows.scanner, customerJob), { error: 'invalid_handoff' });
  assert.deepEqual(link(CUSTOMER, [unknownId], customerJob), { error: 'invalid_handoff' });
  assert.deepEqual(state(rows.scanner), { consumed: false, jobId: null });
  assert.deepEqual(link(CUSTOMER, rows.scanner, staffJob), { error: 'not_authorized' },
    'someone else\'s job is still refused first');
});

test('link: staff link a scanner row; a website row still links for its job owner', { skip }, () => {
  assert.deepEqual(link(STAFF, rows.scannerForStaff, staffJob), { value: '{"linked": true}' });
  assert.deepEqual(state(rows.scannerForStaff), { consumed: true, jobId: staffJob });
  assert.deepEqual(link(CUSTOMER, rows.website, customerJob), { value: '{"linked": true}' });
  assert.deepEqual(state(rows.website), { consumed: true, jobId: customerJob });
});

test('submit: a scanner row fails like an unknown id, whatever its token or expiry', { skip }, () => {
  const jobsBefore = jobCount();
  assert.deepEqual(submit(unknownId, hash('b')), { error: 'invalid_handoff' });
  for (const [label, row, tokenHash] of [
    ['wrong token', rows.scanner, hash('9')],
    ['right token', rows.scanner, rows.scanner[2]],
    ['right token, expired', rows.scannerExpired, rows.scannerExpired[2]],
  ]) {
    assert.deepEqual(submit(row[0], tokenHash), { error: 'invalid_handoff' }, label);
    assert.deepEqual(state(row), { consumed: false, jobId: null }, `${label} leaves the row untouched`);
  }
  assert.equal(jobCount(), jobsBefore, 'no enquiry job is created');
});

test('submit: website rows keep their token, expiry and consumption behaviour', { skip }, () => {
  const [id, , tokenHash] = rows.websiteToSubmit;
  assert.deepEqual(submit(id, hash('9')), { error: 'invalid_handoff' });
  assert.deepEqual(submit(rows.websiteExpired[0], rows.websiteExpired[2]), { error: 'expired_handoff' });
  const created = submit(id, tokenHash);
  assert.equal(created.error, undefined);
  const { jobId, idempotentReplay } = JSON.parse(created.value);
  assert.equal(idempotentReplay, false);
  assert.deepEqual(state(rows.websiteToSubmit), { consumed: true, jobId });
  assert.deepEqual(submit(id, tokenHash), { error: 'consumed_handoff' });
});
