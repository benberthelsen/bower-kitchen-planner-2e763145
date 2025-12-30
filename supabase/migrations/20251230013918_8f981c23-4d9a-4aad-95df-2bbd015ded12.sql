-- Add visibility and ordering columns to microvellum_products
ALTER TABLE public.microvellum_products 
ADD COLUMN IF NOT EXISTS visible_to_standard boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS visible_to_trade boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS featured boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 999;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_microvellum_products_visibility 
ON public.microvellum_products (visible_to_standard, visible_to_trade, featured, display_order);