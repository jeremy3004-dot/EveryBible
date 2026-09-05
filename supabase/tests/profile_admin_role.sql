-- Run against a local or linked database as postgres. Every fixture rolls back.
BEGIN;
SET LOCAL statement_timeout = '10s';

DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.profiles', 'admin_role', 'INSERT')
     OR has_column_privilege('authenticated', 'public.profiles', 'admin_role', 'UPDATE')
     OR has_column_privilege('anon', 'public.profiles', 'admin_role', 'INSERT')
     OR has_column_privilege('anon', 'public.profiles', 'admin_role', 'UPDATE') THEN
    RAISE EXCEPTION 'Client roles must not be able to assign admin_role';
  END IF;
  IF NOT has_column_privilege('service_role', 'public.profiles', 'admin_role', 'UPDATE') THEN
    RAISE EXCEPTION 'Service role must retain role-management access';
  END IF;
END;
$$;

-- Signup trigger must still create the normal profile/progress/preferences rows.
SELECT set_config('test.profile_user_id', gen_random_uuid()::text, true);
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (current_setting('test.profile_user_id')::uuid, 'role-test@example.invalid', '{}');
SELECT set_config('request.jwt.claim.sub', current_setting('test.profile_user_id'), true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  denied boolean := false;
BEGIN
  -- The mobile sync upsert includes id in its update column list.
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (auth.uid(), 'role-test@example.invalid', 'Regression fixture', null)
  ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, email = EXCLUDED.email,
    display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url;

  BEGIN
    UPDATE public.profiles SET admin_role = 'super_admin' WHERE id = auth.uid();
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Self-promotion UPDATE was allowed'; END IF;

  denied := false;
  BEGIN
    INSERT INTO public.profiles (id, admin_role) VALUES (auth.uid(), 'super_admin')
    ON CONFLICT (id) DO UPDATE SET admin_role = EXCLUDED.admin_role;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Self-promotion INSERT/upsert was allowed'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                 AND display_name = 'Regression fixture' AND admin_role IS NULL) THEN
    RAISE EXCEPTION 'Normal profile update failed or the role changed';
  END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.profiles SET admin_role = 'super_admin'
WHERE id = current_setting('test.profile_user_id')::uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = current_setting('test.profile_user_id')::uuid
                 AND admin_role = 'super_admin') THEN
    RAISE EXCEPTION 'Authorized service role assignment failed';
  END IF;
END;
$$;
RESET ROLE;
SELECT 'PASS: signup, profile sync, denied client role writes, authorized service assignment' AS result;
ROLLBACK;
