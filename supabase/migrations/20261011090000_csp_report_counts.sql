-- Content-Security-Policy violation counts for the planner (security plan
-- step 7). public/_headers sends a report-only CSP whose report-uri and
-- report-to name the csp-report Edge Function; that function calls
-- record_csp_report_v1 with the service role. A week of these counts decides
-- when the policy can be enforced.
--
-- Only aggregates are kept: one row per UTC day, disposition, directive,
-- blocked origin (or CSP keyword), page (origin and path with ids masked)
-- and source origin, with a hit count. No IP, user agent, query, sample or
-- full URL is stored. A day holds at most 2,000 distinct rows, and the first
-- new row of each day removes rows older than 30 days.
--
-- Idempotent: it is applied on its own to a database that has drifted from
-- the repository's migrations.

CREATE TABLE IF NOT EXISTS public.csp_report_counts (
  day date NOT NULL,
  disposition text NOT NULL,
  directive text NOT NULL,
  blocked text NOT NULL,
  page text NOT NULL,
  source text NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, disposition, directive, blocked, page, source)
);

ALTER TABLE public.csp_report_counts ENABLE ROW LEVEL SECURITY;
-- No policies and no browser grants: staff read it in the SQL editor.
REVOKE ALL ON TABLE public.csp_report_counts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_csp_report_v1(
  p_disposition text,
  p_directive text,
  p_blocked text,
  p_page text,
  p_source text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_rows integer;
BEGIN
  IF p_disposition IS NULL OR p_directive IS NULL OR p_blocked IS NULL OR p_page IS NULL OR p_source IS NULL
     OR length(p_disposition) > 16 OR length(p_directive) > 64 OR length(p_blocked) > 200
     OR length(p_page) > 200 OR length(p_source) > 200 THEN
    RAISE EXCEPTION 'invalid_csp_report' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.csp_report_counts
     SET hits = LEAST(hits, 2147483646) + 1, last_seen = now()
   WHERE day = v_day AND disposition = p_disposition AND directive = p_directive
     AND blocked = p_blocked AND page = p_page AND source = p_source;
  IF FOUND THEN
    RETURN true;
  END IF;

  SELECT count(*) INTO v_rows FROM public.csp_report_counts WHERE day = v_day;
  IF v_rows >= 2000 THEN
    RETURN false;
  END IF;
  IF v_rows = 0 THEN
    DELETE FROM public.csp_report_counts WHERE day < v_day - 30;
  END IF;

  INSERT INTO public.csp_report_counts AS c (day, disposition, directive, blocked, page, source)
  VALUES (v_day, p_disposition, p_directive, p_blocked, p_page, p_source)
  ON CONFLICT (day, disposition, directive, blocked, page, source)
  DO UPDATE SET hits = LEAST(c.hits, 2147483646) + 1, last_seen = now();

  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_csp_report_v1(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_csp_report_v1(text, text, text, text, text) TO service_role;
