-- Durable delivery state for planner/trade jobs forwarded to Build Flow.
-- The planner job remains the origin receipt; failures are visible and can be
-- retried with the same idempotency key without creating duplicate leads.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS buildflow_status text,
  ADD COLUMN IF NOT EXISTS buildflow_lead_id uuid,
  ADD COLUMN IF NOT EXISTS buildflow_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS buildflow_error text;

CREATE INDEX IF NOT EXISTS jobs_buildflow_failed_idx
  ON public.jobs (updated_at DESC)
  WHERE buildflow_status = 'failed';
