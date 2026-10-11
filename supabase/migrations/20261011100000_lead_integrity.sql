-- Lead integrity (security plan step 3). Three independent repairs, each
-- written to re-run safely: production has drifted from these files and does
-- not record them in supabase_migrations.schema_migrations, so this file is
-- applied on its own and may meet objects that already exist.
--
-- (a) Only the service role and Bower staff may create or touch a homeowner
--     lead (jobs.status = 'enquiry'). Until now any confirmed account could
--     INSERT its own row as 'enquiry' (or flip a draft to it) and so inject
--     leads into admin Leads, and the customer of an owned enquiry could
--     rewrite it ('Users can update own jobs' has no column guard).
-- (b) link_trade_handoff_v2 needs the handoff token's hash. v1 lets any job
--     owner consume or attach any handoff by its id alone, which also breaks
--     the real visitor's later submit with consumed_handoff. v1 stays granted
--     until the token-sending link-trade-handoff is live; the follow-up
--     migration 20261011100200_followup_revoke_link_trade_handoff_v1.sql
--     revokes it and is NOT part of this apply.
-- (d) funnel_events rows are bounded (anon can insert them).

-- ── (a) jobs: enquiry rows are service-role or staff only ───────────────────
-- "Service role" is the JWT role claim PostgREST sets for the service key; it
-- stays visible inside the SECURITY DEFINER RPCs (submit_planner_enquiry_v1/v2,
-- promote_ai_design_v1) that the edge functions call with that key. A direct
-- database session with no JWT at all (migrations, the SQL editor, cron) is
-- trusted when its session user is postgres, supabase_admin or a superuser;
-- a session that carries a browser JWT is judged by that JWT, so
-- impersonating a user in the SQL editor gets that user's answer.
CREATE OR REPLACE FUNCTION public.guard_enquiry_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim_role text;
  v_uid uuid;
BEGIN
  IF NOT (NEW.status IS NOT DISTINCT FROM 'enquiry'
          OR (TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'enquiry')) THEN
    RETURN NEW;
  END IF;

  v_claim_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  IF v_claim_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF v_claim_role IS NULL
     AND (session_user IN ('postgres', 'supabase_admin')
          OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = session_user AND rolsuper)) THEN
    RETURN NEW;
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NOT NULL AND public.is_bower_staff(v_uid) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501',
    DETAIL = 'Homeowner enquiries are created and changed only by the service role or Bower staff.';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_enquiry_jobs() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_enquiry_jobs ON public.jobs;
CREATE TRIGGER guard_enquiry_jobs
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_enquiry_jobs();

-- ── (b) token-bound trade linking ───────────────────────────────────────────
-- v1's rules plus the token: the caller must be Bower staff or own the job; a
-- scanner handoff needs staff (20261009100000_scanner_handoffs_staff_only.sql);
-- and anyone who is not staff must present the sha256 hex of the handoff's
-- token. A wrong, missing or never-set token fails exactly like an unknown id
-- or a scanner row, before consumption is looked at, and leaves the row as it
-- was.
CREATE OR REPLACE FUNCTION public.link_trade_handoff_v2(
  p_handoff_id uuid,
  p_job_id uuid,
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_staff boolean;
  v_source text;
  v_token_hash text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;

  v_is_staff := public.is_bower_staff(auth.uid());
  IF NOT v_is_staff
     AND NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id AND customer_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id) THEN
    RAISE EXCEPTION 'invalid_job' USING ERRCODE = 'P0001';
  END IF;

  SELECT source, public_token_hash INTO v_source, v_token_hash
    FROM public.planner_handoffs WHERE id = p_handoff_id FOR UPDATE;
  IF NOT FOUND
     OR (v_source = 'scanner' AND NOT v_is_staff)
     OR (NOT v_is_staff AND (p_token_hash IS NULL OR v_token_hash IS NULL
                             OR v_token_hash <> p_token_hash)) THEN
    RAISE EXCEPTION 'invalid_handoff' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.planner_handoffs
    SET consumed_at = COALESCE(consumed_at, now()),
        job_id = COALESCE(job_id, p_job_id)
    WHERE id = p_handoff_id;

  RETURN jsonb_build_object('linked', true);
END;
$$;

REVOKE ALL ON FUNCTION public.link_trade_handoff_v2(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_trade_handoff_v2(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.link_trade_handoff_v2(uuid, uuid, text) TO authenticated;

-- ── (d) bounded funnel_events rows ──────────────────────────────────────────
-- NOT VALID: existing rows are left alone; every new or changed row is
-- checked. The wizard's own events are far inside these limits
-- (analyticsPrivacy.ts caps strings at 256 characters).
DO $$
BEGIN
  IF to_regclass('public.funnel_events') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.funnel_events'::regclass
                   AND conname = 'funnel_events_metadata_size') THEN
    ALTER TABLE public.funnel_events ADD CONSTRAINT funnel_events_metadata_size
      CHECK (octet_length(metadata::text) <= 4096) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.funnel_events'::regclass
                   AND conname = 'funnel_events_event_type_length') THEN
    ALTER TABLE public.funnel_events ADD CONSTRAINT funnel_events_event_type_length
      CHECK (char_length(event_type) <= 64) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.funnel_events'::regclass
                   AND conname = 'funnel_events_session_id_length') THEN
    ALTER TABLE public.funnel_events ADD CONSTRAINT funnel_events_session_id_length
      CHECK (char_length(session_id) <= 128) NOT VALID;
  END IF;
END $$;
