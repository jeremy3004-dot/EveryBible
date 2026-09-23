-- Security fix (audit 2026-09-24: M4, L1, L5): groups feature hardening. Applied to production 2026-09-23 23:32 UTC.
-- docs/research/supabase-security-audit-2026-09-24.md
--
-- M4 — UPDATE paths could move rows between groups or change who a row belongs to.
--   * prayer_update_creator (prayer_requests) had USING user_id = auth.uid() and no WITH
--     CHECK; "Session creators can update sessions" (group_sessions) only checked created_by.
--     A filtered PATCH was caught by Postgres re-applying the SELECT policy to the new row,
--     but an unfiltered PATCH with Prefer: return=minimal reads no columns, so only the
--     UPDATE policy applied and the author could set group_id to any group. Both policies
--     also kept working after the author left the group.
--   * "Leaders can update membership" (group_members) only re-checked leadership, so a
--     leader could rewrite user_id and enrol any profile without consent.
--   * "Leaders can update groups" re-checks is_group_leader(id), a STABLE function that sees
--     the pre-update snapshot, so a leader could hand leader_id to any profile.
--   Fix:
--   * BEFORE UPDATE triggers pin the scope columns for every role, including SECURITY
--     DEFINER code and the service role: prayer_requests (group_id, user_id), group_sessions
--     (group_id, created_by), group_members (group_id, user_id), groups (id).
--   * Prayer and session updates also require the author to still be a member.
--   * groups.leader_id can only change to a profile that is already a member of the group,
--     and group_members.role follows it (the only other writer is leave_group(), which
--     already promotes an existing member and keeps roles in sync).
--   * The client has no UPDATE path on group_members (src/services/groups never updates it),
--     so the leader UPDATE policy is dropped. Joining stays on join_group_by_code(), and
--     direct INSERT stays self-only for the creating leader (20260910093000).
--
-- L1 — is_group_member(p_group_id, p_user_id) / is_group_leader(...) were SECURITY DEFINER,
--   callable by authenticated through /rest/v1/rpc, and answered for any p_user_id: a
--   membership oracle. They are replaced by one-argument versions that always check the
--   caller (auth.uid()), every policy that used them is re-pointed, and the two-argument
--   versions are dropped. Checking your own membership reveals nothing new.
--
-- L5 — join_group_by_code() had no attempt limit on a 6-character code. It now records each
--   miss in private.group_join_attempts and refuses every call (even with a valid code, so it
--   stops being an oracle) once a user has 10 misses in the last hour. A miss returns NULL
--   instead of raising, because a raise would roll back the attempt row. The client already
--   treats NULL as "no group" (joinSyncedGroup in src/services/groups/groupService.ts). Codes
--   stay 6 characters so existing clients keep generating valid ones.
--
-- Production had 0 rows in groups, group_members, group_sessions, and prayer_requests on
-- 2026-09-24, so nothing existing is affected. Verified locally with
-- scripts/verify-group-policies-sql.mjs (PGlite).

-- ---------------------------------------------------------------------------------------------
-- Private schema for internals that must not be reachable through PostgREST.
-- ---------------------------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------------------------
-- L1: caller-only membership helpers.
-- ---------------------------------------------------------------------------------------------
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members members
    where members.group_id = p_group_id
      and members.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_group_leader(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.groups managed_groups
    where managed_groups.id = p_group_id
      and managed_groups.leader_id = (select auth.uid())
  );
$$;

revoke all on function public.is_group_member(uuid) from public, anon;
revoke all on function public.is_group_leader(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated, service_role;
grant execute on function public.is_group_leader(uuid) to authenticated, service_role;

-- Re-point every policy that used the two-argument helpers (live pg_depend, 2026-09-24).
drop policy if exists "Group members can view groups" on public.groups;
create policy "Group members can view groups" on public.groups
  for select using (public.is_group_member(groups.id));

-- The WITH CHECK sees the pre-update snapshot, so it cannot validate a new leader_id; the
-- guard_group_update trigger below does.
drop policy if exists "Leaders can update groups" on public.groups;
create policy "Leaders can update groups" on public.groups
  for update using (public.is_group_leader(groups.id))
  with check (public.is_group_leader(groups.id));

drop policy if exists "Group members can view membership" on public.group_members;
create policy "Group members can view membership" on public.group_members
  for select using (public.is_group_member(group_members.group_id));

drop policy if exists "Leaders can add group members directly" on public.group_members;
create policy "Leaders can add group members directly" on public.group_members
  for insert with check (
    user_id = (select auth.uid())
    and public.is_group_leader(group_members.group_id)
  );
comment on policy "Leaders can add group members directly" on public.group_members is
  'Direct membership INSERT is leader-only and self-only (S13). Ordinary joins go through the '
  'SECURITY DEFINER RPC public.join_group_by_code(), which requires the group join code.';

drop policy if exists "Users and leaders can leave groups" on public.group_members;
create policy "Users and leaders can leave groups" on public.group_members
  for delete using (
    user_id = (select auth.uid())
    or public.is_group_leader(group_members.group_id)
  );

-- M4: no client UPDATE path on membership rows (see header).
drop policy if exists "Leaders can update membership" on public.group_members;

drop policy if exists "Group members can view sessions" on public.group_sessions;
create policy "Group members can view sessions" on public.group_sessions
  for select using (public.is_group_member(group_sessions.group_id));

drop policy if exists "Group members can insert sessions" on public.group_sessions;
create policy "Group members can insert sessions" on public.group_sessions
  for insert with check (
    created_by = (select auth.uid())
    and public.is_group_member(group_sessions.group_id)
  );

-- M4: authors can edit a session only while they are still in its group.
drop policy if exists "Session creators can update sessions" on public.group_sessions;
create policy "Session creators can update sessions" on public.group_sessions
  for update using (
    created_by = (select auth.uid())
    and public.is_group_member(group_sessions.group_id)
  )
  with check (
    created_by = (select auth.uid())
    and public.is_group_member(group_sessions.group_id)
  );

-- M4: authors can edit a prayer request only while they are still in its group.
drop policy if exists "prayer_update_creator" on public.prayer_requests;
create policy "prayer_update_creator" on public.prayer_requests
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_group_member(prayer_requests.group_id)
  )
  with check (
    user_id = (select auth.uid())
    and public.is_group_member(prayer_requests.group_id)
  );

