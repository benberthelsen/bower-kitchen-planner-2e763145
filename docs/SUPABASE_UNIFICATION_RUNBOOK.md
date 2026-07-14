# Supabase Unification Runbook

Goal: both apps (public website + kitchen planner) on ONE project —
**bower-cabinet-ai** (`ehtwywctledgkxexztbh`, ap-southeast-2). Old planner
project `wyiydozwukiayhwcdlcf` retires. Test data is reseeded, not migrated.
Prepared 2026-07-02.

## Already done in the repos (this session)

- Planner `.env` now points at bower-cabinet-ai (URL, project id, publishable key).
  The old values are kept in `.env.backup-wyiydozwukiayhwcdlcf` (git-ignored) in case
  you need to roll back.
- Planner `supabase/config.toml` → `project_id = "ehtwywctledgkxexztbh"`.
- The hard-coded third project (`cfwywsrhwnfqzdxcgnmm`) is gone —
  `src/integrations/external-supabase/client.ts` is now a shim over the main
  env-configured client (only legacy pages used it; they're queued for deletion).
- `supabase/bootstrap/planner_schema_bootstrap.sql` — every planner migration
  concatenated in order, ready to paste into the SQL editor.

## Steps for you (each is a few minutes)

**1. Create the planner schema on bower-cabinet-ai.**
Supabase dashboard → bower-cabinet-ai → SQL Editor → paste and run
`supabase/bootstrap/planner_schema_bootstrap.sql` (planner repo). Run it
**before** the website's scraper-catalog migration if that hasn't been applied
yet — its policies reference `user_roles`, which this script creates. It seeds
benchtop pricing (Meganite/Egger) and the two dimension presets as it goes.

**2. Deploy the planner edge functions to the unified project.**
From the planner repo (the config.toml already targets the right project):

```powershell
supabase link --project-ref ehtwywctledgkxexztbh
supabase functions deploy import-microvellum
supabase functions deploy process-dxf-geometry
supabase functions deploy export-microvellum-xml
supabase functions deploy import-prices
supabase functions deploy import-pricing
supabase functions deploy import-supplier-materials
supabase functions deploy scheduled-supplier-import
supabase functions deploy send-email
```

The website functions (generate-flatlay, generate-design-image,
scrape-supplier-catalog) are already on this project — nothing to do.

**3. Auth setup.**
Authentication → create your admin user (or sign up through the app), then in
SQL editor grant the role:

```sql
insert into user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'ben@bowerbuilding.net'
on conflict do nothing;
```

**4. Reseed pricing data (in this order).**
1. Materials + hardware: SQL editor → run
   `public/data/bower-supplier-catalog/material_pricing_supabase_upsert.sql`
   then `hardware_pricing_supabase_upsert.sql` (either repo's copy — identical).
2. Microvellum products: planner Admin → Settings → Microvellum Product Catalog
   → import the bundled product list (or your latest XML).
3. Parts/edges/labor: planner Admin → Pricing pages, or re-run your MV pricing
   import — labor_rates seeds ship in the bootstrap where the migrations had them.
4. Sanity check: open the planner, add a Base 3 Drawer, confirm a non-zero
   Est. Total and that materials show swatch images.

**5. RLS spot-checks (5 minutes).**
- Signed-out browser → planner URL: should not read jobs or pricing.
- Trade user: sees own jobs only; cannot read `client_markup_settings` of others.
- Admin: full pricing pages work; job list shows costs.
- Website flat-lay + scope builder still work (they were already on this project).

**6. Retire the old project.**
Once the planner runs clean for a few days, pause/delete `wyiydozwukiayhwcdlcf`
in the dashboard so nothing quietly writes there, and delete
`.env.backup-wyiydozwukiayhwcdlcf`.

## What this unlocks immediately

Job notes, benchtop pricing admin, dimension preset saving, funnel analytics,
supplier feeds (add pg_cron per the comment in the supplier_feeds migration when
ready), and — because both apps now share auth + tables — the website→planner
handoff (Phase 3 of the integration plan) becomes a straightforward build.
