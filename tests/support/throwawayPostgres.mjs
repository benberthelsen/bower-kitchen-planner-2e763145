// A throwaway PostgreSQL cluster carrying the planner's real migrations, for
// node --test files that check SQL behaviour (the same approach as
// tests/scanner-handoff-rpcs.test.mjs). supabase-shim.sql stands in for
// Supabase's roles, auth schema and default grants; then every file in
// supabase/migrations is loaded in filename order, minus any the test holds
// back. Callers act as anon, a signed-in user or the service role by setting
// the role and JWT claims the way PostgREST does.
//
// `skip` is a reason string when no PostgreSQL server binaries are installed
// (or root has no postgres user to run them as); tests then skip.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chownSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS = 'supabase/migrations';
export const migrationFiles = readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql')).sort();
const SHIM = fileURLToPath(new URL('./supabase-shim.sql', import.meta.url));

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
export const skip = !bin ? 'no PostgreSQL server binaries installed'
  : postgresUser && postgresUser.status !== 0 ? 'running as root without a postgres user' : false;

/** SQL that makes the rest of a session run as this caller. */
export const as = {
  anon: () => `SET request.jwt.claims = '{"role": "anon"}'; SET ROLE anon;`,
  user: (id) => `SET request.jwt.claims = '{"role": "authenticated", "sub": "${id}"}'; SET ROLE authenticated;`,
  service: () => `SET request.jwt.claims = '{"role": "service_role"}'; SET ROLE service_role;`,
};

export async function startCluster({ holdBack = [] } = {}) {
  const port = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port: free } = probe.address();
      probe.close(() => resolve(free));
    });
  });
  const dir = mkdtempSync(join(tmpdir(), 'bower-sql-'));
  if (asRoot) {
    chownSync(dir, Number(postgresUser.stdout.trim()),
      Number(spawnSync('id', ['-g', 'postgres'], { encoding: 'utf8' }).stdout.trim()));
  }
  const server = (tool, args) => {
    const [command, argv] = asRoot
      ? ['runuser', ['-u', 'postgres', '--', join(bin, tool), ...args]] : [join(bin, tool), args];
    const result = spawnSync(command, argv, { encoding: 'utf8' });
    assert.equal(result.status, 0, `${tool} failed: ${result.stderr}`);
  };
  const psql = (args) => spawnSync(join(bin, 'psql'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres',
    '-d', 'postgres', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', ...args], { encoding: 'utf8' });

  /** Runs one session. Returns { value } (the last output line) or
   *  { error, code } (the raised message and SQLSTATE). */
  const sql = (statements) => {
    const result = psql(['-c', statements]);
    if (result.status !== 0) {
      const match = result.stderr.match(/ERROR:\s+([0-9A-Z]{5}):\s+(.*)/);
      assert.ok(match, result.stderr);
      return { error: match[2].trim(), code: match[1] };
    }
    return { value: result.stdout.trim().split('\n').at(-1) };
  };
  /** Runs a session that must succeed and returns its last output line. */
  const ok = (statements) => {
    const result = sql(statements);
    assert.equal(result.error, undefined, `${result.error} (${result.code})`);
    return result.value;
  };
  const load = (file) => {
    const result = psql(['-f', file]);
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  };
  /** Loads `body` wrapped in `before` and `after` from a temporary file. */
  const loadWrapped = (before, body, after) => {
    const file = join(dir, `wrapped-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
    writeFileSync(file, `${before}\n${body}\n${after}\n`);
    load(file);
  };
  const stop = () => {
    try { server('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', 'stop']); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  };

  try {
    server('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '--no-sync']);
    server('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'log'), '-w', '-o',
      `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories='' -c fsync=off`, 'start']);
    load(SHIM);
    for (const file of migrationFiles.filter((name) => !holdBack.includes(name))) load(join(MIGRATIONS, file));
  } catch (error) {
    try { stop(); } catch { rmSync(dir, { recursive: true, force: true }); }
    throw error;
  }
  return { sql, ok, load, loadWrapped, stop };
}
