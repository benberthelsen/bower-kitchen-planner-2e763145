---
name: price-kitchen
description: Price a kitchen through the BowerOS pricing engine from a Microvellum estimating report, and emit a workbook Build Flow can import via its Microvellum importer. Use when asked to price a job, quote a kitchen, re-price a Microvellum quote with Bower's own numbers, or check what a job should cost.
---

# Price a kitchen through BowerOS

Takes a Microvellum **Cost Based Estimating Report**, re-prices every cabinet
from Bower's own catalogue and shop rates, and writes an `.xlsx` that Build
Flow's existing **Quote → Import from Microvellum** reads.

The output carries Microvellum's *schedule* (what cabinets, what sizes) and
BowerOS's *prices*. Microvellum's own figures are discarded.

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

`mv_total` is optional — carry it when present so benchtops and other items the
cabinet engine doesn't price can pass through, and so the run can be compared
against Microvellum.

**Verify before going on:** the parsed material and labour columns must sum to
the report's own stated totals. If they don't, the extraction is wrong — fix it
rather than pricing bad input.

### 2. Pull the live catalogue

Cost data is not publicly readable, so fetch it with the Supabase MCP against
project `ehtwywctledgkxexztbh` (bower-cabinet-ai) and write `pricing-data.json`:

```json
{
  "parts": [], "materials": [], "edges": [], "hardware": [], "labor": [],
  "hardwareOptions": { "hingeType": "...", "drawerType": "...",
                       "cabinetTop": "rail", "supplyHardware": true,
                       "adjustableLegs": true, "handleId": "..." },
  "defaults": { "carcaseMaterialId": "...", "exteriorMaterialId": "...",
                "edgeId": "..." }
}
```

Select every column the engine reads — for `parts_pricing` that is
`name, part_type, length_function, width_function, edging,
handling_cost, area_handling_cost, machining_cost, area_machining_cost,
assembly_cost, area_assembly_cost, visibility_status`; for `materials_pricing`
the `area_cost`, sheet size and yield fields. Confirm the board and finish the
client actually chose, and set `defaults` to those material ids.

### 3. Build the engine bundle

```bash
npx esbuild scripts/pricing-smoke-entry.ts --bundle --format=esm \
  --outfile=.tmp-snap-test/pricing.mjs "--alias:@=./src" --platform=node
```

### 4. Price it

```bash
node scripts/price-kitchen.mjs schedule.json pricing-data.json bower-quote.xlsx
```

Options:

- `--overhead 0.10 --markup 0.40` — the commercial layer. Defaults shown.
- `--no-install` — supply assembled, client installs.
- `--flat-pack` — flat pack; the assembly and hardware-fitting stations drop out.
- `BOWER_PROJECT`, `BOWER_CONTACT`, `BOWER_QUOTE_NO`, `BOWER_ROOM` — header
  fields the importer picks up.

### 5. Check the result before handing it over

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

- **Blind corners, undermount rangehood cabinets and tall broom cabinets price
  low.** `buildGenericCabinetMapping` gives them a plain box, missing the return
  panel and filler a real blind corner has. Worth $700–900 on a kitchen with all
  three. Needs real per-type part definitions.
- **Benchtops** are passed through from the source report. The cabinet engine
  doesn't price stone; `benchtopCalculator` does, and it needs a stone catalogue
  selection this skill doesn't collect.
- **Flat panels import without dimensions.** A 16mm applied panel fails Build
  Flow's `width >= 100` test and is read as a buyout item. The money is right,
  the W/H/D show as 0. Microvellum's own reports import the same way.

## Cross-checking against Microvellum

`scripts/mv-job-runthrough.mjs` compares line by line, and
`scripts/mv-per-part-check.mjs` compares cost per part. Both take the same
`schedule.json`. Use them when a total looks wrong — they show whether the gap
is in the rates or in the part mapping.

Microvellum is a reference, never a calibration target. Do not tune rates to
match it.
