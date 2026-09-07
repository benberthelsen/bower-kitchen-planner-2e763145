# Pulling the live catalogue

Cost data is not publicly readable, so use the Supabase MCP against project
`ehtwywctledgkxexztbh` (bower-cabinet-ai). Run these five queries and assemble
the results into `pricing-data.json`.

Note the table is `material_pricing`, singular — `materials_pricing` does not
exist and the query will fail.

## The queries

```sql
-- parts  -> pricing-data.json "parts"
select name, part_type, length_function, width_function, edging,
       handling_cost, area_handling_cost, machining_cost, area_machining_cost,
       assembly_cost, area_assembly_cost, visibility_status
from parts_pricing;

-- materials -> "materials"
select id, item_code, name, material_type, brand, thickness,
       sheet_length, sheet_width, area_cost, area_handling_cost,
       area_assembly_cost, expected_yield_factor, minimum_job_area,
       minimum_usage_rollover, double_sided, double_sided_cost,
       horizontal_grain, horizontal_grain_surcharge, visibility_status
from material_pricing;

-- edges -> "edges"
select id, item_code, name, edge_type, brand, thickness, length_cost,
       handling_cost, area_handling_cost, application_cost, visibility_status
from edge_pricing;

-- hardware -> "hardware"
select id, item_code, name, hardware_type, brand, series, unit_cost,
       inner_unit_cost, handling_cost, machining_cost, assembly_cost,
       runner_depth, runner_height, visibility_status
from hardware_pricing;

-- labour -> "labor"  (fallback only; the workshop model prices labour)
select id, name, rate_type, rate from labor_rates;
```

## Assembling the file

```json
{
  "parts": [], "materials": [], "edges": [], "hardware": [], "labor": [],
  "hardwareOptions": {
    "hingeType": "<hardware_pricing.item_code for the hinge>",
    "drawerType": "<item_code for the runner>",
    "handleId": "<item_code for the handle>",
    "cabinetTop": "rail", "supplyHardware": true, "adjustableLegs": true
  },
  "defaults": {
    "carcaseMaterialId": "<material_pricing.id for the carcase board>",
    "exteriorMaterialId": "<material_pricing.id for the door finish>",
    "edgeId": "<edge_pricing.id>"
  }
}
```

`defaults` and `hardwareOptions` are the job's actual selections, not
placeholders — ask which board, finish, hinge, runner and handle the client
chose. Getting these wrong is the single easiest way to produce a confident,
wrong quote: the engine will happily price a whole kitchen in the wrong finish
without complaining, because every row it used was valid.

## Sanity checks before pricing

- Every material used has `area_cost > 0`. A `$0` board silently understates the
  whole job; the engine warns, but the warning is easy to skim past.
- `expected_yield_factor` is set. Missing yield falls back to 85% with a warning.
- The hinge, runner and handle item codes exist in `hardware_pricing`, otherwise
  the engine falls back to a default price and warns.

## Why not just use the anon key

Trade and buy prices must never be publicly readable, so the pricing tables are
authenticated-read only. There is no publishable-key path to them, which is why
this goes through the MCP rather than a fetch in the script.
