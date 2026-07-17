-- Pre-live audit repairs (PRE-LIVE-AUDIT-2026-07-16 P1.1 / P2.6):
-- 1. Production rejected anonymous funnel_events inserts with 403 — re-assert
--    the table grants and the anon INSERT policy idempotently so wizard
--    analytics work again. RLS policies need matching table privileges.
-- 2. Funnel analytics were readable by EVERY authenticated user (including
--    trade customers). Restrict SELECT to Bower staff.

GRANT INSERT ON public.funnel_events TO anon, authenticated;
GRANT SELECT ON public.funnel_events TO authenticated;

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon can insert funnel events" ON public.funnel_events;
CREATE POLICY "anon can insert funnel events"
  ON public.funnel_events FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated can read funnel events" ON public.funnel_events;
DROP POLICY IF EXISTS "staff can read funnel events" ON public.funnel_events;
CREATE POLICY "staff can read funnel events"
  ON public.funnel_events FOR SELECT TO authenticated
  USING (public.is_bower_staff(auth.uid()));
