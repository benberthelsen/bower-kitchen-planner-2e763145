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
