-- Server-side-only synthetic usability test mode.
--
-- Synthetic callers must prove possession of SYNTHETIC_TEST_SECRET at the
-- Edge Function. The secret is never shipped in the browser bundle or placed
-- in a URL. Test records remain durable and explicitly tagged for review.

ALTER TABLE public.ai_designer_sessions
  ADD COLUMN IF NOT EXISTS is_synthetic_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_run_id text,
  ADD COLUMN IF NOT EXISTS persona_id text;

ALTER TABLE public.ai_design_brief_revisions
  ADD COLUMN IF NOT EXISTS is_synthetic_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_run_id text,
  ADD COLUMN IF NOT EXISTS persona_id text;

ALTER TABLE public.ai_design_proposals
  ADD COLUMN IF NOT EXISTS is_synthetic_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_run_id text,
  ADD COLUMN IF NOT EXISTS persona_id text;

ALTER TABLE public.ai_design_rule_results
  ADD COLUMN IF NOT EXISTS is_synthetic_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_run_id text,
  ADD COLUMN IF NOT EXISTS persona_id text;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS is_synthetic_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_run_id text,
  ADD COLUMN IF NOT EXISTS persona_id text;

ALTER TABLE public.planner_handoffs
  ADD COLUMN IF NOT EXISTS is_synthetic_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_run_id text,
  ADD COLUMN IF NOT EXISTS persona_id text;

CREATE TABLE IF NOT EXISTS public.synthetic_email_sink (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id text NOT NULL,
  persona_id text NOT NULL,
  is_synthetic_test boolean NOT NULL DEFAULT true CHECK (is_synthetic_test),
  message_type text NOT NULL,
  envelope_to jsonb NOT NULL CHECK (jsonb_typeof(envelope_to) = 'array'),
  subject text NOT NULL,
  html text NOT NULL,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_payload) = 'object'),
  transport text NOT NULL DEFAULT 'database-sink'
    CHECK (transport IN ('database-sink', 'mailtrap')),
  transport_status text NOT NULL DEFAULT 'captured'
    CHECK (transport_status IN ('captured', 'delivered-to-sandbox', 'sandbox-error')),
  transport_message_id text,
  transport_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (test_run_id ~ '^[A-Z0-9][A-Z0-9_-]{5,63}$'),
  CHECK (persona_id ~ '^SYN-P(00[1-9]|0[1-9][0-9]|100)$')
);

CREATE TABLE IF NOT EXISTS public.synthetic_usability_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id text NOT NULL,
  persona_id text NOT NULL,
  is_synthetic_test boolean NOT NULL DEFAULT true CHECK (is_synthetic_test),
  persona_profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(persona_profile) = 'object'),
  device text NOT NULL CHECK (device IN ('mobile', 'desktop', 'tablet')),
  primary_journey text NOT NULL,
  secondary_journey text,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'running', 'completed', 'failed', 'paused')),
  ai_session_id uuid REFERENCES public.ai_designer_sessions(id) ON DELETE SET NULL,
  proposal_ids uuid[] NOT NULL DEFAULT '{}',
  selected_proposal_id uuid REFERENCES public.ai_design_proposals(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  email_sink_id uuid REFERENCES public.synthetic_email_sink(id) ON DELETE SET NULL,
  price_band jsonb,
  session_metrics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(session_metrics) = 'object'),
  synthetic_reactions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(synthetic_reactions) = 'array'),
  observed_failures jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(observed_failures) = 'array'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (test_run_id, persona_id),
  CHECK (test_run_id ~ '^[A-Z0-9][A-Z0-9_-]{5,63}$'),
  CHECK (persona_id ~ '^SYN-P(00[1-9]|0[1-9][0-9]|100)$')
);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_synthetic_run
  ON public.ai_designer_sessions(test_run_id, persona_id)
  WHERE is_synthetic_test;
CREATE INDEX IF NOT EXISTS idx_ai_proposals_synthetic_run
  ON public.ai_design_proposals(test_run_id, persona_id)
  WHERE is_synthetic_test;
CREATE INDEX IF NOT EXISTS idx_jobs_synthetic_run
  ON public.jobs(test_run_id, persona_id)
  WHERE is_synthetic_test;
CREATE INDEX IF NOT EXISTS idx_synthetic_sessions_run
  ON public.synthetic_usability_sessions(test_run_id, persona_id);
CREATE INDEX IF NOT EXISTS idx_synthetic_email_sink_run
  ON public.synthetic_email_sink(test_run_id, persona_id);

ALTER TABLE public.synthetic_usability_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synthetic_email_sink ENABLE ROW LEVEL SECURITY;
-- Deliberately no browser policies. Service-role Edge Functions own all access.

CREATE OR REPLACE FUNCTION public.propagate_ai_proposal_synthetic_tags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT s.is_synthetic_test, s.test_run_id, s.persona_id
    INTO NEW.is_synthetic_test, NEW.test_run_id, NEW.persona_id
    FROM public.ai_designer_sessions s
    WHERE s.id = NEW.session_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_ai_proposal_synthetic_tags ON public.ai_design_proposals;
