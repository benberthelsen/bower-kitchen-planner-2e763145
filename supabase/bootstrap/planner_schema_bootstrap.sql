-- Planner schema bootstrap for the unified Bower Supabase project (bower-cabinet-ai / ehtwywctledgkxexztbh).
-- Generated 2026-07-02 by concatenating supabase/migrations/ in order.
-- Run ONCE in the SQL editor BEFORE the website's scraper-catalog migration
-- (that migration's policies reference user_roles, created here).

-- ═══ 20251223110322_654151c0-7cfa-4a25-b559-ecb25e1bd41e.sql ═══
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  company_name TEXT,
  user_type TEXT DEFAULT 'consumer' CHECK (user_type IN ('consumer', 'trade')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create products table (catalog with updatable prices)
CREATE TABLE public.products (
  id TEXT PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  item_type TEXT,
  default_width NUMERIC(10,2),
  default_depth NUMERIC(10,2),
  default_height NUMERIC(10,2),
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create jobs table
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number SERIAL,
  name TEXT NOT NULL,
  customer_id UUID REFERENCES public.profiles(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'pending_approval', 'approved', 'in_production', 'completed')),
  cost_excl_tax NUMERIC(10,2) DEFAULT 0,
  cost_incl_tax NUMERIC(10,2) DEFAULT 0,
  design_data JSONB,
  delivery_method TEXT DEFAULT 'pickup' CHECK (delivery_method IN ('pickup', 'delivery')),
  notes TEXT,
  completion_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create price_history table for auditing
CREATE TABLE public.price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
  old_price NUMERIC(10,2),
  new_price NUMERIC(10,2),
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- User roles policies (only admins can manage roles)
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Products policies (public read, admin write)
CREATE POLICY "Anyone can view products" ON public.products
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage products" ON public.products
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Jobs policies
CREATE POLICY "Users can view own jobs" ON public.jobs
  FOR SELECT USING (auth.uid() = customer_id);

CREATE POLICY "Users can create own jobs" ON public.jobs
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Users can update own jobs" ON public.jobs
  FOR UPDATE USING (auth.uid() = customer_id);

CREATE POLICY "Admins can view all jobs" ON public.jobs
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all jobs" ON public.jobs
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Price history policies (admin only)
CREATE POLICY "Admins can view price history" ON public.price_history
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert price history" ON public.price_history
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$$;

-- Trigger to auto-create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Timestamp triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
-- ═══ 20251224023807_993787b5-c4f7-431e-b528-078a751301bf.sql ═══
-- Parts Pricing Table
CREATE TABLE public.parts_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  part_type text NOT NULL,
  length_function text,
  width_function text,
  edging text,
  handling_cost numeric DEFAULT 0,
  area_handling_cost numeric DEFAULT 0,
  machining_cost numeric DEFAULT 0,
  area_machining_cost numeric DEFAULT 0,
  assembly_cost numeric DEFAULT 0,
  area_assembly_cost numeric DEFAULT 0,
  visibility_status text DEFAULT 'Available',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Hardware Pricing Table
CREATE TABLE public.hardware_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_code text NOT NULL,
  name text NOT NULL,
  hardware_type text,
  brand text,
  series text,
  runner_height numeric,
  runner_depth numeric,
  runner_desc text,
  handling_cost numeric DEFAULT 0,
  unit_cost numeric DEFAULT 0,
  inner_unit_cost numeric DEFAULT 0,
  machining_cost numeric DEFAULT 0,
  assembly_cost numeric DEFAULT 0,
  visibility_status text DEFAULT 'Available',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Material Pricing Table
CREATE TABLE public.material_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_code text NOT NULL,
  name text NOT NULL,
  material_type text,
  brand text,
  finish text,
  substrate text,
  thickness numeric,
  prefix text,
  door_filter text,
  horizontal_grain boolean DEFAULT false,
  horizontal_grain_surcharge numeric DEFAULT 0,
  double_sided boolean DEFAULT false,
  double_sided_cost numeric DEFAULT 0,
  area_handling_cost numeric DEFAULT 0,
  area_cost numeric DEFAULT 0,
  area_assembly_cost numeric DEFAULT 0,
  minimum_usage_rollover numeric DEFAULT 0,
  expected_yield_factor numeric DEFAULT 1,
  minimum_job_area numeric DEFAULT 0,
  sheet_length numeric,
  sheet_width numeric,
  visibility_status text DEFAULT 'Available',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Edge Pricing Table
CREATE TABLE public.edge_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_code text NOT NULL,
  name text NOT NULL,
  edge_type text,
  brand text,
  finish text,
  thickness numeric,
  door_filter text,
  handling_cost numeric DEFAULT 0,
  length_cost numeric DEFAULT 0,
  area_handling_cost numeric DEFAULT 0,
  application_cost numeric DEFAULT 0,
  visibility_status text DEFAULT 'Available',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Door/Drawer Pricing Table
CREATE TABLE public.door_drawer_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_code text NOT NULL,
  name text NOT NULL,
  outsourced boolean DEFAULT false,
  filter_name text,
  suffix text,
  advanced boolean DEFAULT false,
  handling_cost numeric DEFAULT 0,
  area_handling_cost numeric DEFAULT 0,
  machining_cost numeric DEFAULT 0,
  area_machining_cost numeric DEFAULT 0,
  unit_cost numeric DEFAULT 0,
  assembly_cost numeric DEFAULT 0,
  area_assembly_cost numeric DEFAULT 0,
  visibility_status text DEFAULT 'Available',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Stone Pricing Table
CREATE TABLE public.stone_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand text NOT NULL,
  range_tier text,
  trade_supply_per_sqm numeric DEFAULT 0,
  install_supply_per_sqm numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Client Markup Settings Table
CREATE TABLE public.client_markup_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  markup_type text DEFAULT 'percentage',
  material_markup numeric DEFAULT 0,
  hardware_markup numeric DEFAULT 0,
  labor_markup numeric DEFAULT 0,
  delivery_markup numeric DEFAULT 0,
  stone_markup numeric DEFAULT 0,
  parts_markup numeric DEFAULT 0,
  edge_markup numeric DEFAULT 0,
  door_drawer_markup numeric DEFAULT 0,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Labor Rates Table
CREATE TABLE public.labor_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  rate_type text DEFAULT 'hourly',
  rate numeric DEFAULT 0,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.parts_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hardware_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edge_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.door_drawer_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stone_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_markup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_rates ENABLE ROW LEVEL SECURITY;

-- Parts Pricing Policies
CREATE POLICY "Anyone can view parts pricing" ON public.parts_pricing FOR SELECT USING (true);
CREATE POLICY "Admins can manage parts pricing" ON public.parts_pricing FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Hardware Pricing Policies
CREATE POLICY "Anyone can view hardware pricing" ON public.hardware_pricing FOR SELECT USING (true);
CREATE POLICY "Admins can manage hardware pricing" ON public.hardware_pricing FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Material Pricing Policies
CREATE POLICY "Anyone can view material pricing" ON public.material_pricing FOR SELECT USING (true);
CREATE POLICY "Admins can manage material pricing" ON public.material_pricing FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Edge Pricing Policies
CREATE POLICY "Anyone can view edge pricing" ON public.edge_pricing FOR SELECT USING (true);
CREATE POLICY "Admins can manage edge pricing" ON public.edge_pricing FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Door/Drawer Pricing Policies
CREATE POLICY "Anyone can view door drawer pricing" ON public.door_drawer_pricing FOR SELECT USING (true);
CREATE POLICY "Admins can manage door drawer pricing" ON public.door_drawer_pricing FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Stone Pricing Policies
CREATE POLICY "Anyone can view stone pricing" ON public.stone_pricing FOR SELECT USING (true);
CREATE POLICY "Admins can manage stone pricing" ON public.stone_pricing FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Client Markup Settings Policies
CREATE POLICY "Admins can view all markup settings" ON public.client_markup_settings FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own markup settings" ON public.client_markup_settings FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "Admins can manage markup settings" ON public.client_markup_settings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Labor Rates Policies
CREATE POLICY "Anyone can view labor rates" ON public.labor_rates FOR SELECT USING (true);
CREATE POLICY "Admins can manage labor rates" ON public.labor_rates FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_parts_pricing_type ON public.parts_pricing(part_type);
CREATE INDEX idx_hardware_pricing_type ON public.hardware_pricing(hardware_type);
CREATE INDEX idx_hardware_pricing_brand ON public.hardware_pricing(brand);
CREATE INDEX idx_material_pricing_brand ON public.material_pricing(brand);
CREATE INDEX idx_material_pricing_finish ON public.material_pricing(finish);
CREATE INDEX idx_edge_pricing_brand ON public.edge_pricing(brand);
CREATE INDEX idx_client_markup_client ON public.client_markup_settings(client_id);

-- Create triggers for updated_at
CREATE TRIGGER update_parts_pricing_updated_at BEFORE UPDATE ON public.parts_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_hardware_pricing_updated_at BEFORE UPDATE ON public.hardware_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_material_pricing_updated_at BEFORE UPDATE ON public.material_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_edge_pricing_updated_at BEFORE UPDATE ON public.edge_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_door_drawer_pricing_updated_at BEFORE UPDATE ON public.door_drawer_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_stone_pricing_updated_at BEFORE UPDATE ON public.stone_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_client_markup_updated_at BEFORE UPDATE ON public.client_markup_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_labor_rates_updated_at BEFORE UPDATE ON public.labor_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
-- ═══ 20251229050049_d761a0f2-521c-49d6-bc6f-42313b80348f.sql ═══
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
-- ═══ 20251230013918_8f981c23-4d9a-4aad-95df-2bbd015ded12.sql ═══
-- Add visibility and ordering columns to microvellum_products
ALTER TABLE public.microvellum_products 
ADD COLUMN IF NOT EXISTS visible_to_standard boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS visible_to_trade boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS featured boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 999;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_microvellum_products_visibility 
ON public.microvellum_products (visible_to_standard, visible_to_trade, featured, display_order);
-- ═══ 20251230014917_edc4cfb9-144a-4a0f-95b8-c7f440e48f78.sql ═══
-- Add unique constraint on microvellum_link_id for upsert to work
ALTER TABLE public.microvellum_products 
ADD CONSTRAINT microvellum_products_link_id_unique UNIQUE (microvellum_link_id);
-- ═══ 20251230031654_4329f4dd-ae5d-48ee-a87f-536887a2c184.sql ═══
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
-- ═══ 20260102215308_dc425c05-b37a-409b-8acb-8ad7a13154f0.sql ═══
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
-- ═══ 20260108075704_6f41257b-c32f-4a88-8083-72004ac38cd5.sql ═══
-- 1. Create "Countertops" category
UPDATE microvellum_products 
SET spec_group = 'Countertops' 
WHERE name ILIKE '%countertop%';

-- 2. Move appliances to "Appliances" category
UPDATE microvellum_products 
SET spec_group = 'Appliances' 
WHERE name IN ('Dishwasher', 'Dryer', 'Freestanding Range', 'Fridge', 
               'Integrated Dishwasher', 'Range Hood', 'Washing Machine')
  AND (spec_group = 'Base Cabinets' OR spec_group IS NULL);

-- 3. Create "Props" category for non-cabinet decorative items
UPDATE microvellum_products 
SET spec_group = 'Props' 
WHERE name IN ('Bar Stools', 'Book', 'Chair', 'Cookware', 'Dishes', 
               'Glasses', 'Ladder', 'Plants', 'Sofa', 'Table Set', 
               'Toilet', 'TV', 'Material Trolly', 'Bathroom Fixture')
  AND (spec_group = 'Base Cabinets' OR spec_group IS NULL);

-- 4. Move trim/finishing products to "Parts"
UPDATE microvellum_products 
SET spec_group = 'Parts' 
WHERE name IN ('Backsplash', 'Pelmet', 'Valance', 'Corbels', 'Soffit',
               'Finished Leg', 'Finished Leg With Radius', 
               'Bracket Array', 'Bracket Single', 'Box End',
               'Extruded Crown', 'Extruded Valance', 'Stemware Rack',
               'Wine Rack Diamond Stack', 'Mitered Shelf', 'Ellipse',
               'Round Top', 'Curved Part', 'Template',
               'Shelves with Shelf Std', 'Cabinet Faces Only')
  AND (spec_group = 'Base Cabinets' OR spec_group IS NULL);

-- 5. Create "Master Cabinets" category for flexible/parametric cabinets
UPDATE microvellum_products 
SET spec_group = 'Master Cabinets' 
WHERE name ILIKE 'master%' 
  AND name NOT ILIKE '%corner%'
  AND name NOT ILIKE '%blind%'
  AND spec_group IN ('Base Cabinets', 'Upper Cabinets');

-- 6. Create "Master Corner Cabinets" for master corner products
UPDATE microvellum_products 
SET spec_group = 'Master Corner Cabinets' 
WHERE (name ILIKE 'master%corner%' OR name ILIKE 'master%blind%');

-- 7. Move extruded parts to "Parts"
UPDATE microvellum_products 
SET spec_group = 'Parts' 
WHERE name ILIKE 'extruded%part%' 
  AND (spec_group = 'Base Cabinets' OR spec_group IS NULL);

-- 8. Move pocket door products to "Accessories"
UPDATE microvellum_products 
SET spec_group = 'Accessories' 
WHERE name ILIKE '%pocket door%' 
  AND (spec_group = 'Base Cabinets' OR spec_group IS NULL);

-- 9. Move test/diagnostic products to "Parts"
UPDATE microvellum_products 
SET spec_group = 'Parts' 
WHERE name ILIKE '%diagnostic%' 
  OR name ILIKE '%pricing%cost%' 
  OR name ILIKE '%pricing%prime%';
-- ═══ 20260108231513_d6fbe2a9-4ee9-46be-940a-774573ea96b9.sql ═══
-- Add columns for storing DXF geometry and SVG thumbnails
ALTER TABLE microvellum_products
ADD COLUMN IF NOT EXISTS thumbnail_svg TEXT,
ADD COLUMN IF NOT EXISTS front_geometry JSONB,
ADD COLUMN IF NOT EXISTS has_dxf_geometry BOOLEAN DEFAULT false;
-- ═══ 20260217000100_admin_report_exports.sql ═══
-- Admin report export helpers and RPC

CREATE OR REPLACE FUNCTION public.jsonb_array_to_csv(p_rows jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_headers text[];
  v_header_line text;
  v_body text;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN '';
  END IF;

  SELECT array_agg(key ORDER BY key)
  INTO v_headers
  FROM jsonb_each((p_rows->0)::jsonb);

  v_header_line := array_to_string(v_headers, ',');

  SELECT string_agg(
    (
      SELECT string_agg(
        '"' || replace(COALESCE(elem->>header, ''), '"', '""') || '"',
        ','
      )
      FROM unnest(v_headers) AS header
    ),
    E'\n'
  )
  INTO v_body
  FROM jsonb_array_elements(p_rows) AS elem;

  RETURN v_header_line || E'\n' || COALESCE(v_body, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_generate_report_export(
  p_report_type text,
  p_start_date date,
  p_end_date date,
  p_tenant_company text,
  p_format text DEFAULT 'csv'
)
RETURNS TABLE(
  filename text,
  mime_type text,
  payload text,
  generated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb := '[]'::jsonb;
  v_format text := lower(COALESCE(p_format, 'csv'));
  v_range_end timestamptz;
  v_tenant_company text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can export reports';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;

  IF v_format NOT IN ('csv', 'json') THEN
    RAISE EXCEPTION 'Unsupported format: %', p_format;
  END IF;

  v_tenant_company := NULLIF(trim(p_tenant_company), '');
  IF v_tenant_company IS NULL THEN
    RAISE EXCEPTION 'Tenant company is required';
  END IF;

  v_range_end := (p_end_date::timestamptz + interval '1 day');

  CASE p_report_type
    WHEN 'users' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(export_rows)), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT
          p.id,
          p.email,
          p.full_name,
          p.phone,
          p.company_name,
          p.user_type,
          p.created_at,
          COUNT(j.id)::int AS job_count,
          COALESCE(SUM(j.cost_incl_tax), 0)::numeric(12,2) AS total_job_value,
          MAX(j.created_at) AS last_job_at
        FROM public.profiles p
        LEFT JOIN public.jobs j ON j.customer_id = p.id
        WHERE p.company_name = v_tenant_company
          AND p.created_at >= p_start_date::timestamptz
          AND p.created_at < v_range_end
        GROUP BY p.id, p.email, p.full_name, p.phone, p.company_name, p.user_type, p.created_at
        ORDER BY p.created_at DESC
      ) export_rows;

    WHEN 'jobs' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(export_rows)), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT
          j.id,
          j.job_number,
          j.name,
          j.status,
          j.cost_excl_tax,
          j.cost_incl_tax,
          j.completion_date,
          j.created_at,
          j.updated_at,
          p.id AS customer_id,
          p.full_name AS customer_name,
          p.email AS customer_email,
          p.company_name AS customer_company,
          p.user_type AS customer_type
        FROM public.jobs j
        INNER JOIN public.profiles p ON p.id = j.customer_id
        WHERE p.company_name = v_tenant_company
          AND j.created_at >= p_start_date::timestamptz
          AND j.created_at < v_range_end
        ORDER BY j.created_at DESC
      ) export_rows;

    WHEN 'pricing_history' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(export_rows)), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT
          ph.id,
          ph.product_id,
          pr.sku AS product_sku,
          pr.name AS product_name,
          ph.old_price,
          ph.new_price,
          ph.changed_at,
          ph.changed_by,
          changed_profile.full_name AS changed_by_name,
          changed_profile.email AS changed_by_email,
          changed_profile.company_name AS changed_by_company
        FROM public.price_history ph
        LEFT JOIN public.products pr ON pr.id = ph.product_id
        LEFT JOIN public.profiles changed_profile ON changed_profile.id = ph.changed_by
        WHERE changed_profile.company_name = v_tenant_company
          AND ph.changed_at >= p_start_date::timestamptz
          AND ph.changed_at < v_range_end
        ORDER BY ph.changed_at DESC
      ) export_rows;

    ELSE
      RAISE EXCEPTION 'Unsupported report type: %', p_report_type;
  END CASE;

  RETURN QUERY
  SELECT
    format('%s_%s_%s.%s', p_report_type, replace(v_tenant_company, ' ', '-'), to_char(now(), 'YYYYMMDD_HH24MISS'), v_format),
    CASE WHEN v_format = 'csv' THEN 'text/csv' ELSE 'application/json' END,
    CASE WHEN v_format = 'csv' THEN public.jsonb_array_to_csv(v_rows) ELSE jsonb_pretty(v_rows) END,
    now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_generate_report_export(text, date, date, text, text) TO authenticated;

