-- Keep the Bower office account authoritative across fresh environments.
-- The live account predates this migration, so make both the profile and role
-- changes idempotent.
DO $$
DECLARE
  v_user_id uuid;
  v_email text := 'info@bowercabinets.com';
BEGIN
  SELECT id
  INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Admin grant skipped: % does not exist in auth.users', v_email;
  ELSE
    INSERT INTO public.profiles (id, email, user_type, updated_at)
    VALUES (v_user_id, v_email, 'trade', now())
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        user_type = 'trade',
        updated_at = now();

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END
$$;
