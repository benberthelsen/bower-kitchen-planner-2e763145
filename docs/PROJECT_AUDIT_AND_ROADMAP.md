# Bower Platform — Full Audit & Roadmap to Completion

Audited 2026-07-02 across the kitchen planner app, public website + scraper
project, and the unified Supabase backend (bower-cabinet-ai). This is the
master document; each workstream below has a self-contained brief in
`docs/workstreams/` so separate sessions can work in parallel without
stepping on each other.

## Where the platform stands

**Solid and verified working:** unified Supabase project (single DB, auth,
admin role); trade flow end-to-end (job → room wizard → 3D planner → quote →
submit → admin review queue); BOM pricing engine with correct part sizing
(seeded parts library, per-drawer face heights, verified line-by-line offline);
single source of truth for totals (toolbar = cabinet list = job page = admin,
costs persisted to the jobs table); supplier data bundle in sync between
projects (2,207 materials + 406 hardware rows + 775 images, hash-verified);
materials/pricing admin pages; benchtop pricing (Meganite/Egger seeded); job
notes; dimension presets (DB-backed, admin-editable); Browse Colours swatch
browser; axis-aligned 2D plan view; corner cabinets auto-nesting into corners;
drawer-front height editor flowing through 3D and BOM.

**The gap between "works" and "finished"** is concentrated in five areas:
the product configurator (Full Editor) has its own parallel parts/preview
logic that disagrees with the real engine; pricing DATA has holes (Laminex
prices, Hafele drawers/runners/hinges, Blum entirely, edge tape, labor rates
tuning); the website and planner don't hand off to each other yet; edge
functions and RLS on the unified DB aren't deployed/audited; and legacy code
plus small UX debts remain.

## Complete defect / unfinished list

### Product Configurator (Full Editor) — WS1
1. Corner Left/Right Leg Depth defaults to full cabinet depth (900) instead of
   the standard arm depth (575) when no construction value is stored.
2. Parts List prices board parts against "3mm White Backing" (first cheap
   material match) instead of the cabinet's carcase/exterior selections.
3. Parts List uses its own hardcoded part prices ($45 gables etc.) and its own
   sizing — it should call the same BOM engine the planner/quote uses.
4. Corner pie-cut doors render wrongly in the 3D preview (single door on the
   wrong plane instead of the bi-fold pair across the notch); planner scene
   renders them correctly, so the preview's PlacedItem mapping/recipe is off.
5. Totals in the Parts List panel ($33.65 for a corner cabinet) bear no
   relation to the quote engine.

### Pricing engine + data — WS2 & WS3 & WS4
6. Unmatched material selections silently price against an arbitrary board
   (observed: all carcase parts on "Aluminium Haze"). Needs safe fallback +
   visible warning.
7. Materials with no captured price (all 285 Laminex rows) price at $0
   silently — quote understates with no flag. Needs "Needs Review/unpriced"
   badge on quote + planner toolbar.
8. `edge_pricing` table empty on unified DB — edging priced from fallbacks.
9. `labor_rates` table empty — engine uses calibrated code defaults
   ($592/drawer-bank labor dominates cabinet cost); admin needs seeded rows to
   tune from.
10. Hafele data missing drawers, drawer systems, runners, furniture hinges
    (the exact items every cabinet needs). 406 rows cover appliances/handles/
    sinks only.
11. Blum hardware absent entirely — to be sourced via Wilson & Bradley as a
    separate supplier feed (never mixed with Hafele rows).
12. Laminex: catalogue + images captured, zero prices — needs authorised price
    book import path.
13. 5 material images missing (4× EGGER oak variants, Meganite Snow White Flex).
14. Client markup profiles: no default row on unified DB → commercial layer
    (margin/design fee) currently zero on all quotes.

### Website ↔ planner integration — WS5
15. Website `/planner` page stores briefs in localStorage only; no real
    handoff. `WebsitePlannerHandoff` contract (integration plan Phase 3)
    unimplemented on both sides.
16. No "Open Kitchen Planner" link from website to planner app (Phase 1).
17. Flat-lay generator not callable from the planner (same project now — thin
    client work).

### Unified Supabase completion — WS6
18. Planner edge functions not yet deployed to bower-cabinet-ai (Microvellum
    import/export, DXF, import-supplier-materials, scheduled-supplier-import,
    send-email).
19. RLS audit not performed (trade isolation, admin-only pricing, anon funnel
    inserts).
20. supplier_feeds cron (pg_cron + pg_net) not enabled.
21. Old planner project wyiydozwukiayhwcdlcf still live — retire after
    burn-in; delete `.env.backup-wyiydozwukiayhwcdlcf`.
22. Second planner copy exists at `OneDrive\Projects-Code\Kitchen planner` —
    consolidate/delete to avoid editing the wrong tree.

### Admin & reporting polish — WS7
23. Admin JobDetail header says "1 room, 0 cabinets" (count parses old
    structure) and corner cabinet shows no sell price (stale snapshot handling).
24. Reports/Analytics/funnel pages unverified against the unified DB.
25. Admin "first navigation blank page" hiccup (lazy-load) still unexplained.

### Planner UX / 3D polish — WS8
26. Camera view presets (Front/Top/Corner buttons) still absent; orbit is
    right-drag only (hint added, presets would be better).
27. Catalog thumbnails inconsistent (line art vs grey 3D renders).
28. Wall cabinet drag: no elevation handle in 3D; mounting height only via
    dialog.
29. Texture quality: door finish textures load but tiling/scale unreviewed on
    large runs.

### Legacy cleanup — WS9
30. Dead code scheduled for removal: `src/pages/Index.tsx`,
    `src/pages/TradePlanner.tsx`, `src/store/PlannerContext.tsx`,
    `src/integrations/external-supabase/` (now a shim), legacy hooks.
    Remove after WS1-2 land (some legacy pages import the shim).

### Homeowner mode — WS10 (last)
31. Public simplified planner over the same engine (integration plan Phase 4):
    guided flow, lead capture, quote request — after handoff (WS5) exists.

## Suggested execution order & parallelism

```
Parallel now:   WS1 (configurator)   WS2 (engine guards+seeds)   WS3 (hardware list→scrape)
Then:           WS4 (Laminex import) WS6 (Supabase completion)   WS7 (admin polish)
Then:           WS5 (handoff)        WS8 (UX polish)             WS9 (legacy cleanup)
Last:           WS10 (homeowner mode)
```

WS1+WS2 are the "guts" and unblock trust in every number. WS3/WS4 are
data-entry-shaped and independent. WS5 needs WS6's function deploys done.
WS9 must wait for WS1 (shared imports). Details, file lists, and acceptance
criteria live in each brief under `docs/workstreams/`.
