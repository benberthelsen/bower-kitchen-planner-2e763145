GRANT SELECT ON public.appliance_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appliance_products TO authenticated;
GRANT ALL ON public.appliance_products TO service_role;