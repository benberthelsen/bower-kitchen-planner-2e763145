-- Hafele Slider SC robe door kits (944.02.0xx) for the BowerOS robe module (src/lib/pricing/robeSliderDoors.ts).
--
-- NOT APPLIED. Written 17 Sep 2026 as a file only - apply it to the planner project (ehtwywctledgkxexztbh) only on
-- Ben's go, then redeploy price-quote (the engine bundle that reads these columns ships in the same change).
--
-- What it does, all additive and safe to re-run:
--   1. hardware_pricing gains nullable robe_profile / robe_leaves / robe_finish / robe_track_length_mm, so the engine
--      selects the ONE kit for an opening itself, plus price_basis and source_url, which hardware_pricing lacked.
--   2. 16 kit rows, hardware_type 'robe_kit' (never 'handle' - that type is picked per door by the cabinet engine).
--      unit_cost is Ben's Hafele AU account Net price captured 31 Aug 2026 (his Hafele_Slider_SC_Pricing_Program.html
--      PRICE_SEED and the build pack's SKU Price Catalog). Ben, 17 Sep 2026: the GST basis of those Net prices is NOT
--      known, so every row is flagged "unconfirmed - pending Hafele capture" and the engine says so on every quote.
--      machining_cost / assembly_cost 0: the robe stations carry the time.
--   3. The same 16 articles go on the Hafele trade-price capture list (hafele_trade_prices, one row per article with
--      its product URL, no price yet). Ben: "add the items to the scraper list on the hardware to allow for
--      updating". When the next logged-in capture writes trade_cost_ex_gst (Bower's buy price ex GST), the engine
--      prices the kit from it and drops the unconfirmed flag - no change to this table needed.
--
-- The SKU -> profile / leaves / finish / length mapping is Ben's, sourced in his build pack (SC-16) to the Hafele AU
-- Slider SC brochure p3. The installation pages print the 16 numbers in an unlabelled grid and cannot confirm it.
--
-- item_code already carries two UNIQUE indexes (idx_hardware_pricing_item_code_unique, idx_hardware_pricing_item_code
-- - checked read-only with pg_indexes, 17 Sep 2026; pg_constraint shows only the pkey), so ON CONFLICT (item_code)
-- is the idempotency guard. A re-run refreshes the descriptive columns but never overwrites a unit_cost whose
-- price_basis no longer says "unconfirmed" (someone has since confirmed it by hand).
--
-- Rollback:
--   DELETE FROM public.hafele_trade_prices WHERE article_code LIKE '944.02.0%' AND trade_cost_ex_gst IS NULL;
--   DELETE FROM public.hardware_pricing WHERE hardware_type = 'robe_kit' AND item_code LIKE '944.02.0%';
--   ALTER TABLE public.hardware_pricing DROP COLUMN robe_profile, DROP COLUMN robe_leaves, DROP COLUMN robe_finish,
--     DROP COLUMN robe_track_length_mm, DROP COLUMN price_basis, DROP COLUMN source_url;

BEGIN;

ALTER TABLE public.hardware_pricing
  ADD COLUMN IF NOT EXISTS robe_profile text,
  ADD COLUMN IF NOT EXISTS robe_leaves integer,
  ADD COLUMN IF NOT EXISTS robe_finish text,
  ADD COLUMN IF NOT EXISTS robe_track_length_mm integer,
  ADD COLUMN IF NOT EXISTS price_basis text,
  ADD COLUMN IF NOT EXISTS source_url text;

