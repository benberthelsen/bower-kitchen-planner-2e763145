// Lead integrity (20261011100000_lead_integrity.sql) against the real
// migrations in a throwaway PostgreSQL cluster: only the service role and
// Bower staff create or touch a homeowner enquiry, linking a handoff needs
// its token unless the caller is staff, and funnel_events rows are bounded.
// The follow-up that revokes link_trade_handoff_v1 is held back at first, as
// it is in production, and applied in the last test.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { MIGRATIONS, as, skip, startCluster } from './support/throwawayPostgres.mjs';

const LEAD_INTEGRITY = '20261011100000_lead_integrity.sql';
const REVOKE_V1 = '20261011100200_followup_revoke_link_trade_handoff_v1.sql';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const STAFF = '33333333-3333-4333-8333-333333333333';
const CUSTOMER = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';

const jobs = {
  customerDraft: 'a0000000-0000-4000-8000-000000000001',
  // An enquiry its customer can see and, by RLS alone, update: only the
  // trigger stands between them and a rewrite.
  ownedEnquiry: 'a0000000-0000-4000-8000-000000000002',
  lead: 'a0000000-0000-4000-8000-000000000003',
  leadForPromotion: 'a0000000-0000-4000-8000-000000000004',
  staffDraft: 'a0000000-0000-4000-8000-000000000005',
  otherDraft: 'a0000000-0000-4000-8000-000000000006',
};

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const token = (char) => char.repeat(43);
const handoffs = {
  website: ['b0000000-0000-4000-8000-000000000001', 'website', sha256(token('a'))],
  websiteForStaff: ['b0000000-0000-4000-8000-000000000002', 'website', sha256(token('b'))],
  scanner: ['b0000000-0000-4000-8000-000000000003', 'scanner', sha256(token('c'))],
  scannerForStaff: ['b0000000-0000-4000-8000-000000000004', 'scanner', sha256(token('d'))],
  untokened: ['b0000000-0000-4000-8000-000000000005', 'website', null],
  forV1: ['b0000000-0000-4000-8000-000000000006', 'website', sha256(token('e'))],
  afterRevoke: ['b0000000-0000-4000-8000-000000000007', 'website', sha256(token('f'))],
};
const unknownHandoff = 'b0000000-0000-4000-8000-0000000000ff';

let db = null;

