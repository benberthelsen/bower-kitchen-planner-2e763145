-- Comprehensive benchtop pricing matrix.
--
-- A benchtop quote has two distinct cost layers:
--   1. supplier product (sheet, linear metre, or square metre), and
--   2. fabrication/order operations required to turn it into a finished top.
--
-- All new operation rates default to zero deliberately. Supplier price lists
-- do not establish Bower's CNC, sanding, joining, or installation labour rates;
-- an administrator must confirm those rates before a product is treated as a
-- complete finished-benchtop price.

ALTER TABLE public.benchtop_pricing
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS item_code text,
  ADD COLUMN IF NOT EXISTS catalog_finish_id text,
  ADD COLUMN IF NOT EXISTS supply_pathway text NOT NULL DEFAULT 'supplier_custom',
  ADD COLUMN IF NOT EXISTS profile_type text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS thickness_mm integer,
  ADD COLUMN IF NOT EXISTS minimum_order_length_mm integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimum_charge numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cut_to_length_cost numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cnc_setup_cost numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cnc_cut_per_lm numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS join_cost numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sanding_polishing_per_lm numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS edge_finish_per_lm numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finished_end_cost numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sink_cutout_cost numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cooktop_cutout_cost numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tap_hole_cost numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_order_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freight_cost numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS price_status text NOT NULL DEFAULT 'base_only',
  ADD COLUMN IF NOT EXISTS notes text;

-- Classify the catalogue already in production without changing any supplier
-- rates. Meganite is a sheet-fabricated solid surface; Egger rows are stocked
-- preformed worktops; legacy stone is ordered/fabricated by a supplier.
UPDATE public.benchtop_pricing
SET supplier = COALESCE(supplier, brand),
    supply_pathway = CASE
      WHEN material_type = 'solid_surface' OR pricing_method = 'per_sheet'
        THEN 'stock_sheet_fabricated'
      WHEN material_type = 'laminate' AND pricing_method = 'per_lm'
        THEN 'stock_preformed'
      ELSE 'supplier_custom'
    END,
    profile_type = CASE
      WHEN material_type = 'solid_surface' THEN 'square_edge'
      WHEN material_type = 'laminate' AND pricing_method = 'per_lm' THEN 'postformed'
      ELSE 'custom'
    END,
    thickness_mm = COALESCE(
      thickness_mm,
      CASE
        WHEN material_type = 'solid_surface' THEN 12
        WHEN material_type = 'laminate' THEN 38
        ELSE NULL
      END
    ),
    price_status = CASE
      WHEN price_status IN ('confirmed', 'needs_review') THEN price_status
      ELSE 'base_only'
    END;

-- Give existing rooms a deterministic legacy fallback. New rooms persist an
-- explicit selection, but old saved jobs did not have that field.
WITH preferred AS (
  SELECT id
  FROM public.benchtop_pricing
  ORDER BY
    CASE WHEN lower(brand) = 'meganite' AND lower(COALESCE(range_tier, '')) LIKE 'snow white%' THEN 0 ELSE 1 END,
    brand,
    range_tier NULLS LAST,
    id
  LIMIT 1
)
UPDATE public.benchtop_pricing p
SET is_default = true
FROM preferred
WHERE p.id = preferred.id
  AND NOT EXISTS (
    SELECT 1 FROM public.benchtop_pricing existing WHERE existing.is_default
  );

ALTER TABLE public.benchtop_pricing
  DROP CONSTRAINT IF EXISTS benchtop_pricing_supply_pathway_check;
ALTER TABLE public.benchtop_pricing
  ADD CONSTRAINT benchtop_pricing_supply_pathway_check
  CHECK (supply_pathway IN (
    'stock_preformed',
    'stock_sheet_fabricated',
    'supplier_custom',
    'made_to_order'
  ));

ALTER TABLE public.benchtop_pricing
  DROP CONSTRAINT IF EXISTS benchtop_pricing_price_status_check;
ALTER TABLE public.benchtop_pricing
  ADD CONSTRAINT benchtop_pricing_price_status_check
  CHECK (price_status IN ('base_only', 'confirmed', 'needs_review'));

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
    AND sink_cutout_cost >= 0
    AND cooktop_cutout_cost >= 0
    AND tap_hole_cost >= 0
    AND supplier_order_fee >= 0
    AND freight_cost >= 0
  );

CREATE UNIQUE INDEX IF NOT EXISTS benchtop_pricing_one_default_idx
  ON public.benchtop_pricing (is_default)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS benchtop_pricing_pathway_active_idx
  ON public.benchtop_pricing (supply_pathway, is_active, brand);

COMMENT ON COLUMN public.benchtop_pricing.supply_pathway IS
  'How the finished top is procured: stocked preformed, stock sheet fabricated in-house, supplier custom, or made to order.';
COMMENT ON COLUMN public.benchtop_pricing.price_status IS
  'base_only means supplier material is priced but fabrication/order rates still need confirmation.';
COMMENT ON COLUMN public.benchtop_pricing.sanding_polishing_per_lm IS
  'Solid-surface finishing charge per finished linear metre, including Meganite sanding/polishing.';
