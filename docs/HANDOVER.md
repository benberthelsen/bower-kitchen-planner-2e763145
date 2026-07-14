# Bower Kitchen Planner — Session Handover

Written 2026-07-08 for a fresh session (Fable) picking up the Bower kitchen
planner + website + scraper + Supabase platform. Read this first, then
`docs/PROJECT_AUDIT_AND_ROADMAP.md` and the `docs/workstreams/WS*.md` briefs.

## TL;DR — what state is the platform in

The platform is **functional end-to-end and running on one unified Supabase
project**. A trade user can create a job → run the room wizard → place cabinets
in the 3D planner → get a real BOM quote on real trade costs → submit for
approval → it lands in the admin review queue. Pricing is trustworthy: real
Laminex/Polytec/Egger/ForestOne material costs, a 288-row Microvellum parts
library, 888 edge rows, 10 labour rates, 2,677 hardware rows plus 50 real
drawer-runner/hinge/plate rows. Security is locked down (pricing tables are
authenticated-only). Edge functions are deployed.

The remaining work is polish and a few data gaps, not core function. Nothing is
on fire.

## The three repos / projects

1. **Kitchen planner app** (the main app):
   `C:\Users\bench\Claude\Projects\kitchen online planner\bower-kitchen-planner`
   Vite + React + TypeScript + Tailwind + shadcn + three.js. Trade planner,
   admin, pricing engine. This is where almost all work happens.
2. **Public website + scraper**:
   `C:\Users\bench\OneDrive\Projects-Code\Codex\bower-cabinet-web-site`
   Public site, virtual showrooms, flat-lay AI, and all the supplier-price
   scraper scripts. The planner reads its exported data bundle.
3. **Supabase — UNIFIED onto `bower-cabinet-ai`** (project ref
   `ehtwywctledgkxexztbh`, region ap-southeast-2). BOTH apps use this project
   now. The old planner project `wyiydozwukiayhwcdlcf` is retired (data already
   copied out) — do not write to it; it can be deleted after a burn-in period.
   There is a `.env.backup-wyiydozwukiayhwcdlcf` in the planner root for
   rollback only.

Run the planner: `npm run dev` in the planner folder → http://localhost:8080.
Admin login: **info@bowercabinets.com** (has the `admin` role).

## ⚠️ Critical gotchas (things that will bite you)

1. **The bash sandbox mount lags the file tools.** Files edited with
   Write/Edit sometimes don't appear (or appear truncated with trailing NUL
   bytes / missing final braces) when read via `mcp__workspace__bash`. If bash
   shows a file broken but tsc passes, trust tsc. When a file looks truncated,
   re-check with the Read tool (host-side, always current). Several times this
   session a file's closing `}` "vanished" in bash — it was a sync artifact.
2. **The git index corrupts repeatedly** (`bad signature 0x00000000`,
   `index file corrupt`). Fix: `rm -f .git/index && git read-tree HEAD` (or
   `git reset -q`). Commits still land even when the index is flaky — verify
   with `git log --oneline -1`. Don't panic; the working tree is fine.
   Note: after a `git reset` with a fresh index, `git status` shows everything
   as untracked `??` — that's cosmetic, HEAD is intact.
3. **The git remote is proxy-blocked (403)** — you cannot fetch/push to GitHub
   from the sandbox. Work locally; the user syncs.
