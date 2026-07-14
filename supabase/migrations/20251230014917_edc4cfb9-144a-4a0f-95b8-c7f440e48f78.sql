-- Add unique constraint on microvellum_link_id for upsert to work
ALTER TABLE public.microvellum_products 
ADD CONSTRAINT microvellum_products_link_id_unique UNIQUE (microvellum_link_id);