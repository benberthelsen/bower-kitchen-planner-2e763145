---
name: price-kitchen
description: Price a kitchen or joinery job through the BowerOS pricing engine from a Microvellum Cost Based Estimating Report, and emit an .xlsx that Build Flow imports through its Import from Microvellum screen. Use this whenever the ask is about what a job should cost - pricing or quoting a kitchen, re-pricing or cross-checking a Microvellum quote with Bower's own numbers, running a job through the pricing engine, checking a quote looks right, or just dropping in a Microvellum estimating report and wanting numbers back - even when BowerOS, pricing engine or skill are never said. This one is about the money - costs, labour, sell prices, variance against Microvellum. It is not for turning a drawing into a client specification document, shop drawings, or renders - use bower-client-spec or bower-shop-drawings for those, even though they take a Microvellum quote too.
---

# Price a kitchen through BowerOS

Takes a Microvellum **Cost Based Estimating Report**, re-prices every cabinet
from Bower's own catalogue and shop rates, and writes an `.xlsx` that Build
Flow's existing **Quote → Import from Microvellum** reads.

The output carries Microvellum's *schedule* (what cabinets, what sizes) and
BowerOS's *prices*. Microvellum's own figures are discarded.

Run from the `bower-kitchen-planner` repo — the pricing engine is compiled from
its `src/`, and every script below lives in its `scripts/`.

## Which source to use

**Use the Microvellum estimating report.** Not the DWG.

- The report is a structured product schedule — qty, description, W/H/D, room —
  which is exactly the engine's input. Parsing is reliable and reconciles
  against the report's own totals.
- Build Flow's importer already speaks this format, so the output drops
  straight in.
- A `.dwg` is binary CAD geometry. Cabinet identity lives in block names and
  layer conventions that vary between drawings, so cabinet type and dimensions
  can't be recovered dependably. Nothing downstream consumes it.

If only a DWG exists, ask for the estimating report — Microvellum can produce
one from the same drawing. Don't attempt to parse the DWG.

## Steps

### 1. Parse the report into a schedule

For a PDF, extract with `extraction_mode="layout"`. Plain extraction runs the
numeric columns together and silently corrupts dimensions and costs.

Each product row is:

```
Qty | Description | W | H | D | Material | Labor | Total
```

Rows are grouped under `Room Name: <name>` headers. Write
`schedule.json` to the scratchpad:

```json
[{ "room": "kitchen", "qty": 1, "name": "Base 3 Drawer",
   "w": 896.5, "h": 880, "d": 555, "mv_total": 960.24 }]
```

Carry `mv_total` on every row. Benchtops and other items the cabinet engine
does not price pass through on it, and step 5's cross-check depends on it.

**Verify before going on:** the parsed material and labour columns must sum to
the report's own stated totals. If they don't, the extraction is wrong — fix it
rather than pricing bad input.

### 2. Pull the live catalogue

Cost data is authenticated-read only, so fetch it with the Supabase MCP against
project `ehtwywctledgkxexztbh` (bower-cabinet-ai) and write `pricing-data.json`.

**Read `references/pricing-data.md`** — it has the five queries with the exact
columns the engine reads, the shape of the file, and the checks worth doing
before you price anything.

The part that needs a human answer rather than a query: which board, finish,
hinge, runner and handle this job actually uses. The engine will price a whole
kitchen in the wrong finish without a murmur, because every row it used was
valid. Ask if you don't know.

### 3. Build the engine bundle

```bash
npx esbuild scripts/pricing-smoke-entry.ts --bundle --format=esm \
  --outfile=.tmp-snap-test/pricing.mjs "--alias:@=./src" --platform=node
```

### 4. Price it

```bash
node scripts/price-kitchen.mjs schedule.json pricing-data.json bower-quote.xlsx
```

The markup comes from the `commercial` block in `pricing-data.json`. Check the
`markup applied` line in the output and say in your summary what it was and
where it came from — a quote at the wrong margin looks exactly like a quote at
the right one.

Options:

- `--markup 0.40 --overhead 0` — override the catalogue's markup for this run.
- `--no-install` — supply assembled, client installs.
- `--flat-pack` — flat pack; the assembly and hardware-fitting stations drop out.
- `BOWER_PROJECT`, `BOWER_CONTACT`, `BOWER_QUOTE_NO`, `BOWER_ROOM` — header
  fields the importer picks up.

