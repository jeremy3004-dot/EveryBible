-- Advisors recheck 2026-09-24 (docs/research/supabase-advisors-cleanup-2026-09-24.md,
-- "Recheck after today's migrations"). NOT yet applied to production — the lead applies it.
-- Verify first with scripts/verify-group-policies-sql.mjs (PGlite), which replays this file.
--
-- multiple_permissive_policies [WARN, performance] — new today.
--   20260924035926_groups_leader_read_and_leave_guard.sql added a second permissive SELECT
--   policy on public.groups, so every authenticated read of groups evaluates two policies:
--
--     "Group members can view groups"   FOR SELECT TO public
--        USING (private.is_group_member(id))
--     "Leaders can view their groups"   FOR SELECT TO authenticated
--        USING (leader_id = (select auth.uid()))
--
--   This file replaces both with one policy:
--
--     "Members and leaders can view groups"   FOR SELECT TO authenticated
--        USING (leader_id = (select auth.uid()) or private.is_group_member(id))
--
-- Why the result is the same:
--   * authenticated: Postgres combines permissive policies with OR, so the old visible set was
--     exactly "is_group_member(id) OR leader_id = auth.uid()". The new USING is that expression.
--     INSERT ... RETURNING (createSyncedGroup, G1) checks the same SELECT policy set, so the
--     leader still sees the row they just inserted before their membership row exists.
--     The cheap leader test comes first; OR arguments are evaluated left to right, so the
--     SECURITY DEFINER member lookup only runs for rows the caller does not lead.
--   * anon: anon has SELECT on groups but not EXECUTE on private.is_group_member (revoked in
--     20260711100100 / 20260923233220, kept by the private-schema move), so under the old
--     "TO public" policy every anon read of groups failed with 42501 and returned no row. With
--     no policy for anon, RLS now returns zero rows instead of an error. No row becomes
--     visible; the app only reads groups when signed in (src/services/groups/groupService.ts).
--   * service_role and the table owner bypass RLS, so they are unaffected.
--   * INSERT, UPDATE and DELETE policies on groups are untouched.
--
-- Idempotent: drops by name (old and new) before creating.

drop policy if exists "Group members can view groups" on public.groups;
drop policy if exists "Leaders can view their groups" on public.groups;
drop policy if exists "Members and leaders can view groups" on public.groups;

create policy "Members and leaders can view groups" on public.groups
  for select to authenticated
  using (leader_id = (select auth.uid()) or private.is_group_member(id));

comment on policy "Members and leaders can view groups" on public.groups is
  'Members see their groups; the current leader also sees their own group before their '
  'membership row exists (INSERT ... RETURNING in createSyncedGroup). Single permissive '
  'SELECT policy so the multiple_permissive_policies advisor stays clear.';

-- Post-apply check (read-only):
--   select policyname, roles, cmd, qual from pg_policies
--   where schemaname = 'public' and tablename = 'groups' and cmd = 'SELECT';
--   -- expect exactly one row: "Members and leaders can view groups", {authenticated}.
