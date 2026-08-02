-- Complete Meganite supplier sheet catalogue from the ForestOne national
-- fabricator pricebook supplied to Bower on 24 October 2025. The book is
-- effective 1 July 2024 and lists prices ex GST. Rice Pudding is independently
-- cross-checked against Bower invoice 2627100005942 dated 20 July 2026.
--
-- These remain base_only: the source establishes sheet supply cost, not
-- Bower's CNC, joining, sanding/polishing, edge, installation or freight rates.

ALTER TABLE public.benchtop_pricing
  ADD COLUMN IF NOT EXISTS half_sheet_length_mm integer,
  ADD COLUMN IF NOT EXISTS half_sheet_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS half_sheet_source text;

ALTER TABLE public.benchtop_pricing
  DROP CONSTRAINT IF EXISTS benchtop_pricing_half_sheet_check;
ALTER TABLE public.benchtop_pricing
  ADD CONSTRAINT benchtop_pricing_half_sheet_check CHECK (
    (half_sheet_length_mm IS NULL OR half_sheet_length_mm > 0)
    AND (half_sheet_price IS NULL OR half_sheet_price >= 0)
  );

-- Correct two legacy labels that do not occur in the supplied catalogue while
-- preserving their IDs so saved room selections do not break.
UPDATE public.benchtop_pricing
SET range_tier = 'Shadow Concrete (T4)'
WHERE lower(brand) = 'meganite' AND range_tier = 'Shadow Boulder (T4)';

UPDATE public.benchtop_pricing
SET range_tier = 'Taupe Concrete (T4)'
WHERE lower(brand) = 'meganite' AND range_tier = 'Taupe Terrazzo (T4)';

UPDATE public.benchtop_pricing
SET range_tier = 'Mont Blanc (3660x1220x12)'
WHERE lower(brand) = 'meganite' AND range_tier = 'Mont Blanc Wide (3660×1220)';

DROP TABLE IF EXISTS tmp_meganite_supplier_catalog;
CREATE TEMP TABLE tmp_meganite_supplier_catalog (
  item_code text PRIMARY KEY,
  source_name text NOT NULL,
  display_name text NOT NULL,
  stock_length_mm integer NOT NULL,
  stock_depth_mm integer NOT NULL,
  thickness_mm integer NOT NULL,
  price_per_sheet numeric(12,2) NOT NULL,
  half_sheet_length_mm integer,
  half_sheet_price numeric(12,2),
  half_sheet_source text
);

