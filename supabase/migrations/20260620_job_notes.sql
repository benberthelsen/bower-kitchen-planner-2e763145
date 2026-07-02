-- Job notes / activity timeline
-- Tracks comments, system events, and admin-internal notes per job.

CREATE TABLE IF NOT EXISTS job_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  author_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,                                  -- denormalised for display
  author_role text        NOT NULL DEFAULT 'trade',  -- 'admin' | 'trade' | 'system'
  content     text        NOT NULL,
  is_internal boolean     NOT NULL DEFAULT false,    -- admin-only when true
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_notes_job_id_idx ON job_notes (job_id, created_at DESC);

ALTER TABLE job_notes ENABLE ROW LEVEL SECURITY;

-- Trade users can read non-internal notes on their own jobs
CREATE POLICY "trade read own job notes"
  ON job_notes FOR SELECT TO authenticated
  USING (
    NOT is_internal AND
    EXISTS (SELECT 1 FROM jobs WHERE id = job_id AND customer_id = auth.uid())
  );

-- Admins can read all notes
CREATE POLICY "admin read all job notes"
  ON job_notes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Trade users can insert non-internal notes on their own jobs
CREATE POLICY "trade insert notes on own jobs"
  ON job_notes FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND
    NOT is_internal AND
    EXISTS (SELECT 1 FROM jobs WHERE id = job_id AND customer_id = auth.uid())
  );

-- Admins can insert any note
CREATE POLICY "admin insert all notes"
  ON job_notes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));
