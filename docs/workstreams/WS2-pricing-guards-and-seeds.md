# WS2 — Pricing Engine Guards + Data Seeds

**Complexity: MEDIUM — mid-tier model fine. Read docs/PRICING_ENGINE.md first.**
Repo: kitchen planner. Independent of WS1.

## Goal
The engine must never silently price wrong: unmatched materials fail safe,
unpriced materials are flagged, and the empty pricing tables get sensible
seeds the admin can tune.

## Tasks

1. **Safe material fallback** — `src/lib/pricing/sheetOptimizer.ts` (and
   `resolveMaterialId` in `bomGenerator.ts`): when a cabinet's material id
   doesn't resolve, do NOT use an arbitrary/first row. Fallback order:
   a row whose name matches /shop materials/i with a price → cheapest priced
   sheet material → else price 0 AND mark the sheet line `unresolved: true`.

2. **Unpriced-material flag** — when a resolved material has `area_cost` null/0
   (e.g. all Laminex rows, `price_status = 'Needs Review'`), still size the
   parts but add a warning to the QuoteBOM: extend `QuoteBOM` with
   `warnings: string[]` (e.g. "Aged Ash (Laminex): no price captured — quote
   understates"). Surface: planner toolbar shows an amber ⚠ badge with count,
   tooltip lists warnings; JobEditor Quote State shows the same. Persist
   warnings into the quote snapshot so admin sees them.

3. **Edge tape seed** — new migration `2026xxxx_edge_pricing_seed.sql`:
   1mm PVC edging in White, Black, Woodgrain-match + 1mm ABS, with
   `length_cost` ≈ $1.20/m and `application_cost` ≈ $0.80/m (admin-tunable),
   `item_code`s EDGE-PVC-1-WHT etc. Match the `edge_pricing` schema in
   `supabase/migrations/20251224…sql`.

4. **Labor rates seed** — migration inserting the engine's code defaults as
   rows so Admin → Labor Rates can tune them. Rate names must match
   `RATE_NAME_MAP` in `src/lib/pricing/laborCalculator.ts` (read it; e.g.
   base per cabinet, per door, per drawer, tall loading, per-metre width).

5. **Default client markup profile** — migration inserting one
   `client_markup_settings` row (`is_default = true`, `markup_type =
   'percentage'`, margin 30, design 5, others 0 — confirm field names from the
   table schema) so quotes include a commercial layer out of the box. RLS
   note: profile rows are per-client; make the seed a global default the
   `useClientMarkup` fallback can find, or extend the hook to read an
   `is_default` row with null client_id (check current query first).

6. **Update supabase types** — add any new columns/rows to
   `src/integrations/supabase/types.ts` if schema changes (it shouldn't).

## Acceptance
- Offline harness (pattern in session history: compile `src/lib/pricing` with
  tsc to /tmp, feed bundle JSON + seeds) shows: unmatched carcase → shop
  materials fallback + warning; Laminex exterior → sized parts + warning, not
  $0 silence.
- Planner shows ⚠ when a Laminex colour is selected.
- tsc clean; functional test passes; migrations run clean on a fresh SQL
  editor session.
