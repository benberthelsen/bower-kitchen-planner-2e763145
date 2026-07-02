# Website ↔ Scraper ↔ Planner Integration Status

Cross-link review of the Bower website/scraper project
(`OneDrive\Projects-Code\Codex\bower-cabinet-web-site`) and the kitchen planner
(`Claude\Projects\kitchen online planner\bower-kitchen-planner`).
Last updated: 2026-07-02.

## What's connected and working

**Supplier data bundle — in sync.** The scraper's `export:planner-data` bundle
(`public/data/bower-supplier-catalog/`) is byte-identical on both sides
(manifest hash `94d58ff4…`, generated 2026-06-28: 2,207 materials, 406 Hafele
hardware rows, 775 swatch/texture assets). The planner reads
`planner-materials.json` at runtime for material pickers, 3D textures, and BOM
pricing — this link is live and verified.

**Import paths exist end-to-end.** Bundle CSVs → Admin Supplier Import (diff
preview → apply); `supplier-material-products.json` → `import-supplier-materials`
edge function; `*_supabase_upsert.sql` for direct seeding; `supplier_feeds` +
`scheduled-supplier-import` for cron-based URL imports (pending migration + pg_cron).

**Flat-lay generator working on the website side.** `generate-flatlay` (OpenAI
image generation over selected materials, called via `dreamweaverBridge.ts` from
the Design Scope Builder / showrooms flat-lay page) plus `generate-design-image`
and `scrape-supplier-catalog` (Firecrawl) are deployed as website Supabase functions.

## What's NOT lined up

**1. Three different Supabase projects (critical).**

| App | Project ref | Where set |
|---|---|---|
| Website | `ehtwywctledgkxexztbh` (bower-cabinet-ai) | `.env.local`, `supabase/config.toml` |
| Planner | `wyiydozwukiayhwcdlcf` | `.env`, `supabase/config.toml` |
| Planner (hard-coded!) | `cfwywsrhwnfqzdxcgnmm` | `src/integrations/external-supabase/client.ts` → `useExternalDesignSync` |

The apps are not talking to the same database. Website leads, scope briefs, and
scraped catalog reviews live in one project; jobs, pricing, and trade data in
another; and a third is hard-coded for design sync. **Action:** pick the
Bower-owned project, deploy both apps' migrations + functions to it, point both
`.env`s at it, delete the external-supabase client (or move its URL to env),
then review RLS across customer designs / trade jobs / admin pricing.

**2. Planner migrations not applied.** `benchtop_pricing`, `dimension_presets`,
`job_notes`, `funnel_events`, `supplier_feeds` tables are missing from the live
planner DB — benchtop admin, preset saving, notes, analytics, and scheduled
imports all fail until `supabase/migrations/` (20260616 → 20260702) are applied.
This should be folded into the unification in point 1 rather than done twice.

**3. Website → planner handoff is still a mock.** `PlannerPage.tsx` stores
"planner briefs" in localStorage (`bower_planner_briefs_v1`) and links to the
flat-lay scope builder; nothing opens the actual planner with starter data. The
`WebsitePlannerHandoff` contract from `docs/kitchen-planner-integration-plan.md`
(Phase 3) is not implemented on either side.

**4. Bundle-vs-DB pricing precedence.** The planner prefers the bundle JSON over
the `material_pricing` table, so admin price edits don't affect quotes while the
bundle exists. See `docs/PRICING_ENGINE.md` → "Known wrinkle" for the fix options
(recommended: merge by item_code, DB price wins when reviewed).

## Scraper gaps (from the handover, confirmed still open)

- **Hafele**: drawers, drawer systems, runners, and furniture hinges need
  logged-in pricing (browser session or exported price file — no passwords in repo).
- **Wilson & Bradley**: new feed needed for Blum hardware
  (`source_supplier = Wilson & Bradley`, `brand = Blum`, never mixed with Hafele).
- **Laminex**: catalogue + images captured, but rows stay `Needs Review` until an
  authorised price book is imported.
- **Images**: 5 material rows missing (4× EGGER oak variants, Meganite Snow White Flex).

## Recommended build order

1. **Unify Supabase** (one project, all migrations, all functions, env-only refs,
   RLS pass). Unblocks everything else and kills the 3-project confusion.
2. **Pricing precedence fix** so admin controls sell prices (small planner change).
3. **Phase 1 website link**: "Open Kitchen Planner" button on `/planner` passing
   `source/room/style/materials` URL params.
4. **Phase 3 handoff**: implement `WebsitePlannerHandoff` — planner reads the
   params/lead and seeds a starter room (room type, dimensions, material defaults
   map directly onto the existing room wizard config).
5. **Flat-lay cross-link**: once on one Supabase project, let the planner call
   `generate-flatlay` with the room's material selections (the function already
   accepts generic items — this is a thin client addition).
6. **Scraper fills**: Hafele logged-in hardware, Wilson & Bradley/Blum feed,
   Laminex price book, 5 missing images.
7. **Homeowner mode** (Phase 4) over the same pricing engine.

Planner-side UX queue still open from the smoke test: 2D plan view, camera
orbit/view presets, corner cabinet corner-snap, friendly job number in the trade
header, Ctrl+Enter hint, dialog z-index over scene labels.
