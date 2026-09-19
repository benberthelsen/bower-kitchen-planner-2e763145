# Pricing Engine Deep Dive

How a placed cabinet becomes a priced quote, and how the linked pricing sheets feed it.
Last updated: 2026-09-17 (Hafele Slider SC robe openings priced by BowerOS from a `robe` block — see "Hafele
Slider SC robe openings"; robe-named rows without one carried at the source price, and the part-fits-board
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

A row that carries a `robe` block is PRICED — see "Hafele Slider SC robe openings" below. A robe-NAMED row
**without** one is not priced: `quoteFromSchedule` splits robe rows off **first** — before the
benchtop split and before the part mapping's faces-only / opening / carcase rules can see them — and
carries each at the row's own `mv_total`:

- one `source: 'passthrough'` line: `quantity` = the row's qty, `total` = `costPrice` = `mv_total`,
  `laborCost` 0, `marginPercent` 0 (the source figure is already a sell price);
- **no** carcase board, hinges, plates, shelf pins, edge tape, workshop stations, install minutes or
  job-minimum top-ups — the row never becomes a `PlacedItem`;
- a warning starting `ROBE NOT PRICED BY BOWEROS:` naming the row, its room, qty and size, placed
  **first** in `warnings`, saying the row has no robe fields so BowerOS cannot price it and to send it as a Hafele
  Slider SC opening (Build Flow: Price with BowerOS > Robe openings);
- when such a row shares its room with a row that HAS robe fields (priced or refused), a LOUD
  `POSSIBLE DOUBLE CHARGE:` warning names both rows and the carried figure — most likely the same robe twice
  (a Microvellum or hand-typed robe line beside the opening that replaces it). Nothing is removed;
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

## Hafele Slider SC robe openings — PRICED by BowerOS (17 Sep 2026, not deployed)

Ben's standalone robe program (`Hafele_Slider_SC_Pricing_Program.html`) is folded into the engine as a product
kind, like benchtop blanks. A schedule row that carries a **`robe` block** is priced by
`src/lib/pricing/robeSliderDoors.ts` (money) on top of `src/lib/pricing/robeGeometry.ts` (pure geometry). A
robe-NAMED row **without** a `robe` block keeps the guard above: carried at `mv_total`, `ROBE NOT PRICED`.
Nothing is live until the kit seed is applied and `price-quote` is redeployed.

### The contract (engine <-> Build Flow)

A robe row is a normal schedule row `{ name, qty, room, w, h, d, mv_total? }` plus:

```ts
robe: {
  kind: 'hafele_slider_sc',
  profile: 'handle' | 'slimline', leaves: 2 | 3, finish: 'silver' | 'black',
  openingWidth, openingHeight,                         // measured opening, mm
  allowances?: { left, right, top, bottom },           // positive deductions, mm, default 0
  infill: 'board' | 'mirror',
  infillMaterialId?: string,                           // board infill (material_pricing id / item_code)
  infillThickness?: number,                            // 16-18 mm: board = checked against the board bought;
                                                       // mirror = the glass + backer build-up (checked, used for the mass)
  softCloseAllLeaves?: boolean                         // default true (Ben)
}
```

- The `robe` block decides, not the name: "Bedroom 1 wall unit" with a robe block is a priced opening.
  `w` / `h` / `d` are not read for a robe row (the opening sizes are).
- `qty` = identical openings on the row; **one quote line per row**, `quantity` = qty, `source: 'bower'`,
  `marginPercent` = the catalogue markup (40%, `client_markup_settings "Standard Default"`), install NOT in it.
- The response adds **`robes: PricedRobeOpening[]`** — one entry per PRICED row:
  `{ index, name, room, qty, spec, geometry { icw, ih, doorWidth, doorHeight, leafWidth, closureError, trackCut,
  verticalProfileCut, horizontalProfileCut, panelCut { w, h }, panelFinished { w, h }, kitLength, profileAllowance,
  softCloseSetback, tracks, verticalProfiles, horizontalProfiles }, kit { item_code, name, price, unconfirmed, priceSource,
  priceBasis, quantity, cost }, boards { material, materialId, itemCode, thickness, sheetLength, sheetWidth,
  sheets, sheetsShare, fitOk, panels, cost }, edgeMetres, edge, dampers { inKit, needed, extra, priced: false },
  mirror { required, priced: false, panels, panelCut }, leafMassKg, minutes { setUp, leaves, install },
  shopMinutes, kitCost, boardCost, edgeCost, materialCost, laborCost, costPrice, total, unpricedItems, warnings }`.
  - `geometry.panelFinished` = the finished infill panel the profile channel holds (doorWidth × doorHeight);
    `geometry.panelCut` = its SAW size: a board panel is edged on all four sides, so it is cut one edge thickness
    in from each side (cut = finished − 2 × edge; 1152 × 2343 for the worked example's 1 mm tape). A mirror panel is
    cut at its finished size. The sheet nest, fit check, edge metres and mass all use the finished size, as
    Microvellum nests an edged part.
  - `boards.sheets` = whole sheets bought for EVERY robe row on that board (they nest together);
    `sheetsShare` = this row's share by panel area. On a mirror opening `material` / `materialId` / `itemCode` /
    `thickness` / sheet sizes are null, `sheets` 0 and `fitOk` null. On a priced board row `fitOk` is always
    true — a leaf that does not fit is a hard stop, so it is never priced.
  - `total` = `costPrice` × uplift (sell ex GST, no install). `minutes.install` is this row's part of the job's
    "Installation — onsite" line, which is billed at cost exactly as for cabinets.
- **`robesNotPriced: [{ index, name, room, qty, reasons[], geometry | null }]`** — rows WITH a robe block the
  module refused. Each is carried like a guard row (its `mv_total`, or a visible `$0.00` line marked
  `unpriced: true`) with a warning `ROBE NOT PRICED BY BOWEROS: "<name>" (...) has Hafele Slider SC robe fields
  but cannot be priced: <reasons>`.
- A quote with no robe rows returns `robes: []` and `robesNotPriced: []`; nothing else changes.
- `GET price-quote?catalog=1` adds `robeKits` (hardware_type `robe_kit`, Available, with the `robe_*` columns
  and `price_basis`). Informational: the engine selects the kit itself, Build Flow never sends a kit id.

### Geometry — closure primary, checked against Ben's app

Hafele (installation p3) prints `ICW - 92 ÷ 2`, `ICW - 108 ÷ 3` (Handle), `ICW + 60 - 14 ÷ 2`,
`ICW + 120 - 21 ÷ 3` (Slimline) with no parentheses. Read as (sum) ÷ n all four are ONE identity:

```
icw        = openingWidth  - left - right          ih = openingHeight - top - bottom   (both snapped to 1e-6 mm)
leafWidth  = (icw + 60 × (leaves - 1)) / leaves    (finished leaf, 60 mm overlap per junction, p1)
doorWidth  = leafWidth - allowance                 (the panel cut, Hafele "DW"; allowance 76 Handle, 7 Slimline)
doorHeight = ih - 55                               (p3)
trackCut = icw; verticalProfileCut = doorHeight (2 a leaf); horizontalProfileCut = doorWidth (2 a leaf)
panel (finished) = doorWidth x doorHeight; softCloseSetback 35 Handle / 0 Slimline (p6)
kit: 2 leaves ≤1800 → 1800, ≤2700 → 2700, else none; 3 leaves ≤2700 → 2700, ≤3600 → 3600, else none (inclusive)
tracks: 2 leaves front / rear; 3 leaves front / rear / front
```

The printed formula is kept as an assertion (`printedDoorWidth`, `printedFormulaError` = 0). Ben's app
computes DW from the printed formula and ADDS the allowance, so a measured allowance of 80 gives a closure error
of 8 mm and blocks the job; here an optional `calibration.profileAllowance` moves only the panel cut and the
closure stays 0 (not exposed in the contract until a profile is measured).

The clear sizes are snapped to 1e-6 mm before any comparison. Unrounded, a measured 2700.3 less 0.1 and 0.2 was
2700.0000000000005 and lost the 2700 kit (blocked), 1800.2 less 0.1 twice took the 2700 kit instead of the 1800
one, and 2805.6 less 0.3 twice made a 2749.9999999999995 mm door that dodged the 2750 stop. Ben's app has the same
unrounded sums, which is why the oracle below never saw it; the smoke test now checks all three.

**Proven:** `scratchpad/robeeng/oracle_compare.mjs` runs Ben's own `calcCabinet` (verbatim extraction) and this
module over **114,912** openings (both profiles, 2 and 3 leaves, widths 1000–3800 mm in 7.3 mm steps plus every
boundary, 12 heights either side of the limit, three allowance sets, panel and mirror, 16–19 mm): largest
difference in icw, ih, DW, door height, leaf width, closure, infill cut, track, profile cuts, setback, kit length
and leaf mass **4.5e-13 mm**; SKU selection, track planes and the pass / block status identical in every case
(his 900–1350 width BLOCK counted as our WARNING). His 7 self-tests pass on his code, and the smoke test
re-expresses all 7 plus the build pack's Validation Tests T01–T10 (core DW, door height, finished width, insert,
leaf kg, stock length, closure, PASS / BLOCK) to 0.001 through the geometry helpers, and runs T09 (the 19 mm mirror
build-up) through `quoteFromSchedule` itself as well.

### Hard stops and warnings

| Rule | Source | Result |
|---|---|---|
| door height ≥ 2750 mm (IH ≥ 2805) | Hafele p3 "Door Height: <2750mm", strict | NOT priced |
| no packaged kit (2 leaves over 2700, 3 leaves over 3600) | build pack Kit_Nominal_Length | NOT priced; a 2-leaf ≤3600 says "three leaves on the 3600 kit covers it" |
| leaf panel does not fit its board (10 mm trim, either way round) | `partFitsSheet` | NOT priced — e.g. a 2400 Slimline 2-leaf panel is 1223 wide and cannot come off 2400 × 1200 or 3115 × 1200 |
| board leaf estimated ≥ 50 kg | Hafele p3 "<50kg", per door (build pack SC-04) | NOT priced (board at 700 kg/m³ + 3 kg profiles/hardware — Ben's app estimate) |
| board thickness outside 16–18 mm, or `infillThickness` outside 16–18 (board OR mirror build-up) | Ben 17 Sep: 16–18 accepted; build pack SC-17 "no mirror-specific exception", T09 | NOT priced |
| no robe_kit row / no matching row / two matching rows / kit with no price | catalogue | NOT priced |
| infill material missing, or with no thickness / sheet size / area_cost | catalogue | NOT priced |
| finished leaf outside 900–1350 mm | Ben's app only — no Hafele page or build-pack rule; source unknown | WARNING, priced |
| `infillThickness` ≠ the board's thickness (both 16–18) | | WARNING, priced as the board bought |
| no `infillMaterialId` | | WARNING, priced in the job's door finish (`exteriorMaterialId`) |
| mirror leaf mass | Hafele does not specify mirror (build pack USR-01) | WARNING with Ben's estimate on the `infillThickness` build-up sent (default 16), split as 4 mm glass + the rest backer — the split is an ASSUMPTION (16 mm = 4 + 12: 51.2 kg on 2400 × 2400 Handle, OVER; 18 mm on 2200 × 2400 Handle = 4 + 14: 50.2 kg, OVER) |
| `infillMaterialId` on a mirror opening | | WARNING, ignored (a thickness alone raises nothing) |

### What is charged

- **Kit** — one `hardware_pricing` row per opening: `hardware_type 'robe_kit'`, matched on `robe_profile`,
  `robe_leaves`, `robe_finish`, `robe_track_length_mm`. Price = the Hafele trade-price capture
  (`hafele_trade_prices.trade_cost_ex_gst`, Bower's buy price ex GST, either article shape) when positive —
  `unconfirmed: false`, `priceSource 'hafele_capture'`; else `unit_cost` flagged `unconfirmed: true` with its
  `price_basis` and a LOUD `KIT PRICE UNCONFIRMED:` warning (Ben 17 Sep: GST basis of the 31 Aug Net prices
  unknown — "add the items to the scraper list"). Rollers, guides, the 4 dampers, tracks and profile stock are
  inside the kit and never listed; `workshopCosting.hardware` carries the kit line once.
- **Board infill** — WHOLE sheets from a real nest (`packWholeSheetCuts`): each leaf as (long side + 10) ×
  (short side + 10) on the nominal sheet, long side along the sheet's long side — the same 10 mm as
  `partFitsSheet`'s trim for one leaf and 10 mm between neighbours (**assumed** router path, not calibrated).
  No yield factor and no area rule: two 1154 × 2345 leaves are 2 sheets of 3600 × 1800 ($330.87 at $25.53/m²),
  where area ÷ sheet area says 1. Robe rows on the same board nest together; cost split by panel area. Robe
  leaves do NOT nest with the kitchen's boards (as benchtops do not).
- **Edge tape** — all four sides of every board panel through `calculateEdgeTape` (edge = row `edgeId`, else
  `selections.edgeId`; warned when it falls back to $2.50/m). Bought under the job's 20 m minimum then by the
  metre, counting what the cabinets already buy of the SAME tape: the robe pays
  `order(kitchen + robe) - order(kitchen)` metres + application on its own metres + handling, and the tape stays
  ONE `workshopCosting.edgebanding` row. Robe-only 2400 × 2400: 13.996 m → 20 m × $1.50 + 13.996 × $0.90 + $0.50
  = $43.10. Mirror: no tape.
- **Mirror** — Ben: charged as a WHOLE SHEET as bought, but no mirror sheet size, price or supplier exists. The
  opening prices everything else and raises `MIRROR NOT PRICED:` (panels and cut size); `mirror.priced false`,
  the glass is on `workshopCosting.buyoutItems`. Nothing is invented.
- **Dampers** — every kit has 4 (2-door and 3-door alike, p1 / SC-15). Soft close on all leaves (default) needs 2
  a leaf (one each end of travel, as the 2-door kit's 4 imply): a 3-leaf opening needs 2 more. Counted in
  `dampers.extra`, `SOFT-CLOSE DAMPERS NOT PRICED:` warning, on `buyoutItems`. `softCloseAllLeaves: false` on 3
  leaves buys none and warns not to describe every leaf as soft close.
- **Stations** (`workshopModel.ts`, `robes` input; all no-ops at 0) — Ben, 17 Sep 2026:

| Station | Minutes | Rate | Bucket |
|---|---|---|---|
| Robe opening assembly set-up | 30 per opening (`robeOpeningSetupMin`) | assembly $100 | assembly |
| Robe leaf assembly | 30 per leaf (`robeLeafAssemblyMin`) | assembly $100 | assembly |
| Drafting / Part handling | per panel (board and mirror) | as cabinets | drafting / productHandling |
| Panel lead-in / out, Panel cutting, Part labelling | board panels only | machining $250 | machining |
| Edgebanding | only if the edge row has no application_cost | $100 | edgebanding |
| Loading & unloading (large loose panels) / (loose fronts & boards) | per leaf, 2 crew when ≥ 2000 mm and ≥ 1 m² | loading $80 | productHandling |
| Install | 45 per opening (`installRobeOpeningMin`) | install $98, at cost | installation |

  Profile / track cutting and fitting rollers, guides and dampers are inside Ben's 30 + 30. No vertical
  drilling, shop part assembly, hardware assembly or cabinet loading. Flat pack: no set-up, leaf assembly or
  install (panels wrapped); assembled: no install. Every station name lands in exactly one `laborMinutes`
  bucket (smoke-tested), so no robe minute vanishes from Build Flow's schedule.
- **Robe minutes land on the robe line**: robes run as their own `calculateWorkshopCost([], { robes })` call;
  each row's labour is its share of that call, weighted by what the model says the row costs alone. Kitchen
  lines are exactly as without the robe (smoke-tested).
- **Job minimums** — the robe call applies the 20 min drafting / 10 min CNC floors when `jobMinimums` is on. The
  floor is on the JOB: drafting = max(20, every call's real drafting), CNC = max(10, every call's real machining).
  `jobMinimumCredit` carries the earlier calls' real minutes and their top-up minutes separately:
  - no earlier top-up: the robe call tops up to the floor as usual — a robe-only quote pays $54.44 on the worked
    example;
  - the kitchen call already topped up: the robe's own minutes use that top-up up first, as a NEGATIVE line under the
    same top-up station name, which merges into the kitchen's top-up line (a line left at 0 min is dropped). The
    kitchen lines keep their cost; the robe line pays its minutes less the part of the top-up it used. Before this, a
    robe beside a small kitchen paid its 2.74 drafting and 3.70 machining minutes on top of the full top-up (ten-sands:
    drafting 22.74 and CNC 13.70 where both should stay 20 / 10);
  - the CNC floor needs something on the machine: a mirror-only robe quote pays the drafting floor but no CNC set-up;
  - `jobMinimums: false` gets none. (A benchtop-only quote still gets no floor, and a benchtop's drafting still
    stacks on the kitchen's top-up — both unchanged.)

### Catalogue seed — `supabase/migrations/20260917120000_slider_sc_robe_kits.sql` (NOT APPLIED)

Additive and re-runnable: nullable `robe_profile` / `robe_leaves` / `robe_finish` / `robe_track_length_mm` /
`price_basis` / `source_url` on `hardware_pricing` (with CHECK constraints), the 16 kits from Ben's PRICE_SEED
(`robe_kit`, never `handle`; `unit_cost` = his 31 Aug Net price; `price_basis` "unconfirmed - pending Hafele
capture (… GST basis not confirmed)"), `ON CONFLICT (item_code)` on the two existing unique indexes (checked
read-only with `pg_indexes`; `EXPLAIN` shows both as arbiters) — a re-run never overwrites a price whose basis
no longer says unconfirmed. The same 16 articles go on the **capture list**: `hafele_trade_prices` rows with the
family product URL and NO price (`ON CONFLICT (article_code) DO NOTHING`); the next logged-in capture fills
`trade_cost_ex_gst` and the engine switches to it with no catalogue change. A closing DO block asserts 16 kits,
16 variants, 0 typed handle, 16 on the list. `price-quote` loads only the `944%` capture rows and keeps pricing
(unconfirmed) if that read fails. The smoke test parses the SQL itself and checks every row against Ben's
PRICE_SEED.

### Worked example — 2400 × 2400, 2 leaves, Handle, silver, Polytec Polar White Sheen 16 mm (POLY25832), assembled + installed

Live catalogue rows (17 Sep 2026): POLY25832 2400 × 1200 $31.47/m²; edge bk1403 Polar White SolidSheen $1.50/m,
$0.50 handling, $0.90/m application; markup 40%; kit rows from the seed. Run through the rebuilt `engine.mjs`
exactly as `price-quote` calls it (`scratchpad/robeeng/worked_example.mjs`, and `fnsim/run_fn.mjs` through
`index.ts` itself with a mocked client).

| | BowerOS cost | Sell ex GST |
|---|---|---|
| Geometry | icw 2400, leaf 1230, panels 2 × 1154 × 2345 finished (cut 1152 × 2343 before the 1 mm edge), closure 0, track 2400, 4 verticals 2345, 4 horizontals 1154 | |
| Kit 944.02.002 (2700), unconfirmed | $324.01 | |
| Board: 2 whole 2400 × 1200 sheets (5.76 m²) | $181.27 | |
| Edge: 13.996 m, bought 20 m | $43.10 | |
| Shop: drafting 2.74 + top-up 17.26 min ($32.67); lead-in 0.70 + cutting 2.80 + labelling 0.20 + CNC top-up 6.30 min ($41.66); handling 0.50 min ($0.83); set-up 30 min ($50); leaf assembly 60 min ($100); loading 2 leaves × 3 min × 2 crew ($16) — 132.5 min | $241.16 | |
| **Opening line** | **$789.54** | **$1,105.36** |
| Install 45 min × $98 (at cost) | $73.50 | $73.50 |
| **Job** | $863.04 | **$1,178.86** ex GST ($1,296.75 inc) |

Ben's app, same opening, its defaults (markup 30%, waste 10%, $90/h, panel $45/m², 1 h set-up + 1.5 h a leaf,
3 h install): kit $324.01, panel $267.91, fabrication $360, install $270 → direct $1,221.92 → **$1,588.49** ex GST.
BowerOS is **$409.63 lower**, every dollar attributed (sell dollars; 1 cent is line rounding):

| Difference | Sell $ | Why |
|---|---|---|
| Kit markup 30% → 40% | +32.40 | same $324.01 cost; the catalogue default markup (Ben: 40% on a bought-in kit) |
| Board rate $45 placeholder → $31.47 live POLY25832, on his 5.953 m² | −112.77 | −$80.55 cost × 1.4 |
| Board quantity: area × 2 × 1.1 waste (5.953 m²) → 2 whole sheets (5.76 m²) | −8.52 | −$6.09 cost × 1.4 (on a 2400 × 1200 the whole-sheet rule is the smaller here; on 3600 × 1800 it is larger) |
| Board markup 30% → 40% on his panel cost | +26.79 | |
| Edge tape on all four sides (his app: none) | +60.34 | $43.10 × 1.4 — Ben's rule 6 |
| Set-up + leaves: 240 min at $90 → 90 min at $100 | −294.00 | −$210 cost × 1.4 — Ben's 30 + 30 a leaf |
| Per-part stations (drafting, cutting, labelling, handling) | +29.01 | $20.72 × 1.4 — his app has none |
| Job minimums on a robe-only quote | +76.22 | $54.44 × 1.4 |
| Loading 2 large loose panels | +22.40 | $16.00 × 1.4 |
| Labour markup 30% → 40% on his $360 | +36.00 | |
| Install 180 → 45 min | −202.50 | at his $90 |
| Install rate $90 → $98 | +6.00 | 45 min |
| Install not marked up (BowerOS bills install at cost) | −81.00 | his 30% on $270 |
| **Total** | **−409.63** | = $1,178.86 − $1,588.49 |

### Not decided / still open

- Mirror sheet size, price and supplier; whether a backer is used; mirror mass (Hafele does not specify mirror). The
  glass / backer split of a 17 or 18 mm build-up is assumed (4 mm glass + the rest backer) for the mass estimate.
- Extra damper part number and price.
- Where the 900–1350 mm leaf range came from (warned, not blocked).
- The IH datum: the engine takes `openingHeight − top − bottom` as Hafele's IH (a carcase-internal measure on p3);
  a builder's plasterboard opening to a finished floor may need a different allowance. Floor level / covering
  and out-of-square are not modelled.
- The SKU → profile / leaves / finish / length mapping is Ben's (build pack SC-16, brochure p3); the installation
  pages cannot confirm it.
- The 10 mm spacing between leaves in the nest is assumed; grain is taken as along the sheet's long side.
- A benchtop-only quote still gets no job minimums (pre-existing).

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
