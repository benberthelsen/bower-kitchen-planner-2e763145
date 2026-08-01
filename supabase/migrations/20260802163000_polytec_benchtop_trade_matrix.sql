-- Polytec made-to-order HPL benchtop price rules from the June 2026 trade
-- price list supplied to Bower. Prices are list prices ex GST. The document
-- explicitly says discounts are not included, so account_discount_pct remains
-- NULL until Polytec confirms Bower's current account discount.

ALTER TABLE public.benchtop_pricing
  ADD COLUMN IF NOT EXISTS width_price_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quoted_edge_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS surface_surcharge_pct numeric(7,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS circular_surcharge_pct numeric(7,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS double_sided_surcharge_pct numeric(7,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS length_rounding_mm integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS account_discount_pct numeric(7,3),
  ADD COLUMN IF NOT EXISTS operation_rates jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_document text,
  ADD COLUMN IF NOT EXISTS source_page text,
  ADD COLUMN IF NOT EXISTS source_date date;

ALTER TABLE public.benchtop_pricing
  DROP CONSTRAINT IF EXISTS benchtop_pricing_rule_values_check;
ALTER TABLE public.benchtop_pricing
  ADD CONSTRAINT benchtop_pricing_rule_values_check CHECK (
    quoted_edge_count IN (1, 2)
    AND surface_surcharge_pct BETWEEN 0 AND 100
    AND circular_surcharge_pct BETWEEN 0 AND 100
    AND double_sided_surcharge_pct BETWEEN 0 AND 100
    AND length_rounding_mm >= 0
    AND (account_discount_pct IS NULL OR account_discount_pct BETWEEN 0 AND 100)
  );

COMMENT ON COLUMN public.benchtop_pricing.width_price_tiers IS
  'Depth/width bands and one-edge/two-edge list rates per linear metre.';
COMMENT ON COLUMN public.benchtop_pricing.account_discount_pct IS
  'Current confirmed supplier account discount. NULL means unknown and must not be assumed.';
COMMENT ON COLUMN public.benchtop_pricing.operation_rates IS
  'Source price-list operations retained for audit and future job-specific selection.';

WITH polytec_rules AS (
  SELECT
    '[
      {"min_depth_mm":250,"max_depth_mm":300,"one_edge_price_per_lm":49.34,"two_edge_price_per_lm":58.81},
      {"min_depth_mm":301,"max_depth_mm":450,"one_edge_price_per_lm":74.63,"two_edge_price_per_lm":84.11},
      {"min_depth_mm":451,"max_depth_mm":610,"one_edge_price_per_lm":100.57,"two_edge_price_per_lm":109.75},
      {"min_depth_mm":611,"max_depth_mm":850,"one_edge_price_per_lm":117.63,"two_edge_price_per_lm":127.14},
      {"min_depth_mm":851,"max_depth_mm":900,"one_edge_price_per_lm":134.09,"two_edge_price_per_lm":143.25},
      {"min_depth_mm":901,"max_depth_mm":1200,"one_edge_price_per_lm":201.13,"two_edge_price_per_lm":210.31}
    ]'::jsonb AS tiers,
    '{
      "masons_mitre":29.50,
      "full_mitre":44.50,
      "butt_joint":21.25,
      "dog_leg_mitre":118.00,
      "half_dog_leg":59.00,
      "special_joint":59.00,
      "double_masons_mitre_t_joint":118.00,
      "internal_sink_or_cooktop_cutout":30.75,
      "raw_cutout":14.00,
      "square_edge_cutout":27.75,
      "square_edge_laminated_end":14.00,
      "square_edge_arc_end":29.50,
      "square_edge_end_one_blended_corner":19.50,
      "square_edge_end_two_blended_corners":25.00,
      "single_radius_corner":19.50,
      "double_radius_corner":25.00
    }'::jsonb AS operations
), products AS (
  SELECT * FROM (VALUES
    ('706f6c79-7465-4300-a001-000000000001'::uuid, 'POLYTEC-HPL-MTO-STANDARD-33', 'Made to order HPL - Standard finish', 0.000::numeric),
    ('706f6c79-7465-4300-a001-000000000002'::uuid, 'POLYTEC-HPL-MTO-WOODMATT-33', 'Made to order HPL - Woodmatt / Smooth', 5.000::numeric),
    ('706f6c79-7465-4300-a001-000000000003'::uuid, 'POLYTEC-HPL-MTO-PREMIUM-33', 'Made to order HPL - Gloss / Ravine / Matera / Venette', 10.000::numeric)
  ) AS v(id, item_code, range_tier, surface_surcharge_pct)
)
INSERT INTO public.benchtop_pricing (
  id, brand, range_tier, material_type, pricing_method,
  stock_length_mm, stock_depth_mm, price_per_sheet, price_per_lm,
  trade_supply_per_sqm, install_per_lm, install_supply_per_sqm,
  supplier, item_code, supply_pathway, profile_type, thickness_mm,
  minimum_order_length_mm, minimum_charge, waste_factor,
  minimum_sheet_quantity, cut_to_length_cost, cnc_setup_cost,
  cnc_cut_per_lm, join_cost, sanding_polishing_per_lm,
  edge_finish_per_lm, finished_end_cost, sink_cutout_cost,
  cooktop_cutout_cost, tap_hole_cost, supplier_order_fee, freight_cost,
  is_default, is_active, price_status, notes,
  width_price_tiers, quoted_edge_count, surface_surcharge_pct,
  circular_surcharge_pct, double_sided_surcharge_pct, length_rounding_mm,
  account_discount_pct, operation_rates, source_document, source_page,
  source_date
)
SELECT
  products.id, 'Polytec', products.range_tier, 'laminate', 'per_lm',
  3600, 1130, NULL, 100.57,
  0, 0, 0,
  'Polytec', products.item_code, 'made_to_order', 'fabricated_one_edge', 33,
  0, 0, 0,
  1, 0, 0,
  0, 29.50, 0,
  0, 14.00, 30.75,
  30.75, 0, 0, 0,
  false, true, 'confirmed',
  'June 2026 list price ex GST. 21mm and 33mm share the published LM rates. List excludes Bower account discount; current discount is unconfirmed and is not applied. Rolled one edge: maximum 3600mm long x 1130mm wide.',
  polytec_rules.tiers, 1, products.surface_surcharge_pct,
  20, 70, 100,
  NULL, polytec_rules.operations,
  'Polytec Trade price list June 2026', 'PDF page 33 (printed pages 64-65)',
  DATE '2026-06-16'
FROM products CROSS JOIN polytec_rules
ON CONFLICT (id) DO UPDATE SET
  brand = EXCLUDED.brand,
  range_tier = EXCLUDED.range_tier,
  material_type = EXCLUDED.material_type,
  pricing_method = EXCLUDED.pricing_method,
  stock_length_mm = EXCLUDED.stock_length_mm,
  stock_depth_mm = EXCLUDED.stock_depth_mm,
  price_per_lm = EXCLUDED.price_per_lm,
  supplier = EXCLUDED.supplier,
  item_code = EXCLUDED.item_code,
  supply_pathway = EXCLUDED.supply_pathway,
  profile_type = EXCLUDED.profile_type,
  thickness_mm = EXCLUDED.thickness_mm,
  join_cost = EXCLUDED.join_cost,
  finished_end_cost = EXCLUDED.finished_end_cost,
  sink_cutout_cost = EXCLUDED.sink_cutout_cost,
  cooktop_cutout_cost = EXCLUDED.cooktop_cutout_cost,
  price_status = EXCLUDED.price_status,
  notes = EXCLUDED.notes,
  width_price_tiers = EXCLUDED.width_price_tiers,
  quoted_edge_count = EXCLUDED.quoted_edge_count,
  surface_surcharge_pct = EXCLUDED.surface_surcharge_pct,
  circular_surcharge_pct = EXCLUDED.circular_surcharge_pct,
  double_sided_surcharge_pct = EXCLUDED.double_sided_surcharge_pct,
  length_rounding_mm = EXCLUDED.length_rounding_mm,
  account_discount_pct = EXCLUDED.account_discount_pct,
  operation_rates = EXCLUDED.operation_rates,
  source_document = EXCLUDED.source_document,
  source_page = EXCLUDED.source_page,
  source_date = EXCLUDED.source_date;
