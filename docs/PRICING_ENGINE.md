# Pricing Engine Deep Dive

How a placed cabinet becomes a priced quote, and how the linked pricing sheets feed it.
Last updated: 2026-09-17 (robe openings carried at the source price, and the part-fits-board
warning — see "Robe openings and sliding robe doors" and "Part fits board" below; 2026-09-16
benchtops priced from a schedule; the rest of this file still describes the planner
`calculateBenchtops` path).

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
   4. calculateSheetRequirements(parts)        → whole sheets per material by area / yield
                                                 (+ oversizeParts: parts that cannot fit one sheet — warning only)
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

## Robe openings and sliding robe doors (17 Sep 2026)

BowerOS does **not** price robe openings or sliding robe doors yet (Ben's Hafele Slider SC program is
designed, not built). Until it does, `quoteFromSchedule` splits robe rows off **first** — before the
benchtop split and before the part mapping's faces-only / opening / carcase rules can see them — and
carries each at the row's own `mv_total`:

- one `source: 'passthrough'` line: `quantity` = the row's qty, `total` = `costPrice` = `mv_total`,
  `laborCost` 0, `marginPercent` 0 (the source figure is already a sell price);
- **no** carcase board, hinges, plates, shelf pins, edge tape, workshop stations, install minutes or
  job-minimum top-ups — the row never becomes a `PlacedItem`;
- a warning starting `ROBE NOT PRICED BY BOWEROS:` naming the row, its room, qty and size, placed
  **first** in `warnings`;
- a robe row with **no** `mv_total` (or 0) still gets a **$0.00 line** (unlike a benchtop passthrough,
  which is dropped) and its warning says it has NO source price and must be priced by hand;
- `workshopCosting.hasBuyout` / `buyoutItems` include robe rows (carried from the source quote).

Other rows in the job price as if the robe row were not there — the smoke test checks a Base 2 Door and a
Tall 1 Door Broom Cabinet beside a sliding robe keep exactly their lines.

`buildGenericCabinetMapping` also **refuses** a robe row (returns null) before every other rule, so the
planner / direct `generateCabinetBOM` path prices it at $0 with a robe-specific warning instead of
"no part mapping", and `carriesKickFace` never gives one a kick run. The CLI `scripts/price-kitchen.mjs`
does its own row split and now splits robe rows off first the same way: each goes into its room's section
at its own `mv_total` (a $0 line when it has none), with the same `robeNotPricedWarning` text printed first
under WARNINGS, and the cross-check counts its figure on both sides as it does a benchtop's. On the 11 saved
schedules the CLI's file and console output are byte-identical before and after (none has a robe row).

**Which names** — `isRobeDoorProduct` in `cabinetPartMapping.ts`. The ROOM is never tested: a "Base 2 Door"
or "Tall 1 Door Broom Cabinet" in a room called Robe is a carcase and prices exactly as before. The rules
run in this order; the first that decides wins:

