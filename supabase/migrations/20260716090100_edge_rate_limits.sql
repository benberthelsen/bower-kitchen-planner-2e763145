-- Durable shared rate limiting for public edge functions
-- (PRE-LIVE-AUDIT-2026-07-16 item 3; implementation-status "move rate limiting
-- to a durable shared store"). The previous limiter was per-function-instance
-- memory, so it reset on every cold start and never coordinated across
-- instances — inadequate for the paid ai-designer endpoint.
--
-- Fixed-window counter keyed by an opaque caller key (functions pass the
-- day-salted pseudonymous IP hash from the shared security helper — raw IPs
-- never reach this table). service_role only; no browser access.

CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0
);

ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: deny-by-default for anon/authenticated; service_role bypasses.

CREATE OR REPLACE FUNCTION public.bump_edge_rate_limit_v1(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_allowed boolean;
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 OR length(p_key) > 200
     OR p_limit IS NULL OR p_limit < 1
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 604800 THEN
    RAISE EXCEPTION 'invalid_rate_limit_args' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.edge_rate_limits AS r (key, window_start, hits)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    hits = CASE
      WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN 1
      ELSE r.hits + 1
    END,
    window_start = CASE
      WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN now()
      ELSE r.window_start
    END
  RETURNING hits <= p_limit INTO v_allowed;

  -- Opportunistic cleanup of stale windows (keys are day-salted, so rows
  -- naturally stop being touched after a day).
  IF random() < 0.02 THEN
    DELETE FROM public.edge_rate_limits WHERE window_start < now() - interval '2 days';
  END IF;

  RETURN v_allowed;
END;
$fn$;

REVOKE ALL ON FUNCTION public.bump_edge_rate_limit_v1(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_edge_rate_limit_v1(text, integer, integer) TO service_role;
