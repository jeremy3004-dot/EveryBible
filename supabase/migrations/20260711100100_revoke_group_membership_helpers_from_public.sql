-- P0 SECURITY (follow-up): revoke drifted PUBLIC/anon EXECUTE on the group
-- membership/leadership helpers.
--
-- `is_group_member` and `is_group_leader` were introduced as SECURITY DEFINER
-- helpers in 20260704120000_fix_group_members_rls_recursion.sql with a targeted
-- `GRANT ... TO authenticated` but WITHOUT the accompanying
-- `REVOKE ... FROM PUBLIC, anon`. PostgreSQL grants EXECUTE to PUBLIC by default
-- on every CREATE FUNCTION, so both functions remained callable by anon — a
-- membership/leadership oracle: anyone can probe an arbitrary (group_id, user_id)
-- pair and learn a boolean membership fact.
--
-- The P0 sweep 20260710071844_revoke_public_execute_on_security_definer_functions.sql
-- fixed this class for eight other SECURITY DEFINER functions but did not cover
-- these two. This migration closes the same gap, following the established
-- pattern: REVOKE ALL FROM PUBLIC, anon, then GRANT only to the role that
-- legitimately calls them.
--
-- These helpers are invoked by the RLS policies on groups / group_members /
-- group_sessions / prayer_requests, which are evaluated for signed-in users, so
-- `authenticated` is the only client role that needs EXECUTE. Idempotent.

REVOKE ALL ON FUNCTION public.is_group_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_group_leader(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_group_leader(uuid, uuid) TO authenticated;
