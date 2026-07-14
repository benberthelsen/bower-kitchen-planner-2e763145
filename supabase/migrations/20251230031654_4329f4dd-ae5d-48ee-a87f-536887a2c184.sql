-- Add enhanced cabinet metadata columns to microvellum_products
ALTER TABLE public.microvellum_products 
  ADD COLUMN IF NOT EXISTS has_false_front boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_adjustable_shelves boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS corner_type text DEFAULT NULL;

-- Update has_false_front based on product names containing "False Front"
UPDATE public.microvellum_products 
SET has_false_front = true 
WHERE name ILIKE '%false front%' OR name ILIKE '%with front%';

-- Update corner_type based on product names
UPDATE public.microvellum_products 
SET corner_type = 'blind' 
WHERE name ILIKE '%blind%' AND is_corner = true;

UPDATE public.microvellum_products 
SET corner_type = 'diagonal' 
WHERE name ILIKE '%diagonal%' AND is_corner = true;

UPDATE public.microvellum_products 
SET corner_type = 'l-shape' 
WHERE (name ILIKE '%l-shape%' OR name ILIKE '%l shape%' OR name ILIKE '%lazy susan%') AND is_corner = true;

-- Add comment for documentation
COMMENT ON COLUMN public.microvellum_products.has_false_front IS 'Whether cabinet has decorative false front (e.g., sink cabinets with false drawer front)';
COMMENT ON COLUMN public.microvellum_products.has_adjustable_shelves IS 'Whether cabinet has adjustable internal shelves';
COMMENT ON COLUMN public.microvellum_products.corner_type IS 'Type of corner cabinet: blind, diagonal, l-shape, or null for non-corner';