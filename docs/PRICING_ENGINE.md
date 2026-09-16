# Pricing Engine Deep Dive

How a placed cabinet becomes a priced quote, and how the linked pricing sheets feed it.
Last updated: 2026-09-16 (benchtops priced from a schedule — see "Benchtops priced from a
schedule" below; the rest of this file still describes the planner `calculateBenchtops` path).

## The pipeline at a glance

```
Catalog product (microvellum_products / static catalog)
        │  definitionId
        ▼
PlacedItem  (dims, materials, drawer heights, position)   ← room planner
        │
        ▼
generateCabinetBOM (src/lib/pricing/bomGenerator.ts)
   1. getCabinetPartMapping(definitionId)      → which parts this cabinet needs
   2. getPartQuantities(config)                → perDoor / perDrawer / perShelf → numbers
   3. calculatePartDimensions(...)             → parts_pricing formulas → real part sizes
   4. calculateSheetRequirements(parts)        → nest parts onto sheets per material
   5. calculateEdgeTape(parts)                 → edge metres per edge material, bought as a 20 m minimum then by the metre
   6. calculateHardware(config, ...)           → hinges + plates, runners, screws, legs
   7. calculateLaborCost(...)                  → calibrated labor model (labor_rates)
   8. calculateBuildHours(...)                 → time model for scheduling
        │  CabinetBOM (parts, sheets, edging, hardware, subtotals)
        ▼
generateQuoteBOM (all cabinets in the room)
   • consolidateSheets / EdgeTape / Hardware   → job-level bulk yield
   • P5 reconciliation                         → bulk sheet savings pushed back per cabinet
   • kick panels                               → job-level line
   • calculateBenchtops (benchtopCalculator)   → per_sheet / per_lm / per_sqm methods
   • commercial layer (client_markup_settings) → margin, design fee, delivery, install, markup
   • GST                                       → grandTotal { subtotalExGst, gst, total }
```

## Benchtops priced from a schedule (Build Flow / price-quote)

A schedule row whose name matches `/countertop|benchtop/i` does **not** go through
`calculateBenchtops`. `quoteFromSchedule` hands it to `priceLaminatedBenchtops`
(`src/lib/pricing/benchtopLaminate.ts`), which returns the material working plus the
fabrication quantities `calculateWorkshopCost({ benchtops })` turns into station minutes.
A row is engine-priced only when it resolves to a priced sheet (`benchtopMaterialId`, else
`selections.benchtopMaterialId`); otherwise it passes through at `mv_total`, as before.

There are **two kinds of top**, and they are priced nothing like each other.

| | `laminated` (fabricated solid surface) | `blank` (pre-made laminate benchtop blank) |
|---|---|---|
| What it is | Meganite / HIMACS sheet: slab + build-up strips, glued, sanded, polished in the shop | EGGER 38 mm postformed worktop bought finished, e.g. 3650 × 600 |
| Layers | `ceil(finished / sheet thickness)`; extras are edge build-up strips | always **1** — the blank's own thickness (a 39 mm ask is a note, and is warned) |
| Material | whole sheets, nested by area across every row sharing the sheet, + 5 % area waste floor | **whole blanks as bought**, counted off the blank LENGTH and charged **per lineal metre**, no waste factor (Ben, 16 Sep 2026) |
| Stations | cutting (perimeter, CNC rate), lamination glue-up, build-up strips, mitred apron, joins (45 min), face polishing, profile polishing, cut-outs ($250/h CNC) | blank cutting (per crosscut), cut-end edge strip (per exposed end), blank joins (bolted), cut-outs (bench rate) |
| Never | — | no lamination, no build-up, no adhesive, **no face or profile polishing**, no glued seams |
| Loading | as a product (6 min × 2 crew) | as a long part, with the large loose panels (3 min × 2 crew) |
| Install | product + `installBenchtopMinPerM` × run | same |

### Which kind a row gets

1. `row.benchtopKind` (`'blank' | 'laminated'`) always wins. Build Flow's dialog sends it.
2. Otherwise the catalogue row decides, via `isBenchtopBlankSheet` (exported so Build Flow's
   picker can mirror it):
   - `material_type` that says so outright (`benchtop_blank`, `laminate_worktop`, `worktop`) → blank;
   - `material_type` that is solid surface / stone / quartz / porcelain / slab → laminated;
   - otherwise **thickness 30–45 mm AND `sheet_width` ≤ 1000 mm** → blank.
3. Otherwise `laminated` — exactly today's pricing.

Checked against the live catalogue (16 Sep 2026) the shape rule selects **exactly** the 39
EGGER 38 mm worktops (3650 × 600 and 3650 × 920). Every MEGANITE row is `solid_surface_sheet`
at 6–20 mm; the thick Polytec boards (32 / 33 / 38 mm, POLY52428 included) are 1200–1830 wide.
An inferred blank is always warned, so a new catalogue row of that shape cannot change a price
silently. `price-quote?catalog=1` now ships `sheet_length` / `sheet_width` so Build Flow can
apply the same rule (needs the function redeployed).

### How a blank is counted and charged

- Each piece reserves `min(sheet_length, piece length + 10 mm)` of blank length
  (`DEFAULT_BLANK_TRIM_MM` — squaring the factory end plus saw kerf). A piece as long as the
  blank takes the whole blank and needs **no** crosscut — but the crosscut is counted off the
  PIECE, not off the reserved length, or a 3645 mm top off a 3650 blank is cut and edged for free
  because the trim allowance happened to fill the blank.
- Pieces are first-fit-decreasing packed into whole blanks, across every row sharing the blank,
  so two rows never each round up to a blank they could have shared. `blanks` on the response
  is that whole-blank count; `sheetsShare` is the row's fraction of it.
- No area waste floor: 3500 / 3600 / 3650 × 600 are all ONE blank (the old area rule bought two).
- A piece longer than the blank splits into sections and adds `sections − 1` **bolted** joins —
  never the 45 min solid-surface seam.
- A piece deeper than the blank is warned (use the 920 blank, or fabricate it) and charged as
  `ceil(depth / sheet_width)` blanks side by side per section: no width join is invented, because a
  postformed blank cannot be joined along its length, but the material must not be under-bought
  either. A 2931 × 900 island on the 600 blank used to cost exactly what a 600 deep top did.
- Material = **whole blanks × the blank's length in metres × `area_cost`**, i.e. `area_cost` is
  read as **$ per lineal metre** of the blank's stock width, because that is what the supplier's
  list is: the 600 and the 920 deep worktop of one EGGER decor are $76.70 and $123.79 a metre, and
  a genuine $/m² rate is the same for both widths of one decor. `benchtop_pricing` carries the same
  numbers as `price_per_lm` with `pricing_method 'per_lm'`; `material_pricing.price_unit` says
  `'m2'`, which is the wrong label. Every blank row warns what basis was used and what the m²
  reading would have cost, so the disagreement is visible on the quote, not just in this file.
- **Cut-outs are off unless the row asks** (Ben, 16 Sep 2026). Nothing infers a sink from a
  product name; zero cut-outs means zero minutes and no station, for both kinds of top.
- Exposed cut ends: `benchtopExposedEnds` per unit, else one per piece with a warning. The
  postformed front edge and the factory ends arrive finished. The matching end strip COMES WITH THE
  BLANK (Ben, 16 Sep 2026), so no strip material is charged - only the time to laminate and finish
  the end, 15 min each, and the row says so.

### Placeholder minutes (DEFAULT, not calibrated)

Microvellum carries no countertop fabrication labour, so there is no external calibration
source. Confirm from shop timing. `workshopModel.ts`:

| Rate | Default | Station | Paid at |
|---|---|---|---|
| `benchtopBlankCutMin` | 5 min / cut | Benchtop blank cutting | `assemblyRate` $100 (bench work, not the $250 CNC) |
| `benchtopBlankEndEdgeMin` | 15 min / end (Ben, 16 Sep 2026 - the only calibrated one) | Benchtop cut-end edge strip | `edgebandingRate` $100 |
| `benchtopBlankJoinMin` | 30 min / join | Benchtop blank joins | `assemblyRate` $100 |
| `benchtopSinkCutoutMin` / `Cooktop` / `TapHole` | 30 / 20 / 5 min | Benchtop cut-outs (fabricated top) | `machiningRate` $250 |
| the same three minutes on a blank | 30 / 20 / 5 min | Benchtop blank cut-outs | `assemblyRate` $100 — a jigsaw and a router on the bench, like every other blank station |

Station names are chosen so `quoteFromSchedule`'s `laborMinutes` buckets catch them: *cutting* →
machining, *edge* → edgebanding, *joins* and *cut-outs* → finishing. ("edging" does not contain
"edge", hence "edge strip".)

Worked example — Q-0042, one 2931 × 600 piece on EGGPPRWS3606 ($76.70 a metre, flat pack,
markup 0.4). The blank is 3.65 m:

| | material | labour | shop min | sell ex GST | job ex GST |
|---|---|---|---|---|---|
| Old, asked 38 mm | $167.97 | $204.18 | 118.4 | $521.01 | $2,956.32 |
| Old, asked 39 mm (what the MV line carries) | $367.75 | $243.88 | 139.5 | $856.28 | $3,291.59 |
| **New, 38 or 39 mm** | **$279.96** | **$36.08** | **22.7** | **$442.46** | **$2,877.77** |

$167.45 of the old labour was face + profile polishing on a blank that arrives polished; the new
$36.08 is within a dollar of the $36.90 Ben hand-fixed the line to. The material moved the other
way: $279.96 is the whole 3.65 m blank at the supplier's per-metre rate, where the old reading
charged 2.19 m² of it. **Ben has not ruled on that yet** — his hand fix left the $167.97 material
alone — so the first blank top he prices should be checked against 'BOWEBUIL - Pricelist.pdf'.
Every blank row carries the warning that says so.

### Open questions (carried, not decided here)

- **Unit — decided in code, not yet with Ben.** A blank is charged per lineal metre (above). If the
  price book says otherwise, the change is the one line in `blankPrice`; the row warning quotes both
  figures so a wrong unit cannot go out silently.
- Default exposed ends when the dialog says nothing (one per piece today).
- Blank lengths: the catalogue has only 3650 mm. If Bower buys 4100 mm, add the rows and the
  length packer will choose.
- `workshopCosting.hasStone` is still true for ANY benchtop row, blank included. Left alone until
  Build Flow's use of it is checked.

## Toe-kick facing laminate — DESIGNED, NOT BUILT (16 Sep 2026)

Ben's kicks are 15 mm ply faced with a Polytec laminate (POLY6428 'Kickboard Laminate (only)
Brushed Stainless 3600 × 1200', 0.7 mm, $88.99/m²). The engine cannot see the facing at all: a
Toe Kick Base row prices its ply and its labour and nothing else, so on Q-0042 the facing had to
be added by hand ($43.27 material + $65 labour). Ben's rule, 16 Sep 2026: **"kick it does not
have to use the full board rule"** — the thin facing laminate is charged by the AREA USED plus
waste, never as a whole 3600 × 1200 sheet (that would be $643 sell for 0.31 m² of laminate).
Boards and benchtop blanks keep the whole-board rule; only the facing is by area.

Design to build:

1. `ScheduleItem` gains `kickFacingMaterialId?: string` (material_pricing id or item_code),
   `kickFacingAreaSqm?: number` (override) and `kickFacingWaste?: number` (default 0.15 — a
   facing is cut in strips off a wide sheet and the offcut is usable).
2. Area, when not given: `(w × h) / 1e6 × qty` off the row's own face, +`kickFacingWaste`.
   A wrapped return adds `d` per exposed end — collect it as a count, like `benchtopExposedEnds`,
   rather than guessing.
3. Cost: `area × (1 + waste) × area_cost`, folded onto that row's `lineCost` / `materialCost` and
   into `workshopCosting.sheetStock` as an area row (`units` = m² used, `wastePercent` = the
   facing waste), NOT as whole sheets. This is the one material in the engine that is deliberately
   not whole-sheet, so it needs its own comment where it is written.
4. Labour: a new `BenchtopFabricationInputs`-style input is the wrong home; add
   `kickFacingSqm` to `calculateWorkshopCost` opts beside `extraParts`, and a station
   'Kick facing bonding' at `kickFacingBondMinPerSqm` (placeholder ~20 min/m², `assemblyRate`) —
   contact adhesive both faces, lay up, roller, trim. Ben's hand-priced line was $65 for two kicks
   (39 min at $100/h), which is the figure to calibrate against.
5. Warning: any row matching `TOE_KICK_BASE_RE` (or a `/kick/i` product) priced **without**
   `kickFacingMaterialId` must warn "priced as bare ply - no facing laminate is charged", so a
   faced kick is never quoted bare again.
6. Tests: facing area by hand for Q-0042's two kicks (1908 + 400 long), the whole-sheet rule NOT
   applied, a kick without a facing warned, a job with no kick unchanged.

Not built in this run: it touches the cabinet line path (`lineCost`, `generateQuoteBOM`'s
workshop call), which the benchtop work deliberately stayed out of, and the waste figure, the
bonding minutes and whether the facing wraps the returns are all still Ben's to confirm.

## Where each number comes from (the linked pricing sheets)

| Table / file | What it prices | Editable where |
|---|---|---|
| `planner-materials.json` (bundle) | Board/material $/m², sheet sizes, swatch + texture images | Regenerated by the scraper project (`npm run export:planner-data`) |
| `material_pricing` (Supabase) | Same as above — DB copy | Admin → Pricing → Materials, or Supplier Import |
| `parts_pricing` | Per part type: `length_function`, `width_function`, edging spec, handling/machining/assembly $ | Admin → Pricing → Parts |
| `edge_pricing` | Edge tape $/m + application cost | Admin → Pricing → Edges |
| `hardware_pricing` | Hinges, plates, runners, screws, legs (series-matched) | Admin → Pricing → Hardware, or Supplier Import |
| `door_drawer_pricing` | Outsourced door/drawer front pricing | Admin → Pricing → Doors/Drawers |
| `labor_rates` | Tunable labor model rates (base/door/drawer/tall/width) | Admin → Pricing → Labor Rates |
| `benchtop_pricing` | Meganite per-sheet, Egger per-lm, stone per-m² | Admin → Pricing → Benchtops *(needs migration applied)* |
| `client_markup_settings` | Per-client margin/design/delivery/install/markup | Admin → Pricing → Client Markups |

`useTradeRoomPricing.fetchPricingData()` loads all of these in one go (5-minute cache) and
hands them to the engine as `PricingData`.

## Part sizing formulas

`parts_pricing` rows carry formulas evaluated by `formulaParser.ts` with variables like
`CabWidth`, `CabHeight`, `CabDepth`, `CarcaseThick`, `ToeKickHeight`, `DoorGap`,
`NumDrawers`, `DrawerFrontHeight`, `DrawerHeight`. Example: a gable might be
`length = CabHeight - ToeKickHeight`, `width = CabDepth`.

Drawer parts are expanded **per drawer** (since #20): each drawer face gets its own
height — custom heights from the cabinet editor or the standard Microvellum
distribution — with `DrawerFrontHeight = face` and `DrawerHeight = face − 20mm`
(box side rule, min 60mm). Shared logic lives in `src/lib/drawerHeights.ts` so the
3D render and the BOM always agree.

## Material selection and cost basis

All bundle/scraper prices are **raw supplier cost, ex GST, pre markup** (see the
website/scraper handover). The engine owns everything on top: wastage via
`expected_yield_factor` and sheet nesting, handling/machining/assembly per part,
labor, benchtops, then the commercial layer and GST. Exterior parts (doors, drawer
fronts, panels) price against the cabinet's exterior material; everything else
prices against the carcase material (`EXTERIOR_PART` regex in bomGenerator).

## Where totals surface (single source of truth)

- Planner toolbar Est. Total = `quoteBOM.grandTotal.total` (sell, inc GST).
- Cabinet list = per-cabinet BOM cost × sell factor, so rows sum to the toolbar total.
- Job page Quote State = persisted per-room BOM snapshots (`design_data.quoteSnapshotsByRoom`),
  written by the planner with a 500ms debounce. The old width×depth placeholder is gone.
- `jobs.cost_excl_tax` / `cost_incl_tax` are persisted alongside, so admin lists and
  the dashboard show real money.
- Quote PDF, cut summary, ordering list, and packing list all read the same QuoteBOM.

## ⚠ Known wrinkle: bundle vs database precedence

Both `useMaterialsCatalog` and `useTradeRoomPricing` treat the **bundle JSON as the
primary materials source** and only fall back to Supabase `material_pricing` when the
bundle is missing/empty. Consequence: **edits made in Admin → Material Pricing do not
affect quotes while the bundle file exists.** Options (pick one):

1. Flip precedence — prefer DB rows when the table is non-empty, bundle as fallback
   (admin regains control after each import).
2. Merge by `item_code` — bundle supplies images/range, DB supplies price when a row
   exists and is marked reviewed.
3. Keep bundle-first, and make the Supplier Import flow the only path that changes
   prices (then admin Materials page should be read-only for bundle items).

Recommendation: option 2 — it matches the intended flow (scraper captures raw cost,
admin reviews/overrides in DB) without losing the bundle's image coverage.

## Scraper → planner data flow

```
Supplier sites / price books (Polytec, Laminex, ForestOne, Egger, Meganite, Hafele)
   → capture scripts (website project, scripts/*.mjs|py)
   → audited price books (outputs/, docs/)
   → npm run export:planner-data
   → public/data/bower-supplier-catalog/   (website project)
   → copied to planner public/data/bower-supplier-catalog/
        ├─ planner-materials.json          → read at runtime (materials + textures + prices)
        ├─ material_pricing.csv            → Admin → Supplier Import (diff → apply to DB)
        ├─ hardware_pricing.csv            → Admin → Supplier Import
        ├─ *_supabase_upsert.sql           → direct DB seeding
        └─ supplier-material-products.json → import-supplier-materials edge function
```

The `supplier_feeds` table + `scheduled-supplier-import` edge function add cron-based
URL imports on top (needs the supplier_feeds migration applied and pg_cron configured).

Bundle verification: `manifest.json` hash matches between the website project and the
planner copy (checked 2026-07-02: `94d58ff4…`, 2,613 records, 775 assets, in sync).
