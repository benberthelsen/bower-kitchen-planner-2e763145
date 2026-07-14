-- WS2 item 5: seed a GLOBAL default markup profile so quotes carry a
-- commercial layer out of the box. client_id is NULL (not tied to a client);
-- useClientMarkup falls back to this row when the user has no profile.
-- Admin-tunable in Admin → Pricing → Client Markups.

-- Trade users could previously only read rows where client_id = auth.uid(),
-- so the global default needs its own read policy.
DROP POLICY IF EXISTS "Authenticated can view global default markup" ON public.client_markup_settings;
CREATE POLICY "Authenticated can view global default markup"
  ON public.client_markup_settings
  FOR SELECT
  TO authenticated
  USING (client_id IS NULL AND is_default = true);

-- Idempotent seed: one global default at 30% across cost categories
-- (delivery excluded — flat pass-through).
INSERT INTO public.client_markup_settings
  (client_id, name, markup_type, material_markup, hardware_markup, labor_markup,
   delivery_markup, stone_markup, parts_markup, edge_markup, door_drawer_markup, is_default)
SELECT
  NULL, 'Standard Default', 'percentage', 30, 30, 30, 0, 30, 30, 30, 30, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_markup_settings
  WHERE client_id IS NULL AND is_default = true
);
