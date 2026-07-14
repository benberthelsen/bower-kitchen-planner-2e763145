# WS6 — Unified Supabase Completion (ops)

**Complexity: LOW-MEDIUM (ops/checklist, needs Ben at the keyboard for CLI).**
Reference: docs/SUPABASE_UNIFICATION_RUNBOOK.md. Schema + data reseed already
done; this finishes the move.

## Tasks
1. **Deploy planner edge functions** (Ben runs; commands in the runbook §2):
   import-microvellum, process-dxf-geometry, export-microvellum-xml,
   import-prices, import-pricing, import-supplier-materials,
   scheduled-supplier-import, send-email. Verify each responds (Microvellum
   XML export from admin JobDetail is the easiest end-to-end check).
2. **RLS audit** — with two browsers (admin + a fresh trade signup):
   - trade user sees only own jobs; cannot select other users' jobs by id;
   - trade cannot read/write pricing tables or other clients' markups;
   - anon can insert funnel_events but not read them;
   - job_notes: trade sees non-internal notes on own jobs only, admin all;
   - storage buckets (if any) not public unless intended.
   Record results in this file; fix policies via migrations where broken.
3. **supplier_feeds cron** — enable pg_cron + pg_net (dashboard → extensions),
   then run the commented `cron.schedule` block from
   `supabase/migrations/20260620_supplier_feeds.sql` with the project ref and
   service key (dashboard-side only — never in the repo).
4. **Retire old project** `wyiydozwukiayhwcdlcf` after 1-2 weeks clean running;
   delete `.env.backup-wyiydozwukiayhwcdlcf`.
5. **Delete the stray planner copy** at
   `C:\Users\bench\OneDrive\Projects-Code\Kitchen planner` (confirm with Ben
   nothing unique lives there first — check git status/diff if it's a repo).
6. **Website env**: confirm the website deploy pipeline (whatever hosts
   bowerbuilding.net) carries the same VITE_SUPABASE_* values.

## Acceptance
- All planner functions deployed and callable; MV XML export produces a file.
- RLS table in this doc filled in with pass/fail per check, all pass.
- Feeds cron fires (check supplier_feeds.last_run_at after a scheduled run).

## RLS read-only audit (2026-07-13)

Reviewed every `USING (true)` SELECT policy across `supabase/migrations`.

Clean:
- Raw supplier COST tables — material_pricing, hardware_pricing, parts_pricing,
  edge_pricing, door_drawer_pricing, benchtop_pricing (ex stone_pricing),
  labor_rates, products — are all `to authenticated` after
  `20260705_rls_lockdown_pricing.sql`. No anon cost exposure.
- `client_markup_settings` — admin-view-all / user-view-own / authenticated
  view of the global default only. Acceptable (trade users need the default to price).
- `planner_handoffs` — anon **INSERT** only; SELECT/consume are authenticated.
  Website can create a handoff but nobody can read others' handoffs anonymously.
- `funnel_events` — anon INSERT (analytics), authenticated SELECT. Fine.

One finding (low risk, needs a product call):
- `microvellum_products` still has `"Anyone can view microvellum products"
  FOR SELECT USING (true)` — anon-readable. It carries catalog IDENTITY only
  (names, dimensions, door/drawer counts, spec groups, geometry) — **no costs** —
  so this is not a price leak, and the lockdown deliberately left the catalog
  readable. But the policy is anon, while the lockdown comment says "authenticated".
  DECISION NEEDED: if the public/homeowner catalog does not need anon reads,
  tighten this to `to authenticated` to match intent. Left as-is for now to avoid
  breaking any public catalog display.
