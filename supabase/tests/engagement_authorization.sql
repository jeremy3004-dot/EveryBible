-- Read-only role regression; safe to execute without user fixtures.
BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.authorize_engagement_refresh();
    RAISE EXCEPTION 'Anonymous caller was authorized';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.authorize_engagement_refresh();
    RAISE EXCEPTION 'Authenticated caller was authorized';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF public.authorize_engagement_refresh() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Service caller was denied';
  END IF;
END;
$$;
RESET ROLE;
SELECT 'PASS: engagement RPC rejects client roles and accepts service role' AS result;
ROLLBACK;