| # | Rule | Caught | Not caught |
|---|---|---|---|
| 1 | a Hafele Slider SC kit — `slider sc` or a `944.02` code — whatever else the name says | "Slider SC 2 Door Robe Door Set", "Hafele Slider SC", "944.02.011" | |
| 2 | a board word (filler, scribe, applied, end panel, pelmet, bulkhead, valance, kick, plinth) → NOT a robe row; it keeps its flat-board price | | "Robe Door Pelmet", "Robe Opening Scribe Filler" |
| 3 | `robe` / `wardrobe` + `opening(s)`, whatever cabinet word describes the opening — an opening has no carcase to price (the mapping's opening rule returns null), so a cabinet word winning only lost the `mv_total` and the robe warning | "Robe Opening", "Robe Opening Hanging", "Robe Opening With Shelf" | |
| 4 | `robe` / `wardrobe` + `door(s)` with NO door count and no drawer, when its only cabinet words are tall / open / hanging | "Tall Robe Doors", "Robe Doors - Tall", "Robe doors (open end)" | "Robe Tall 2 Door", "Robe Tall Door Cabinet", "Robe Doors Base" |
| 5 | any other cabinet word (base, upper, wall, tall, corner, pantry, vanity, linen, broom, drawer, shelf, hanging, hamper, cabinet, carcase, open, bin, waste, tray, basket, pull-out, runner) → NOT a robe row | | "Robe Base 3 Drawer", "Robe Hanging Rail", "Base Pull Out Sliding Shelf", "Tall Sliding Door Cabinet" |
| 6 | `robe` / `wardrobe` + a door / opening / leaf / front / face / track / kit word, or a sliding / slider word | "Robe doors only", "Robe Door Faces Only", "Walk-in Robe Door Track", "2 Door Sliding Robe" | |
| 7 | no robe word: `sliding door(s)` / `panel(s)` / `leaf` / `leaves`, or `slider` with a door word | "Mirror Sliding Door", "Wardrobe Sliding Doors" | "Waste Slider" |

A carcase with sliding doors that rule 5 keeps ("Tall Sliding Door Cabinet", "Upper 2 Door Slider") prices
as a carcase with its door board but no hinges or plates (`hasSlidingDoors`), and warns that the track kit
is not priced. None of the 11 saved jobs has a robe-named row.

What the live engine did before (probe on the live catalogue, 2400 × 2400 rows, no `mv_total`):

| Row | Before | After |
|---|---|---|
| "Robe Opening" | $0.00, warning `no part mapping … cabinet not priced` | $0.00 line + `ROBE NOT PRICED` warning (NO source price) |
| "2 Door Sliding Robe" | $759.59 cost / $1,136.93 job sell: carcase board, 8 hinges, 8 plates, 4 shelf pins, 24.27 m edge, 78 min Hardware assembly, 45 min install | $0 (or its `mv_total`), nothing else |
| "Slider SC 2 Door Robe Door Set" | same as above | same as above |
| "Sliding Robe Door" | $637.48 cost / $965.98 job sell (carcase, 1 door) | same as above |
| "Robe Door Faces Only" qty 2, 1234 × 2345 | $750.83 cost / $1,198.16 job sell: hinged loose fronts, 8 hinges, 14.32 m edge | same as above |

## Part fits board — WARNING ONLY (17 Sep 2026)

The whole-sheet count (`calculateMaterialSheets`, `consolidateSheetRequirements`) is part AREA ÷ yield ÷
SHEET AREA, rounded up. It never looked at a part's shape, so a 1223 × 2345 part priced out of a
3115 × 1200 board it cannot be cut from. `partFitsSheet(length, width, sheetLength, sheetWidth)` in
`sheetOptimizer.ts` is the missing geometric test:

- **Grain is not modelled** anywhere in the engine (`material_pricing.horizontal_grain` is never read), so
  a part may be turned 90°: it fits when its long side ≤ the sheet's long side and its short side ≤ the
  sheet's short side.
- **Trim**: the usable sheet is the nominal size less `SHEET_TRIM_MM` = 10 mm off EACH dimension (in total,
  not per edge), so a 2400 × 1200 sheet nests 2390 × 1190 and a part exactly the sheet size does NOT fit.
  That is Bower's Microvellum sheet setting (8 + 2 mm off the length, 5 + 5 mm off the width); Polytec MDF is
  ±5 mm; and on Donkin Lane Microvellum left the one 2400 × 100 filler unplaced on its 2400 × 1200 Polar
  White board. The finished part size is compared, as Microvellum nests an edged part. The catalogue has no
  per-material trim, so a board bought oversize but listed at nominal size (Microvellum lists some Polytec
  162412 boards at 2410 × 1210) can report a 2391–2400 mm part that does nest.
- A material with no `sheet_length` / `sheet_width` is judged against the 2400 × 1200 default and the
  warning says so.

`calculateSheetRequirements` records the offenders on the cabinet's `SheetAllocation.oversizeParts`;
`generateQuoteBOM` turns them into **one warning per sheet material** (`Part too big for its board: …`),
each part name + size listed once with its count and the cabinets carrying it. **No price changes**: the
sheet count is still area-based. Only cabinet parts are checked — kick runs are job-level stock lengths, and
schedule benchtops (blanks and laminated tops) are nested by `benchtopLaminate` with their own join rules,
so neither can trigger it.

Two kinds of size are not judged: a stand-in size (`PartDimension.sizePlaceholder` — a door with no catalogue
formula, or a corner part needing a second arm the item does not carry), and a floor-standing part that is over
its sheet only by the toe kick (`generateCabinetBOM`; see the modelling fault below). The kick is only taken
off an item taller than the kick: a 100-high "Pelmet BC" is not standing on one.

New warnings on the 11 saved jobs against 23e7b08, with the 10 mm trim (every money and minute figure
byte-identical; the trim added no part on any job, only the usable size to the text):

| Job | Board (all 2400 × 1200) | Part(s) the engine priced | Real? |
|---|---|---|---|
| Coral Lodge kitchen | Plantation Ash | Under Panel 2582 × 307 | yes — longer than the sheet; needs a longer board or a join |
| Coral Lodge robe | Blonde Oak | Under Panel 2770 × 70 | yes — same |
| Regal kitchen | Polar White | Under Panel 2984 × 330; Pelmet BC 3000 × 100 | yes — same |

Without the kick and stand-in exclusions the tall ones also reported: Regal 2 × Tall Applied Panel 2460 × 580
and the broom's 2460 sides / back / door, Erin & Matt 3 × Tall Applied Panel 2440 × 710 (Microvellum cuts
2305 × 728, which fits), and Donkin's corner Ls Base Bottom 1252 × 1252 (no second arm in the schedule).

The tall ones are the warning doing its job on a **modelling** fault it did not cause: schedule heights
for tall items include the toe kick (E&M 2440 → MV cut 2305), but `Tall Left/Right Side` and `Tall Back`
are `CabHeight` and a board-thin applied panel is cut to its full height. Separately, the live `Door` row has
no length/width formula, so `calculatePartDimensions` falls back to **height × DEPTH** per door — the Regal
250-wide broom door is priced as 2460 × 580, and a 900 × 880 × 555 "Base 2 Door" carries 0.98 m² of door
where 2 × 880 × 449 is 0.79 m². Neither is changed here.

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

### Benchtop minutes

Microvellum carries no countertop fabrication labour, so there is no external calibration source.
The three BLANK minutes below are Ben's own, given 16 Sep 2026 ("5 min a cut is right, joins 30 is
fine", 15 min to laminate and finish an end) - do not change them without asking him. The cut-out
minutes are still uncalibrated defaults. `workshopModel.ts`:

| Rate | Default | Station | Paid at |
|---|---|---|---|
| `benchtopBlankCutMin` | 5 min / cut (Ben, 16 Sep 2026) | Benchtop blank cutting | `assemblyRate` $100 (bench work, not the $250 CNC) |
| `benchtopBlankEndEdgeMin` | 15 min / end (Ben, 16 Sep 2026) | Benchtop cut-end edge strip | `edgebandingRate` $100 |
| `benchtopBlankJoinMin` | 30 min / join (Ben, 16 Sep 2026) | Benchtop blank joins | `assemblyRate` $100 |
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
