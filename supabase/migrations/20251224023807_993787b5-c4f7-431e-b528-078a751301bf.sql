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