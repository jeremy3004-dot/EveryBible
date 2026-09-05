-- PostgREST verifies the bearer credential before selecting the caller's role.
-- SECURITY INVOKER is essential: current_user must remain the verified caller.
CREATE OR REPLACE FUNCTION public.authorize_engagement_refresh()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT current_user = 'service_role'; $$;

REVOKE ALL ON FUNCTION public.authorize_engagement_refresh() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_engagement_refresh() TO service_role;
