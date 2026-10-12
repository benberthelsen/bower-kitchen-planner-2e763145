-- Approved trade accounts (security plan step 9). Groundwork only: nothing
-- reads this list for access yet, and no policy elsewhere changes here. A
-- later step restricts supplier pricing and jobs INSERT to
-- is_trade_or_staff(auth.uid()).
--
-- The owner approves each account by hand on admin Customers. The list starts
-- empty: nothing is backfilled from profiles.user_type (self-declared at
-- sign-up) or from job history.
--
-- Written to re-run safely; production does not record the planner's
-- migration files, so this file is applied on its own.

CREATE TABLE IF NOT EXISTS public.trade_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trade_accounts ENABLE ROW LEVEL SECURITY;

-- Approve = INSERT, revoke = DELETE; a row is never edited in place.
REVOKE ALL ON public.trade_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.trade_accounts TO authenticated;
GRANT ALL ON public.trade_accounts TO service_role;

-- Policies are created only when missing (no DROP), so the file re-runs
-- safely and applies without a destructive-statement confirmation.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trade_accounts'
                 AND policyname = 'Users can view own trade account') THEN
    CREATE POLICY "Users can view own trade account"
      ON public.trade_accounts FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
  -- The admin approval list needs every row.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trade_accounts'
                 AND policyname = 'Admins can view all trade accounts') THEN
    CREATE POLICY "Admins can view all trade accounts"
      ON public.trade_accounts FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
  -- An approval always names the admin who gave it.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trade_accounts'
                 AND policyname = 'Admins can approve trade accounts') THEN
    CREATE POLICY "Admins can approve trade accounts"
      ON public.trade_accounts FOR INSERT TO authenticated
      WITH CHECK (public.has_role(auth.uid(), 'admin') AND approved_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trade_accounts'
                 AND policyname = 'Admins can revoke trade accounts') THEN
    CREATE POLICY "Admins can revoke trade accounts"
      ON public.trade_accounts FOR DELETE TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- Approved trade account or Bower staff (admin/staff roles). SECURITY DEFINER
-- so a policy can call it for the signed-in user without that user reading
-- trade_accounts or user_roles.
CREATE OR REPLACE FUNCTION public.is_trade_or_staff(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.trade_accounts WHERE user_id = p_user)
    OR public.is_bower_staff(p_user)
  );
$$;

REVOKE ALL ON FUNCTION public.is_trade_or_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_trade_or_staff(uuid) TO authenticated, service_role;
