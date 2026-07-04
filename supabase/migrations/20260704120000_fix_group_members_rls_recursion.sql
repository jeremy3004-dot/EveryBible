-- Health-check finding C1 remediation:
-- The SELECT policy on public.group_members is self-referencing
-- (EXISTS (SELECT 1 FROM public.group_members ...)), which makes Postgres
-- re-evaluate the same policy on the subquery and raises
-- 42P17 "infinite recursion detected in policy for relation group_members"
-- the moment synced groups are enabled. The groups and group_sessions SELECT
-- policies also read group_members, so the recursion cascades to every
-- group_service query.
--
-- Fix: introduce SECURITY DEFINER membership/leadership helpers (which bypass
-- RLS on their internal reads and therefore cannot recurse), then repoint the
-- affected policies to call the helpers instead of inlining self-referencing
-- or cross-referencing EXISTS clauses. Access semantics are preserved exactly:
--   * a user may see a group / its membership / its sessions iff they are a member
--   * a leader may create/update/delete groups and manage membership as before
--
-- The helpers pin search_path = public and are marked STABLE so the planner can
-- cache them per statement, matching the health-sweep (select auth.uid()) intent.

-- Membership check: does p_user_id belong to p_group_id?
-- SECURITY DEFINER bypasses RLS on the internal read, breaking the recursion.
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members members
    WHERE members.group_id = p_group_id
      AND members.user_id = p_user_id
  );
$$;

-- Leadership check: is p_user_id the leader of p_group_id?
CREATE OR REPLACE FUNCTION public.is_group_leader(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.groups managed_groups
    WHERE managed_groups.id = p_group_id
      AND managed_groups.leader_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_leader(uuid, uuid) TO authenticated;

-- groups: members can view their groups (was an inline EXISTS on group_members,
-- which cascaded into the recursive group_members policy).
DROP POLICY IF EXISTS "Group members can view groups" ON public.groups;
CREATE POLICY "Group members can view groups" ON public.groups
  FOR SELECT USING (
    public.is_group_member(groups.id, (select auth.uid()))
  );

-- groups: leader-only write policies (repointed to the helper for consistency;
-- semantics unchanged — leader_id must equal the caller).
DROP POLICY IF EXISTS "Leaders can update groups" ON public.groups;
CREATE POLICY "Leaders can update groups" ON public.groups
  FOR UPDATE USING (public.is_group_leader(groups.id, (select auth.uid())))
  WITH CHECK (public.is_group_leader(groups.id, (select auth.uid())));

-- group_members: the recursive SELECT policy. Repointed to the SECURITY DEFINER
-- helper so the membership visibility check no longer re-triggers RLS on
-- group_members. Semantics preserved: a caller sees a group's membership rows
-- iff they are themselves a member of that group.
DROP POLICY IF EXISTS "Group members can view membership" ON public.group_members;
CREATE POLICY "Group members can view membership" ON public.group_members
  FOR SELECT USING (
    public.is_group_member(group_members.group_id, (select auth.uid()))
  );

-- group_members: leader-managed UPDATE (was an inline EXISTS on groups; repointed
-- to is_group_leader — semantics unchanged).
DROP POLICY IF EXISTS "Leaders can update membership" ON public.group_members;
CREATE POLICY "Leaders can update membership" ON public.group_members
  FOR UPDATE USING (
    public.is_group_leader(group_members.group_id, (select auth.uid()))
  )
  WITH CHECK (
    public.is_group_leader(group_members.group_id, (select auth.uid()))
  );

-- group_members: DELETE — self-leave OR leader-removes-member. Repointed the
-- leader branch to the helper; the self-leave branch is unchanged.
DROP POLICY IF EXISTS "Users and leaders can leave groups" ON public.group_members;
CREATE POLICY "Users and leaders can leave groups" ON public.group_members
  FOR DELETE USING (
    user_id = (select auth.uid())
    OR public.is_group_leader(group_members.group_id, (select auth.uid()))
  );

-- group_sessions: members can view sessions (was an inline EXISTS on
-- group_members that cascaded into the recursive policy).
DROP POLICY IF EXISTS "Group members can view sessions" ON public.group_sessions;
CREATE POLICY "Group members can view sessions" ON public.group_sessions
  FOR SELECT USING (
    public.is_group_member(group_sessions.group_id, (select auth.uid()))
  );

-- group_sessions: members can insert their own sessions. Kept the created_by
-- self-check and moved the membership EXISTS to the helper. Semantics preserved:
-- a caller may insert a session iff created_by is themselves AND they are a member.
DROP POLICY IF EXISTS "Group members can insert sessions" ON public.group_sessions;
CREATE POLICY "Group members can insert sessions" ON public.group_sessions
  FOR INSERT WITH CHECK (
    created_by = (select auth.uid())
    AND public.is_group_member(group_sessions.group_id, (select auth.uid()))
  );
