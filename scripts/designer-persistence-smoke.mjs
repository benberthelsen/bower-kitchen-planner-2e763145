import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migration = readFileSync(
  path.join(root, 'supabase/migrations/20260714110000_ai_designer_v2_persistence.sql'),
  'utf8',
);
const edge = readFileSync(path.join(root, 'supabase/functions/ai-designer/index.ts'), 'utf8');

let failures = 0;
function check(name, test) {
  try {
    assert.ok(test(), name);
    console.log(`  OK ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
}

console.log('AI designer persistence smoke tests');

for (const table of [
  'ai_designer_sessions',
  'ai_design_brief_revisions',
  'ai_design_proposals',
  'ai_design_rule_results',
  'cabinet_catalog_capabilities',
  'ai_regulatory_profiles',
]) {
  check(`${table} exists and has RLS`, () =>
    migration.includes(`CREATE TABLE public.${table}`)
    && migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`));
}

check('public session tokens are stored only as SHA-256 hashes', () =>
  migration.includes('public_token_hash text NOT NULL UNIQUE')
  && !migration.match(/\bpublic_token\s+text/i));

check('session creation RPC is service-role only', () =>
  /REVOKE ALL ON FUNCTION public\.create_ai_designer_session_v1[\s\S]+FROM PUBLIC, anon, authenticated;/.test(migration)
  && /GRANT EXECUTE ON FUNCTION public\.create_ai_designer_session_v1[\s\S]+TO service_role;/.test(migration));

check('proposal persistence uses a row lock and optimistic revision check', () =>
  migration.includes('FOR UPDATE;')
  && migration.includes('v_session.design_revision <> p_expected_design_revision')
  && migration.includes("RAISE EXCEPTION 'stale_design_revision'"));

check('proposal persistence RPC is service-role only', () =>
  /REVOKE ALL ON FUNCTION public\.persist_ai_designer_proposals_v1[\s\S]+FROM PUBLIC, anon, authenticated;/.test(migration)
  && /GRANT EXECUTE ON FUNCTION public\.persist_ai_designer_proposals_v1[\s\S]+TO service_role;/.test(migration));

check('provisional capabilities cannot become quote-ready', () =>
  migration.includes("CHECK (NOT quote_ready OR approval_status = 'approved')")
  && migration.includes("'provisional', false"));

check('catalogue imports use V2 designer roles and capability fields', () =>
  migration.includes("ARRAY['sink-base']::text[]")
  && migration.includes("ARRAY['dishwasher-opening']::text[]")
  && migration.includes('mounting_class text NOT NULL')
  && migration.includes('width_config jsonb NOT NULL'));

check('approved capability resolution is deterministic and excludes provisional rows', () =>
  migration.includes('resolve_approved_cabinet_capability_v1')
  && migration.includes("c.approval_status = 'approved'")
  && migration.includes('abs(candidates.width_mm - p_requested_width_mm)')
  && migration.includes('candidates.item_id'));

check('proposal lineage stores engine, catalogue, pricing, prompt and model versions', () =>
  ['engine_version', 'catalog_version', 'pricing_version', 'prompt_version', 'model_provider', 'model_id']
    .every(column => migration.includes(column)));

check('Edge Function creates sessions and atomically persists proposals', () =>
  edge.includes("service.rpc('create_ai_designer_session_v1'")
  && edge.includes("service.rpc('persist_ai_designer_proposals_v1'")
  && edge.includes('stale_design_revision'));

check('AI endpoint uses restricted CORS/body/rate helpers', () =>
  edge.includes('const gated = gate(req)')
  && edge.includes('readJsonBody(req)')
  && edge.includes('ipKey(req)')
  && !edge.includes("'Access-Control-Allow-Origin': '*'"));

check('AI endpoint does not return raw provider failures', () =>
  edge.includes("errorResponse(req, 502, 'designer_provider_failed')")
  && !edge.includes('await resp.text()'));

if (failures > 0) {
  console.error(`\n${failures} persistence smoke test(s) failed`);
  process.exit(1);
}
console.log('\nAll AI designer persistence smoke tests passed');
