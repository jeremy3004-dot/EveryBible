-- Audit 2026-09-24 L4: public buckets must not be listable by other users.
-- Run against a local or linked database as postgres. Every fixture rolls back.
-- Before 20260924150200_restrict_public_bucket_listing.sql this fails: avatar_select
-- (role public) let anyone list avatars/, whose folders are user UUIDs, and
-- content_images_public_read(_authenticated) let anyone list content-images/.
-- Public object URLs (/storage/v1/object/public/...) do not consult RLS, so they keep working.
BEGIN;
SET LOCAL statement_timeout = '10s';

SELECT set_config('test.owner_id', gen_random_uuid()::text, true);
SELECT set_config('test.other_id', gen_random_uuid()::text, true);

INSERT INTO storage.objects (bucket_id, name)
VALUES
  ('avatars', current_setting('test.owner_id') || '/avatar.jpg'),
  ('avatars', current_setting('test.other_id') || '/avatar.jpg'),
  ('content-images', 'devotionals/cover.jpg');

-- Anonymous callers see nothing in either bucket.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id IN ('avatars', 'content-images')) THEN
    RAISE EXCEPTION 'anon can still list avatars or content-images';
  END IF;
END;
$$;
RESET ROLE;

-- A signed-in user sees only their own avatar folder (needed for upsert and account deletion).
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.owner_id'), 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'avatars' AND name LIKE current_setting('test.other_id') || '/%'
  ) THEN
    RAISE EXCEPTION 'authenticated user can list another user''s avatar';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'avatars' AND name = current_setting('test.owner_id') || '/avatar.jpg'
  ) THEN
    RAISE EXCEPTION 'authenticated user cannot see their own avatar (upsert/delete would fail)';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'content-images') THEN
    RAISE EXCEPTION 'authenticated user can still list content-images';
  END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT (SELECT public FROM storage.buckets WHERE id = 'avatars')
     OR NOT (SELECT public FROM storage.buckets WHERE id = 'content-images') THEN
    RAISE EXCEPTION 'avatars and content-images must stay public buckets so public URLs resolve';
  END IF;
END;
$$;

SELECT 'PASS: public buckets serve URLs but cannot be enumerated' AS result;
ROLLBACK;
