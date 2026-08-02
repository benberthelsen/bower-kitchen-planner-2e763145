-- Current Bower account pricing sampled from the logged-in Hafele Impact
-- configurator on 2026-08-02. These are completed, fabricated and delivered
-- benchtop prices ex GST, not raw sheet prices.
--
-- The live configurator consistently resolved to:
--   configured job/fabrication/freight allowance  $1,132.88 per quote
--   + product/depth rate                           $/linear metre
--   + cut-outs and any additional visible side edges.
--
-- Quote audit references retained below:
--   M5012932  Mirostone samples
--   Q5012964  Laminate samples
--   T5014835  Compact laminate samples
--   D5014836  Dekton Lite samples

ALTER TABLE public.benchtop_pricing
  ADD COLUMN IF NOT EXISTS finished_end_per_lm numeric(12,4) NOT NULL DEFAULT 0;

ALTER TABLE public.benchtop_pricing
  DROP CONSTRAINT IF EXISTS benchtop_pricing_nonnegative_matrix_check;
ALTER TABLE public.benchtop_pricing
  ADD CONSTRAINT benchtop_pricing_nonnegative_matrix_check
  CHECK (
    minimum_order_length_mm >= 0
    AND minimum_charge >= 0
    AND cut_to_length_cost >= 0
    AND cnc_setup_cost >= 0
    AND cnc_cut_per_lm >= 0
    AND join_cost >= 0
    AND sanding_polishing_per_lm >= 0
    AND edge_finish_per_lm >= 0
    AND finished_end_cost >= 0
    AND finished_end_per_lm >= 0
    AND sink_cutout_cost >= 0
    AND cooktop_cutout_cost >= 0
    AND tap_hole_cost >= 0
    AND supplier_order_fee >= 0
    AND freight_cost >= 0
  );

COMMENT ON COLUMN public.benchtop_pricing.finished_end_per_lm IS
  'Supplier charge per linear metre of an additional visible side/end edge. Used in preference to the legacy fixed finished_end_cost when non-zero.';

