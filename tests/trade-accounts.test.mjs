// Approved trade accounts (20261011100100_trade_accounts.sql) against the
// real migrations in a throwaway PostgreSQL cluster: only admins approve or
// revoke, a signed-in account sees only its own approval, nothing starts
// approved, and is_trade_or_staff answers for staff and approved accounts.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { MIGRATIONS, as, skip, startCluster } from './support/throwawayPostgres.mjs';

const TRADE_ACCOUNTS = '20261011100100_trade_accounts.sql';

const ADMIN = '11111111-1111-4111-8111-111111111111';
// Holds admin and staff both, as an owner who is also on the floor would.
const ADMIN_AND_STAFF = '22222222-2222-4222-8222-222222222222';
const STAFF = '33333333-3333-4333-8333-333333333333';
const TRADE_A = '44444444-4444-4444-8444-444444444444';
const TRADE_B = '55555555-5555-4555-8555-555555555555';
// Signed up as 'trade' and owns a job, but nobody has approved it.
const UNAPPROVED = '66666666-6666-4666-8666-666666666666';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';

let db = null;

before(async () => {
  if (skip) return;
  db = await startCluster();
  db.ok(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@example.com'), ('${ADMIN_AND_STAFF}', 'owner@example.com'),
      ('${STAFF}', 'staff@example.com'), ('${TRADE_A}', 'a@example.com'),
      ('${TRADE_B}', 'b@example.com'), ('${UNAPPROVED}', 'unapproved@example.com');
    INSERT INTO public.user_roles (user_id, role) VALUES
      ('${ADMIN}', 'admin'), ('${ADMIN_AND_STAFF}', 'admin'), ('${ADMIN_AND_STAFF}', 'staff'),
      ('${STAFF}', 'staff');
    UPDATE public.profiles SET user_type = 'trade' WHERE id IN ('${TRADE_A}', '${UNAPPROVED}');
    INSERT INTO public.jobs (name, status, customer_id) VALUES ('Existing job', 'draft', '${UNAPPROVED}');`);
});

after(() => db?.stop());

const rows = () => db.ok(`SELECT coalesce(string_agg(user_id::text, ',' ORDER BY user_id), '')
  FROM public.trade_accounts;`);
const visibleTo = (user) => db.ok(`${as.user(user)}
  SELECT coalesce(string_agg(user_id::text, ',' ORDER BY user_id), '') FROM public.trade_accounts;`);
const approve = (admin, user, extra = '') => db.sql(`${as.user(admin)}
  INSERT INTO public.trade_accounts (user_id${extra ? ', approved_by' : ''})
    VALUES ('${user}'${extra ? `, '${extra}'` : ''}) RETURNING approved_by;`);
const isTradeOrStaff = (user) => db.ok(`${as.user(TRADE_A)}
  SELECT public.is_trade_or_staff(${user ? `'${user}'` : 'NULL'});`);

test('nothing starts approved, and re-applying the migration backfills nothing', { skip }, () => {
  assert.equal(rows(), '');
  db.load(join(MIGRATIONS, TRADE_ACCOUNTS));
  assert.equal(rows(), '', 'a trade sign-up with a job is still not approved');
});

test('an account that is not admin cannot approve anyone, itself included', { skip }, () => {
  for (const [caller, user] of [[UNAPPROVED, UNAPPROVED], [TRADE_A, TRADE_A], [STAFF, TRADE_A]]) {
    const result = approve(caller, user);
    assert.equal(result.code, '42501', `${caller} approving ${user}`);
    assert.match(result.error, /row-level security/);
  }
  assert.equal(db.sql(`${as.anon()} INSERT INTO public.trade_accounts (user_id) VALUES ('${TRADE_A}');`).code,
    '42501');
  assert.equal(rows(), '');
});

test('an admin approves; the approval names that admin and no one else', { skip }, () => {
  assert.deepEqual(approve(ADMIN, TRADE_A), { value: ADMIN });
  assert.deepEqual(approve(ADMIN_AND_STAFF, TRADE_B), { value: ADMIN_AND_STAFF },
    'an admin who is also staff can approve');
  assert.equal(approve(ADMIN, UNAPPROVED, STAFF).code, '42501', 'approved_by cannot name another account');
  assert.equal(rows(), [TRADE_A, TRADE_B].join(','));
});

test('a signed-in account sees only its own approval; admins see the list', { skip }, () => {
  assert.equal(visibleTo(TRADE_A), TRADE_A);
  assert.equal(visibleTo(TRADE_B), TRADE_B);
  assert.equal(visibleTo(UNAPPROVED), '');
  assert.equal(visibleTo(STAFF), '', 'the staff role alone does not read the list');
  assert.equal(visibleTo(ADMIN), [TRADE_A, TRADE_B].join(','));
  assert.equal(db.sql(`${as.anon()} SELECT count(*) FROM public.trade_accounts;`).code, '42501');
});

test('an approved account cannot remove or change its approval', { skip }, () => {
  assert.equal(db.ok(`${as.user(TRADE_A)}
    WITH gone AS (DELETE FROM public.trade_accounts WHERE user_id = '${TRADE_A}' RETURNING 1)
    SELECT count(*) FROM gone;`), '0');
  assert.equal(db.sql(`${as.user(TRADE_A)}
    UPDATE public.trade_accounts SET approved_by = '${TRADE_A}' WHERE user_id = '${TRADE_A}';`).code, '42501');
  assert.equal(db.sql(`${as.user(ADMIN)}
    UPDATE public.trade_accounts SET approved_at = now() WHERE user_id = '${TRADE_A}';`).code, '42501',
  'approvals are inserted and deleted, never edited');
  assert.equal(rows(), [TRADE_A, TRADE_B].join(','));
});

test('is_trade_or_staff: staff and approved accounts yes, everyone else no', { skip }, () => {
  assert.equal(isTradeOrStaff(STAFF), 't');
  assert.equal(isTradeOrStaff(ADMIN), 't');
  assert.equal(isTradeOrStaff(ADMIN_AND_STAFF), 't');
  assert.equal(isTradeOrStaff(TRADE_A), 't');
  assert.equal(isTradeOrStaff(TRADE_B), 't');
  assert.equal(isTradeOrStaff(UNAPPROVED), 'f', 'signing up as trade is not approval');
  assert.equal(isTradeOrStaff(UNKNOWN), 'f');
  assert.equal(isTradeOrStaff(null), 'f');
  assert.equal(db.sql(`${as.anon()} SELECT public.is_trade_or_staff('${STAFF}');`).code, '42501');
});

test('an admin revokes; the account is no longer trade', { skip }, () => {
  assert.equal(db.ok(`${as.user(ADMIN)}
    WITH gone AS (DELETE FROM public.trade_accounts WHERE user_id = '${TRADE_B}' RETURNING 1)
    SELECT count(*) FROM gone;`), '1');
  assert.equal(isTradeOrStaff(TRADE_B), 'f');
  assert.equal(rows(), TRADE_A);
});

test('deleting the account deletes its approval', { skip }, () => {
  db.ok(`DELETE FROM auth.users WHERE id = '${TRADE_A}';`);
  assert.equal(rows(), '');
  assert.equal(isTradeOrStaff(TRADE_A), 'f');
});
