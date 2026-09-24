-- Groups health check 2026-09-24 (docs/research/groups-health-check-2026-09-24.md, G1 and G2).
-- Applied to production 2026-09-24 (version 20260924035926).
-- had 0 rows in groups / group_members / group_sessions on 2026-09-24, so applying it changes
-- no existing data. Verify with scripts/verify-group-policies-sql.mjs (PGlite) first.
--
-- G1 [High, latent] — creating a synced group always failed.
--   createSyncedGroup (src/services/groups/groupService.ts) inserts the groups row with
--   `.insert(...).select('*').single()`. PostgREST runs that as INSERT ... RETURNING, and
--   Postgres requires a returned row to pass the table's SELECT policies. The only SELECT
--   policy on groups is "Group members can view groups" (is_group_member(id)), and the
--   leader's group_members row is inserted in the next request, so every create failed with
--   "new row violates row-level security policy for table groups" (42501) before a group
--   existed. The existing verifier inserted without RETURNING and so never saw it.
--   Fix: the current leader may read their own group. leader_id only ever names a member
--   once creation finishes (guard_group_leader_change, leave_group), so this exposes nothing
--   a member could not already read.
--
-- G2 [Medium] — a leader could leave without handing over leadership.
--   "Users and leaders can leave groups" let anyone delete their own membership row. A leader
--   doing that directly (instead of calling leave_group()) left groups.leader_id pointing at
--   them: the group had no leader among its members, nobody could advance its lesson, and the
--   departed leader kept every is_group_leader() right — deleting the group, removing members,
--   and re-adding themselves through "Leaders can add group members directly".
--   Fix: the current leader cannot delete their own membership row; they leave through
--   leave_group(), which hands leadership to the longest-standing member or deletes the group
--   when they were the last one. leave_group() is SECURITY DEFINER (owner bypasses RLS) and
--   cascading deletes from groups are not subject to RLS, so both keep working. Members still
--   leave directly or through the RPC, and leaders can still remove other members.

drop policy if exists "Leaders can view their groups" on public.groups;
create policy "Leaders can view their groups" on public.groups
  for select to authenticated
  using (leader_id = (select auth.uid()));

drop policy if exists "Users and leaders can leave groups" on public.group_members;
create policy "Users and leaders can leave groups" on public.group_members
  for delete using (
    (
      user_id = (select auth.uid())
      and not public.is_group_leader(group_members.group_id)
    )
    or (
      user_id <> (select auth.uid())
      and public.is_group_leader(group_members.group_id)
    )
  );
comment on policy "Users and leaders can leave groups" on public.group_members is
  'Members may remove themselves; the leader may remove other members. The leader leaves only '
  'through public.leave_group(), which hands leadership over or deletes an empty group (G2).';

-- Post-apply check (read-only):
--   select policyname, cmd, qual from pg_policies
--   where schemaname = 'public' and tablename in ('groups', 'group_members')
--   order by tablename, cmd;
--   -- expect "Leaders can view their groups" (SELECT) on groups and the new DELETE qual above.
