-- Prayer wall health check 2026-09-24 (docs/research/prayer-wall-health-check-2026-09-24.md).
-- Production had 0 rows in prayer_requests and prayer_interactions on 2026-09-24 and the prayer
-- wall is not reachable in the app, so applying this changes no existing data. Verify with
-- scripts/verify-prayer-wall-sql.mjs (PGlite) first.
--
-- PW1 [Medium] Deleting a group leader's account erased the whole group.
--   groups.leader_id references profiles ON DELETE CASCADE, and delete_my_account() deletes the
--   auth user, so every group the user led was deleted with them, and with it every other
--   member's prayer requests, interactions and sessions. A BEFORE DELETE trigger on profiles
--   now hands each group the user leads to its longest-standing other member first (the same
--   choice leave_group() makes). A group with no other member is still deleted by the cascade.
--   It is a trigger, like forget_deleted_profile (20260924041136), so it also covers accounts
--   deleted from the dashboard or the admin API, where auth.uid() is not the user. The user's
--   own requests and interactions still go with the account (user_id cascades).
--
-- PW2 [Medium] Timestamps were client-controlled.
--   The wall is ordered by created_at DESC. The INSERT and UPDATE policies let the author write
--   created_at, so a request dated 2099 stayed pinned to the top of the group's wall. answered_at
--   could be any value and did not have to agree with is_answered. The server now sets
--   created_at on insert and keeps it on update, sets answered_at when a request becomes
--   answered, keeps it while it stays answered, and clears it when it is un-answered.
--   is_answered can no longer be NULL.
--
-- PW3 [Medium] No posting limit.
--   Any member could post without limit to every group they belong to. Each author may now post
--   10 requests per rolling hour and 30 per rolling day, across all groups. Over the limit the
--   insert fails with SQLSTATE PT429 (PostgREST answers HTTP 429) and the message
--   'prayer_request_rate_limited', which the app maps to a translated notice. Interactions are
--   already capped at one per user, type and request by their unique key and notify nobody, so
--   they are not limited.
--
-- PW4 [Low] Whitespace-only requests passed the 1..500 length check. They are now rejected.
--
-- PW5 [Info] Client roles held TRUNCATE, REFERENCES and TRIGGER on both tables (Supabase
--   defaults). TRUNCATE ignores RLS; PostgREST does not expose it, but nothing needs it.
--   anon has no policy on either table, so it loses every privilege on them.

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------------------------
-- PW4 + PW2: content and answered flag constraints.
-- ---------------------------------------------------------------------------------------------
alter table public.prayer_requests
  drop constraint if exists prayer_requests_content_not_blank;
alter table public.prayer_requests
  add constraint prayer_requests_content_not_blank check (content ~ '[^[:space:]]');

update public.prayer_requests set is_answered = false where is_answered is null;
alter table public.prayer_requests alter column is_answered set default false;
alter table public.prayer_requests alter column is_answered set not null;

-- ---------------------------------------------------------------------------------------------
-- PW2: server-owned timestamps.
-- ---------------------------------------------------------------------------------------------
create or replace function private.stamp_prayer_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.is_answered := coalesce(new.is_answered, false);

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.answered_at := case when new.is_answered then now() end;
    return new;
  end if;

  new.created_at := old.created_at;
  new.answered_at := case
    when not new.is_answered then null
    when old.is_answered then old.answered_at
    else now()
  end;
  return new;
end;
$$;

drop trigger if exists stamp_prayer_request on public.prayer_requests;
create trigger stamp_prayer_request
  before insert or update on public.prayer_requests
  for each row execute function private.stamp_prayer_request();

-- ---------------------------------------------------------------------------------------------
-- PW3: posting limit. SECURITY DEFINER so the count sees every row by the author, including
-- rows in groups they have since left, whatever the caller's RLS view.
-- ---------------------------------------------------------------------------------------------
create index if not exists idx_prayer_requests_user_created
  on public.prayer_requests (user_id, created_at desc);
-- The new index leads with user_id, so it also serves every lookup the old one did.
drop index if exists public.idx_prayer_requests_user;

create or replace function private.limit_prayer_request_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  posted_last_hour integer;
  posted_last_day integer;
begin
  -- Serialise concurrent inserts by one author so a burst cannot slip past the count.
  perform pg_advisory_xact_lock(hashtextextended('prayer_request_rate:' || new.user_id::text, 0));

  select
    count(*) filter (where created_at > now() - interval '1 hour'),
    count(*)
  into posted_last_hour, posted_last_day
  from public.prayer_requests
  where user_id = new.user_id
    and created_at > now() - interval '1 day';

  if posted_last_hour >= 10 or posted_last_day >= 30 then
    raise exception 'prayer_request_rate_limited'
      using errcode = 'PT429',
            hint = 'An author may share 10 prayer requests per hour and 30 per day.';
  end if;

  return new;
end;
$$;

revoke all on function private.limit_prayer_request_rate() from public, anon, authenticated;
revoke all on function private.stamp_prayer_request() from public, anon, authenticated;

drop trigger if exists limit_prayer_request_rate on public.prayer_requests;
create trigger limit_prayer_request_rate
  before insert on public.prayer_requests
  for each row execute function private.limit_prayer_request_rate();

-- ---------------------------------------------------------------------------------------------
-- PW1: hand groups over before the account (and its profile) is deleted.
-- ---------------------------------------------------------------------------------------------
create or replace function private.hand_over_groups_of_deleted_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  led_group record;
  successor uuid;
begin
  for led_group in
    select id from public.groups where leader_id = old.id
  loop
    select members.user_id
    into successor
    from public.group_members members
    where members.group_id = led_group.id
      and members.user_id <> old.id
    order by members.joined_at asc, members.user_id
    limit 1;

    -- guard_group_leader_change accepts the successor because they are a member, and
    -- sync_group_leader_role moves the 'leader' role to them.
    if successor is not null then
      update public.groups
      set leader_id = successor,
          updated_at = now()
      where id = led_group.id;
    end if;
  end loop;

  return old;
end;
$$;

revoke all on function private.hand_over_groups_of_deleted_profile()
  from public, anon, authenticated;

drop trigger if exists hand_over_groups_of_deleted_profile on public.profiles;
create trigger hand_over_groups_of_deleted_profile
  before delete on public.profiles
  for each row execute function private.hand_over_groups_of_deleted_profile();

-- ---------------------------------------------------------------------------------------------
-- PW5: privileges nobody uses.
-- ---------------------------------------------------------------------------------------------
revoke all on table public.prayer_requests, public.prayer_interactions from anon;
revoke truncate, references, trigger
  on table public.prayer_requests, public.prayer_interactions from authenticated;

-- Post-apply checks (read-only):
--   select tgname from pg_trigger where tgrelid = 'public.prayer_requests'::regclass
--     and not tgisinternal order by 1;
--   -- forbid_scope_change, limit_prayer_request_rate, stamp_prayer_request,
--   -- update_prayer_requests_updated_at
--   select conname from pg_constraint where conrelid = 'public.prayer_requests'::regclass;
--   -- includes prayer_requests_content_not_blank
--   select grantee, string_agg(privilege_type, ',') from information_schema.role_table_grants
--    where table_name in ('prayer_requests', 'prayer_interactions') group by grantee;
--   -- anon absent; authenticated DELETE,INSERT,SELECT,UPDATE
--   select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass
--     and tgname = 'hand_over_groups_of_deleted_profile';  -- one row
