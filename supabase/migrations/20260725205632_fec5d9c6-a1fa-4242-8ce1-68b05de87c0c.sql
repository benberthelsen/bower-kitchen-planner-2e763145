
CREATE TABLE public.appliance_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code TEXT,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT NOT NULL CHECK (category IN ('sink','tap','dishwasher','oven','cooktop','rangehood','fridge','microwave','laundry','other')),
  subcategory TEXT,
  description TEXT,
  rrp NUMERIC,
  sell_price NUMERIC,
  installed_price NUMERIC,
  width_mm INT,
  height_mm INT,
  depth_mm INT,
  cutout_width_mm INT,
  cutout_height_mm INT,
  cutout_depth_mm INT,
  finish TEXT,
  power_requirements TEXT,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_url TEXT,
  model_url TEXT,
  model_ios_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  price_is_placeholder BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.appliance_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appliance_products TO authenticated;
GRANT ALL ON public.appliance_products TO service_role;

ALTER TABLE public.appliance_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active appliance products"
  ON public.appliance_products FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert appliance products"
  ON public.appliance_products FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update appliance products"
  ON public.appliance_products FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete appliance products"
  ON public.appliance_products FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER appliance_products_updated_at
  BEFORE UPDATE ON public.appliance_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX appliance_products_category_idx ON public.appliance_products (category, sort_order);
CREATE INDEX appliance_products_active_idx ON public.appliance_products (is_active);

-- Seed data
INSERT INTO public.appliance_products (brand, name, category, subcategory, rrp, installed_price, width_mm, height_mm, depth_mm, cutout_width_mm, cutout_height_mm, cutout_depth_mm, finish, power_requirements, sort_order) VALUES
  ('Häfele','60cm Pyrolytic Oven','oven','Built-in',2499,2799,595,595,567,560,585,550,'Stainless Steel','15A dedicated circuit',10),
  ('Häfele','60cm Multifunction Oven','oven','Built-in',1699,1999,595,595,567,560,585,550,'Stainless Steel',NULL,20),
  ('Häfele','60cm Induction Cooktop','cooktop','Induction',1499,1699,590,60,520,560,NULL,500,'Black Glass','32A circuit',10),
  ('Häfele','60cm Gas Cooktop','cooktop','Gas',999,1199,590,110,510,560,NULL,480,'Stainless Steel',NULL,20),
  ('Häfele','90cm Canopy Rangehood','rangehood','Canopy',1299,1599,900,600,500,NULL,NULL,NULL,'Stainless Steel','Ducted',10),
  ('Häfele','60cm Fully Integrated Dishwasher','dishwasher','Integrated',1799,2049,596,818,550,NULL,NULL,NULL,'Panel Ready',NULL,10),
  ('Häfele','Built-in Microwave','microwave','Built-in',899,1049,595,388,420,560,362,550,'Stainless Steel',NULL,10),
  (NULL,'Single Bowl Undermount Sink','sink','Undermount',449,NULL,440,200,440,NULL,NULL,NULL,'Stainless Steel',NULL,10),
  (NULL,'Double Bowl Undermount Sink','sink','Undermount',749,NULL,820,200,450,NULL,NULL,NULL,'Stainless Steel',NULL,20),
  (NULL,'Kitchen Mixer Tap','tap','Mixer',299,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Chrome',NULL,10),
  (NULL,'Kitchen Mixer Tap','tap','Mixer',349,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Matte Black',NULL,20),
  (NULL,'Kitchen Mixer Tap','tap','Mixer',379,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Brushed Gunmetal',NULL,30);
