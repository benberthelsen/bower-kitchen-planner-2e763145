-- Add corner cabinet dimension columns to microvellum_products
ALTER TABLE public.microvellum_products
ADD COLUMN IF NOT EXISTS left_arm_depth numeric DEFAULT 575,
ADD COLUMN IF NOT EXISTS right_arm_depth numeric DEFAULT 575,
ADD COLUMN IF NOT EXISTS blind_depth numeric DEFAULT 150,
ADD COLUMN IF NOT EXISTS filler_width numeric DEFAULT 75,
ADD COLUMN IF NOT EXISTS return_filler boolean DEFAULT false;

-- Update existing corner products with correct corner_type
UPDATE public.microvellum_products 
SET corner_type = 'l-shape',
    left_arm_depth = 900,
    right_arm_depth = 900
WHERE (name ILIKE '%corner%' AND name NOT ILIKE '%blind%')
  AND (category = 'Base' OR category = 'Wall');

-- Update blind corner products
UPDATE public.microvellum_products 
SET corner_type = 'blind',
    blind_depth = 150,
    filler_width = 75
WHERE name ILIKE '%blind%';

-- Update diagonal corner products
UPDATE public.microvellum_products 
SET corner_type = 'diagonal'
WHERE name ILIKE '%diagonal%' OR name ILIKE '%45%';