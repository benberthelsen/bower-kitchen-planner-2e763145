# WS3 — Targeted Hafele + Blum (Wilson & Bradley) Hardware Build-out

**Complexity: LOW-MEDIUM (data work, careful matching) — small model fine.**
Repos: scraper project (`bower-cabinet-web-site`) for capture; planner for import.
Independent — can run parallel to WS1/WS2.

## Rule
Scrape/capture ONLY the items below — never whole sites. Hafele items come
from the logged-in Hafele session or an exported price file (never store the
password). Blum items come from Wilson & Bradley (`source_supplier = "Wilson &
Bradley"`, `brand = "Blum"`) and are never mixed with Hafele rows.

## What the engine actually consumes (from hardwareCalculator + shop standards)
The planner needs, per `hardware_type` + `series`, with `unit_cost`:

### Drawer runners (`hardware_type: runner`) — THE critical gap
Lengths to cover standard depths (carcase 575 → nominal lengths):
- **Hafele Alto Slim** (current shop default): 270, 350, 400, 450, 500mm —
  soft-close, per-pair pricing; include inner heights available (runner_height,
  runner_depth columns exist).
- **Blum LEGRABOX / TANDEMBOX Antaro** (via W&B): same lengths 270-500mm,
  N + M heights minimum, soft-close (BLUMOTION).
- **Blum MOVENTO / TANDEM** undermount: 400, 450, 500mm pairs.

### Hinges (`hardware_type: hinge`) — second critical gap
- **Hafele Salice Rapido** (shop default series): 94/110° full overlay,
  half overlay, inset; PLUS matching mounting plates (engine prices plates as
  separate series-matched items — keep plate rows with same `series`).
- **Blum CLIP top BLUMOTION** (via W&B): 110° full/half/inset + CRISTALLO if
  cheap to include; matching plates (0, 3, 9mm).
- Wide-angle 155-170° (one series each) for corner bi-folds.
- Bi-fold/pie-cut corner hinge sets (Salice + Blum equivalents).

### Already covered (skip unless prices stale)
Handles, knobs, appliances, sinks/taps — 406 Hafele rows exist. Legs, shelf
pins, screws priced from existing rows/defaults.

### Nice-to-have (only if trivially available)
Bin pullout kits (fits Base Bin Pullout product), Lazy Susan, cutlery inserts.

## Pipeline
1. Build the capture list as CSV first (`docs/hardware-target-list.csv` in the
   scraper repo): supplier, brand, series, item description, size, expected
   item_code if known. Get Ben to eyeball it before scraping.
2. Capture prices (Firecrawl script per supplier page OR Ben exports from the
   logged-in portal; parse the export).
3. Emit `hardware_pricing` rows matching the existing CSV format in
   `public/data/bower-supplier-catalog/hardware_pricing.csv` (item_code, name,
   hardware_type, brand, series, runner_height, runner_depth, unit_cost, …).
4. Re-run `npm run export:planner-data` in the scraper repo (updates the
   bundle + planner copy) and produce a `hardware_pricing_supabase_upsert.sql`
   delta for the SQL editor.
5. Verify in planner: wizard Hardware step shows Blum + Hafele series grouped;
   a 3-drawer cabinet's BOM hardware lines use real runner prices.

## Acceptance
- hardware_pricing has priced rows for every runner length 270-500 in ≥2
  series (Hafele Alto Slim + one Blum) and hinge+plate sets in ≥2 series.
- No Hafele row carries brand Blum or vice versa.
- BOM for Base 3 Drawer shows real runner cost (not $45 generic).
