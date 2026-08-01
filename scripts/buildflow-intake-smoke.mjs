import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const helper = read('supabase/functions/_shared/buildFlow/leadIntake.ts');
const homeowner = read('supabase/functions/submit-planner-enquiry/index.ts');
const tradeEdge = read('supabase/functions/sync-buildflow-lead/index.ts');
const tradeUi = read('src/pages/trade/JobEditor.tsx');
const adminUi = read('src/pages/admin/JobDetail.tsx');
const migration = read('supabase/migrations/20260801090000_jobs_buildflow_delivery.sql');

assert.match(helper, /BUILDFLOW_LEAD_INTAKE_URL/);
assert.match(helper, /BUILDFLOW_INTAKE_SECRET/);
assert.match(helper, /x-intake-secret/);
assert.match(homeowner, /planner-lead:\$\{result\.jobId\}/);
assert.match(tradeEdge, /planner-lead:\$\{job\.id\}/);
assert.match(tradeEdge, /job\.customer_id === authData\.user\.id/);
assert.match(tradeUi, /functions\.invoke\('sync-buildflow-lead'/);
assert.match(adminUi, /Send to Build Flow/);
assert.match(migration, /buildflow_status text/);
assert.match(migration, /WHERE buildflow_status = 'failed'/);

console.log('Build Flow intake smoke test passed.');