CREATE TRIGGER set_ai_proposal_synthetic_tags
  BEFORE INSERT OR UPDATE OF session_id ON public.ai_design_proposals
  FOR EACH ROW EXECUTE FUNCTION public.propagate_ai_proposal_synthetic_tags();

CREATE OR REPLACE FUNCTION public.propagate_ai_rule_synthetic_tags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  SELECT p.is_synthetic_test, p.test_run_id, p.persona_id
    INTO NEW.is_synthetic_test, NEW.test_run_id, NEW.persona_id
    FROM public.ai_design_proposals p
    WHERE p.id = NEW.proposal_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_ai_rule_synthetic_tags ON public.ai_design_rule_results;
CREATE TRIGGER set_ai_rule_synthetic_tags
  BEFORE INSERT OR UPDATE OF proposal_id ON public.ai_design_rule_results
  FOR EACH ROW EXECUTE FUNCTION public.propagate_ai_rule_synthetic_tags();

CREATE OR REPLACE FUNCTION public.create_ai_designer_session_v2(
  p_token_hash text,
  p_brief jsonb,
  p_brief_fingerprint text,
  p_room_fingerprint text,
  p_expires_at timestamptz,
  p_source text,
  p_test_run_id text,
  p_persona_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid := gen_random_uuid();
  v_brief_id uuid := gen_random_uuid();
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_brief_fingerprint IS NULL OR p_brief_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_room_fingerprint IS NULL OR p_room_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_brief IS NULL OR jsonb_typeof(p_brief) <> 'object'
     OR p_expires_at <= now()
     OR p_source NOT IN ('homeowner', 'trade', 'admin')
     OR p_test_run_id !~ '^[A-Z0-9][A-Z0-9_-]{5,63}$'
     OR p_persona_id !~ '^SYN-P(00[1-9]|0[1-9][0-9]|100)$' THEN
    RAISE EXCEPTION 'invalid_ai_session' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.ai_designer_sessions
    (id, public_token_hash, source, expires_at,
     is_synthetic_test, test_run_id, persona_id)
  VALUES
    (v_session_id, p_token_hash, p_source, p_expires_at,
     true, p_test_run_id, p_persona_id);

  INSERT INTO public.ai_design_brief_revisions
    (id, session_id, revision, room_revision, brief, brief_fingerprint,
     room_fingerprint, is_synthetic_test, test_run_id, persona_id)
  VALUES
    (v_brief_id, v_session_id, 1, 1, p_brief, p_brief_fingerprint,
     p_room_fingerprint, true, p_test_run_id, p_persona_id);

  RETURN jsonb_build_object(
    'sessionId', v_session_id,
    'briefRevisionId', v_brief_id,
    'briefRevision', 1,
    'designRevision', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_ai_designer_session_v2(
  text, jsonb, text, text, timestamptz, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ai_designer_session_v2(
  text, jsonb, text, text, timestamptz, text, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.submit_planner_enquiry_v2(
  p_submission_key uuid,
  p_fingerprint text,
  p_job jsonb,
  p_handoff_id uuid,
  p_token_hash text,
  p_test_run_id text,
  p_persona_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_job_id uuid;
BEGIN
  IF p_test_run_id !~ '^[A-Z0-9][A-Z0-9_-]{5,63}$'
     OR p_persona_id !~ '^SYN-P(00[1-9]|0[1-9][0-9]|100)$' THEN
    RAISE EXCEPTION 'invalid_synthetic_test' USING ERRCODE = 'P0001';
  END IF;

  v_result := public.submit_planner_enquiry_v1(
    p_submission_key,
    p_fingerprint,
    p_job,
    p_handoff_id,
    p_token_hash
  );
  v_job_id := (v_result->>'jobId')::uuid;

  UPDATE public.jobs
    SET is_synthetic_test = true,
        test_run_id = p_test_run_id,
        persona_id = p_persona_id
    WHERE id = v_job_id
      AND (
        NOT is_synthetic_test
        OR (test_run_id = p_test_run_id AND persona_id = p_persona_id)
      );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'synthetic_tag_conflict' USING ERRCODE = 'P0001';
  END IF;

  IF p_handoff_id IS NOT NULL THEN
    UPDATE public.planner_handoffs
      SET is_synthetic_test = true,
          test_run_id = p_test_run_id,
          persona_id = p_persona_id
      WHERE id = p_handoff_id;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_planner_enquiry_v2(
  uuid, text, jsonb, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_planner_enquiry_v2(
  uuid, text, jsonb, uuid, text, text, text
) TO service_role;

DROP TRIGGER IF EXISTS update_synthetic_usability_sessions_updated_at
  ON public.synthetic_usability_sessions;
CREATE TRIGGER update_synthetic_usability_sessions_updated_at
  BEFORE UPDATE ON public.synthetic_usability_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