4. **Bash cannot reach the internet / Supabase** (`curl` returns 000, npm
   installs 403). For anything needing network — Supabase reads/writes, package
   installs — use the browser (Claude-in-Chrome) via the running app, or ask
   the user to run it. To compile-check the pricing engine offline, copy
   `src/lib/pricing/*` to /tmp and run the repo's local
   `node_modules/typescript/bin/tsc` (esbuild's native binary is Windows-built
   and won't run in the Linux sandbox, so `npm run test:snapping` fails here —
   that's environmental, not a code break).
5. **Parallel sessions exist.** The user runs multiple Cowork sessions on this
   same repo. Their commits/edits may appear mid-task (you'll see file-changed
   notices). Some sessions saved deliverables to their OWN outputs folder
   instead of the repo (WS3's hardware CSV, WS2's DB writes) — if something
   "was done" but isn't in the repo, check other sessions' outputs folders and
   the old Supabase project before concluding it's missing.
6. **Supabase writes are gated by the auto-approval classifier.** When "Skip
   all approvals" is ON, sensitive DB writes get auto-DENIED. Counter-intuitive
   but true: to let the user approve a write, they must turn Skip-approvals OFF
   so it prompts them. Don't repeatedly retry a denied action — the classifier
   escalates and flags it as tunnelling.
7. **Pricing data caches 5 minutes** in the app (react-query staleTime). After
   changing DB pricing, hard-reload or wait to see it reflected in a quote.

## What's DONE (verified working)

- **Supabase unification** onto bower-cabinet-ai: schema bootstrap, all
  migrations applied, env + config pointed at it, hard-coded 3rd project
  removed (`external-supabase/client.ts` is now an env shim).
- **RLS security**: pricing tables (material/hardware/parts/edge/benchtop/
  labor/products) are authenticated-only — closed a real anon leak of raw
  supplier costs. Verified live. Migration:
  `supabase/migrations/20260705_rls_lockdown_pricing.sql`.
- **Edge functions**: all 8 planner functions deployed
  (import-microvellum, process-dxf-geometry, export-microvellum-xml,
  import-prices, import-pricing, import-supplier-materials,
  scheduled-supplier-import, send-email). Re-deploy with
  `.\deploy-functions.ps1`.
- **Microvellum catalog imported**: 321 products.
- **Pricing single source of truth**: toolbar = cabinet list = job page =
  admin, all from the BOM engine; `jobs.cost_excl/incl_tax` persisted.
- **WS1 configurator**: corner arm depths default 575, Parts List runs on the
  real BOM engine (`useCabinetBOM`), unpriced-material warning, corner pie-cut
  bi-fold doors render correctly (CornerBiFold), 45° door presentation library-
  wide, solid-interior-fill block removed so open doors show the real cavity.
- **WS4 Laminex**: 191 of 285 colours captured with real trade prices and live
  in the bundle + DB. Pipeline (capture → import → export → SQL) built in the
  website repo.
- **WS2 recovered**: labour (10), edge (888), parts (288 real MV library —
  replaced a 40-row stopgap), door/drawer (6), full hardware (2,677) — all
  copied from the old project into bower-cabinet-ai via the admin session.
- **WS3 hardware**: 50 rows (29 drawer runners across Hafele Alto Slim + Blum
  LEGRABOX/TANDEMBOX/MOVENTO/TANDEM, 17 hinges, 3 plates) — real trade net
  prices, loaded into hardware_pricing. Source of truth CSV:
  `bower-cabinet-web-site/docs/hardware-target-list.csv`.
- **Handles**: a parallel session added 3D handle models per style + a grouped/
  searchable handle picker (see `src/lib/handleStyles.ts`, `HandleMesh.tsx`).
- **Catalog favourites**: per-user Quick Picks in the planner sidebar.
- **Drawer-front height editor (#20)**, **admin dimension presets (#17)**,
  **Browse Colours swatch dialog**, **2D plan view + camera hints**, **corner
  auto-snap**, **friendly job numbers** — all done earlier.

## What's OPEN (the roadmap from here)

Priority order, with the self-contained brief for each in `docs/workstreams/`:

1. **Last 94 Laminex colours** — blocked only on Laminex trade login being back
   up (their auth was 502ing). The browser-harvest tooling resumes where it
   stopped (localStorage backup + resume logic in place). ~15 min when login
   works. See task/notes; the harvester pattern is in the WS4b history.
2. **Default client_markup_settings row** — neither database had one, so the
   commercial layer (margin/design fee) may be zero on quotes unless a profile
   exists. Small: seed one `is_default` markup profile. (WS2 brief item 5.)
3. **Labour model vs labor_rates** — the 10 recovered labor_rates rows
   (Cabinet Assembly, Installation…) don't match the engine's `RATE_NAME_MAP`
   keys in `src/lib/pricing/laborCalculator.ts`, so labour still uses the
   calibrated code defaults ($592/drawer-bank). Decide whether to wire the DB
   rates into the model or keep the code calibration. Not a bug, a choice.
4. **WS2 engine guards (partially open)** — the DATA seeds are recovered, but
   the code-side guards from the WS2 brief (safe material fallback in
   sheetOptimizer when a material id doesn't resolve; a `warnings[]` array on
   QuoteBOM surfaced as a badge) were never built. The WS1 parts panel has a
   basic unpriced warning; the engine-level guard is still worth doing.
5. **WS5 website→planner handoff** (Phase 1 link + Phase 3 starter-design).
6. **WS7 admin polish** — verify Reports/Analytics/Leads against the unified
   DB; the "0 cabinets" JobDetail count was fixed but re-check.
7. **WS8 planner UX** — camera view presets (Front/Top/Corner), consistent
   catalog thumbnails, wall-cabinet height handle, texture tiling review.
8. **WS9 legacy cleanup** — remove `src/pages/Index.tsx`, `TradePlanner.tsx`,
   `store/PlannerContext.tsx`, `external-supabase/` shim once confirmed unused.
9. **WS10 homeowner mode** — public simplified planner (needs a planning
   session with Ben first; price ranges only, never trade costs).
10. **Retire old Supabase project** + delete stray planner copy at
    `OneDrive\Projects-Code\Kitchen planner` (a different, older app — confirm
    with Ben before deleting).
11. **pg_cron for supplier_feeds** — enable pg_cron + pg_net in the dashboard
    and uncomment the cron block in the supplier_feeds migration.

## Key files map (for orientation)

- Pricing engine: `src/lib/pricing/` — `bomGenerator.ts` (orchestrator),
  `cabinetPartMapping.ts`, `formulaParser.ts`, `sheetOptimizer.ts`,
  `edgeCalculator.ts`, `hardwareCalculator.ts`, `laborCalculator.ts`,
  `benchtopCalculator.ts`. Full write-up: `docs/PRICING_ENGINE.md`.
- BOM hook the UI uses: `src/hooks/useTradeRoomPricing.ts`
  (`useTradeRoomPricing` for rooms, `useCabinetBOM` for a single cabinet).
- 3D: `src/components/3d/` — `CabinetAssembler.tsx` (builds a cabinet from
  parts), `CabinetMesh.tsx`, `UnifiedScene.tsx`, `cabinet-parts/*`,
  `HandleMesh.tsx`. Corner logic keys off `src/lib/cornerDefaults.ts`.
- Materials/catalog: `src/hooks/useMaterialsCatalog.ts`, `useCatalog.ts`.
  Material data is read bundle-first from
  `public/data/bower-supplier-catalog/planner-materials.json`, DB as fallback —
  see the "known wrinkle" in `docs/PRICING_ENGINE.md`.
- Admin pricing pages: `src/pages/admin/pricing/*`.
- Supabase: `src/integrations/supabase/{client,types}.ts`,
  `supabase/migrations/`, `supabase/functions/`, `supabase/bootstrap/`.

## Verification habits that worked

- After any pricing change: open a Base 3 Drawer's Full Editor → Parts List and
  confirm board/edge/hardware/labour are all non-zero and no amber warning.
- `npx tsc -p tsconfig.app.json --noEmit` is the reliable health check.
- `npm run test:functional` passes in-sandbox; snapping/pricing esbuild tests
  need Windows (run them on the user's machine).
- To inspect the live DB from the sandbox, use the browser: fetch the Supabase
  REST API with the anon key (reads) or the app's admin session (writes) — the
  anon key is in `.env`.

Good luck — the platform is in good shape. Start by reading
`docs/PROJECT_AUDIT_AND_ROADMAP.md` for the full picture.
