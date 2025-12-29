-- Create microvellum_products table for storing imported cabinet definitions
CREATE TABLE public.microvellum_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  microvellum_link_id TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT, -- Base, Wall, Tall, Accessory
  cabinet_type TEXT, -- Door, Drawer, Corner, Sink, etc.
  default_width NUMERIC DEFAULT 600,
  default_depth NUMERIC DEFAULT 575,
  default_height NUMERIC DEFAULT 870,
  door_count INTEGER DEFAULT 0,
  drawer_count INTEGER DEFAULT 0,
  is_corner BOOLEAN DEFAULT false,
  is_sink BOOLEAN DEFAULT false,
  is_blind BOOLEAN DEFAULT false,
  spec_group TEXT,
  room_component_type TEXT,
  raw_metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.microvellum_products ENABLE ROW LEVEL SECURITY;

-- Anyone can view products (for catalog display)
CREATE POLICY "Anyone can view microvellum products"
ON public.microvellum_products
FOR SELECT
USING (true);

-- Only admins can manage products
CREATE POLICY "Admins can manage microvellum products"
ON public.microvellum_products
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_microvellum_products_updated_at
BEFORE UPDATE ON public.microvellum_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();