before(async () => {
  if (skip) return;
  db = await startCluster({ holdBack: [REVOKE_V1] });
  // Seeded by postgres with no JWT, the way a migration or the SQL editor
  // writes; the trigger lets that through.
  db.ok(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@example.com'), ('${STAFF}', 'staff@example.com'),
      ('${CUSTOMER}', 'customer@example.com'), ('${OTHER}', 'other@example.com');
    INSERT INTO public.user_roles (user_id, role) VALUES ('${ADMIN}', 'admin'), ('${STAFF}', 'staff');
    INSERT INTO public.jobs (id, name, status, customer_id) VALUES
      ('${jobs.customerDraft}', 'Customer draft', 'draft', '${CUSTOMER}'),
      ('${jobs.ownedEnquiry}', 'Owned enquiry', 'enquiry', '${CUSTOMER}'),
      ('${jobs.lead}', 'Wizard lead', 'enquiry', NULL),
      ('${jobs.leadForPromotion}', 'Lead to promote', 'enquiry', NULL),
      ('${jobs.staffDraft}', 'Staff draft', 'draft', '${STAFF}'),
      ('${jobs.otherDraft}', 'Other draft', 'draft', '${OTHER}');
    INSERT INTO public.planner_handoffs (id, source, payload, public_token_hash, expires_at) VALUES
      ${Object.values(handoffs).map(([id, source, hash]) =>
        `('${id}', '${source}', '{}', ${hash ? `'${hash}'` : 'NULL'}, now() + interval '1 day')`).join(', ')};`);
});

after(() => db?.stop());

const job = (id) => JSON.parse(db.ok(`SELECT json_build_object('status', status, 'notes', notes,
  'customer', customer_id) FROM public.jobs WHERE id = '${id}';`));
const handoff = ([id]) => JSON.parse(db.ok(`SELECT json_build_object('consumed', consumed_at IS NOT NULL,
  'jobId', job_id) FROM public.planner_handoffs WHERE id = '${id}';`));
const jobCount = () => Number(db.ok('SELECT count(*) FROM public.jobs;'));
const notAuthorized = { error: 'not_authorized', code: '42501' };

test('jobs: a signed-in account cannot INSERT an enquiry, even as its own customer', { skip }, () => {
  const before = jobCount();
  assert.deepEqual(db.sql(`${as.user(CUSTOMER)}
    INSERT INTO public.jobs (name, status, customer_id) VALUES ('Injected lead', 'enquiry', '${CUSTOMER}');`),
  notAuthorized);
  assert.deepEqual(db.sql(`${as.user(CUSTOMER)}
    INSERT INTO public.jobs (name, status, customer_id) VALUES ('Injected lead', 'enquiry', NULL);`),
  notAuthorized);
  assert.deepEqual(db.sql(`${as.anon()}
    INSERT INTO public.jobs (name, status) VALUES ('Anonymous lead', 'enquiry');`), notAuthorized);
  assert.equal(jobCount(), before);
});

test('jobs: the owner still creates and edits a draft', { skip }, () => {
  const id = db.ok(`${as.user(CUSTOMER)}
    INSERT INTO public.jobs (name, status, customer_id) VALUES ('New draft', 'draft', '${CUSTOMER}') RETURNING id;`);
  assert.equal(job(id).status, 'draft');
  const defaulted = db.ok(`${as.user(CUSTOMER)}
    INSERT INTO public.jobs (name, customer_id) VALUES ('Default status', '${CUSTOMER}') RETURNING status;`);
  assert.equal(defaulted, 'draft');
  assert.equal(db.ok(`${as.user(CUSTOMER)}
    UPDATE public.jobs SET notes = 'edited', status = 'pending_approval'
      WHERE id = '${jobs.customerDraft}' RETURNING status;`), 'pending_approval');
});

test('jobs: an owner cannot turn a draft into an enquiry', { skip }, () => {
  const id = db.ok(`${as.user(CUSTOMER)}
    INSERT INTO public.jobs (name, status, customer_id) VALUES ('Draft', 'draft', '${CUSTOMER}') RETURNING id;`);
  assert.deepEqual(db.sql(`${as.user(CUSTOMER)}
    UPDATE public.jobs SET status = 'enquiry' WHERE id = '${id}';`), notAuthorized);
  assert.equal(job(id).status, 'draft');
});

test('jobs: a customer who can see an enquiry cannot change it', { skip }, () => {
  assert.equal(db.ok(`${as.user(CUSTOMER)}
    SELECT count(*) FROM public.jobs WHERE id = '${jobs.ownedEnquiry}';`), '1', 'RLS shows the row');
  for (const change of ["notes = 'rewritten'", "status = 'draft'", `customer_id = '${OTHER}'`]) {
    assert.deepEqual(db.sql(`${as.user(CUSTOMER)}
      UPDATE public.jobs SET ${change} WHERE id = '${jobs.ownedEnquiry}';`), notAuthorized, change);
  }
  assert.deepEqual(job(jobs.ownedEnquiry), { status: 'enquiry', notes: null, customer: CUSTOMER });
});

test('jobs: a session impersonating a user is judged by its JWT, not as postgres', { skip }, () => {
  assert.deepEqual(db.sql(`SET request.jwt.claims = '{"role": "authenticated", "sub": "${CUSTOMER}"}';
    UPDATE public.jobs SET notes = 'impersonated' WHERE id = '${jobs.ownedEnquiry}';`), notAuthorized);
  assert.deepEqual(db.sql(`SET request.jwt.claims = '{"role": "anon"}';
    INSERT INTO public.jobs (name, status) VALUES ('Impersonated lead', 'enquiry');`), notAuthorized);
});

test('jobs: the service-role submit RPCs still create enquiries', { skip }, () => {
  const v1 = JSON.parse(db.ok(`${as.service()}
    SELECT public.submit_planner_enquiry_v1(gen_random_uuid(), '${sha256('v1')}',
      '{"name": "Wizard enquiry", "status": "enquiry"}');`));
  assert.equal(v1.idempotentReplay, false);
  assert.deepEqual(job(v1.jobId), { status: 'enquiry', notes: null, customer: null });

  const v2 = JSON.parse(db.ok(`${as.service()}
    SELECT public.submit_planner_enquiry_v2(gen_random_uuid(), '${sha256('v2')}',
      '{"name": "Synthetic enquiry"}', NULL, NULL, 'RUN_LEAD_INTEGRITY', 'SYN-P001');`));
  assert.equal(job(v2.jobId).status, 'enquiry');
  assert.equal(db.ok(`SELECT is_synthetic_test FROM public.jobs WHERE id = '${v2.jobId}';`), 't');

  // submit-planner-enquiry records Build Flow delivery on the new lead.
  assert.equal(db.ok(`${as.service()}
    UPDATE public.jobs SET buildflow_status = 'published' WHERE id = '${v1.jobId}' RETURNING buildflow_status;`),
  'published');
});

test('jobs: promote_ai_design_v1 through the service role still turns a lead into a draft', { skip }, () => {
  const result = JSON.parse(db.ok(`${as.service()}
    SELECT public.promote_ai_design_v1('${jobs.leadForPromotion}', '${STAFF}',
      '{"id": "room-1", "cabinets": []}', '{"source": "test"}');`));
  assert.deepEqual(result, { jobId: jobs.leadForPromotion, tradeRoomId: 'room-1', alreadyPromoted: false });
  assert.equal(job(jobs.leadForPromotion).status, 'draft');
});

test('jobs: staff change enquiries', { skip }, () => {
  assert.equal(db.ok(`${as.user(ADMIN)}
    UPDATE public.jobs SET notes = 'called back' WHERE id = '${jobs.lead}' RETURNING notes;`), 'called back');
  assert.equal(db.ok(`${as.user(ADMIN)}
    UPDATE public.jobs SET status = 'draft' WHERE id = '${jobs.lead}' RETURNING status;`), 'draft');
  assert.equal(db.ok(`${as.user(ADMIN)}
    UPDATE public.jobs SET status = 'enquiry' WHERE id = '${jobs.lead}' RETURNING status;`), 'enquiry');
  // The staff role (not admin) passes the trigger too; RLS still limits
  // which rows a staff member reaches.
  assert.equal(db.ok(`${as.user(STAFF)}
    INSERT INTO public.jobs (name, status, customer_id) VALUES ('Phone lead', 'enquiry', '${STAFF}')
      RETURNING status;`), 'enquiry');
});

const link = (user, [handoffId], jobId, tokenHash) => db.sql(`${as.user(user)}
  SELECT public.link_trade_handoff_v2('${handoffId}', '${jobId}', ${tokenHash ? `'${tokenHash}'` : 'NULL'});`);

test('link v2: a job owner needs the handoff token; wrong or missing fails like an unknown id', { skip }, () => {
  const invalid = { error: 'invalid_handoff', code: 'P0001' };
  assert.deepEqual(link(CUSTOMER, handoffs.website, jobs.customerDraft, sha256(token('z'))), invalid);
  assert.deepEqual(link(CUSTOMER, handoffs.website, jobs.customerDraft, null), invalid);
  assert.deepEqual(link(CUSTOMER, handoffs.website, jobs.customerDraft, handoffs.website[2].toUpperCase()), invalid);
  assert.deepEqual(link(CUSTOMER, [unknownHandoff], jobs.customerDraft, handoffs.website[2]), invalid);
  assert.deepEqual(link(CUSTOMER, handoffs.untokened, jobs.customerDraft, sha256('anything')), invalid,
    'a row with no token hash is never linked by a non-staff caller');
  assert.deepEqual(handoff(handoffs.website), { consumed: false, jobId: null });
  assert.deepEqual(handoff(handoffs.untokened), { consumed: false, jobId: null });

  assert.deepEqual(link(CUSTOMER, handoffs.website, jobs.customerDraft, handoffs.website[2]),
    { value: '{"linked": true}' });
  assert.deepEqual(handoff(handoffs.website), { consumed: true, jobId: jobs.customerDraft });
});

test('link v2: the job-owner check and the scanner staff-only rule still apply', { skip }, () => {
  assert.deepEqual(link(CUSTOMER, handoffs.websiteForStaff, jobs.otherDraft, handoffs.websiteForStaff[2]),
    { error: 'not_authorized', code: 'P0001' }, 'someone else\'s job is refused, token or not');
  assert.deepEqual(link(CUSTOMER, handoffs.scanner, jobs.customerDraft, handoffs.scanner[2]),
    { error: 'invalid_handoff', code: 'P0001' }, 'a scanner row needs staff even with its token');
  assert.deepEqual(handoff(handoffs.scanner), { consumed: false, jobId: null });
  assert.equal(db.sql(`${as.anon()} SELECT public.link_trade_handoff_v2('${handoffs.website[0]}',
    '${jobs.customerDraft}', NULL);`).code, '42501', 'anon cannot call it');

  assert.deepEqual(link(STAFF, handoffs.scannerForStaff, jobs.staffDraft, null), { value: '{"linked": true}' });
  assert.deepEqual(handoff(handoffs.scannerForStaff), { consumed: true, jobId: jobs.staffDraft });
  assert.deepEqual(link(STAFF, handoffs.websiteForStaff, jobs.staffDraft, null), { value: '{"linked": true}' },
    'staff link without the token');
  assert.deepEqual(handoff(handoffs.websiteForStaff), { consumed: true, jobId: jobs.staffDraft });
});

test('funnel_events: oversized rows are refused; ordinary events still go in', { skip }, () => {
  const insert = (sessionId, eventType, metadata) => db.sql(`${as.anon()}
    INSERT INTO public.funnel_events (session_id, event_type, metadata)
      VALUES ('${sessionId}', '${eventType}', '${JSON.stringify(metadata)}');`);
  assert.equal(insert('s1', 'step_complete', { step: 3, shape: 'l-shaped' }).error, undefined);
  assert.equal(insert('s'.repeat(128), 'e'.repeat(64), { note: 'x'.repeat(4000) }).error, undefined,
    'exactly at the limits is accepted');

  const tooBig = insert('s1', 'step_complete', { note: 'x'.repeat(4100) });
  assert.equal(tooBig.code, '23514');
  assert.match(tooBig.error, /funnel_events_metadata_size/);
  assert.match(insert('s1', 'e'.repeat(65), {}).error, /funnel_events_event_type_length/);
  assert.match(insert('s'.repeat(129), 'step_complete', {}).error, /funnel_events_session_id_length/);

  assert.equal(db.ok(`SELECT string_agg(conname || ':' || convalidated, ',' ORDER BY conname)
    FROM pg_constraint WHERE conrelid = 'public.funnel_events'::regclass AND contype = 'c';`),
  'funnel_events_event_type_length:false,funnel_events_metadata_size:false,funnel_events_session_id_length:false',
  'added NOT VALID, so existing rows are left alone');
});

test('the migration re-runs cleanly, and its guarded parts skip a missing funnel_events', { skip }, () => {
  const file = join(MIGRATIONS, LEAD_INTEGRITY);
  db.load(file);
  db.load(file);
  assert.equal(db.ok(`SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.jobs'::regclass
    AND tgname = 'guard_enquiry_jobs';`), '1');
  assert.equal(db.ok(`SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.funnel_events'::regclass AND contype = 'c';`), '3');
  db.loadWrapped('BEGIN; DROP TABLE public.funnel_events;', readFileSync(file, 'utf8'), 'ROLLBACK;');
  assert.deepEqual(db.sql(`${as.user(CUSTOMER)}
    INSERT INTO public.jobs (name, status, customer_id) VALUES ('Still guarded', 'enquiry', '${CUSTOMER}');`),
  notAuthorized);
});

test('follow-up: v1 works until its revoke is applied, then only v2 links', { skip }, () => {
  assert.deepEqual(db.sql(`${as.user(CUSTOMER)}
    SELECT public.link_trade_handoff_v1('${handoffs.forV1[0]}', '${jobs.customerDraft}');`),
  { value: '{"linked": true}' }, 'tabs on the old frontend keep linking until the follow-up');

  const file = join(MIGRATIONS, REVOKE_V1);
  db.load(file);
  db.load(file);
  assert.equal(db.sql(`${as.user(CUSTOMER)}
    SELECT public.link_trade_handoff_v1('${handoffs.afterRevoke[0]}', '${jobs.customerDraft}');`).code, '42501');
  assert.deepEqual(handoff(handoffs.afterRevoke), { consumed: false, jobId: null });
  assert.deepEqual(link(CUSTOMER, handoffs.afterRevoke, jobs.customerDraft, handoffs.afterRevoke[2]),
    { value: '{"linked": true}' });
});