-- ═══ 20260307000100_normalize_job_statuses.sql ═══
-- Normalize job status workflow for trade + admin consistency.
-- Canonical statuses: draft, pending_approval, approved, in_production, completed.

UPDATE public.jobs
SET status = 'pending_approval'
WHERE status = 'processing';

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.jobs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.jobs DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.jobs
ADD CONSTRAINT jobs_status_check
CHECK (status IN ('draft', 'pending_approval', 'approved', 'in_production', 'completed'));

-- ═══ 20260307205254_2725a6ca-f6a5-44fd-9ed4-b226d47fa513.sql ═══
UPDATE public.profiles SET user_type = 'trade' WHERE email = 'info@bowercabinets.com';
-- ═══ 20260616000100_supplier_material_scraper_adapter.sql ═══
-- Extend planner material pricing so supplier scraper imports can drive
-- colour/finish pickers, sample images, ordering, and private price review.

alter table public.material_pricing
  add column if not exists description text,
  add column if not exists source_supplier text,
  add column if not exists source_url text,
  add column if not exists sample_image_url text,
  add column if not exists thumbnail_url text,
  add column if not exists supplier_product_id text,
  add column if not exists supplier_variant_code text,
  add column if not exists supplier_finish_code text,
  add column if not exists supplier_range text,
  add column if not exists supplier_category text,
  add column if not exists price_status text not null default 'not_captured',
  add column if not exists price_source text,
  add column if not exists price_captured_at timestamptz,
  add column if not exists price_unit text,
  add column if not exists captured_unit_price numeric,
  add column if not exists technical_documents jsonb not null default '[]'::jsonb,
  add column if not exists finish_variants jsonb not null default '[]'::jsonb,
  add column if not exists scraper_metadata jsonb not null default '{}'::jsonb,
  add column if not exists review_status text not null default 'pending',
  add column if not exists last_scraped_at timestamptz;