### 5. Cross-check against the source quote

**Ben is supplying the Microvellum quote alongside each job for now, as a
calibration period. Always carry `mv_total` through into `schedule.json` so this
runs.** It fires automatically whenever the schedule has those figures, and
appends a row to `docs/pricing-crosscheck-log.md`.

This compares at **cost**, not sell. Microvellum's line figures carry its own
+10%/+40%; ours carry Bower's, and those differ. Comparing sell prices measures
the gap between two business margins and says nothing about whether the engine
is right — it read -17% on a job that was actually within 3.5% at cost.

Read the result as follows:

- **Job variance within ±5%** — expected on a normal kitchen. Report it and move on.
- **Outside ±5%** — investigate before sending. It is far more likely to be a
  part-mapping gap than a genuine pricing difference.
- **Lines more than 25% under** — the script names them. Two different causes,
  and they need telling apart:
  - *Our gap.* A cabinet type getting fewer parts than it really has, or
    inferring no doors from a name with no door word in it. Real under-pricing;
    fix `buildGenericCabinetMapping`. Both failures were found this way.
  - *Their inflation.* Microvellum bills per part, so single flat boards
    (panels, kicks, pelmets, under panels) come out wildly high — anywhere from
    $88 to $416 for one board on the same job. Ours is right; theirs isn't.

Use `scripts/mv-per-part-check.mjs` to tell them apart. On real cabinets the two
engines agree on cost per part within a few percent; where they don't, look at
whether the part *count* is wrong rather than the rate.

Watch the log across jobs. A single outlier is noise; the same cabinet type
reading low on several jobs is a mapping worth fixing, and that is the point of
collecting them.

**Never tune rates to close a gap with Microvellum.** The engine prices
bottom-up from real quantities and station rates, and that is deliberate — the
old flat regression was fitted to Microvellum's marked-up line totals and
double-counted markup on every quote as a result.

### 6. Check the result before handing it over

- **Read the warnings.** "no part mapping" means a product priced at $0 and the
  quote is short by whatever that cabinet was worth. Never pass a quote on with
  unresolved warnings without saying so.
- **Sanity-check against the source report.** Landing within about 5% of
  Microvellum on a normal kitchen is expected. A much larger gap means a
  mapping or catalogue problem, not a pricing insight.
- Report the cost breakdown, the shop and install hours, and the sell total.
  Say plainly which figures are BowerOS's and which passed through from the
  source.

## Known gaps — state these, don't paper over them

- **Tall broom cabinets price about 25% under Microvellum.** Unexplained — a
  broom cupboard's part list looks right (carcass, shelves, door) and no missing
  component has been identified, so nothing was invented to close it. Watch the
  cross-check log: if broom cabinets read low across several jobs it is a real
  gap worth chasing; on one job it is noise. Blind corners and rangehood
  cabinets had the same symptom and were fixed in Sep 2026 — the blind corner
  was missing its return panel, filler and second back, and both were inferring
  zero doors from names that carry no door word.
- **`CABINET_PART_MAP` is effectively dead code.** Its 27 SKU-keyed definitions
  are only reached on an exact `definitionId` match, and real placed products
  carry opaque uuids while Microvellum sends product names — so everything goes
  through `buildGenericCabinetMapping`. Fix the generic path, not the map. The
  two also use different part names (`Drawer Box Side` vs `Drawer Left Side`),
  so routing names to the map would break part lookups.
- **The stored markup has been wrong.** `client_markup_settings` held 30% when
  Ben was charging 40%. Confirm the margin rather than trusting the row, and say
  which one you used.
- **Benchtops** are passed through from the source report. The cabinet engine
  doesn't price stone; `benchtopCalculator` does, and it needs a stone catalogue
  selection this skill doesn't collect.
- **Flat panels import without dimensions.** A 16mm applied panel fails Build
  Flow's `width >= 100` test and is read as a buyout item. The money is right,
  the W/H/D show as 0. Microvellum's own reports import the same way.

## Deeper comparison tools

`scripts/mv-job-runthrough.mjs` compares line by line and splits labour against
Microvellum's own figures; `scripts/mv-per-part-check.mjs` compares cost per
part and shows the spread. Both take the same `schedule.json`. Reach for them
when step 5 flags something and you need to see whether the gap is in the rates
or in the part count.