COMMENT ON COLUMN public.hardware_pricing.robe_profile IS 'Robe door kits only: handle | slimline (Hafele Slider SC).';
COMMENT ON COLUMN public.hardware_pricing.robe_leaves IS 'Robe door kits only: 2 or 3 leaves.';
COMMENT ON COLUMN public.hardware_pricing.robe_finish IS 'Robe door kits only: silver | black (anodised).';
COMMENT ON COLUMN public.hardware_pricing.robe_track_length_mm IS 'Robe door kits only: nominal track length, mm (1800 / 2700 / 3600).';
COMMENT ON COLUMN public.hardware_pricing.price_basis IS 'Where unit_cost came from and whether it is confirmed.';
COMMENT ON COLUMN public.hardware_pricing.source_url IS 'Supplier product page for this article.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hardware_pricing_robe_profile_check') THEN
    ALTER TABLE public.hardware_pricing ADD CONSTRAINT hardware_pricing_robe_profile_check
      CHECK (robe_profile IS NULL OR robe_profile IN ('handle', 'slimline'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hardware_pricing_robe_leaves_check') THEN
    ALTER TABLE public.hardware_pricing ADD CONSTRAINT hardware_pricing_robe_leaves_check
      CHECK (robe_leaves IS NULL OR robe_leaves IN (2, 3));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hardware_pricing_robe_finish_check') THEN
    ALTER TABLE public.hardware_pricing ADD CONSTRAINT hardware_pricing_robe_finish_check
      CHECK (robe_finish IS NULL OR robe_finish IN ('silver', 'black'));
  END IF;
END $$;

INSERT INTO public.hardware_pricing
  (item_code, name, hardware_type, brand, series, unit_cost, inner_unit_cost, handling_cost, machining_cost, assembly_cost,
   visibility_status, robe_profile, robe_leaves, robe_finish, robe_track_length_mm, price_basis, source_url)
VALUES
  ('944.02.001', 'Hafele Slider SC fitting set, Handle door, 2 door, silver anodised, 1800 mm',   'robe_kit', 'Hafele', 'slider_sc_handle',   291.97, 0, 0, 0, 0, 'Available', 'handle',   2, 'silver', 1800, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/94402001/?MasterSKU=P-01319895'),
  ('944.02.002', 'Hafele Slider SC fitting set, Handle door, 2 door, silver anodised, 2700 mm',   'robe_kit', 'Hafele', 'slider_sc_handle',   324.01, 0, 0, 0, 0, 'Available', 'handle',   2, 'silver', 2700, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/94402002/?MasterSKU=P-01319895'),
  ('944.02.010', 'Hafele Slider SC fitting set, Handle door, 2 door, black anodised, 1800 mm',    'robe_kit', 'Hafele', 'slider_sc_handle',   313.83, 0, 0, 0, 0, 'Available', 'handle',   2, 'black',  1800, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/94402010/?MasterSKU=P-01319895'),
  ('944.02.011', 'Hafele Slider SC fitting set, Handle door, 2 door, black anodised, 2700 mm',    'robe_kit', 'Hafele', 'slider_sc_handle',   349.70, 0, 0, 0, 0, 'Available', 'handle',   2, 'black',  2700, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/94402011/?MasterSKU=P-01319895'),
  ('944.02.003', 'Hafele Slider SC fitting set, Handle door, 3 door, silver anodised, 2700 mm',   'robe_kit', 'Hafele', 'slider_sc_handle',   427.72, 0, 0, 0, 0, 'Available', 'handle',   3, 'silver', 2700, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/94402003/?MasterSKU=P-01319895'),
  ('944.02.004', 'Hafele Slider SC fitting set, Handle door, 3 door, silver anodised, 3600 mm',   'robe_kit', 'Hafele', 'slider_sc_handle',   459.76, 0, 0, 0, 0, 'Available', 'handle',   3, 'silver', 3600, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/94402004/?MasterSKU=P-01319895'),
  ('944.02.012', 'Hafele Slider SC fitting set, Handle door, 3 door, black anodised, 2700 mm',    'robe_kit', 'Hafele', 'slider_sc_handle',   460.51, 0, 0, 0, 0, 'Available', 'handle',   3, 'black',  2700, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/94402012/?MasterSKU=P-01319895'),
  ('944.02.013', 'Hafele Slider SC fitting set, Handle door, 3 door, black anodised, 3600 mm',    'robe_kit', 'Hafele', 'slider_sc_handle',   496.38, 0, 0, 0, 0, 'Available', 'handle',   3, 'black',  3600, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/94402013/?MasterSKU=P-01319895'),
  ('944.02.020', 'Hafele Slider SC fitting set, Slimline door, 2 door, silver anodised, 1800 mm', 'robe_kit', 'Hafele', 'slider_sc_slimline', 244.20, 0, 0, 0, 0, 'Available', 'slimline', 2, 'silver', 1800, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/94402020/?MasterSKU=P-01319894'),
  ('944.02.021', 'Hafele Slider SC fitting set, Slimline door, 2 door, silver anodised, 2700 mm', 'robe_kit', 'Hafele', 'slider_sc_slimline', 276.24, 0, 0, 0, 0, 'Available', 'slimline', 2, 'silver', 2700, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/94402021/?MasterSKU=P-01319894'),
  ('944.02.030', 'Hafele Slider SC fitting set, Slimline door, 2 door, black anodised, 1800 mm',  'robe_kit', 'Hafele', 'slider_sc_slimline', 261.28, 0, 0, 0, 0, 'Available', 'slimline', 2, 'black',  1800, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/94402030/?MasterSKU=P-01319894'),
  ('944.02.031', 'Hafele Slider SC fitting set, Slimline door, 2 door, black anodised, 2700 mm',  'robe_kit', 'Hafele', 'slider_sc_slimline', 297.16, 0, 0, 0, 0, 'Available', 'slimline', 2, 'black',  2700, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/94402031/?MasterSKU=P-01319894'),
  ('944.02.022', 'Hafele Slider SC fitting set, Slimline door, 3 door, silver anodised, 2700 mm', 'robe_kit', 'Hafele', 'slider_sc_slimline', 356.07, 0, 0, 0, 0, 'Available', 'slimline', 3, 'silver', 2700, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/94402022/?MasterSKU=P-01319894'),
  ('944.02.023', 'Hafele Slider SC fitting set, Slimline door, 3 door, silver anodised, 3600 mm', 'robe_kit', 'Hafele', 'slider_sc_slimline', 388.11, 0, 0, 0, 0, 'Available', 'slimline', 3, 'silver', 3600, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/94402023/?MasterSKU=P-01319894'),
  ('944.02.032', 'Hafele Slider SC fitting set, Slimline door, 3 door, black anodised, 2700 mm',  'robe_kit', 'Hafele', 'slider_sc_slimline', 381.69, 0, 0, 0, 0, 'Available', 'slimline', 3, 'black',  2700, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/94402032/?MasterSKU=P-01319894'),
  ('944.02.033', 'Hafele Slider SC fitting set, Slimline door, 3 door, black anodised, 3600 mm',  'robe_kit', 'Hafele', 'slider_sc_slimline', 417.56, 0, 0, 0, 0, 'Available', 'slimline', 3, 'black',  3600, 'unconfirmed - pending Hafele capture (Hafele AU account Net price captured by Ben 2026-08-31; GST basis not confirmed)', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/94402033/?MasterSKU=P-01319894')
ON CONFLICT (item_code) DO UPDATE SET
  name = EXCLUDED.name,
  hardware_type = EXCLUDED.hardware_type,
  brand = EXCLUDED.brand,
  series = EXCLUDED.series,
  machining_cost = 0,
  assembly_cost = 0,
  robe_profile = EXCLUDED.robe_profile,
  robe_leaves = EXCLUDED.robe_leaves,
  robe_finish = EXCLUDED.robe_finish,
  robe_track_length_mm = EXCLUDED.robe_track_length_mm,
  source_url = EXCLUDED.source_url,
  unit_cost = CASE
    WHEN hardware_pricing.price_basis IS NULL OR hardware_pricing.price_basis LIKE 'unconfirmed%' THEN EXCLUDED.unit_cost
    ELSE hardware_pricing.unit_cost END,
  price_basis = CASE
    WHEN hardware_pricing.price_basis IS NULL OR hardware_pricing.price_basis LIKE 'unconfirmed%' THEN EXCLUDED.price_basis
    ELSE hardware_pricing.price_basis END,
  updated_at = now();

-- The capture list: one row per article with the family product URL the logged-in capture appends the 8-digit
-- article number to (the same shape as the 1,227 rows captured 7 Sep 2026). No price until the capture writes one.
INSERT INTO public.hafele_trade_prices (article_code, name, variant_label, product_type, product_url, source)
VALUES
  ('944.02.001', 'Slider SC fitting set, Handle door',   '2 door / silver anodised / 1800 mm', 'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/P-01319895/',   'capture list: robe kit added 2026-09-17, not yet captured'),
  ('944.02.002', 'Slider SC fitting set, Handle door',   '2 door / silver anodised / 2700 mm', 'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/P-01319895/',   'capture list: robe kit added 2026-09-17, not yet captured'),
  ('944.02.010', 'Slider SC fitting set, Handle door',   '2 door / black anodised / 1800 mm',  'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/P-01319895/',   'capture list: robe kit added 2026-09-17, not yet captured'),
  ('944.02.011', 'Slider SC fitting set, Handle door',   '2 door / black anodised / 2700 mm',  'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/P-01319895/',   'capture list: robe kit added 2026-09-17, not yet captured'),
  ('944.02.003', 'Slider SC fitting set, Handle door',   '3 door / silver anodised / 2700 mm', 'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/P-01319895/',   'capture list: robe kit added 2026-09-17, not yet captured'),
  ('944.02.004', 'Slider SC fitting set, Handle door',   '3 door / silver anodised / 3600 mm', 'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/P-01319895/',   'capture list: robe kit added 2026-09-17, not yet captured'),
  ('944.02.012', 'Slider SC fitting set, Handle door',   '3 door / black anodised / 2700 mm',  'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/P-01319895/',   'capture list: robe kit added 2026-09-17, not yet captured'),
  ('944.02.013', 'Slider SC fitting set, Handle door',   '3 door / black anodised / 3600 mm',  'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-handle-door/P-01319895/',   'capture list: robe kit added 2026-09-17, not yet captured'),
  ('944.02.020', 'Slider SC fitting set, Slimline door', '2 door / silver anodised / 1800 mm', 'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/P-01319894/', 'capture list: robe kit added 2026-09-17, not yet captured'),
  ('944.02.021', 'Slider SC fitting set, Slimline door', '2 door / silver anodised / 2700 mm', 'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/P-01319894/', 'capture list: robe kit added 2026-09-17, not yet captured'),
  ('944.02.030', 'Slider SC fitting set, Slimline door', '2 door / black anodised / 1800 mm',  'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/P-01319894/', 'capture list: robe kit added 2026-09-17, not yet captured'),
  ('944.02.031', 'Slider SC fitting set, Slimline door', '2 door / black anodised / 2700 mm',  'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/P-01319894/', 'capture list: robe kit added 2026-09-17, not yet captured'),
  ('944.02.022', 'Slider SC fitting set, Slimline door', '3 door / silver anodised / 2700 mm', 'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/P-01319894/', 'capture list: robe kit added 2026-09-17, not yet captured'),
  ('944.02.023', 'Slider SC fitting set, Slimline door', '3 door / silver anodised / 3600 mm', 'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/P-01319894/', 'capture list: robe kit added 2026-09-17, not yet captured'),
  ('944.02.032', 'Slider SC fitting set, Slimline door', '3 door / black anodised / 2700 mm',  'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/P-01319894/', 'capture list: robe kit added 2026-09-17, not yet captured'),
  ('944.02.033', 'Slider SC fitting set, Slimline door', '3 door / black anodised / 3600 mm',  'robe_kit', 'https://www.hafele.com.au/en/product/slider-sc-fitting-set-slimline-door/P-01319894/', 'capture list: robe kit added 2026-09-17, not yet captured')
ON CONFLICT (article_code) DO NOTHING;

-- Assertions: exactly the 16 kits, one row per variant, none typed as a handle.
DO $$
DECLARE
  n_kits integer;
  n_variants integer;
  n_handles integer;
  n_listed integer;
BEGIN
  SELECT count(*) INTO n_kits FROM public.hardware_pricing WHERE hardware_type = 'robe_kit' AND item_code LIKE '944.02.0%';
  SELECT count(DISTINCT (robe_profile, robe_leaves, robe_finish, robe_track_length_mm)) INTO n_variants
    FROM public.hardware_pricing WHERE hardware_type = 'robe_kit' AND item_code LIKE '944.02.0%';
  SELECT count(*) INTO n_handles FROM public.hardware_pricing WHERE item_code LIKE '944.02.%' AND hardware_type ILIKE 'handle%';
  SELECT count(*) INTO n_listed FROM public.hafele_trade_prices WHERE article_code LIKE '944.02.0%';
  IF n_kits <> 16 OR n_variants <> 16 OR n_handles <> 0 OR n_listed <> 16 THEN
    RAISE EXCEPTION 'Slider SC kit seed check failed: % kit rows, % variants, % typed handle, % on the capture list (want 16, 16, 0, 16)',
      n_kits, n_variants, n_handles, n_listed;
  END IF;
END $$;

COMMIT;
