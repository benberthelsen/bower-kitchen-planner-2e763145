-- R5: Funnel analytics events table
-- Tracks homeowner wizard progress without requiring authentication.
-- Insert: open to anon (wizard is public).
-- Select: restricted to authenticated users (admin reads).

CREATE TABLE IF NOT EXISTS funnel_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  text,
  event_type  text        NOT NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS funnel_events_event_type_idx  ON funnel_events (event_type);
CREATE INDEX IF NOT EXISTS funnel_events_created_at_idx  ON funnel_events (created_at DESC);
CREATE INDEX IF NOT EXISTS funnel_events_session_id_idx  ON funnel_events (session_id);

ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY;

-- Homeowner wizard (anon) can insert events
CREATE POLICY "anon can insert funnel events"
  ON funnel_events FOR INSERT TO anon
  WITH CHECK (true);

-- Authenticated users (admin) can read all events
CREATE POLICY "authenticated can read funnel events"
  ON funnel_events FOR SELECT TO authenticated
  USING (true);
