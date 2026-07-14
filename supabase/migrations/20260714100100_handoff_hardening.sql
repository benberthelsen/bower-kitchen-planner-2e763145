-- Room scanner Phase 1A (master plan §6.2): planner_handoffs hardening.
-- Tokenized public capability flow, deny-by-default direct access, staff-only
-- reads, durable submission idempotency fields on jobs.

-- ── planner_handoffs capability/versioning fields ──────────────────────────
ALTER TABLE public.planner_handoffs
  ADD COLUMN IF NOT EXISTS public_token_hash text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS payload_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalization_key uuid,
  ADD COLUMN IF NOT EXISTS submission_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_planner_handoffs_token_hash
  ON public.planner_handoffs(public_token_hash) WHERE public_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_planner_handoffs_expires ON public.planner_handoffs(expires_at);
CREATE INDEX IF NOT EXISTS idx_planner_handoffs_consumed ON public.planner_handoffs(consumed_at);
CREATE INDEX IF NOT EXISTS idx_planner_handoffs_submission ON public.planner_handoffs(submission_key);

-- Missing FK (ON DELETE SET NULL — deletion workflow removes payloads/objects
-- explicitly first, so a cascade can never orphan private storage objects).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planner_handoffs_job_fk'
  ) THEN
    ALTER TABLE public.planner_handoffs
      ADD CONSTRAINT planner_handoffs_job_fk
      FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── jobs: durable idempotency for homeowner enquiries ──────────────────────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS submission_key uuid,
  ADD COLUMN IF NOT EXISTS submission_fingerprint text;

-- Real UNIQUE constraint (multiple NULLs allowed; safe ON CONFLICT target).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_submission_key_unique'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_submission_key_unique UNIQUE (submission_key);
  END IF;
END $$;

-- ── staff helper ────────────────────────────────────────────────────────────
-- Explicit staff/admin roles only. NEVER infer staff from
-- profiles.user_type = 'trade' — a trade customer is not Bower staff.
CREATE OR REPLACE FUNCTION public.is_bower_staff(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user AND role IN ('admin'::public.app_role, 'staff'::public.app_role)
  );
$$;

REVOKE ALL ON FUNCTION public.is_bower_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_bower_staff(uuid) TO authenticated, service_role;

-- ── RLS: deny-by-default direct access ──────────────────────────────────────
-- The old policies allowed anonymous INSERT (bypassing validation/tokens) and
-- let ANY authenticated user read/rewrite every handoff. All public and
-- mutation paths now go through validated edge functions + restricted RPCs.
DROP POLICY IF EXISTS "Anyone can create planner handoffs" ON public.planner_handoffs;
DROP POLICY IF EXISTS "Authenticated can read planner handoffs" ON public.planner_handoffs;
DROP POLICY IF EXISTS "Authenticated can consume planner handoffs" ON public.planner_handoffs;

DROP POLICY IF EXISTS "Staff can read planner handoffs" ON public.planner_handoffs;
CREATE POLICY "Staff can read planner handoffs"
  ON public.planner_handoffs FOR SELECT TO authenticated
  USING (public.is_bower_staff(auth.uid()));
-- No INSERT/UPDATE/DELETE policies: browsers cannot mutate handoffs directly.
