-- WS5 Phase 3: website → planner starter-design handoff.
-- The website (anon) inserts a scope row; the planner (authenticated) reads it
-- by id, pre-fills the Room Setup Wizard, marks it consumed and links the job.

CREATE TABLE IF NOT EXISTS public.planner_handoffs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'website',
  -- WebsitePlannerHandoff contract (docs/kitchen-planner-integration-plan.md)
  payload jsonb NOT NULL,
  lead_name text,
  lead_email text,
  lead_phone text,
  consumed_at timestamptz,
  job_id uuid
);

ALTER TABLE public.planner_handoffs ENABLE ROW LEVEL SECURITY;

-- Anonymous website visitors create handoffs (lead capture) but can never
-- read them back — the row id acts as the capability token in the URL.
DROP POLICY IF EXISTS "Anyone can create planner handoffs" ON public.planner_handoffs;
CREATE POLICY "Anyone can create planner handoffs"
  ON public.planner_handoffs FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can read planner handoffs" ON public.planner_handoffs;
CREATE POLICY "Authenticated can read planner handoffs"
  ON public.planner_handoffs FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can consume planner handoffs" ON public.planner_handoffs;
CREATE POLICY "Authenticated can consume planner handoffs"
  ON public.planner_handoffs FOR UPDATE TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_planner_handoffs_job ON public.planner_handoffs(job_id);
