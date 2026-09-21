# Pricing Engine Deep Dive

How a placed cabinet becomes a priced quote, and how the linked pricing sheets feed it.
Last updated: 2026-09-21 — toe kicks priced as the ply LADDER Microvellum cuts with the selected laminate face by
AREA, four adjustable legs a cabinet with the kick face by the LINEAL METRE, over-long parts SPLIT and priced with
a join instead of only warned, mirror glass charged on its MEASURED cut area at the Glasstech rate, and sink
cut-outs split into drop-in 30 min / undermount 90 min. See "Toe kicks: the ladder, the ply, the facing and the
legs", "Part fits board — and what happens when it does not", the Mirror bullet under "What is charged", and
"Benchtop minutes".
(2026-09-19 carcase parts cut to the carcase height, doors and drawer faces at Microvellum's finished
size — see "Part sizes: carcase height, doors and drawer faces"; 2026-09-17 Hafele Slider SC robe openings priced by BowerOS from a `robe` block — see "Hafele
Slider SC robe openings"; robe-named rows without one carried at the source price, and the part-fits-board
warning — see "Robe openings and sliding robe doors" and "Part fits board" below; 2026-09-16
benchtops priced from a schedule; the rest of this file still describes the planner
`calculateBenchtops` path).

## The whole-board rule, and its two exceptions

Bower buys whole boards and charges whole boards — one small door in a job still pays for the sheet. Edge tape is a
20 m minimum then by the metre; benchtop blanks are whole blanks as bought. **Exactly two materials are charged by
the area used instead**, both on Ben's own instruction and both flagged wherever they are written:

1. **Toe-kick facing laminate** — area used + 15% waste (Ben, 16 Sep 2026: "kick it does not have to use the full
   board rule"). Microvellum does the same, at 20%.
2. **Mirror glass** — the measured cut area, to 4 decimal places, at the Glasstech rate (Ben's own invoice,
   21 Sep 2026). **This replaced his 17 Sep instruction to charge a whole sheet.**

Nothing else may be charged by area. Both exceptions reach the quote with `sheetsRequired: 0` or an explicit
"measured area, NOT a sheet" label so no one reading a sheet-stock list mistakes them for boards.

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
      (a Toe Kick Base instead cuts the ladder: ladderKickCutList → Sub Front / Sub Back / Sleepers / Cleats)
   3b. splitOversizeParts(parts)               → a part that cannot be cut from its board becomes equal pieces
                                                 that can, priced, with a note and a join (Ben, 21 Sep 2026)
   4. calculateSheetRequirements(parts)        → whole sheets per material by area / yield
   5. calculateEdgeTape(parts)                 → edge metres per edge material, bought as a 20 m minimum then by the metre
   6. calculateHardware(config, ...)           → hinges + plates, runners, screws, legs
   7. calculateLaborCost(...)                  → calibrated labor model (labor_rates)
   8. calculateBuildHours(...)                 → time model for scheduling
        │  CabinetBOM (parts, sheets, edging, hardware, subtotals)
        ▼
generateQuoteBOM (all cabinets in the room)
   • consolidateSheets / EdgeTape / Hardware   → job-level bulk yield
   • P5 reconciliation                         → bulk sheet savings pushed back per cabinet
   • kick facing / kick face board             → BY AREA + waste (ladder) or BY THE LINEAL METRE (legs), never sheets
   • adjustable legs                            → FOUR a cabinet, or none at all on a job with ladder bases
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
  mirror { required, priced, panels, panelCut, use? }, leafMassKg, minutes { setUp, leaves, install },
  shopMinutes, kitCost, boardCost, edgeCost, mirrorCost, materialCost, laborCost, costPrice, total, unpricedItems,
  warnings }`.
  - `mirror.priced` is true once the glass resolves to its catalogue row BY ITEM_CODE, and `mirror.use` then
    carries `{ materialId, itemCode, name, thicknessMm, panels, panelCut, measurePerPanelSqm, measureSqm, rate,
    cost }` — the Glasstech proforma's own columns (QTY, SIZE, MEASURE, RATE, NET), so a quote can be held next to
    an invoice. `materialCost` = kit + board + edge + mirror.
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
- **Mirror** — CUT TO SIZE and charged on the MEASURED AREA of each piece (21 Sep 2026). **This reverses Ben's
  17 Sep instruction to charge a whole sheet**, on the strength of his own invoice: Glasstech (QLD) proforma
  180617, 1 Sep 2026, ref "4MM MIRROR", bills 2 × 2009 × 760 as 3.0536 m² at $90.21/m² ex GST = $275.47 and
  2 × 1991 × 724 as 2.8830 m² = $260.08. Their MEASURE is `round(w × h in m², 4 dp) × qty` — the exact cut area,
  no over-measure, no minimum, no size band (`glassMeasureSqm`, checked to the printed digit on both lines).
  With the toe-kick facing this is one of only **two** exceptions to the whole-board rule.
  The row is resolved **by `item_code` only** (`GLASSTECH_MIRROR_ITEM_CODE`, default `GT-MIR-4SVB`, overridable
  with `selections.mirrorMaterialId`) — **never by name**: the catalogue's only other "mirror" row is Laminex
  `Mirror Smoke` (AU1003078), a decorative LAMINATE at $273.73/m², three times the glass. With no such row the
  opening prices everything else and still raises `MIRROR NOT PRICED:`; `mirror.priced false`, glass on
  `workshopCosting.buyoutItems`. Priced, it lands in `workshopCosting.sheetStock` as a measured-area line
  (units × rate = cost, exactly as the proforma reads) and the **backer board is still not priced** and stays on
  the buyout list. The catalogue row is written but NOT applied:
  `docs/sql/glasstech-mirror-4mm-silver-vinylback.sql`. The proforma carries no supplier part number at all, so
  that item_code is Bower's own.
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

**The same opening with MIRROR infill** (21 Sep 2026), two 1154 × 2345 panels:

| | before | after (no `GT-MIR-4SVB` row) | after (row seeded) |
|---|---|---|---|
| Kit 944.02.002 | $324.01 | $324.01 | $324.01 |
| Board / edge | — | — | — |
| Mirror glass: 2 × round(1154 × 2345 / 1e6, 4) = 2 × 2.7061 = 5.4122 m² × $90.21 | **not priced** | **not priced** | **$488.23** |
| Shop (drafting + handling on 2 bought panels, set-up 30, leaves 60, loading) | $199.50 | $199.50 | $199.50 |
| **Opening line** | $732.91 | $732.91 | **$1,416.44** |
| **Job ex GST** (+ $73.50 install at cost) | $806.41 | $806.41 | **$1,489.94** |

Nothing moves until the row exists — the change is the RULE (measured area, by code only), not a guess at a price.
The board-infill worked example above is byte-identical before and after.

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

- Mirror: the glass is priced (above), the **backer is not** — which board is it? Mirror mass is still an estimate
  (Hafele does not specify a mirror infill), and the glass / backer split of a 17 or 18 mm build-up is assumed
  (4 mm glass + the rest backer). Does the $90.21/m² rate hold for sizes other than the two on the proforma?
- A robe LEAF that cannot be cut from its board is a HARD STOP, not a split: a leaf is a door face and cannot be
  joined down the middle. Since 21 Sep 2026 a hinged cabinet DOOR, a drawer front and a false front are hard stops
  for exactly the same reason, so the engine no longer contradicts itself on the two halves of the same object.
  Ben's "too long parts still price" therefore covers boards, not fronts — confirm.
- Extra damper part number and price.
- Where the 900–1350 mm leaf range came from (warned, not blocked).
- The IH datum: the engine takes `openingHeight − top − bottom` as Hafele's IH (a carcase-internal measure on p3);
  a builder's plasterboard opening to a finished floor may need a different allowance. Floor level / covering
  and out-of-square are not modelled.
- The SKU → profile / leaves / finish / length mapping is Ben's (build pack SC-16, brochure p3); the installation
  pages cannot confirm it.
- The 10 mm spacing between leaves in the nest is assumed; grain is taken as along the sheet's long side.
- A benchtop-only quote still gets no job minimums (pre-existing).

## Part sizes: carcase height, doors and drawer faces (19 Sep 2026, not deployed)

The part-fits-board warning (below) exposed three sizing faults against the LIVE catalogue. All three were
checked part by part against the Microvellum Toolbox work orders of 11 jobs (152 products: Regal, Donkin
kitchen / laundry / bathroom, Hibiscus, Forest Glen, Coral Lodge kitchen / robe, Kenfrost, 10 Sands, Erin & Matt
v2):

1. **Doors were height × DEPTH.** The live `Door` row (`Component`) has no length or width formula, so every door
   fell back to the item's height × depth: Regal's 250-wide broom priced a 2460 × 580 door (Microvellum
   2325 × 248); a 900 × 880 × 555 "Base 2 Door" carried 2 × 880 × 555 = 0.98 m² of door where Microvellum cuts
   2 × 743 × 448 = 0.67 m².
2. **Floor-standing carcases kept the kick.** The live base and tall sides and backs are plain `CabHeight`, and
   the schedule height includes the toe kick, so every base AND tall side and back was one kick too long
   (Regal broom 2460 vs 2325; every base side 880 vs 745). Microvellum cuts all 113 of them at
   H − Toe_Kick_Height.
3. **Drawer faces were drawer-box fronts.** The live `Drawer Front` row is `(CabWidth − 32) × (DrawerRunnerHeight
   − 30)` = (W − 32) × 110, edged on one side, and the engine prices it as the face: Regal's 600 × 480 Base 1 Drawer
   had a 568 × 110 face where Microvellum cuts 598 × 343. Face board over the 11 jobs was 2.69 m² against 6.47.

**Fixed in code, not in the catalogue.** The kick cannot be written as a formula (no per-item variable, no
conditional: `CabHeight-ToeKickHeight` would cut 135 off uppers and stacked units and use 135 on a 100-kick job),
a re-import through `import-pricing` (upsert on name) would wipe a hand edit, and a row edit would change the
planner (main's older engine) and Build Flow at the same moment, untested. `parts_pricing` is untouched.

### The rules (all numbers from the Microvellum parts and prompts)

- **Kick per item** (`bomGenerator.itemKickMm`). A floor-standing base or tall carcase stands on
  `PlacedItem.toeKickHeight`, else `GlobalDimensions.toeKickHeight` (the planner's room setting). Zero for
  replacement fronts, flat boards, kick bases, uppers, anything with y > 1 or named upper / wall / suspended /
  floating / wall-hung, any name that does not say base / tall / pantry / broom / linen / vanity / sink (Hibiscus's
  "Any Angle Spacer" exists at both levels) unless its `layoutRole` is a floor role, and anything no taller than
  the kick.
- **Kick per schedule row** (`quoteFromSchedule.scheduleKickHeights`): the row's own `kickMm`, else the height of
  the Toe Kick Base rows in its room (a blank room is the default room; case-insensitive), else 0 - or the job's
  kick height when the job is on adjustable legs. In all 7 work orders with kicks that height IS every carcase's
  Toe_Kick_Height: 135 on Regal, Donkin, Kenfrost and Erin & Matt, 100 on Forest Glen, Hibiscus and Coral Lodge's
  robe. Kick rows in one room that disagree take the commonest height, with a warning.
- **Stacked units** (same function): with no `kickMm`, a base row shorter than its room's base height (the
  commonest height of the room's base cabinet rows, by units) stands on NO kick when a taller base row of the same
  width in the same room makes up that height - Regal's "Base Open" 600 × 382 on its "Base 1 Drawer" 600 × 498
  (= 880), Donkin's 632 × 382 on 632 × 498 (= 880), Erin & Matt's 632 × 382 on 632 × 494 (= 876). All three are at Z
  494-498 with Toe_Kick_Height 0 in their work orders. The quote says so (`"Base Open" 600 x 382 in "kitchen" is
  priced standing on the "Base 1 Drawer" 600 x 498 below it …`). Only when the room has a kick to take off.
- **`ScheduleItem.kickMm`** (new, optional): Microvellum's per-product Toe_Kick_Height. It wins over both rules
  above; Build Flow should send it when it has the work order.
- **`CabHeight` is the carcase height**: item height − its kick. Uppers and anything off a kick are unchanged. A
  formula that names `ToeKickHeight` (the 2 July seed's `CabHeight-ToeKickHeight`, the smoke fixture) is evaluated
  on the full item height with `ToeKickHeight` = the item's own kick (100 on a 100-kick room, not the job default
  135), so it cuts the carcase height and the kick never comes off twice. No live row names it (0 of 288).
- **Doors** - a code default used only where the matched row has no formula for that axis (the catalogue still
  wins when it has one): height = carcase height − Top_Reveal (2 on a base, under the benchtop; 0 on tall and upper),
  width = (W − 1 − 1 − DoorGap × (n − 1)) / n with n from the name as before. Microvellum: Left/Right_Reveal 1 (2 at
  some exposed ends - 1 mm, not in a schedule), Door_Gap 2 on 34 of 34 door pairs, Top_Reveal 2 on 10 of 10 base
  door products, 0 on 5 of 6 tall and 26 of 28 upper, Bottom_Reveal 0 except:
  - an **"Upper Rangehood Cabinet"** (not the undermount one): Bottom_Reveal = Rangehood_Facia_Height, 40 by default
    (Donkin 1.22: 695 − 40 = 655 × 298, as cut; Coral Lodge 208: 784 − 2 − 40 = 742; an older Donkin revision had 80).
    New optional `ScheduleItem.rangehoodFaciaMm` carries the prompt; without it, 40.
  - under a **top drawer** (below): height − Top_Drawer_Front_Height 180 − Horizontal_Drawer_Gap 2.
  A default-sized door is a cut size (judged by the part-fit warning), except a pie-cut corner's, a blind corner's
  without its blind width, and an unmodelled drawer layout's.
- **How the drawers sit** (`bomGenerator.frontLayout`, read off the Microvellum library's product prompts:
  Top_Drawer, Double_Top_Drawer, Drawer_Bank, Bay_Qty, Appliance_Top_Opening):
  - **Drawer bank** - drawers only, and they fill the front: "Base 1…7 Drawer", "… Waste Bin", "N Drawer Suspended
    Cabinet", the planner's drawer SKUs (Top_Drawer 0). Each face is W − 2 wide by its share of the face stack
    H − kick − Top_Reveal − DrawerGap × (n − 1) (Microvellum: 14 of 14 standard banks; Donkin's 4-drawer 880 high is
    4 × 184.25 = 737), split by `distributeDrawerHeights` as before. How the stack is split does not change the
    board, the edge metres or the cut perimeter.
  - **Top drawer** - one row of 180-high faces (Top_Drawer 1, Top_Drawer_Front_Height 180) over the doors or an open
    bay: "Base 1 Door 1 Drawer" (450 × 880 on a 135 kick: door 561 × 448 under a 448 × 180 face), "Base 2 Door 1
    Drawer", "Base Open 1 Drawer" (598 × 180 - not a 739-high face), and with Double_Top_Drawer 1 two faces side by
    side, (W − 2 − 2) / 2 wide: "Base 2 Door 2 Drawer", "Base Open 2 Drawer"; plus the two "… Door 1 Drawer Blind
    Corner" products (spanned as a blind corner). From the prompts - no work order has one yet.
  - **Inner** - drawers behind doors ("… With Inner Drawers", Top_Drawer 0): full-height doors; the drawer front
    keeps the catalogue formula as before (Microvellum has no face there).
  - **Unmodelled** - any other drawer product: a microwave or oven opening ("Base 1 Drawer Microwave",
    Appliance_Top_Opening), bays of doors beside drawers ("Base 2 Door 4 Drawer Cabinet", "Base 3 Drawer 2 Door
    Cabinet", Bay_Qty), "… Waste Bin With Top Drawer", "Base 2 Bay Drawer", "Tall Pantry With Drawers", "Base Drawer
    Sink With False Front", corner drawers. Doors full height and flagged as estimates, drawer fronts from the
    catalogue `Drawer Front` row (as live), and a warning: `… its drawer layout is not modelled, so its fronts are an
    estimate …`.
- **The face row.** An engine-sized face (bank or top drawer) is priced on the catalogue's **`Drawer`** row
  (`Component`, no formula, edged all round, the same costs as `Drawer Front`), exactly as a door is on `Door`: a
  formula on `Drawer` wins on its axis, the code default fills the other. `Drawer Front` - the (W − 32) × 110
  drawer-box front - now only sizes drawer fronts the engine has no layout for (inner, unmodelled). With no `Drawer`
  row in the catalogue the face is priced on `Drawer Front` at the default size, edged all round. Edged all round:
  50 of 52 Microvellum drawer fronts. The part keeps the name "Drawer Front".
- **Pie-cut corners**: the doors take the default across the full width, are flagged `sizePlaceholder` and the
  item gets a warning (`… is a corner cabinet - its door board is an estimate …`). Microvellum puts them on the two
  faces left by the arm depths (Regal 880 × 880 × 1200: 325 + 645 with 555 arms), which no schedule carries.
- **Blind corners** ("Base Blind Corner"): **2 doors** (Microvellum's Base Left Door and Base Right Door: Hibiscus 2 ×
  763 × 392.5, Erin & Matt 2 × 739 × 320.5, each with 4 hinges and 2 pulls - the mapping used to give 1), over the
  width less the blind part, with Left_Reveal 2 + Right_Reveal 1: width = (W − blind − 3 − DoorGap) / 2. The blind
  part is the new optional `ScheduleItem.blindCornerWidthMm` (Microvellum's Blind_Corner_Width: 623 Erin & Matt, 473
  Hibiscus) - with it the doors are exact and not flagged. Without it the depth stands in (W − D) and the doors are
  flagged and warned (`… is a blind corner - its door board is an estimate … send blindCornerWidthMm …`): Hibiscus 2 ×
  763 × 351.5 = 0.54 m² against 0.60, Erin & Matt 2 × 739 × 354.5 = 0.52 against 0.47. (The first pass sized one door
  across the full width, 0.96 / 0.94 m², worse than live.) Tall / upper blind corners keep 1 door; Bower's
  base-1000-bc keeps its own mapping; an open blind corner ("Base Open Blind Corner") now gets no door. All corners'
  sides and backs take the kick off.

**Not moved**: replacement fronts (the `exact` faces-only path - 10 Sands 769 × 600 / 769 × 399 still equal
Microvellum), flat boards (applied panels, fillers, pelmets, under panels - still cut to their full height; the
kick-only part-fit exclusion stays for them), Toe Kick Base rows, benchtops, robe openings, drawer boxes, bottoms,
tops, shelves and rails, and hinge counts (still from the item height and door count - a Base Blind Corner's second
door brings its 2 hinges, 2 plates and pull, as in Microvellum). Checked: all 83 flat-board, replacement-front,
kick-base and spacer products of the 11 work orders have identical parts before and after; benchtop and robe output
is identical on the 11 saved jobs.

### Size accuracy against Microvellum (11 work orders, finished sizes, ± 3 mm on both sides)

"First pass" is the first version of this change; "Now" adds the review fixes (stacked units, blind corners,
rangehood facia, top drawers). The last column also sends what Build Flow has in the work order: `kickMm`,
`blindCornerWidthMm`, `rangehoodFaciaMm`.

| Parts | Before (541614d, live) | First pass | Now | Now + work-order prompts |
|---|---|---|---|---|
| Base doors | 0 of 9; 3.96 m² vs MV 2.31 | 9 of 9; 2.32 | 9 of 9; 2.32 | same |
| Tall doors | 0 of 9; 9.08 m² vs 7.47 | 5 of 9; 7.48 | 5 of 9; 7.48 | same |
| Upper doors (not rangehood) | 0 of 45; 11.75 m² vs 11.30 | 17 of 45; 11.05 | 17 of 45; 11.05 | same |
| Rangehood cabinet doors | 0 of 8; 2.29 m² vs 2.16 | 0 of 8; 2.15 | 2 of 8; 2.12 | same |
| Pie-cut corner doors (estimate) | 3.31 m² vs 1.29 | 1.60 | 1.60 | same |
| Blind corner doors | 0 of 4; 0.97 m² vs 1.07 (1 door each) | 0 of 4; 1.90 | 0 of 4 (estimate); 1.06 | 4 of 4; 1.07 |
| Drawer banks (count, width, stack) | 0 of 18; faces 2.69 m² vs 6.47 | 14 of 18; 6.65 | 14 of 18; 6.65 | same |
| Base + tall side and back heights | 9 of 122 | 113 of 122 | 122 of 122 | 122 of 122 |
| Replacement fronts | 3 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |

The misses that remain are all things a schedule row does not carry: the upper doors that drop 16 mm over an
under panel (24 upper doors and the 6 undermount rangehood doors on Regal, Erin & Matt, Coral Lodge; Forest Glen's 4
drop 80 with a 2 mm top reveal); the 4 tall doors on two products whose door count or split is not in the name (Erin
& Matt's "Tall 1 Door Broom" has 2 doors of 346, Regal's "Tall 1 Door Double Door" is 739 + 1063 stacked - the
engine's single 1804 × 598 door is the same board); Coral Lodge's robe drawer banks (30 mm shadow-line reveals and
gaps: stack 694 vs 778); pie-cut corners; blind corners until Build Flow sends the blind width; rangehood internals.

### Money on the 11 saved jobs (sell ex GST, the harness catalogue)

| Job | Before (live) | First pass | Now | Change vs live | Why |
|---|---|---|---|---|---|
| Regal kitchen | 8195.63 | 8037.91 | 8039.40 | −156.23 (−1.9 %) | Polar White fronts 6 → 5 sheets (−$90.63 cost: the 2460 × 580 broom and 880 × 1200 corner doors); edge −4.7 m; cutting and lead-in −2.6 min. The review fixes add back $1.49: the stacked Base Open is 382 again |
| Donkin kitchen | 7039.24 | 6922.64 | 6921.61 | −117.63 (−1.7 %) | Classic White carcase 9 → 8 sheets (−$77.24: base sides and backs 135 shorter); cutting −1.7 min. Review fixes: stacked Base Open 382 again, rangehood doors 40 shorter |
| Erin & Matt (saved request) | 16317.77 | 16422.99 | 16520.72 | +202.95 (+1.2 %) | Polar White fronts 2 → 3 sheets (+$90.63: drawer faces at full size); carcase 22 → 21 sheets (−$64.23); edge +21.9 m (+$52.71). Review fixes +$97.73: the blind corner's second door (+$25.50 hinges, plates and pull; +21 min hardware assembly, +$34.30) and the stacked Base Open |
| Hibiscus kitchen | 6636.07 | 6671.13 | 6767.53 | +131.46 (+2.0 %) | no sheet changes; edge +10.3 m (+$24.22). Review fixes +$96.40: the blind corner's second door (hardware +$25.50, shop labour +$42.97) |
| Coral Lodge robe | 6904.63 | 6927.34 | 6927.34 | +22.71 (+0.3 %) | no sheet changes; edge +11.2 m (+$13.93); cutting +$2.29 |
| Coral Lodge kitchen | 3327.10 | 3332.95 | 3332.95 | +5.85 | upper doors W/n − 2 wide instead of the depth: edge +1.4 m (+$2.75), cutting +$1.44 |
| Donkin laundry | 1155.31 | 1153.07 | 1153.07 | −2.24 | no sheet changes; edge −0.5 m, cutting −0.3 min |
| Forest Glen laundry | 4679.94 | 4679.26 | 4679.26 | −0.68 | no sheet changes; edge +1.1 m, cutting −0.4 min |
| Donkin bathroom, 10 Sands, 10 Sands (Arabica) | 393.69 / 679.50 / 795.28 | same | same | 0 | flat panels and replacement fronts only |
| **All 11** | **56,124.16** | **56,015.76** | **56,210.35** | **+86.19 (+0.15 %)** | |

"Now" above is the state **before** the 21 Sep 2026 kick / split work; for what that moved see "Toe kicks: the
ladder, the ply, the facing and the legs".

Whole sheets absorb most of the area change; the edge-tape moves are the drawer faces (edged all round, where the
box-front row edged one side) and doors whose perimeter changed; minutes move through Panel lead-in / cutting
(perimeter), and on the two blind corners through the second door's hinges and pull (drafting, drilling, labelling,
handling, shop and hardware assembly - BowerOS minutes × station rates). Nothing else is added or removed, and each
Toe Kick Base line moves only by cents of its share of the job's shop labour.

### Not done here (each needs Ben's say or a schedule field)

- Build Flow sends none of the three new prompts yet (`kickMm`, `blindCornerWidthMm`, `rangehoodFaciaMm`). The
  stacked-unit rule and the 40 default cover the 11 jobs; the blind corners stay estimates until it sends the width.
- Flat boards: Microvellum cuts a floor-standing applied panel H − kick high and D + board + 2 wide
  (Regal 2325 × 598, Erin & Matt 2305 × 728) and a base / tall return filler H − kick; the engine still cuts
  H × D and H × 100.
- Upper doors over an under panel (+16), pie-cut corners (arm depths), shadow-line drawer banks, an upper's
  Top_Reveal 2 (Coral Lodge 208 rangehood 744 vs 742).
- Unmodelled drawer layouts (above) - microwave / oven openings, door and drawer bays, bin with top drawer, 2-bay
  drawer, pantry with drawers, false-front sink, corner drawers: they need a work order each. "Split Top Drawer"
  banks are priced as a plain bank (the same board; the top face is one piece where Microvellum has two).
- Top-drawer products and "Base Open 2 Drawer" come from the library prompts only; no exported work order has one.
- The oven's two facias (W − 2) × (H − kick − 2 − 602) / 2 (3 of 3 Base Under Counter Ovens); the catalogue has an
  unmapped `Base Ubo Fascia` row, `(CabHeight-600)/2` × `CabWidth-CarcaseThick*2`.
- In-cabinet applied ends (Left/Right_Applied_End prompts: 15 parts, 7.90 m² of front board across the 11 jobs).
- Rail On Flat 2 × 150 (Microvellum 1 × 100 front rail plus a Base Top), shelves in sinks / ovens / open units,
  the Toe Kick Base stand-in.
- Admin → Pricing → Parts still shows the Door row with no formula while the code default is in use. Once both
  apps run this code, writing the same default into the row (`CabHeight-2` / `(CabWidth-2-DoorGap*(NumDoors-1))/NumDoors`
  for a base) would only be cosmetic - and base / tall / upper need different top reveals, which one row cannot say.
- The planner gets this on merge to main; its base items already include the kick in their height and its 3D model
  already draws `carcassHeight = height − kick`, so its BOM will then match its own drawing.

## Part fits board — and what happens when it does not (17 Sep, split 21 Sep 2026)

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

### The part is SPLIT and priced (Ben, 21 Sep 2026)

> "too long parts still price but split the items in half and make a not"

`splitOversizeParts(parts, materials)` in `sheetOptimizer.ts` cuts every part that does not fit into **equal
pieces that do**, and the quote carries a note saying which part, into what, and that it needs a join. It is
called from `generateCabinetBOM` **between `calculatePartDimensions` and `calculateSheetRequirements`** — not
inside `sheetOptimizer` — because `parts` is the one list the sheet count, the edge tape, the per-part costs and
every workshop station all read; splitting inside the sheet call would reach the sheet count and nothing else.

- **Equal pieces, not stock lengths.** `ceil(dimension / usable)` of them, so anything up to twice the board is
  Ben's two halves and a 3.32 m kick rail on a 2.44 m ply board is still two. Both axes split when both overrun
  (a grid), and the orientation needing fewer pieces wins — rotation is allowed exactly as `partFitsSheet` allows
  it, since grain is not modelled anywhere.
- **The join edges are left BARE.** Each piece keeps the original part's edging on the edges it still owns and the
  freshly cut ends get none, so the job's taped metres do not move. A visible raw edge at the seam is **Ben's
  call** — say if the join should be taped (it is $0.18–$1.58 a part).
- **The board does not move.** `n` equal pieces have exactly the area of the part they came from and the sheet
  count is area ÷ yield, so the material cost is identical. If board cost changes on a split, the split is being
  double-counted. What moves is the extra part through drafting / labelling / handling / cutting, the join, and
  occasionally the LOADING CLASS: halving a 2582 mm panel drops it under `largeLooseLongestSideMm` (2000), so it
  reclassifies from a 2-crew large loose panel to an ordinary loose item and gives $5.33 back.
- **Join labour**: `partJoinMin` = 30 min at `assemblyRate` $100, station `Part joins (split over-long parts)`
  (the name contains "joins", so it lands in the finishing bucket). **30 is NOT Ben's figure for a board seam** —
  he has not set one — it is the 30 min he DID confirm for a bolted benchtop blank join on 16 Sep. His to confirm.
- **Never split**:
  - a stand-in / estimated size (`sizePlaceholder`, never judged either);
  - a floor-standing flat board over its sheet only by the toe kick — that correction runs BEFORE the split, so a
    2460 tall applied panel is not charged a phantom join for work that never happens;
  - **a VISIBLE FRONT** — a Door, a Drawer Front, a False Front (`sheetOptimizer.isUnjoinableFace`, matched on
    partType/name). Ben's "split the items in half" is about BOARDS. A front cannot be butt-joined across its face
    and sold as a front, which is the same reason an over-long robe LEAF is a hard stop. A front that does not fit
    falls through to the `Part too big for its board: …` warning, which then says so in as many words and asks for a
    longer sheet in the same decor. The board is still priced by area as if it fitted, and **no join is charged**.
    This is deliberately NOT keyed on `materialRole === 'exterior'`: a Tall Filler, an Applied Panel, an Under Panel
    and a Pelmet are all exterior-role and they DO split — they are exactly the parts Ben asked for (Coral Lodge's
    2770 × 70 filler, Regal's 2984 × 330 under panel).
- The old `Part too big for its board: …` warning is now the fronts' hard stop, and still covers a part a split
  cannot help. Only cabinet parts are split — kick runs are job-level stock lengths, benchtops are nested by
  `benchtopLaminate` with their own join rules, and a robe LEAF that will not fit is a hard stop for the same reason
  a hinged door now is.

**A floor carcase the kick test does not recognise.** The kick name list is `base|tall|pantry|broom|linen|vanity|
sink|tower|appliance|oven|larder|utility|cupboard|robe|bookcase|dresser` (widened 21 Sep 2026 — it used to stop at
`sink`). A base/tall carcase named outside it gets NO kick taken off, so its parts are cut the full item height;
before the split existed that was only a wrong size, and afterwards it bought phantom joins as well ("Appliance
Tower 2 Door" 600 × 2460 was charged 210 min of joins; it is now 60, all of them its kick's real ply rails).
BowerOS cannot resolve the remaining cases on its own — a schedule carries no Z, and Hibiscus lists TWO "Any Angle
Spacer", 406 × 865 at Z 0 (on the floor) and 247 × 692 at Z 1508 (on the wall) — so it now says plainly that it
cannot tell, gives both readings and asks for `kickMm` on the row.

Two kinds of size are not judged:

- a stand-in or estimated size (`PartDimension.sizePlaceholder`): a part whose catalogue row has no formula and
  for which the engine has no default (the live "L Shape Shelf"), a corner's doors (an estimate - the corner
  geometry is not in a schedule), or a corner part needing a second arm the item does not carry (Donkin's
  Ls Base Bottom 1252 × 1252);
- a floor-standing **flat board** that is over its sheet only by the toe kick (`generateCabinetBOM`). Flat boards
  are still cut to their full schedule height, kick included - Regal's 2 × Tall Applied Panel 2460 × 580 and
  Erin & Matt's 3 × 2440 × 710, which Microvellum cuts 2325 × 598 and 2305 × 728 - and that is deliberately not
  changed yet (see "Part sizes" below). The kick is only taken off a board taller than the kick: a 100-high
  "Pelmet BC" is not standing on one.

Carcases no longer need either exclusion: since 19 Sep 2026 their sides, backs and doors are cut to the carcase
height and their doors are sized by the code default (see "Part sizes: carcase height, doors and drawer faces"),
so the Regal broom's sides, back and door are 2325 long and fit a 2400 sheet on their own.

Splits on the 11 saved jobs (21 Sep 2026). Every one of these is a SINGLE over-long part in the Microvellum work
order too, so the sizes are right and the split is a production decision, not a sizing bug:

| Job | Board | Part the engine priced | Split into | Join |
|---|---|---|---|---|
| Coral Lodge kitchen | Plantation Ash 2400 × 1200 | Under Panel "Tall Filler" 2582 × 307 | 2 × 1291 × 307 | 1 |
| Coral Lodge robe | Blonde Oak 2400 × 1200 | Under Panel "Tall Filler" 2770 × 70 | 2 × 1385 × 70 | 1 |
| Regal kitchen | Polar White 2400 × 1200 | Under Panel "Tall Filler" 2984 × 330 | 2 × 1492 × 330 | 1 |
| Regal kitchen | Polar White 2400 × 1200 | Pelmet BC "Tall Filler" 100 × 3000 | 2 × 100 × 1500 | 1 |
| Regal kitchen | Plywood 15 mm 2440 × 1220 | 3320 Toe Kick Base "Sub Front" 3320 × 135 | 2 × 1660 × 135 | 1 |
| Regal kitchen | Plywood 15 mm 2440 × 1220 | 3320 Toe Kick Base "Sub Back" 3290 × 90 | 2 × 1645 × 90 | 1 |

The last two are new: the old single-board kick part was `sizePlaceholder` and therefore exempt from judging
entirely, so Regal's 3.32 m kick raised nothing.

**FOR BEN — split, or buy the long board?** Every one of the four MDF parts above exists in the SAME decor on a
3115 × 1200 board at the SAME $/m²: POLY54313 Plantation Ash, POLY57144 Blonde Oak, POLY43159 Polar White Sheen
(Blonde Oak and Plantation Ash also come 3600 × 1800). One extra 3115 board costs $118–$265 more than the split's
~$50 of join labour, but it gives a ONE-PIECE part — and two of the three decors are grained, which makes a central
butt join on a visible filler a finish decision, not just a cost one. Microvellum cuts all four one-piece. The
engine splits today; say if it should prefer a longer board in the same decor when the catalogue has one.

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
| `benchtopSinkCutoutMin` | 30 min / DROP-IN sink (Ben, 21 Sep 2026) | Benchtop cut-outs (fabricated top) | `machiningRate` $250 |
| `benchtopUndermountSinkCutoutMin` | 90 min / UNDERMOUNT sink (Ben, 21 Sep 2026: "under mounte 1.5 hrs") | Benchtop cut-outs | `machiningRate` $250 |
| `benchtopCooktopCutoutMin` / `benchtopTapHoleMin` | 20 / 5 min | Benchtop cut-outs | `machiningRate` $250 |
| the same four minutes on a blank | 30 / 90 / 20 / 5 min | Benchtop blank cut-outs | `assemblyRate` $100 — a jigsaw and a router on the bench, like every other blank station |

**Drop-in vs undermount (21 Sep 2026).** A drop-in bowl sits in the hole on its own rim, so the cut edge is covered
and only needs sealing; an undermount hole IS the finished visible edge, so it is routed to a template, dressed,
polished and the bowl clamped from below. The distinction is a SECOND COUNT on the row, `benchtopCutouts`:

```ts
benchtopCutouts?: { sink?: number; sinkUndermount?: number; cooktop?: number; tapHole?: number }
```

not a type flag — a top can carry one of each, and a payload that sends only `sink` keeps meaning drop-in, so every
stored quote and every Build Flow payload written before today prices exactly as it did. The rule that **a cut-out
costs nothing unless the row asks for it** is unchanged: the counts default to 0, nothing is ever inferred from a
product name or a sink cabinet, and the station only fires when minutes > 0.
Build Flow's `PriceWithBowerDialog` does not send `sinkUndermount` yet (`Cutouts` type, `NO_CUTOUTS`, one more
Counter) — until it does, every Build Flow cut-out is a drop-in, which is the right default.

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

## Toe kicks: the ladder, the ply, the facing and the legs (21 Sep 2026)

> Ben, 21 Sep 2026: "if there is adjusble leg price four legs per cabinet then a lm of face board if ladder kick
> buikld a cut list and price the kicks as ply with the selected lamnate face"

A Bower job stands on one of two things, and they are priced quite differently.

### A LADDER base — a Microvellum "Toe Kick Base" product

Every Microvellum kitchen Bower builds lists its kicks as their own rows. Until now a `Toe Kick Base` was mapped to
a single `Filler` part and priced as **one 135 × 530 board of CARCASE melamine with its WIDTH ignored entirely**: a
599, a 1480 and a 3320 mm kick all came out at exactly the same money. It is now the ply ladder the work order
actually cuts, faced with the selected kick laminate.

**The cut list** (`ladderKickCutList` in `bomGenerator.ts`; `CabinetBOM.ladderKick.cutList`). Every dimension and
count is read off the 15 `Toe Kick Base` products in Bower's 7 exported work orders (Coral Lodge robe, Donkin
kitchen + laundry, Forest Glen laundry, Hibiscus kitchen, Regal kitchen, Kenfrost WO2) and reproduces **11 of 11**
standard kicks part for part:

| Part | Length | Width | Count |
|---|---|---|---|
| Sub Front | `W − 0.4 × finishedSides` | `H` | 1 |
| Sub Back | `W − 0.4 × finishedSides − K` | `2⁄3 H` | 1 |
| Sleeper Left / Right | `D − 15.4` | `H` | 2 |
| Sleeper 1…n | `D − 30.4` | `2⁄3 H` | `ceil(W / 600) − 1` |
| Cleat Left / Right (+ extras) | `D − 30.4` | `75` (constant, both kick heights) | `2 + floor(W / 2400)` |
| Finished Front (facing) | `W` | `H` | 1 |
| Finished Side (facing) | `D` | `H` | one per exposed end |

All ply parts are 15 mm (`LADDER_PLY_THICKNESS_MM`, Microvellum's "Plywood 15mm_Clone"); the facing is Microvellum's
"Laminate Kick Front". **No ladder part carries edge tape** — `EdgeNameTop/Bottom/Left/Right` are blank on all 15
kicks — so a ladder takes no edging charge. When `D − 30.4 ≤ 0` (Donkin's 30 mm deep return kick) there is no room
for cleats or intermediate sleepers and none are cut, which is what Microvellum does.

**`K` = 30 or 46 — OBSERVED, NOT DERIVED, and FOR BEN.** The Sub Back is inset exactly 30 mm on every 135 mm kick
(Donkin, Regal, Kenfrost) and exactly 46 mm on every 100 mm kick (Coral Lodge robe, Forest Glen, Hibiscus), 11 for
11. 30 is the two 15 mm sleepers it sits between; the extra 16 on a 100 kick is not derivable from anything in the
work orders, and Donkin's 30 mm-deep 135 kick also uses 46. Confirm against the Microvellum library before this is
trusted further (`ladderSubBackInsetMm`).

**Variants the engine names rather than pretends.** `LadderKickBuild.variant` and a plain warning fire for an
angled-end kick ("Toe Kick Base With Angled Ends" — Microvellum cuts the Sub Front and Finished Front to the angled
length, the Sub Back full width at full height, sleepers 85 wide) and for a kick too shallow for cleats. A **NOTCHED**
kick (Forest Glen's 1226, with a Notched Sleeper and Notched Sub Back round a short arm) **cannot be told from a
schedule row at all** — nothing in W × H × D says so — so it prices as the square ladder and the job-level warning
says to check notched and angled kicks against the work order.

**Exposed ends.** Microvellum returns the face on 11 of the 15 kicks, and across them the returns are **24% of the
finished face**, so it is not a rounding error. A schedule cannot infer it, so it is a field: `kickExposedEnds`
(0–2). Omitted, the kick is priced with NO return and the quote says so rather than guessing.

**The ply is a BOARD on the whole-board rule** — nothing changes there. It comes from `kickPlyMaterialId` if sent;
else the row's own board when that is already plywood (which is what a Microvellum export sends, so Bower's jobs
need no new field); else the catalogue's cheapest 12–19 mm PLYWOOD row (`pickKickPlyMaterial`, matched on the word
"plywood" — never "ply", which appears in the decor name "MDF 162412 DS Natural Ply Woodmatt"), warned; else the
carcase board, warned loudly. Every one of the 11 saved jobs fits its kick ply in ONE 2440 × 1220 board.

**The FACING is the exception.** Ben, 16 Sep 2026: *"kick it does not have to use the full board rule"*. The face is
charged by the **AREA USED plus waste**, never as a sheet:

```
areaSqm   = Finished Front (W × H) + Finished Side (D × H) per exposed end
chargedSqm = areaSqm × (1 + KICK_FACING_WASTE)          KICK_FACING_WASTE = 0.15
cost       = chargedSqm × material.area_cost
```

Microvellum's own costing report does the same: Kenfrost charges "Laminate Kick Front" as **solid stock**, 0.72
units at $83.00/m² — exactly that job's 0.5978 m² of face × 1.20 — never a 3600 × 1200 sheet at $384.44. It reaches
the job as an AREA row in `consolidatedSheets` / `workshopCosting.sheetStock` with **`sheetsRequired: 0`**, which is
the flag that says no sheet was bought, and it is kept OUT of `parts` so the whole-board sheet path can never reach
it. The facing material is a SELECTION (`kickFacingMaterialId`, e.g. POLY6428 Kickboard Laminate Brushed Stainless,
$88.99/m²). **With none sent the kick is priced as bare ply, no facing is charged, and the quote says so plainly** —
a decor is never guessed.

**Facing labour**: `kickFacingBondMinPerSqm` = **65 min/m²** at `assemblyRate` $100, station `Kick facing lamination`
(the name lands it in the finishing bucket). That is BEN'S OWN figure — his hand-priced Q-0042 line was $65 for
Kenfrost's two kicks = 39 min over 0.598 m² ≈ 65 min/m². Microvellum says 40 min/m² and 20% waste. **Both the
minutes and the 15% waste are his to settle.** Bonding is only charged when the facing is thin enough to BE a
laminate (`KICK_FACING_LAMINATE_MAX_MM` = 3 mm) — a pre-faced 16 mm kickboard panel is bought finished and needs none.

### ADJUSTABLE LEGS — a planner job with no kick product

- **FOUR legs a cabinet, always** (`DEFAULT_RULES.legsPerCabinet`), not a count computed from the width. That was
  already true; what is new is that it is **visible**: `CabinetBOM.legs` states the count, the unit cost and the
  line cost, and the job carries `Adjustable legs: 4 per cabinet on N floor cabinets = …`.
- Legs are still suppressed for anything not standing on the floor (`carriesKickFace`: wall units, floating
  shelves, replacement fronts, boards) and for **every** cabinet on a job that has `Toe Kick Base` ladder bases —
  the ladder IS the base. Microvellum bills **no leg, plinth, foot or pedestal on any of the 9 work orders**, so
  four-a-cabinet is Ben's number for planner-origin jobs and cannot be checked against Microvellum at all.
- **Only on a job that has no kick product of its own.** The block is gated on
  `adjustableLegs !== false && !hasExplicitKicks && !standsOnLadderBases`. A job that lists its kicks — a planner
  `base_kick` row, or a Microvellum `Toe Kick Base` ladder — already pays for that face once, in the kick's own
  line, and on a ladder job the engine has just deleted every leg. (The block this replaced inherited the gate
  through `kickboards`; the rewrite lost it and billed the same physical kick face twice.)
- **Each cabinet's LINE carries the lineal metres of its own face**: its width + the fillers it carries + its depth
  for every end that returns + any adjoining appliance opening the kick runs straight through
  (`KickFaceUse.adjacentSpanMm` — a 600 mm dishwasher gap is bought, cut and fitted, and `calculateKickboardRuns`
  has always counted it in the run).
- **The JOB buys whole stock LENGTHS**, and that cost is spread back over the cabinets by their metres. Bower buys
  whole boards; 0.900 lm of POLY12745 is not something you can buy. One 900 mm cabinet takes one whole 3600 mm
  length: $59.45 on POLY12745 (the full 150 mm strip on a 135 kick), $48.13 on POLY10679 (ripped to 135 off the
  3600 × 1200 sheet — a whole SHEET is deliberately *not* the unit, or that one cabinet would carry $427). The
  per-metre rate stays on the line as `ratePerM`; `cost` is the share of what was bought, so it is always ≥
  metres × rate.
- `calculateKickboardRuns` says what to ORDER (the job-level `Kick face ordering: …` note), **recomputed at the
  stock length actually charged** — the note used to quote its own 2400 mm default next to a 3600 mm charge.
- A stock board **narrower than twice the kick height is a kickboard STRIP** and the whole width is bought:
  POLY12745 (3600 × 150, $110.09/m²) charges its full 150 mm on a 135 kick = $16.51/lm, where the wide POLY10679
  (3600 × 1200, $99.03/m²) is cut to 135 and charges $13.37/lm.
- **`kickFacingMaterialId` is a PER-ROW selection** and is resolved per cabinet, falling back to the first cabinet
  that sent one and then to that cabinet's own carcase board. It used to be read once from `cabinetItems[0]` — the
  first cabinet of any kind — so listing a wall unit first silently priced the whole job's kick on carcase melamine
  and printed "no kickFacingMaterialId sent" although a row had sent one. Rows asking for different boards get one
  stock line each.
- **A unit the engine knows is STACKED carries neither kick face nor legs.** `quoteFromSchedule`'s stacked-unit rule
  marks it with an explicit `toeKickHeight: 0`, and `carriesKickFace` now reads that — a schedule has no Z, so the
  `y > 1` test could never see it, and a stacked "Base Open" was billed a full width of kick face and four legs on
  top of the cabinet it stands on, next to the quote's own warning saying it was off the floor.

**FOR BEN**: on a leg job, is "a lm of face board … with the selected lamnate face" a pre-faced kickboard panel
bought ready (POLY10679 / POLY12745), or ply plus a separate laminate as the ladder is? The engine charges whatever
material is selected, per metre, and adds the bonding station only when that material is thin laminate — so both
readings work, but the money differs a lot and the selection should say which.

### What it did to the 11 saved jobs

Only the 7 jobs with kicks moved, and **not one dollar of it is material**: every job's kick ply already fitted one
whole board before and after, so `cost.materials` is identical on all 11. The whole move is labour — a kick that was
one part is now 7–14.

| Job | sell ex GST before → after | kick lines before → after |
|---|---|---|
| coral-lodge-kitchen | 3,332.95 → 3,409.07 | no kicks (the +$76 is the 2582 under-panel split) |
| coral-lodge-robe | 6,927.34 → 7,170.50 | 2 kicks $411.38 → $520.41 |
| donkin-bathroom | 393.69 → 393.69 | none |
| donkin-kitchen | 6,921.61 → 7,130.97 | 3 kicks $485.18 → $589.44 |
| donkin-laundry | 1,153.07 → 1,207.81 | 1 kick $229.10 → $258.78 |
| erin-matt | 16,520.72 → 16,900.62 | 4 kicks $691.58 → $906.26 |
| forest-glen-laundry | 4,679.26 → 4,846.17 | 2 kicks $348.40 → $431.29 |
| hibiscus-kitchen | 6,767.53 → 7,012.83 | 3 kicks $545.25 → $689.66 |
| regal-kitchen | 8,039.40 → 8,598.70 | 2 kicks $355.00 → $499.49, plus 4 splits ($200 of joins) |
| ten-sands / ten-sands-arabica | 679.50 / 795.28 unchanged | none |

Context only, never a calibration target: Microvellum charges Kenfrost's flat-pack 1908 kick $240.60 and its 400
kick $126.31 (material + labour), and Erin & Matt's assembled + installed kicks $271–$591. BowerOS used to charge
$118–$229 for every kick whatever its width; it now charges by what the kick actually is.

## Schedule fields added 21 Sep 2026

`ScheduleItem` (and `QuoteSelections`, as a job-wide default) gained three kick fields; `PlacedItem` carries the
same three for the planner path. All are optional and every one of them warns rather than guesses when absent, so
a payload written before today prices exactly as it did.

| Field | On | What it does | Absent |
|---|---|---|---|
| `kickPlyMaterialId` | row + selections | the ply a `Toe Kick Base` LADDER is cut from | the row's own board when that is plywood (a Microvellum export), else the catalogue's cheapest 12–19 mm plywood, warned |
| `kickFacingMaterialId` | row + selections | the kick FACE: the facing laminate on a ladder, or the face board charged per lineal metre on a legs job | ladder: **no facing is charged** and the quote says so; legs: the carcase board, warned |
| `kickExposedEnds` | row (`PlacedItem.kickExposedEnds`) | 0–2 ends of this kick that RETURN and are faced (Microvellum's "Finished Side") | 0, warned — returns are 24% of the finished face across Bower's 15 kicks |
| `benchtopCutouts.sinkUndermount` | row | undermount sink cut-outs, 90 min each | 0 — `sink` alone still means drop-in at 30 min |
| `selections.mirrorMaterialId` | selections | `material_pricing.item_code` of the mirror glass | `GT-MIR-4SVB` (Glasstech); with no such row the mirror is not priced and warns |

Nothing in the response was removed. `CabinetBOM` gained `ladderKick` (the cut list, the ply and the facing),
`kickFace` (the lineal metres a legs cabinet carries), `legs` (four a cabinet, stated) and `splitParts` (what was
cut in half and how many joins it needs).

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
`NumDrawers`, `DrawerFrontHeight`, `DrawerHeight`. The live gable is
`length = CabHeight`, `width = CabDepth`.

**`CabHeight` is the CARCASE height** (since 19 Sep 2026): the item's height less the toe kick it stands on
(`itemKickMm` - only a floor-standing base or tall carcase has one; see "Part sizes: carcase height, doors and
drawer faces"). A formula that names `ToeKickHeight` takes the kick off by itself (`CabHeight - ToeKickHeight`,
the 2 July seed's style) and is evaluated on the full item height with `ToeKickHeight` = the item's own kick
(its room's Toe Kick Base height or `kickMm` - 100 on a 100-kick job, not the job default 135), so it gives the
carcase height. A formula that evaluates to 0 (missing, blank, or naming an unknown variable) falls back: to the engine's
default where it has one (a carcase `Door`), else to the stand-in height × depth, flagged `sizePlaceholder`.

Drawer parts are expanded **per drawer** (since #20): each drawer face gets its own
height — custom heights from the cabinet editor or the standard distribution, over the face stack (carcase height
less the top reveal and a `DrawerGap` between faces) — with `DrawerFrontHeight = face` and `DrawerHeight = face −
20mm` (box side rule, min 60mm). Shared logic lives in `src/lib/drawerHeights.ts` so the 3D render and the BOM use
the same split. A drawer FACE the engine has a layout for (a drawer bank, a top drawer - see `frontLayout`) is
priced on the `Drawer` row (`Component`, like `Door`): its formula wins on an axis that has one, else W − 2 by the
face height, edged all round. The `Drawer Front` row's formula, a drawer-box front, only sizes the rest (inner drawers,
unmodelled layouts).

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
