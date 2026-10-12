// useAuth reads every user_roles row, so an account holding admin and staff
// keeps isAdmin (.single() failed on the second row and dropped it), and the
// admin trade list leaves staff out, puts job owners first and starts with
// nobody approved.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

async function load(entry) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const { resolveRoles } = await load('../src/lib/authRoles.ts');
const { buildTradeCandidates } = await load('../src/lib/tradeCandidates.ts');

test('an account with admin and staff roles is admin, in either row order', () => {
  for (const rows of [[{ role: 'admin' }, { role: 'staff' }], [{ role: 'staff' }, { role: 'admin' }]]) {
    assert.deepEqual(resolveRoles(rows), { roles: ['admin', 'staff'], isAdmin: true, userRole: 'admin' });
  }
});

test('one role, no roles and unknown roles', () => {
  assert.deepEqual(resolveRoles([{ role: 'staff' }]), { roles: ['staff'], isAdmin: false, userRole: 'staff' });
  assert.deepEqual(resolveRoles([{ role: 'admin' }]), { roles: ['admin'], isAdmin: true, userRole: 'admin' });
  for (const rows of [[], null, undefined, [{ role: 'superuser' }], [{}]]) {
    assert.deepEqual(resolveRoles(rows), { roles: [], isAdmin: false, userRole: null });
  }
});

test('useAuth reads every role row and resolves them together', () => {
  const source = readFileSync(new URL('../src/hooks/useAuth.ts', import.meta.url), 'utf8');
  const roleQuery = source.slice(source.indexOf(".from('user_roles')"), source.indexOf(".from('profiles')"));
  assert.ok(roleQuery.length > 0, 'the role query is found');
  assert.doesNotMatch(roleQuery, /\.(single|maybeSingle)\(\)/);
  assert.match(source, /resolveRoles\(/);
  assert.match(source, /\.from\('trade_accounts'\)/);
  assert.match(source, /isTrade,/);
});

test('trade candidates: staff left out, job owners first, nobody approved without a row', () => {
  const profile = (id, created_at) => ({ id, email: `${id}@example.com`, full_name: id, company_name: null,
    user_type: 'consumer', created_at });
  const profiles = [profile('admin', '2026-01-01T00:00:00Z'), profile('staff', '2026-01-02T00:00:00Z'),
    profile('quiet-new', '2026-09-01T00:00:00Z'), profile('quiet-old', '2026-02-01T00:00:00Z'),
    profile('busy', '2026-03-01T00:00:00Z'), profile('recent', '2026-04-01T00:00:00Z')];
  const jobs = [
    { customer_id: 'busy', created_at: '2026-03-05T00:00:00Z', updated_at: '2026-03-06T00:00:00Z' },
    { customer_id: 'busy', created_at: '2026-03-02T00:00:00Z', updated_at: '2026-05-01T00:00:00Z' },
    { customer_id: 'recent', created_at: '2026-08-01T00:00:00Z', updated_at: null },
    { customer_id: 'admin', created_at: '2026-01-05T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
    { customer_id: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
  ];
  const roles = [{ user_id: 'admin', role: 'admin' }, { user_id: 'staff', role: 'staff' },
    { user_id: 'quiet-old', role: 'user' }];
  const candidates = buildTradeCandidates(profiles, jobs, roles, [
    { user_id: 'busy', approved_at: '2026-10-02T00:00:00Z' },
  ]);
  assert.deepEqual(candidates.map((c) => c.profile.id), ['recent', 'busy', 'quiet-new', 'quiet-old']);
  assert.deepEqual(candidates.map((c) => [c.jobCount, c.firstJobAt, c.lastJobAt, c.approved, c.approvedAt]), [
    [1, '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z', false, null],
    [2, '2026-03-02T00:00:00Z', '2026-05-01T00:00:00Z', true, '2026-10-02T00:00:00Z'],
    [0, null, null, false, null],
    [0, null, null, false, null],
  ]);
  assert.ok(buildTradeCandidates(profiles, jobs, roles, []).every((c) => !c.approved), 'nothing pre-filled');
});
