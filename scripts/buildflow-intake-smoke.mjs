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

// --- Audit follow-ups (Sep 2026) -------------------------------------------
const designHelper = read('supabase/functions/_shared/buildFlow/designIntake.ts');
const designEdge = read('supabase/functions/sync-buildflow-design/index.ts');

// The appliance lines a homeowner picked go to Build Flow as items[] from both
// the enquiry submit and the admin resend; the helper grosses ex-GST prices up.
assert.match(helper, /export function applianceItemsToLeadItems/);
assert.match(helper, /unitPrice \* 1\.1/);
assert.match(helper, /\{ items: input\.items \}/);
assert.match(homeowner, /items: applianceItemsToLeadItems\(dd\)/);
assert.match(tradeEdge, /items: applianceItemsToLeadItems\(designData\)/);

// Build Flow's own error reason is kept, and a duplicate replay is success.
for (const src of [helper, designHelper]) {
  assert.match(src, /body\.duplicate === true\) \{/);
  assert.match(src, /body\.error \?\? body\.message \?\? text/);
}

// The client's email is the job owner's, never the signed-in caller's.
assert.doesNotMatch(tradeEdge, /authData\.user\.email/);
assert.doesNotMatch(designEdge, /authData\.user\.email/);
assert.match(tradeEdge, /from\('profiles'\)\.select\('email'\)/);
assert.match(designEdge, /from\('profiles'\)\.select\('email'\)/);

// A failed resend keeps an earlier successful delivery on the row.
assert.doesNotMatch(tradeEdge, /buildflow_published_at: result\.ok \? new Date\(\)\.toISOString\(\) : null/);
assert.doesNotMatch(homeowner, /buildflow_published_at: leadResult\.ok \? new Date\(\)\.toISOString\(\) : null/);

// The planner link Build Flow stores comes from config, not the request origin.
assert.doesNotMatch(designEdge, /req\.headers\.get\('origin'\)/);
assert.match(designEdge, /PLANNER_ADMIN_URL/);

// Admin: approving from the status dropdown runs the same handoff, and the
// panel understands every state the two functions write.
assert.match(adminUi, /if \(newStatus === 'approved' && !wasApproved\) void sendToBuildFlow\(job\.id\)/);
assert.match(adminUi, /job\?\.buildflow_status === 'design_sent'/);
assert.match(adminUi, /job\.buildflow_status === 'design_failed'/);

console.log('Build Flow audit follow-up checks passed.');
