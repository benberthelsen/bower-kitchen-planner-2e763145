-- Add columns for storing DXF geometry and SVG thumbnails
ALTER TABLE microvellum_products
ADD COLUMN IF NOT EXISTS thumbnail_svg TEXT,
ADD COLUMN IF NOT EXISTS front_geometry JSONB,
ADD COLUMN IF NOT EXISTS has_dxf_geometry BOOLEAN DEFAULT false;