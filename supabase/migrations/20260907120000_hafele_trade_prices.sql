-- Häfele price book: the single source of hardware cost.
--
-- Captured from Bower's Häfele trade login on 7 Sep 2026 — one row per article
-- number with the published RRP and Bower's own buy price, both excluding GST.
-- hardware_pricing stays the catalogue of what can be selected; this table is
-- what the planner falls back to whenever a catalogue row has no usable cost,
-- so a cabinet is never quoted on a hardcoded guess.

CREATE TABLE IF NOT EXISTS public.hafele_trade_prices (
  article_code text PRIMARY KEY,
  name text,
  variant_label text,
  product_type text,
  rrp_ex_gst numeric,
  trade_cost_ex_gst numeric,
  product_url text,
  captured_at date NOT NULL DEFAULT current_date,
  source text NOT NULL DEFAULT 'hafele.com.au trade login',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hafele_trade_prices_type ON public.hafele_trade_prices(product_type);

ALTER TABLE public.hafele_trade_prices ENABLE ROW LEVEL SECURITY;

-- Buy prices are commercially sensitive: authenticated staff only, never public.
DROP POLICY IF EXISTS "Authenticated can view hafele trade prices" ON public.hafele_trade_prices;
CREATE POLICY "Authenticated can view hafele trade prices"
  ON public.hafele_trade_prices FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage hafele trade prices" ON public.hafele_trade_prices;
CREATE POLICY "Admins can manage hafele trade prices"
  ON public.hafele_trade_prices FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Appliance cost, alongside the sell price already held in `rrp`.
ALTER TABLE public.appliance_products ADD COLUMN IF NOT EXISTS trade_cost_ex_gst numeric;
