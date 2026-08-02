ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS buildflow_status text,
  ADD COLUMN IF NOT EXISTS buildflow_lead_id uuid,
  ADD COLUMN IF NOT EXISTS buildflow_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS buildflow_error text,
  ADD COLUMN IF NOT EXISTS buildflow_design_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buildflow_design_hash text,
  ADD COLUMN IF NOT EXISTS buildflow_design_id uuid,
  ADD COLUMN IF NOT EXISTS buildflow_job_id uuid,
  ADD COLUMN IF NOT EXISTS buildflow_design_sent_at timestamptz;