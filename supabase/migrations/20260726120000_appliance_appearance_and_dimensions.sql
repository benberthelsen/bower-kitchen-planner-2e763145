-- Appliance appearance + confirmed dimensions.
--
-- Two things the catalogue could not express:
--
-- 1. WHAT THE APPLIANCE LOOKS LIKE. `image_url` existed but was only ever used
--    for the picker card. Häfele publish an orthographic elevation per product
--    (`ppic-` in their filenames), which the 3D renderer now maps onto the face
--    you actually look at — front for ovens and dishwashers, top for cooktops.
--    `image_is_elevation` records whether the stored image is that straight-on
--    shot, because a `dimd-` dimension drawing mapped onto an oven door would
--    render a line drawing on the front of the appliance.
--
-- 2. WHETHER A SIZE HAS BEEN CHECKED. Roughly one product in seven has no
--    published dimensions — Häfele stop maintaining data for ranges they are
--    clearing. Those get derived defaults, and `dimensions_confirmed` marks the
--    difference, mirroring how `price_is_placeholder` already works so the
--    admin screen can surface both the same way.
--
-- Sinks additionally carry their real bowl count and per-bowl sizes, which
-- replaces a guess in the renderer that anything wider than 700 mm was a
-- double bowl. A 1 & 3/4 bowl now draws as one full bowl and one small one.

ALTER TABLE public.appliance_products
  ADD COLUMN IF NOT EXISTS dimensions_confirmed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_is_elevation   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS installation         TEXT,
  ADD COLUMN IF NOT EXISTS bowl_count           NUMERIC,
  ADD COLUMN IF NOT EXISTS bowl_sizes           JSONB,
  ADD COLUMN IF NOT EXISTS product_url          TEXT,
  ADD COLUMN IF NOT EXISTS spec_source          TEXT;

COMMENT ON COLUMN public.appliance_products.dimensions_confirmed IS
  'True once a human has checked the sizes. False means derived or defaulted.';
COMMENT ON COLUMN public.appliance_products.image_is_elevation IS
  'True when image_url is a straight-on product elevation safe to map onto a 3D face.';
COMMENT ON COLUMN public.appliance_products.bowl_count IS
  'Sinks: supplier bowl count (1, 1.75, 2). Drives how many bowls are drawn.';
COMMENT ON COLUMN public.appliance_products.bowl_sizes IS
  'Sinks: array of per-bowl "L x W x D" strings as published.';
COMMENT ON COLUMN public.appliance_products.spec_source IS
  'Where the dimensions came from: product-page, installation-pdf, dimension-drawing, derived.';

-- Existing rows are the 12 placeholder seeds; none of their sizes were checked.
UPDATE public.appliance_products
   SET dimensions_confirmed = false
 WHERE dimensions_confirmed IS DISTINCT FROM false;

CREATE INDEX IF NOT EXISTS appliance_products_needs_review_idx
  ON public.appliance_products (dimensions_confirmed, price_is_placeholder)
  WHERE dimensions_confirmed = false OR price_is_placeholder = true;