INSERT INTO tmp_meganite_supplier_catalog VALUES
  ('MEGM12SNWS3607', 'Snow White', 'Snow White (T1)', 3660, 760, 12, 493.00, NULL, NULL, NULL),
  ('MEGM12SNWF3607', 'Snow White Flex', 'Snow White Flex', 3660, 760, 12, 675.00, NULL, NULL, NULL),
  ('MEGM12SMWIA3607', 'Acrymed MediWhite', 'Acrymed MediWhite', 3660, 760, 12, 675.00, NULL, NULL, NULL),
  ('MEGM12BRWS3607', 'Bright White', 'Bright White (T2)', 3660, 760, 12, 598.00, NULL, NULL, NULL),
  ('MEGM12IVOS3607', 'Ivory', 'Ivory (T2)', 3660, 760, 12, 598.00, NULL, NULL, NULL),
  ('MEGM12ANTS3607', 'Antarctica', 'Antarctica (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12BLGS3607', 'Blanca Granite', 'Blanca Granite (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12CICS3607', 'Cinder Concrete', 'Cinder Concrete (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12CLAS3607', 'Cloud Ash', 'Cloud Ash (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12DJBS3607', 'Dark Jet Black', 'Dark Jet Black (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12FIRS3607', 'Fire', 'Fire (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12ICSS3607', 'Ice Storm', 'Ice Storm (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12LGRS3607', 'Light Grey', 'Light Grey (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12LIMS3607', 'Lime', 'Lime (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12PLGS3607', 'Platinum Granite', 'Platinum Granite (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12POMS3607', 'Polar Mist', 'Polar Mist (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12SASS3607', 'Sandy Shore', 'Sandy Shore (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12STWS3607', 'Starry White', 'Starry White (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12SUNS3607', 'Sunshine', 'Sunshine (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12TANS3607', 'Tangerine', 'Tangerine (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12WHGS3607', 'White Glow', 'White Glow (T3)', 3660, 760, 12, 795.00, NULL, NULL, NULL),
  ('MEGM12ANSS3607', 'Antique Shell', 'Antique Shell', 3660, 760, 12, 936.00, NULL, NULL, NULL),
  ('MEGM12DSNS3607', 'Dark Starry Night', 'Dark Starry Night', 3660, 760, 12, 936.00, NULL, NULL, NULL),
  ('MEGM12MOCS3607', 'Modern Concrete', 'Modern Concrete', 3660, 760, 12, 936.00, NULL, NULL, NULL),
  ('MEGM12RIPS3607', 'Rice Pudding', 'Rice Pudding', 3660, 760, 12, 936.00, 1830, 468.00, 'ForestOne invoice 2627100005942 dated 2026-07-20'),
  ('MEGM12STCS3607', 'Storm Cloud', 'Storm Cloud', 3660, 760, 12, 936.00, NULL, NULL, NULL),
  ('MEGM12URHS3607', 'Urban Habitat', 'Urban Habitat', 3660, 760, 12, 936.00, NULL, NULL, NULL),
  ('MEGM12VEWS3607', 'Verano White', 'Verano White', 3660, 760, 12, 936.00, NULL, NULL, NULL),
  ('MEGM12WIBS3607', 'Winter Boulder', 'Winter Boulder', 3660, 760, 12, 936.00, NULL, NULL, NULL),
  ('MEGM12ALTR3607', 'Alpi Terrazzo', 'Alpi Terrazzo (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12CHCS3607', 'Charcoal Concrete', 'Charcoal Concrete (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12COBS3607', 'Cotton Boulder', 'Cotton Boulder (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12CRRS3607', 'Crater Rock', 'Crater Rock (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12DRBS3607', 'Dark Raven Boulder', 'Dark Raven Boulder (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12HACS3607', 'Hazel Cream', 'Hazel Cream (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12KABS3607', 'Kauai Beach', 'Kauai Beach (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12MOBS3607', 'Mont Blanc', 'Mont Blanc (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12MCAS3607', 'Mt Carrara', 'Mt Carrara (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12MCCS3607', 'Mt Carrara Cremo', 'Mt Carrara Cremo (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12MJAS3607', 'Mt Jade', 'Mt Jade (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12MVAS3607', 'Mt Vancouver', 'Mt Vancouver (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12SGTR3607', 'Sage Terrazzo', 'Sage Terrazzo (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12SLTR3607', 'Salmon Terrazzo', 'Salmon Terrazzo (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12SPTR3607', 'Sapphire Terrazzo', 'Sapphire Terrazzo (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12SHCS3607', 'Shadow Concrete', 'Shadow Concrete (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12SOSS3607', 'Soft Statuario', 'Soft Statuario (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12SOES3607', 'Solar Eclipse', 'Solar Eclipse (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12TACS3607', 'Taupe Concrete', 'Taupe Concrete (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12URTR3607', 'Urban Terrazzo', 'Urban Terrazzo (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12VETR3607', 'Verde Terrazzo', 'Verde Terrazzo (T4)', 3660, 760, 12, 1044.00, NULL, NULL, NULL),
  ('MEGM12CRRS3612', 'Crater Rock', 'Crater Rock (3660x1220x12)', 3660, 1220, 12, 1773.00, NULL, NULL, NULL),
  ('MEGM12MOBS3612', 'Mont Blanc', 'Mont Blanc (3660x1220x12)', 3660, 1220, 12, 1773.00, NULL, NULL, NULL),
  ('MEGM12MCAS3693', 'Mt Carrara', 'Mt Carrara (3660x930x12)', 3660, 930, 12, 1358.00, NULL, NULL, NULL),
  ('MEGM12MCAS3612', 'Mt Carrara', 'Mt Carrara (3660x1220x12)', 3660, 1220, 12, 1773.00, NULL, NULL, NULL),
  ('MEGM12SOSS3612', 'Soft Statuario', 'Soft Statuario (3660x1220x12)', 3660, 1220, 12, 1773.00, NULL, NULL, NULL),
  ('MEGM19SNWS3007', 'Snow White', 'Snow White (3050x760x19)', 3050, 760, 19, 774.00, NULL, NULL, NULL),
  ('MEGM20MCAS3607', 'Mt Carrara', 'Mt Carrara (3660x760x20)', 3660, 760, 20, 1669.00, NULL, NULL, NULL),
  ('MEGM20BRWS3009', 'Bright White', 'Bright White (3050x915x20)', 3050, 915, 20, 1071.00, NULL, NULL, NULL),
  ('MEGM20ANTS3009', 'Antarctica', 'Antarctica (3050x915x20)', 3050, 915, 20, 1242.00, NULL, NULL, NULL),
  ('MEGM20BLGS3009', 'Blanca Granite', 'Blanca Granite (3050x915x20)', 3050, 915, 20, 1242.00, NULL, NULL, NULL),
  ('MEGM20POMS3009', 'Polar Mist', 'Polar Mist (3050x915x20)', 3050, 915, 20, 1242.00, NULL, NULL, NULL),
  ('MEGM20CICS3009', 'Cinder Concrete', 'Cinder Concrete (3050x915x20)', 3050, 915, 20, 1242.00, NULL, NULL, NULL),
  ('MEGM20BRWS3012', 'Bright White', 'Bright White (3050x1240x20)', 3050, 1240, 20, 1485.00, NULL, NULL, NULL),
  ('MEGM20ANTS3012', 'Antarctica', 'Antarctica (3050x1240x20)', 3050, 1240, 20, 1746.00, NULL, NULL, NULL),
  ('MEGM20BLGS3012', 'Blanca Granite', 'Blanca Granite (3050x1240x20)', 3050, 1240, 20, 1746.00, NULL, NULL, NULL),
  ('MEGM20POMS3012', 'Polar Mist', 'Polar Mist (3050x1240x20)', 3050, 1240, 20, 1746.00, NULL, NULL, NULL),
  ('MEGM20CICS3012', 'Cinder Concrete', 'Cinder Concrete (3050x1240x20)', 3050, 1240, 20, 1746.00, NULL, NULL, NULL);

