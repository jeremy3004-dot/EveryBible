-- Audit 2026-09-24 L8: profiles.email must mirror auth.users.email and created_at must not be
-- client-writable. Run against a local or linked database as postgres. Every fixture rolls back.
-- Before 20260924150300_protect_profile_email.sql this fails: authenticated could set
-- profiles.email to any address (apps/admin support search and identity read that column).
BEGIN;
SET LOCAL statement_timeout = '10s';

DO $$
BEGIN
  IF has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.profiles', 'created_at', 'INSERT')
     OR has_column_privilege('anon', 'public.profiles', 'created_at', 'UPDATE') THEN
    RAISE EXCEPTION 'Client roles must not write profiles.created_at';
  END IF;
END;
$$;

SELECT set_config('test.user_id', gen_random_uuid()::text, true);
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (current_setting('test.user_id')::uuid, 'owner@example.invalid', '{}');

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.user_id'), 'role', 'authenticated')::text,
  true
);
SELECT set_config('request.jwt.claim.sub', current_setting('test.user_id'), true);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  -- Shape of the mobile sync upsert in already-shipped app builds (it sends email). It must
  -- keep succeeding, but the stored email must come from auth.users.
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (auth.uid(), 'spoofed@example.invalid', 'Integrity fixture', null)
  ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id, email = EXCLUDED.email,
    display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url;

  IF (SELECT email FROM public.profiles WHERE id = auth.uid()) <> 'owner@example.invalid' THEN
    RAISE EXCEPTION 'Upsert stored a client-supplied email';
  END IF;

  UPDATE public.profiles SET email = 'spoofed@example.invalid' WHERE id = auth.uid();
  IF (SELECT email FROM public.profiles WHERE id = auth.uid()) <> 'owner@example.invalid' THEN
    RAISE EXCEPTION 'Direct UPDATE changed profiles.email';
  END IF;

  IF (SELECT display_name FROM public.profiles WHERE id = auth.uid()) <> 'Integrity fixture' THEN
    RAISE EXCEPTION 'Normal profile fields must still be writable';
  END IF;
END;
$$;
RESET ROLE;

-- An address change in Auth propagates to the profile.
UPDATE auth.users SET email = 'changed@example.invalid'
WHERE id = current_setting('test.user_id')::uuid;
DO $$
BEGIN
  IF (SELECT email FROM public.profiles WHERE id = current_setting('test.user_id')::uuid)
     <> 'changed@example.invalid' THEN
    RAISE EXCEPTION 'profiles.email did not follow auth.users.email';
  END IF;
END;
$$;

SELECT 'PASS: profiles.email mirrors auth.users and ignores client writes' AS result;
ROLLBACK;
