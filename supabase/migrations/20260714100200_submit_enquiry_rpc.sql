-- Room scanner Phase 1A (master plan §6.4-6.5): restricted transaction RPCs.
-- submit_planner_enquiry_v1: one atomic transaction for job creation +
-- handoff consumption, idempotent under a durable submission key.
-- link_trade_handoff_v1: authenticated trade/staff linking after job creation.

CREATE OR REPLACE FUNCTION public.submit_planner_enquiry_v1(
  p_submission_key uuid,
  p_fingerprint text,
  p_job jsonb,
  p_handoff_id uuid DEFAULT NULL,
  p_token_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handoff public.planner_handoffs%ROWTYPE;
  v_job_id uuid;
  v_existing_id uuid;
  v_existing_fp text;
  v_scan jsonb;
BEGIN
  -- 1. Require key, fingerprint (sha256 hex) and job payload.
  IF p_submission_key IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_submission' USING ERRCODE = 'P0001';
  END IF;
  IF p_job IS NULL OR p_job->>'name' IS NULL THEN
    RAISE EXCEPTION 'invalid_submission' USING ERRCODE = 'P0001';
  END IF;

  -- 4. Any submitted room scan must be CONFIRMED (JSON invariant re-checked
  -- here; the edge function already ran the full Zod schema).
  v_scan := p_job->'design_data'->'roomScan';
  IF v_scan IS NOT NULL AND v_scan <> 'null'::jsonb THEN
    IF (v_scan->>'state') IS DISTINCT FROM 'confirmed'
       OR (v_scan->>'confirmedAt') IS NULL
       OR (v_scan->>'confirmedRevision') IS DISTINCT FROM (v_scan->>'roomRevision') THEN
      RAISE EXCEPTION 'unconfirmed_scan' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 2. Lock + verify the handoff when attached.
  IF p_handoff_id IS NOT NULL THEN
    SELECT * INTO v_handoff FROM public.planner_handoffs WHERE id = p_handoff_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_handoff' USING ERRCODE = 'P0001';
    END IF;
    IF v_handoff.public_token_hash IS NOT NULL
       AND (p_token_hash IS NULL OR v_handoff.public_token_hash <> p_token_hash) THEN
      RAISE EXCEPTION 'invalid_handoff' USING ERRCODE = 'P0001';
    END IF;
    IF v_handoff.expires_at IS NOT NULL AND v_handoff.expires_at < now() THEN
      RAISE EXCEPTION 'expired_handoff' USING ERRCODE = 'P0001';
    END IF;

    -- 3. Replay handling on an already-consumed handoff.
    IF v_handoff.consumed_at IS NOT NULL THEN
      IF v_handoff.submission_key = p_submission_key AND v_handoff.job_id IS NOT NULL THEN
        SELECT submission_fingerprint INTO v_existing_fp FROM public.jobs WHERE id = v_handoff.job_id;
        IF v_existing_fp = p_fingerprint THEN
          RETURN jsonb_build_object('jobId', v_handoff.job_id, 'idempotentReplay', true);
        END IF;
        RAISE EXCEPTION 'key_reuse' USING ERRCODE = 'P0001';
      END IF;
      RAISE EXCEPTION 'consumed_handoff' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 5. Insert; database uniqueness is the final concurrency guard.
  INSERT INTO public.jobs
    (name, notes, design_data, cost_excl_tax, cost_incl_tax, status, delivery_method,
     submission_key, submission_fingerprint)
  VALUES
    (p_job->>'name',
     p_job->>'notes',
     p_job->'design_data',
     COALESCE(NULLIF(p_job->>'cost_excl_tax', '')::numeric, 0),
     COALESCE(NULLIF(p_job->>'cost_incl_tax', '')::numeric, 0),
     COALESCE(p_job->>'status', 'enquiry'),
     COALESCE(p_job->>'delivery_method', 'pickup'),
     p_submission_key,
     p_fingerprint)
  ON CONFLICT ON CONSTRAINT jobs_submission_key_unique DO NOTHING
  RETURNING id INTO v_job_id;

  -- 6. Conflict → replay only when fingerprint and handoff context match.
  IF v_job_id IS NULL THEN
    SELECT id, submission_fingerprint INTO v_existing_id, v_existing_fp
      FROM public.jobs WHERE submission_key = p_submission_key;
    IF v_existing_id IS NOT NULL AND v_existing_fp = p_fingerprint THEN
      IF p_handoff_id IS NOT NULL THEN
        UPDATE public.planner_handoffs
          SET consumed_at = COALESCE(consumed_at, now()),
              job_id = COALESCE(job_id, v_existing_id),
              submission_key = COALESCE(submission_key, p_submission_key)
          WHERE id = p_handoff_id;
      END IF;
      RETURN jsonb_build_object('jobId', v_existing_id, 'idempotentReplay', true);
    END IF;
    RAISE EXCEPTION 'key_reuse' USING ERRCODE = 'P0001';
  END IF;

  -- 7. Consume + link the handoff in the same transaction.
  IF p_handoff_id IS NOT NULL THEN
    UPDATE public.planner_handoffs
      SET consumed_at = now(), job_id = v_job_id, submission_key = p_submission_key
      WHERE id = p_handoff_id;
  END IF;

  -- 8. Only the job id + replay flag leave the function.
  RETURN jsonb_build_object('jobId', v_job_id, 'idempotentReplay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_planner_enquiry_v1(uuid, text, jsonb, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_planner_enquiry_v1(uuid, text, jsonb, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.submit_planner_enquiry_v1(uuid, text, jsonb, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_planner_enquiry_v1(uuid, text, jsonb, uuid, text) TO service_role;

-- ── Trade linking (replaces the browser's direct UPDATE) ───────────────────
-- Caller must be Bower staff OR own the target job. Links only after the job
-- exists; never consumes on page load.
CREATE OR REPLACE FUNCTION public.link_trade_handoff_v1(
  p_handoff_id uuid,
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;

  SELECT public.is_bower_staff(auth.uid())
         OR EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id AND customer_id = auth.uid())
    INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id) THEN
    RAISE EXCEPTION 'invalid_job' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.planner_handoffs
    SET consumed_at = COALESCE(consumed_at, now()),
        job_id = COALESCE(job_id, p_job_id)
    WHERE id = p_handoff_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_handoff' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('linked', true);
END;
$$;

REVOKE ALL ON FUNCTION public.link_trade_handoff_v1(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_trade_handoff_v1(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.link_trade_handoff_v1(uuid, uuid) TO authenticated;