-- Attach exact supplier codes and source metadata to compatible live rows.
UPDATE public.benchtop_pricing p
SET item_code = source.item_code,
    supplier = 'ForestOne',
    price_per_sheet = source.price_per_sheet,
    stock_length_mm = source.stock_length_mm,
    stock_depth_mm = source.stock_depth_mm,
    thickness_mm = source.thickness_mm,
    source_document = 'MEGANITE NATIONAL FABRICATOR PRICEBOOK - July 1st 2024',
    source_page = 'PDF page 3 (printed pages 4-5)',
    source_date = DATE '2024-07-01',
    half_sheet_length_mm = source.half_sheet_length_mm,
    half_sheet_price = source.half_sheet_price,
    half_sheet_source = source.half_sheet_source,
    price_status = 'base_only',
    notes = concat_ws(' ', nullif(p.notes, ''),
      'ForestOne fabricator list price ex GST; supplied to Bower as the current list on 2025-10-24. Fabrication, installation and freight are not included.')
FROM tmp_meganite_supplier_catalog source
WHERE lower(p.brand) = 'meganite'
  AND p.stock_length_mm = source.stock_length_mm
  AND p.stock_depth_mm = source.stock_depth_mm
  AND COALESCE(p.thickness_mm, 12) = source.thickness_mm
  AND lower(regexp_replace(p.range_tier, '\s+\([^)]*\)$', '', 'g')) = lower(source.source_name);

-- Add supplier variants missing from the old 36-row catalogue. Existing IDs
-- stay untouched; item_code prevents duplicates if the migration is replayed.
INSERT INTO public.benchtop_pricing (
  id, brand, range_tier, material_type, pricing_method,
  stock_length_mm, stock_depth_mm, price_per_sheet, price_per_lm,
  trade_supply_per_sqm, install_per_lm, install_supply_per_sqm,
  waste_factor, minimum_sheet_quantity, supplier, item_code,
  supply_pathway, profile_type, thickness_mm, is_default, is_active,
  price_status, notes, source_document, source_page, source_date,
  half_sheet_length_mm, half_sheet_price, half_sheet_source
)
SELECT
  gen_random_uuid(), 'Meganite', source.display_name, 'solid_surface', 'per_sheet',
  source.stock_length_mm, source.stock_depth_mm, source.price_per_sheet, NULL,
  0, NULL, 0,
  0.05, 1, 'ForestOne', source.item_code,
  'stock_sheet_fabricated', 'square_edge', source.thickness_mm, false, true,
  'base_only',
  CASE WHEN source.item_code = 'MEGM12RIPS3607'
    THEN 'ForestOne list price ex GST, supplied to Bower 2025-10-24. Full and half-sheet prices independently confirmed by invoice 2627100005942 dated 2026-07-20. Fabrication, installation and freight are not included.'
    ELSE 'ForestOne fabricator list price ex GST; supplied to Bower as the current list on 2025-10-24. Fabrication, installation and freight are not included.'
  END,
  CASE WHEN source.item_code = 'MEGM12RIPS3607'
    THEN 'ForestOne invoice 2627100005942 + MEGANITE NATIONAL FABRICATOR PRICEBOOK'
    ELSE 'MEGANITE NATIONAL FABRICATOR PRICEBOOK - July 1st 2024'
  END,
  'PDF page 3 (printed pages 4-5)',
  CASE WHEN source.item_code = 'MEGM12RIPS3607' THEN DATE '2026-07-20' ELSE DATE '2024-07-01' END,
  source.half_sheet_length_mm, source.half_sheet_price, source.half_sheet_source
FROM tmp_meganite_supplier_catalog source
WHERE NOT EXISTS (
  SELECT 1 FROM public.benchtop_pricing existing
  WHERE existing.item_code = source.item_code
);

DROP TABLE tmp_meganite_supplier_catalog;
