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