drop function if exists public.is_group_member(uuid, uuid);
drop function if exists public.is_group_leader(uuid, uuid);

-- ---------------------------------------------------------------------------------------------
-- M4: pin the columns that decide which group a row belongs to and whose it is.
-- ---------------------------------------------------------------------------------------------
-- Trigger arguments name the pinned columns. Fires for every role; nothing legitimate moves a
-- row to another group or another owner (delete and re-create instead).
create or replace function private.forbid_scope_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  pinned_column text;
begin
  foreach pinned_column in array tg_argv loop
    if (to_jsonb(new) -> pinned_column) is distinct from (to_jsonb(old) -> pinned_column) then
      raise exception '%.% cannot be changed', tg_table_name, pinned_column
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists forbid_scope_change on public.prayer_requests;
create trigger forbid_scope_change
  before update on public.prayer_requests
  for each row execute function private.forbid_scope_change('group_id', 'user_id');

drop trigger if exists forbid_scope_change on public.group_sessions;
create trigger forbid_scope_change
  before update on public.group_sessions
  for each row execute function private.forbid_scope_change('group_id', 'created_by');

drop trigger if exists forbid_scope_change on public.group_members;
create trigger forbid_scope_change
  before update on public.group_members
  for each row execute function private.forbid_scope_change('group_id', 'user_id');

drop trigger if exists forbid_scope_change on public.groups;
create trigger forbid_scope_change
  before update on public.groups
  for each row execute function private.forbid_scope_change('id');

-- M4: leadership can only pass to an existing member. SECURITY DEFINER so the membership
-- lookup does not depend on the caller's RLS view of group_members.
create or replace function private.guard_group_leader_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.leader_id is distinct from old.leader_id
     and not exists (
       select 1
       from public.group_members members
       where members.group_id = new.id
         and members.user_id = new.leader_id
     ) then
    raise exception 'The new group leader must already be a member of the group'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_group_leader_change on public.groups;
create trigger guard_group_leader_change
  before update of leader_id on public.groups
  for each row execute function private.guard_group_leader_change();

-- Keep group_members.role in step with groups.leader_id after a transfer.
create or replace function private.sync_group_leader_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.group_members
  set role = case when user_id = new.leader_id then 'leader' else 'member' end
  where group_id = new.id
    and role is distinct from case when user_id = new.leader_id then 'leader' else 'member' end;
  return null;
end;
$$;

drop trigger if exists sync_group_leader_role on public.groups;
create trigger sync_group_leader_role
  after update of leader_id on public.groups
  for each row
  when (old.leader_id is distinct from new.leader_id)
  execute function private.sync_group_leader_role();

revoke all on function private.forbid_scope_change() from public;
revoke all on function private.guard_group_leader_change() from public;
revoke all on function private.sync_group_leader_role() from public;

-- ---------------------------------------------------------------------------------------------
-- L5: rate-limit join codes.
-- ---------------------------------------------------------------------------------------------
create table if not exists private.group_join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists group_join_attempts_user_time_idx
  on private.group_join_attempts (user_id, attempted_at desc);
alter table private.group_join_attempts enable row level security;
revoke all on table private.group_join_attempts from public;

create or replace function public.join_group_by_code(group_join_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  matched_group_id uuid;
  recent_misses integer;
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Serialize one user's attempts so parallel calls cannot overshoot the limit.
  perform pg_advisory_xact_lock(
    hashtextextended('join_group_by_code:' || requesting_user_id::text, 0)
  );

  select count(*)
  into recent_misses
  from private.group_join_attempts attempts
  where attempts.user_id = requesting_user_id
    and attempts.attempted_at > now() - interval '1 hour';

  if recent_misses >= 10 then
    raise exception 'Too many join attempts. Try again later.'
      using errcode = 'P0001', hint = 'Wait an hour, then check the code with the group leader.';
  end if;

  select groups.id
  into matched_group_id
  from public.groups groups
  where groups.join_code = upper(trim(group_join_code))
    and groups.archived_at is null
  limit 1;

  if matched_group_id is null then
    delete from private.group_join_attempts attempts
    where attempts.user_id = requesting_user_id
      and attempts.attempted_at <= now() - interval '1 hour';
    insert into private.group_join_attempts (user_id) values (requesting_user_id);
    return null;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (matched_group_id, requesting_user_id, 'member')
  on conflict (group_id, user_id) do nothing;

  return matched_group_id;
end;
$$;

revoke all on function public.join_group_by_code(text) from public, anon;
grant execute on function public.join_group_by_code(text) to authenticated;

-- Post-apply check (read-only):
--   select policyname, cmd, qual, with_check from pg_policies
--   where schemaname = 'public'
--     and tablename in ('groups', 'group_members', 'group_sessions', 'prayer_requests');
--   -- expect no "Leaders can update membership", helpers called with one argument, and
--   -- prayer_update_creator / "Session creators can update sessions" with a WITH CHECK.
--   select tgrelid::regclass, tgname from pg_trigger
--   where tgname in ('forbid_scope_change', 'guard_group_leader_change', 'sync_group_leader_role');
