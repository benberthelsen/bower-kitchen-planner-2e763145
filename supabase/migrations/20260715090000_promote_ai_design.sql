-- promote_ai_design_v1 (implementation plan §11.2): the single atomic write
-- behind the staff-only promote-ai-design Edge Function. Replaces the old
-- Admin Leads conversion that only flipped jobs.status to 'draft'.
--
-- The Edge Function owns recompilation, concept validation, the
-- proposalToTradeRoom conversion and repricing; this RPC owns authorization
-- re-checks, the row lock, idempotency and the transaction. Browsers never
-- call it (service_role only) and never supply TradeRooms directly.

CREATE OR REPLACE FUNCTION public.promote_ai_design_v1(
  p_job_id uuid,
  p_staff_user_id uuid,
  p_trade_room jsonb,
  p_promotion jsonb,
  p_proposal_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_session_id uuid;
  v_now_iso text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  -- 1. Staff-only, re-verified inside the transaction.
  IF p_staff_user_id IS NULL OR NOT public.is_bower_staff(p_staff_user_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;
  IF p_trade_room IS NULL OR jsonb_typeof(p_trade_room) <> 'object'
     OR (p_trade_room->>'id') IS NULL
     OR jsonb_typeof(p_trade_room->'cabinets') <> 'array'
     OR p_promotion IS NULL OR jsonb_typeof(p_promotion) <> 'object' THEN
    RAISE EXCEPTION 'invalid_promotion' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Lock the lead for the whole transaction.
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_job' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Idempotent replay: an already-promoted lead returns its existing room.
  IF v_job.design_data ? 'aiPromotion' THEN
    RETURN jsonb_build_object(
      'jobId', v_job.id,
      'tradeRoomId', v_job.design_data->'tradeRooms'->0->>'id',
      'alreadyPromoted', true
    );
  END IF;

  -- 4. Only enquiry leads without existing trade data can be promoted; a job
  --    someone already edited in the trade planner is never overwritten.
  IF v_job.status <> 'enquiry' OR v_job.design_data ? 'tradeRooms' THEN
    RAISE EXCEPTION 'invalid_job_status' USING ERRCODE = 'P0001';
  END IF;

  -- 5. Promotion only ADDS keys: the customer's original spec, items,
  --    priceBand and confirmed roomScan stay in design_data for audit
  --    (§11.2 step 9). Draft only — never quote- or production-approved.
  UPDATE public.jobs
    SET status = 'draft',
        design_data = COALESCE(v_job.design_data, '{}'::jsonb)
          || jsonb_build_object(
               'tradeRooms', jsonb_build_array(p_trade_room),
               'aiPromotion', p_promotion || jsonb_build_object(
                 'promotedBy', p_staff_user_id::text,
                 'promotedAt', v_now_iso
               ),
               'lastSyncedAt', v_now_iso
             )
    WHERE id = p_job_id;

  -- 6. Mark the stored proposal promoted and link its session to this job.
  IF p_proposal_id IS NOT NULL THEN
    UPDATE public.ai_design_proposals
      SET status = 'promoted', promoted_at = now()
      WHERE id = p_proposal_id AND status IN ('validated', 'selected')
      RETURNING session_id INTO v_session_id;
    IF v_session_id IS NOT NULL THEN
      UPDATE public.ai_designer_sessions
        SET job_id = COALESCE(job_id, p_job_id)
        WHERE id = v_session_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'jobId', p_job_id,
    'tradeRoomId', p_trade_room->>'id',
    'alreadyPromoted', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.promote_ai_design_v1(uuid, uuid, jsonb, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_ai_design_v1(uuid, uuid, jsonb, jsonb, uuid) TO service_role;
