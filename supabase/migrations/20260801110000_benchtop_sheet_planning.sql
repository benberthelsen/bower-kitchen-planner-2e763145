-- Whole-sheet benchtop planning controls. Existing materials use a modest
-- fabrication allowance and a one-sheet minimum; both remain editable by the
-- pricing administrator.
ALTER TABLE public.benchtop_pricing
  ADD COLUMN IF NOT EXISTS waste_factor numeric(5,4) NOT NULL DEFAULT 0.05,
  ADD COLUMN IF NOT EXISTS minimum_sheet_quantity integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'benchtop_pricing_waste_factor_check'
      AND conrelid = 'public.benchtop_pricing'::regclass
  ) THEN
    ALTER TABLE public.benchtop_pricing
      ADD CONSTRAINT benchtop_pricing_waste_factor_check
      CHECK (waste_factor >= 0 AND waste_factor <= 0.25);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'benchtop_pricing_minimum_sheet_quantity_check'
      AND conrelid = 'public.benchtop_pricing'::regclass
  ) THEN
    ALTER TABLE public.benchtop_pricing
      ADD CONSTRAINT benchtop_pricing_minimum_sheet_quantity_check
      CHECK (minimum_sheet_quantity >= 1);
  END IF;
END
$$;
