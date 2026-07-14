-- R5/R6: Supplier feeds — configured URL-based pricing imports.
-- Each row represents one external data source (e.g. Polytec price list CSV).
-- The scheduled-supplier-import edge function processes all active feeds on a schedule.

CREATE TABLE IF NOT EXISTS supplier_feeds (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  label            text        NOT NULL,                         -- human name, e.g. "Polytec Sheet Materials"
  table_name       text        NOT NULL,                         -- target: material_pricing | hardware_pricing | ...
  feed_url         text        NOT NULL,                         -- direct CSV download URL
  cron_schedule    text        NOT NULL DEFAULT '0 6 * * 1',     -- display only; actual cron in SQL below
  auto_apply       boolean     NOT NULL DEFAULT false,           -- true = apply immediately; false = log diff only
  is_active        boolean     NOT NULL DEFAULT true,
  last_run_at      timestamptz,
  last_run_ok      boolean,
  last_run_summary text,                                         -- e.g. "4 added, 2 updated, 0 errors"
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Only authenticated admins can read/write feeds
ALTER TABLE supplier_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin full access to supplier_feeds"
  ON supplier_feeds FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION update_supplier_feeds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER supplier_feeds_updated_at
  BEFORE UPDATE ON supplier_feeds
  FOR EACH ROW EXECUTE FUNCTION update_supplier_feeds_updated_at();

-- ─── Scheduled cron job (requires pg_cron + pg_net extensions) ────────────────
-- Uncomment and fill in your project URL and service role key after enabling
-- pg_cron and pg_net in the Supabase dashboard (Database → Extensions).
--
-- select cron.schedule(
--   'supplier-feeds-daily',
--   '0 6 * * *',
--   $$
--     select net.http_post(
--       url     := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/scheduled-supplier-import',
--       headers := jsonb_build_object(
--         'Content-Type',  'application/json',
--         'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'
--       ),
--       body    := '{}'::jsonb
--     )
--   $$
-- );
