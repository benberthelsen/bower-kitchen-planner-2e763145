# WS4 — Laminex Price Book Import

**Complexity: LOW (data pipeline) — small model fine. BLOCKED on Ben providing
an authorised Laminex trade price list (CSV/XLSX/PDF export).**
Repo: scraper project.

## Goal
The 285 captured Laminex catalogue rows (images + names already in the bundle)
get real `area_cost`/`sheet_cost` values and flip from `Needs Review` to
`Available`, so choosing a Laminex colour prices instead of $0.

## Steps
1. Ben supplies the price book (do not scrape public site for prices — they
   aren't published).
2. Write `scripts/import-laminex-pricebook.(py|mjs)` modelled on
   `scripts/import-forestone-pricebooks.py`: parse the file, normalise to raw
   supplier cost ex GST pre markup, compute `area_cost = sheet_cost /
   (sheet_length × sheet_width in m²)`, keep `SheetCostExcGst` for audit.
3. Match rows to the existing Laminex capture by finish name + substrate +
   thickness + sheet size (the ForestOne importer has match-key logic to copy).
   Unmatched price rows → report file for manual review, do NOT guess.
4. Set `price_status`, flip `review_status`, re-run `npm run audit:pricing`
   then `npm run export:planner-data`.
5. Produce the SQL upsert delta; apply to unified DB; verify a Laminex colour
   prices in the planner with no ⚠ warning (after WS2 lands).

## Acceptance
- ≥90% of Laminex rows priced; remainder in a named review file.
- Bundle manifest hash changes propagate to the planner copy.
- Aged Ash Laminex quote line shows real board cost.