create index if not exists idx_material_pricing_item_code on public.material_pricing(item_code);
create index if not exists idx_material_pricing_source_supplier on public.material_pricing(source_supplier);
create index if not exists idx_material_pricing_price_status on public.material_pricing(price_status);
create index if not exists idx_material_pricing_review_status on public.material_pricing(review_status);

create table if not exists public.material_supplier_price_history (
  id uuid primary key default gen_random_uuid(),
  material_pricing_id uuid references public.material_pricing(id) on delete set null,
  item_code text not null,
  supplier text,
  source_url text,
  old_area_cost numeric,
  new_area_cost numeric,
  captured_unit_price numeric,
  price_unit text,
  captured_at timestamptz,
  imported_at timestamptz not null default now(),
  captured_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.material_supplier_price_history enable row level security;

drop policy if exists "Admins can view supplier material price history" on public.material_supplier_price_history;
create policy "Admins can view supplier material price history"
on public.material_supplier_price_history for select
using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can insert supplier material price history" on public.material_supplier_price_history;
create policy "Admins can insert supplier material price history"
on public.material_supplier_price_history for insert
with check (has_role(auth.uid(), 'admin'::app_role));

create index if not exists idx_material_supplier_price_history_item_code
on public.material_supplier_price_history(item_code, imported_at desc);

comment on column public.material_pricing.sample_image_url is 'Supplier sample/swatch image used by the planner material picker.';
comment on column public.material_pricing.price_status is 'not_captured, requires_authorised_login, captured, manual_review, or unavailable.';
comment on column public.material_pricing.scraper_metadata is 'Raw supplier scrape metadata kept for audit/re-import decisions.';

-- ═══ 20260620_benchtop_pricing.sql ═══
-- Migration: rename stone_pricing → benchtop_pricing and add material-type fields
-- Supports: Meganite (solid surface, per_sheet), Egger worktops (laminate, per_lm),
--           and legacy stone (per_sqm).
--
-- Source pricing:
--   Meganite Fabricator Price List (effective 1 July 2024, via ForestOne)
--   ForestOne July 2026 Price List — Egger Worktops (pages 10–11)

-- ── 1. Rename the table ───────────────────────────────────────────────────────
ALTER TABLE IF EXISTS stone_pricing RENAME TO benchtop_pricing;

-- ── 2. Add new columns ────────────────────────────────────────────────────────
ALTER TABLE benchtop_pricing
  ADD COLUMN IF NOT EXISTS material_type  TEXT NOT NULL DEFAULT 'stone',
  ADD COLUMN IF NOT EXISTS pricing_method TEXT NOT NULL DEFAULT 'per_sqm',
  ADD COLUMN IF NOT EXISTS stock_length_mm INT  NOT NULL DEFAULT 3200,
  ADD COLUMN IF NOT EXISTS stock_depth_mm  INT  NOT NULL DEFAULT 1600,
  ADD COLUMN IF NOT EXISTS price_per_sheet NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_per_lm    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS install_per_lm  NUMERIC(10,2);

-- Sensible defaults for existing rows (if any) — treat as legacy per_sqm stone
UPDATE benchtop_pricing
SET material_type  = 'stone',
    pricing_method = 'per_sqm'
WHERE material_type = 'stone' OR material_type IS NULL;

-- ── 3. Constraints ────────────────────────────────────────────────────────────
ALTER TABLE benchtop_pricing
  ADD CONSTRAINT chk_material_type   CHECK (material_type IN ('solid_surface','laminate','stone')),
  ADD CONSTRAINT chk_pricing_method  CHECK (pricing_method IN ('per_sheet','per_lm','per_sqm'));

-- ── 4. Seed Meganite solid-surface data ──────────────────────────────────────
-- Standard sheet: 3660 × 760 × 12mm, priced per sheet ex GST
-- Fabrication/install is a separate quote (install cost not included here)
INSERT INTO benchtop_pricing
  (brand, range_tier, material_type, pricing_method,
   stock_length_mm, stock_depth_mm,
   price_per_sheet, price_per_lm,
   trade_supply_per_sqm, install_supply_per_sqm, install_per_lm)
VALUES

-- Tier 1
('Meganite', 'Snow White (T1)',
 'solid_surface', 'per_sheet', 3660, 760, 493.00, NULL, 0, 0, NULL),

-- Tier 2
('Meganite', 'Bright White / Ivory (T2)',
 'solid_surface', 'per_sheet', 3660, 760, 598.00, NULL, 0, 0, NULL),

-- Tier 3 – mid-range solids
('Meganite', 'Antarctica (T3)',
 'solid_surface', 'per_sheet', 3660, 760, 795.00, NULL, 0, 0, NULL),
('Meganite', 'Blanca Granite (T3)',
 'solid_surface', 'per_sheet', 3660, 760, 795.00, NULL, 0, 0, NULL),
('Meganite', 'Cloud Ash (T3)',
 'solid_surface', 'per_sheet', 3660, 760, 795.00, NULL, 0, 0, NULL),
('Meganite', 'Dark Jet Black (T3)',
 'solid_surface', 'per_sheet', 3660, 760, 795.00, NULL, 0, 0, NULL),
('Meganite', 'Fire (T3)',
 'solid_surface', 'per_sheet', 3660, 760, 795.00, NULL, 0, 0, NULL),
('Meganite', 'Ice Storm (T3)',
 'solid_surface', 'per_sheet', 3660, 760, 795.00, NULL, 0, 0, NULL),
('Meganite', 'Light Grey (T3)',
 'solid_surface', 'per_sheet', 3660, 760, 795.00, NULL, 0, 0, NULL),
('Meganite', 'Lime (T3)',
 'solid_surface', 'per_sheet', 3660, 760, 795.00, NULL, 0, 0, NULL),
('Meganite', 'Platinum Granite (T3)',
 'solid_surface', 'per_sheet', 3660, 760, 795.00, NULL, 0, 0, NULL),
('Meganite', 'Polar Mist (T3)',
 'solid_surface', 'per_sheet', 3660, 760, 795.00, NULL, 0, 0, NULL),
('Meganite', 'Sandy Shore (T3)',
 'solid_surface', 'per_sheet', 3660, 760, 795.00, NULL, 0, 0, NULL),
('Meganite', 'Starry White (T3)',
 'solid_surface', 'per_sheet', 3660, 760, 795.00, NULL, 0, 0, NULL),

-- Tier 4 – premium terrazzo / concrete / boulder
('Meganite', 'Alpi Terrazzo (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Charcoal Concrete (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Cotton Boulder (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Crater Rock (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Dark Raven Boulder (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Hazel Cream (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Kauai Beach (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Mont Blanc (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Mt Carrara (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Mt Carrara Cremo (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Mt Jade (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Mt Vancouver (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Sage Terrazzo (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Salmon Terrazzo (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Sapphire Terrazzo (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Shadow Boulder (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Soft Statuario (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Solar Eclipse (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Taupe Terrazzo (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Urban Terrazzo (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),
('Meganite', 'Verde Terrazzo (T4)',
 'solid_surface', 'per_sheet', 3660, 760, 1044.00, NULL, 0, 0, NULL),

-- Wide format 3660×1220×12mm (single sheet price — for island/splashback use)
('Meganite', 'Mont Blanc Wide (3660×1220)',
 'solid_surface', 'per_sheet', 3660, 1220, 1773.00, NULL, 0, 0, NULL),

-- ── 5. Seed Egger Worktops data ───────────────────────────────────────────────
-- Source: ForestOne July 2026 price list, pages 10–11
-- 38mm Super E0 MR Particleboard (76% Recycled content)
-- Priced per linear metre (LM) ex GST; sheet = 3650mm length

-- 600mm wide, postformed 3mm edge — Solids/Materials (Light Grey, Premium White, stone looks)
('Egger', 'Standard 600 – Solids / Materials',
 'laminate', 'per_lm', 3650, 600, NULL, 76.70, 0, 0, 0),

-- 600mm wide, ABS edge — Feelwood timber looks
('Egger', 'Feelwood 600 – Timber Looks',
 'laminate', 'per_lm', 3650, 600, NULL, 125.58, 0, 0, 0),

-- 920mm wide, postformed — Solids/Materials (island/wider bench)
('Egger', 'Standard 920 – Solids / Materials',
 'laminate', 'per_lm', 3650, 920, NULL, 123.79, 0, 0, 0),

-- 920mm wide, ABS — Feelwood timber looks
('Egger', 'Feelwood 920 – Timber Looks',
 'laminate', 'per_lm', 3650, 920, NULL, 208.10, 0, 0, 0);

-- ── 6. Update Supabase RLS (keep same policy as stone_pricing had) ────────────
-- If RLS was enabled on stone_pricing, re-enable on benchtop_pricing.
-- Check your Supabase dashboard; policies are not automatically renamed.
-- Example (adjust role names to match your project):
--
-- ALTER TABLE benchtop_pricing ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow admin read/write" ON benchtop_pricing
--   FOR ALL USING (auth.role() = 'service_role');
-- CREATE POLICY "Allow authenticated read" ON benchtop_pricing
--   FOR SELECT USING (auth.role() = 'authenticated');

-- ═══ 20260620_funnel_events.sql ═══
-- R5: Funnel analytics events table
-- Tracks homeowner wizard progress without requiring authentication.
-- Insert: open to anon (wizard is public).
-- Select: restricted to authenticated users (admin reads).

CREATE TABLE IF NOT EXISTS funnel_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  text,
  event_type  text        NOT NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS funnel_events_event_type_idx  ON funnel_events (event_type);
CREATE INDEX IF NOT EXISTS funnel_events_created_at_idx  ON funnel_events (created_at DESC);
CREATE INDEX IF NOT EXISTS funnel_events_session_id_idx  ON funnel_events (session_id);

ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY;

-- Homeowner wizard (anon) can insert events
CREATE POLICY "anon can insert funnel events"
  ON funnel_events FOR INSERT TO anon
  WITH CHECK (true);

-- Authenticated users (admin) can read all events
CREATE POLICY "authenticated can read funnel events"
  ON funnel_events FOR SELECT TO authenticated
  USING (true);

-- ═══ 20260620_job_notes.sql ═══
-- Job notes / activity timeline
-- Tracks comments, system events, and admin-internal notes per job.

CREATE TABLE IF NOT EXISTS job_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  author_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,                                  -- denormalised for display
  author_role text        NOT NULL DEFAULT 'trade',  -- 'admin' | 'trade' | 'system'
  content     text        NOT NULL,
  is_internal boolean     NOT NULL DEFAULT false,    -- admin-only when true
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_notes_job_id_idx ON job_notes (job_id, created_at DESC);

ALTER TABLE job_notes ENABLE ROW LEVEL SECURITY;

-- Trade users can read non-internal notes on their own jobs
CREATE POLICY "trade read own job notes"
  ON job_notes FOR SELECT TO authenticated
  USING (
    NOT is_internal AND
    EXISTS (SELECT 1 FROM jobs WHERE id = job_id AND customer_id = auth.uid())
  );

-- Admins can read all notes
CREATE POLICY "admin read all job notes"
  ON job_notes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Trade users can insert non-internal notes on their own jobs
CREATE POLICY "trade insert notes on own jobs"
  ON job_notes FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND
    NOT is_internal AND
    EXISTS (SELECT 1 FROM jobs WHERE id = job_id AND customer_id = auth.uid())
  );

-- Admins can insert any note
CREATE POLICY "admin insert all notes"
  ON job_notes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ═══ 20260620_supplier_feeds.sql ═══
-- R5/R6: Supplier feeds — configured URL-based pricing imports.
-- Each row represents one external data source (e.g. Polytec price list CSV).
-- The scheduled-supplier-import edge function processes all active feeds on a schedule.

CREATE TABLE IF NOT EXISTS supplier_feeds (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  label            text        NOT NULL,                         -- human name, e.g. "Polytec Sheet Materials"
  table_name       text        NOT NULL,                         -- target: material_pricing | hardware_pricing | ...
  feed_url         text        NOT NULL,                         -- direct CSV download URL
  cron_schedule    text        NOT NULL DEFAULT '0 6 * * 1',     -- display only; actual cron in SQL below
  auto_apply       boolean     NOT NULL DEFAULT false,           -- true = apply immediately; false = log diff only
  is_active        boolean     NOT NULL DEFAULT true,
  last_run_at      timestamptz,
  last_run_ok      boolean,
  last_run_summary text,                                         -- e.g. "4 added, 2 updated, 0 errors"
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Only authenticated admins can read/write feeds
ALTER TABLE supplier_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin full access to supplier_feeds"
  ON supplier_feeds FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION update_supplier_feeds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER supplier_feeds_updated_at
  BEFORE UPDATE ON supplier_feeds
  FOR EACH ROW EXECUTE FUNCTION update_supplier_feeds_updated_at();

-- ─── Scheduled cron job (requires pg_cron + pg_net extensions) ────────────────
-- Uncomment and fill in your project URL and service role key after enabling
-- pg_cron and pg_net in the Supabase dashboard (Database → Extensions).
--
-- select cron.schedule(
--   'supplier-feeds-daily',
--   '0 6 * * *',
--   $$
--     select net.http_post(
--       url     := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/scheduled-supplier-import',
--       headers := jsonb_build_object(
--         'Content-Type',  'application/json',
--         'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'
--       ),
--       body    := '{}'::jsonb
--     )
--   $$
-- );

-- ═══ 20260702_dimension_presets.sql ═══
-- #17: Admin-editable dimension presets for the room setup wizard.
-- Replaces the hardcoded "Standard 1 / Standard 2" presets with a DB table
-- the shop admin can manage from Settings.

CREATE TABLE IF NOT EXISTS dimension_presets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  sort_order  int         NOT NULL DEFAULT 0,
  is_default  boolean     NOT NULL DEFAULT false,
  -- Partial<RoomConfig> shape: toeKickHeight, baseHeight, baseDepth,
  -- wallHeight, wallDepth, wallMountHeight, tallHeight, tallDepth, ...
  dimensions  jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dimension_presets ENABLE ROW LEVEL SECURITY;

-- All authenticated users (trade) can read presets for the wizard
CREATE POLICY "authenticated read dimension presets"
  ON dimension_presets FOR SELECT TO authenticated
  USING (true);

-- Only admins can manage presets
CREATE POLICY "admin manage dimension presets"
  ON dimension_presets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION update_dimension_presets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dimension_presets_updated_at
  BEFORE UPDATE ON dimension_presets
  FOR EACH ROW EXECUTE FUNCTION update_dimension_presets_updated_at();

-- Seed with the previous hardcoded shop standards
INSERT INTO dimension_presets (name, sort_order, is_default, dimensions) VALUES
  ('Standard 1 (2100 overheads)', 0, true,
   '{"toeKickHeight":135,"baseHeight":732,"baseDepth":575,"wallHeight":600,"wallDepth":300,"wallMountHeight":1350,"tallHeight":2100,"tallDepth":600}'),
  ('Standard 2 (2400 overheads)', 1, false,
   '{"toeKickHeight":135,"baseHeight":732,"baseDepth":575,"wallHeight":900,"wallDepth":300,"wallMountHeight":1350,"tallHeight":2400,"tallDepth":600}');