WITH impact_products AS (
  SELECT * FROM (VALUES
    (
      '48616665-6c65-4900-a001-000000000001'::uuid,
      'IMPACT-HPL-38', 'Laminate 38mm - all current colours', 'laminate',
      5300, 900, 'postformed_front', 38,
      105.511111::numeric, 151.898611::numeric, 600, 900,
      68.75::numeric, 38.188889::numeric,
      'Q5012964',
      'Bellato Grey; Black Brazil; Calacatta Dior; Carrara Marble; Cento; Chalet Oak New; Icy White Premium; India White; Oiled Oak; Pale Lancelot Oak; Quartz Stone; Volcanic Black Premium.'
    ),
    (
      '48616665-6c65-4900-a001-000000000002'::uuid,
      'IMPACT-MIROSTONE-STD', 'Mirostone 20mm - Standard', 'solid_surface',
      3200, 900, 'profiled_front', 20,
      326.233333::numeric, 450.383333::numeric, 600, 900,
      74.55::numeric, 0::numeric,
      'M5012932',
      'Ash Fall Standard; Aspen Standard; Capri Standard; Iconic Sand Standard.'
    ),
    (
      '48616665-6c65-4900-a001-000000000003'::uuid,
      'IMPACT-MIROSTONE-PRM', 'Mirostone 20mm - Premium', 'solid_surface',
      3200, 900, 'profiled_front', 20,
      445.45::numeric, 663.761111::numeric, 600, 900,
      74.55::numeric, 0::numeric,
      'M5012932',
      'Alpine Premium; Bianco Marble Premium; Diamond White Premium; Warm Grey Premium.'
    ),
    (
      '48616665-6c65-4900-a001-000000000004'::uuid,
      'IMPACT-MIROSTONE-PLUS', 'Mirostone 20mm - Plus', 'solid_surface',
      3200, 900, 'profiled_front', 20,
      587.50::numeric, 825.00::numeric, 600, 900,
      74.55::numeric, 0::numeric,
      'M5012932',
      'Aurum Plus; Calacutta Marble Plus; Milano Plus.'
    ),
    (
      '48616665-6c65-4900-a001-000000000005'::uuid,
      'IMPACT-COMPACT-12-STD', 'Compact Laminate 12mm - Standard', 'laminate',
      3660, 1600, 'compact_visible_front', 12,
      255.00::numeric, 382.50::numeric, 695, 1600,
      80.25::numeric, 0::numeric,
      'T5014835',
      'Dark Concrete; Metallic; Versilia Marble.'
    ),
    (
      '48616665-6c65-4900-a001-000000000006'::uuid,
      'IMPACT-COMPACT-12-UV', 'Compact Laminate 12mm - UV', 'laminate',
      3660, 1600, 'compact_visible_front', 12,
      274.766667::numeric, 824.30::numeric, 695, 1600,
      80.25::numeric, 0::numeric,
      'T5014835',
      'Dark Concrete UV; Firestone UV; Light Concrete UV; Versilia UV.'
    ),
    (
      '48616665-6c65-4900-a001-000000000007'::uuid,
      'IMPACT-DEKTON-LITE-KRETA', 'Dekton Lite 30mm - Kreta Standard', 'stone',
      3050, 900, 'finished_front', 30,
      428.777778::numeric, 723.412500::numeric, 600, 900,
      126.25::numeric, 173.95::numeric,
      'D5014836',
      'Kreta.'
    ),
    (
      '48616665-6c65-4900-a001-000000000008'::uuid,
      'IMPACT-DEKTON-LITE-KELYA', 'Dekton Lite 30mm - Kelya Premium', 'stone',
      3050, 900, 'finished_front', 30,
      556.558333::numeric, 872.533333::numeric, 600, 900,
      126.25::numeric, 173.95::numeric,
      'D5014836',
      'Kelya Premium.'
    )
  ) AS p(
    id, item_code, range_tier, material_type,
    stock_length_mm, stock_depth_mm, profile_type, thickness_mm,
    standard_rate, island_rate, standard_max_depth, island_max_depth,
    cutout_rate, visible_end_rate_per_lm, quote_reference, colours
  )
)
INSERT INTO public.benchtop_pricing (
  id, brand, range_tier, material_type, pricing_method,
  stock_length_mm, stock_depth_mm, price_per_sheet, price_per_lm,
  trade_supply_per_sqm, install_per_lm, install_supply_per_sqm,
  waste_factor, minimum_sheet_quantity, supplier, item_code,
  supply_pathway, profile_type, thickness_mm,
  minimum_order_length_mm, minimum_charge,
  cut_to_length_cost, cnc_setup_cost, cnc_cut_per_lm, join_cost,
  sanding_polishing_per_lm, edge_finish_per_lm,
  finished_end_cost, finished_end_per_lm,
  sink_cutout_cost, cooktop_cutout_cost, tap_hole_cost,
  supplier_order_fee, freight_cost,
  is_default, is_active, price_status, notes,
  width_price_tiers, quoted_edge_count, surface_surcharge_pct,
  circular_surcharge_pct, double_sided_surcharge_pct,
  length_rounding_mm, account_discount_pct, operation_rates,
  source_document, source_page, source_date
)
SELECT
  p.id, 'Hafele Impact', p.range_tier, p.material_type, 'per_lm',
  p.stock_length_mm, p.stock_depth_mm, NULL, p.standard_rate,
  0, 0, 0,
  0, 1, 'Hafele Australia / Impact Benchtops', p.item_code,
  'supplier_custom', p.profile_type, p.thickness_mm,
  0, 0,
  0, 0, 0, 0,
  0, 0,
  0, p.visible_end_rate_per_lm,
  p.cutout_rate, p.cutout_rate, 0,
  1132.88, 0,
  false, true, 'confirmed',
  'Current Bower account configured price ex GST. The fixed $1,132.88 allowance includes the supplier fabrication/order/freight component shown by Impact; the configurator does not expose that split. Front visible/profiled edge is included in the LM rate. Current colours: ' || p.colours,
  jsonb_build_array(
    jsonb_build_object(
      'min_depth_mm', 100,
      'max_depth_mm', p.standard_max_depth,
      'one_edge_price_per_lm', round(p.standard_rate, 6),
      'two_edge_price_per_lm', round(p.standard_rate, 6)
    ),
    jsonb_build_object(
      'min_depth_mm', p.standard_max_depth + 1,
      'max_depth_mm', p.island_max_depth,
      'one_edge_price_per_lm', round(p.island_rate, 6),
      'two_edge_price_per_lm', round(p.island_rate, 6)
    )
  ),
  1, 0,
  0, 0,
  0, 0,
  jsonb_build_object(
    'configured_job_fabrication_freight_allowance', 1132.88,
    'standard_depth_rate_per_lm', round(p.standard_rate, 6),
    'island_depth_rate_per_lm', round(p.island_rate, 6),
    'sink_cutout', p.cutout_rate,
    'cooktop_cutout', p.cutout_rate,
    'additional_visible_side_edge_per_lm', p.visible_end_rate_per_lm
  ),
  'Hafele Impact online configurator, Bower account au0132815',
  'Live configured quote ' || p.quote_reference,
  DATE '2026-08-02'
FROM impact_products p
ON CONFLICT (id) DO UPDATE SET
  brand = EXCLUDED.brand,
  range_tier = EXCLUDED.range_tier,
  material_type = EXCLUDED.material_type,
  pricing_method = EXCLUDED.pricing_method,
  stock_length_mm = EXCLUDED.stock_length_mm,
  stock_depth_mm = EXCLUDED.stock_depth_mm,
  price_per_sheet = EXCLUDED.price_per_sheet,
  price_per_lm = EXCLUDED.price_per_lm,
  supplier = EXCLUDED.supplier,
  item_code = EXCLUDED.item_code,
  supply_pathway = EXCLUDED.supply_pathway,
  profile_type = EXCLUDED.profile_type,
  thickness_mm = EXCLUDED.thickness_mm,
  minimum_order_length_mm = EXCLUDED.minimum_order_length_mm,
  minimum_charge = EXCLUDED.minimum_charge,
  finished_end_cost = EXCLUDED.finished_end_cost,
  finished_end_per_lm = EXCLUDED.finished_end_per_lm,
  sink_cutout_cost = EXCLUDED.sink_cutout_cost,
  cooktop_cutout_cost = EXCLUDED.cooktop_cutout_cost,
  supplier_order_fee = EXCLUDED.supplier_order_fee,
  freight_cost = EXCLUDED.freight_cost,
  is_active = EXCLUDED.is_active,
  price_status = EXCLUDED.price_status,
  notes = EXCLUDED.notes,
  width_price_tiers = EXCLUDED.width_price_tiers,
  quoted_edge_count = EXCLUDED.quoted_edge_count,
  operation_rates = EXCLUDED.operation_rates,
  source_document = EXCLUDED.source_document,
  source_page = EXCLUDED.source_page,
  source_date = EXCLUDED.source_date;

