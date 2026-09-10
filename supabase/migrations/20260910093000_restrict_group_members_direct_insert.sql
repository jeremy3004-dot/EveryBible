-- S13 [Low] — public.group_members INSERT policy allowed self-enrolment into ANY group.
--
-- The policy "Users can join groups as themselves" was introduced in
-- 20260306000000_group_sync_foundation.sql:66-67 and re-created (only to wrap auth.uid() in
-- a scalar subquery) in 20260321060000_health_sweep_rls_policy_optimizations.sql:76-78 as:
--
--     FOR INSERT WITH CHECK (user_id = (select auth.uid()))
--
-- The check constrains WHO is being added but not WHICH group. Any authenticated user who
-- learns or guesses a group's UUID can therefore INSERT themselves into it directly through
-- PostgREST, bypassing public.join_group_by_code() and its join-code secret entirely — and
-- once the row exists the SELECT policies (via public.is_group_member) hand them that
-- group's membership list and every group_sessions row.
--
-- Fix: an ordinary user may no longer insert their own membership row at all; that path is
-- the RPC. Leaders keep direct INSERT so they can add members to a group they own.
--
--     FOR INSERT WITH CHECK (user_id = (select auth.uid())
--                            AND public.is_group_leader(group_id, (select auth.uid())))
--
-- Why this does not break joining:
--   * public.join_group_by_code(TEXT) (20260306000000_group_sync_foundation.sql:123-154) is
--     SECURITY DEFINER with `SET search_path = ''`, owned by postgres. Its
--     `INSERT INTO public.group_members ... ON CONFLICT DO NOTHING` therefore executes as the
--     table owner, and Postgres does not apply row level security to a table's owner unless
--     the table is declared FORCE ROW LEVEL SECURITY (it is not). The RPC is unaffected by
--     this policy, and it is the only sanctioned join path: it resolves the group by
--     join_code, rejects archived groups, and inserts role 'member'.
--   * The only direct client-side insert is group creation —
--     src/services/groups/groupService.ts:131-138 inserts the leader's own membership row
--     immediately after inserting the groups row with leader_id = the caller. is_group_leader
--     is true for that row, so creation still succeeds.
--   * Synced groups are still behind the studyGroupsSync=false flag, so no production traffic
--     depends on the old behaviour today.
--
-- public.is_group_leader(uuid, uuid) is the SECURITY DEFINER STABLE helper from
-- 20260704120000_fix_group_members_rls_recursion.sql; using it (rather than an inline EXISTS
-- on public.groups) keeps this policy out of the RLS recursion that migration fixed, and it
-- is already GRANTed to authenticated there.

DROP POLICY IF EXISTS "Users can join groups as themselves" ON public.group_members;

CREATE POLICY "Leaders can add group members directly" ON public.group_members
  FOR INSERT WITH CHECK (
    user_id = (select auth.uid())
    AND public.is_group_leader(group_members.group_id, (select auth.uid()))
  );

COMMENT ON POLICY "Leaders can add group members directly" ON public.group_members IS
  'Direct membership INSERT is leader-only (S13). Ordinary joins go through the SECURITY '
  'DEFINER RPC public.join_group_by_code(), which requires the group join code.';
