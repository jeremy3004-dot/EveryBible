-- P0 SECURITY: Revoke drifted EXECUTE grants on SECURITY DEFINER functions.
--
-- Root cause: PostgreSQL grants EXECUTE to PUBLIC by default on every
-- CREATE [OR REPLACE] FUNCTION. Several SECURITY DEFINER functions were
-- (re)created over time without an accompanying REVOKE ... FROM PUBLIC, so the
-- PUBLIC and anon roles accumulated EXECUTE on privileged functions. Supabase
-- security advisors flag these as anon_security_definer_function_executable /
-- authenticated_security_definer_function_executable.
--
-- PATTERN FOR ALL FUTURE SECURITY DEFINER FUNCTIONS: every
-- `CREATE OR REPLACE FUNCTION` MUST be followed by
--     REVOKE ALL ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon;
-- and then a targeted GRANT only to the role(s) that legitimately call it
-- (authenticated for signed-in mobile RPCs, service_role for server/admin-only
-- functions). Never rely on the implicit PUBLIC grant.

-- === Admin analytics: service_role ONLY (never a client role). ===
REVOKE ALL ON FUNCTION public.get_admin_analytics_overview(TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics_overview(TIMESTAMPTZ, INTEGER) TO service_role;

-- === Shared mobile content: called only via the site API route with the
--     service-role key (apps/site/app/api/mobile/content/route.ts). The mobile
--     app fetches it over HTTP (EXPO_PUBLIC_CONTENT_API_URL), never as a direct
--     anon/authenticated RPC, so no client role needs EXECUTE. ===
REVOKE ALL ON FUNCTION public.get_live_mobile_content(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_mobile_content(TIMESTAMPTZ) TO service_role;

-- === Auth trigger function: fired by the AFTER INSERT trigger on auth.users.
--     Trigger execution does not require EXECUTE, so no client role should be
--     able to invoke it as an RPC. ===
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- === Signed-in mobile RPCs: authenticated ONLY (revoke anon + PUBLIC). ===
-- Verified call sites use the authenticated session client:
--   batch_track_events    -> src/services/analytics/analyticsService.ts:180
--   refresh_my_engagement -> src/services/analytics/analyticsService.ts:263
--   delete_my_account     -> src/services/account/accountService.ts:14
--   join_group_by_code    -> src/services/groups/groupService.ts:160
--   leave_group           -> src/services/groups/groupService.ts:180
REVOKE ALL ON FUNCTION public.batch_track_events(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch_track_events(JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.refresh_my_engagement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_my_engagement() TO authenticated;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

REVOKE ALL ON FUNCTION public.join_group_by_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_group_by_code(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.leave_group(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_group(UUID) TO authenticated;
