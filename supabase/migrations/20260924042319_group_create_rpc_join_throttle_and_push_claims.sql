-- Groups health check follow-ups (docs/research/groups-health-check-2026-09-24.md: G5, G6, G9).
-- NOT YET APPLIED. Synced groups are behind studyGroupsSync=false, the groups UI has no entry
-- point, and production had 0 rows in groups / group_members / group_sessions on 2026-09-24.
-- Verify first: PGLITE_MODULE=<pglite>/dist/index.js node scripts/verify-group-policies-sql.mjs
--
-- G9 — creating a group took two requests (groups row, then the leader's membership row). A
--   client killed in between left a group with no members. public.create_group() does both in
--   one transaction and draws the join code on the server (G6: codes came from Math.random on
--   the device). The client falls back to the two-request path while this RPC is missing.
--
-- G6 — join_group_by_code() limited misses to 10 per account per hour, so many accounts meant
--   many guesses. Two more limits, both refusing even a correct code once hit (no oracle):
--   * per client address: 30 misses an hour. Joining is a plain PostgREST RPC, so the address
--     comes from request.headers: cf-connecting-ip (set by Cloudflare in front of the API), else
--     x-real-ip. x-forwarded-for is never read: the client can prepend anything to it. When
--     neither header is present or parses as an address, only the other limits apply. Only a
--     SHA-256 of the address is stored, and rows are pruned after an hour.
--   * globally: once 300 misses land in an hour, accounts younger than 24 hours are refused.
--     Established accounts keep joining during an attack, so the global budget cannot be used
--     to lock everyone out; fresh throwaway accounts are what a many-accounts attack needs.
--   A per-code counter was considered and rejected: guesses are for codes that do not exist, so
--   there is no per-code row to count against.
--
-- G5 — send-group-notification pushed caller-supplied title/body text (up to 2,000 chars) to
--   every member. The updated function sends only server-composed text for one event (a
--   recorded session) and first calls public.claim_group_session_notification(), which is
--   service-role only and checks, atomically:
--   * the session exists, is in the requested group, and was recorded by the caller;
--   * the caller is still a member;
--   * the session is under 15 minutes old (no replaying old sessions);
--   * no push was sent for this session, or for the same lesson in this group in the last 12
--     hours (several members recording one meeting push once — G11);
--   * the caller has sent fewer than 5 pushes in the last hour, and the group fewer than 10 in
--     the last day.
--   It returns the group name and the other members with their interface language, so the
--   function writes each push in the recipient's language rather than the sender's.

-- -------------------------------------------------------------------------------------------
-- G9: create_group()
-- -------------------------------------------------------------------------------------------

-- Six characters from the client's unambiguous 32-letter alphabet. Each character takes one
-- byte of a v4 UUID (pg_strong_random); 256 is a multiple of 32, so there is no modulo bias.
-- Bytes 0-5 are fully random (the version and variant bits live in bytes 6 and 8).
create or replace function private.new_group_join_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', get_byte(random_bytes.b, position) % 32 + 1, 1),
    '' order by position
  )
  from (select uuid_send(gen_random_uuid()) as b) random_bytes,
       generate_series(0, 5) as position;
$$;
revoke all on function private.new_group_join_code() from public;

create or replace function public.create_group(
  group_name text,
  starting_course_id text default 'entry-course',
  starting_lesson_id text default 'entry-1'
)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  created_group public.groups;
  attempt integer := 0;
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if char_length(coalesce(starting_course_id, '')) > 64
     or char_length(coalesce(starting_lesson_id, '')) > 64 then
    raise exception 'Course or lesson id is too long' using errcode = '22001';
  end if;

  loop
    attempt := attempt + 1;
    begin
      insert into public.groups (name, leader_id, join_code, current_course_id, current_lesson_id)
      values (
        trim(group_name),
        requesting_user_id,
        private.new_group_join_code(),
        coalesce(nullif(trim(starting_course_id), ''), 'entry-course'),
        coalesce(nullif(trim(starting_lesson_id), ''), 'entry-1')
      )
      returning * into created_group;
      exit;
    exception when unique_violation then
      if attempt >= 5 then
        raise exception 'Unable to reserve a unique join code' using errcode = 'P0001';
      end if;
    end;
  end loop;

  insert into public.group_members (group_id, user_id, role, joined_at)
  values (created_group.id, requesting_user_id, 'leader', created_group.created_at);

  return created_group;
end;
$$;

revoke all on function public.create_group(text, text, text) from public, anon;
grant execute on function public.create_group(text, text, text) to authenticated;
comment on function public.create_group(text, text, text) is
  'Creates a group and its leader membership in one transaction, with a server-drawn join code '
  '(groups health check G9/G6). Returns the new groups row.';

-- -------------------------------------------------------------------------------------------
-- G6: per-address and global join-code limits
-- -------------------------------------------------------------------------------------------

alter table private.group_join_attempts add column if not exists client_key text;
create index if not exists group_join_attempts_client_time_idx
  on private.group_join_attempts (client_key, attempted_at desc)
  where client_key is not null;
create index if not exists group_join_attempts_time_idx
  on private.group_join_attempts (attempted_at);

-- SHA-256 of the caller's address from the headers PostgREST exposes, or null. Only
-- cf-connecting-ip and x-real-ip are trusted; x-forwarded-for is client-controlled.
create or replace function private.request_client_key(key_scope text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  request_headers jsonb;
  raw_address text;
  address inet;
begin
  begin
    request_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;

  raw_address := coalesce(
    nullif(btrim(request_headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(request_headers ->> 'x-real-ip'), '')
  );
  if raw_address is null or char_length(raw_address) > 64 then
    return null;
  end if;

  begin
    address := raw_address::inet;
  exception when others then
    return null;
  end;

  return encode(sha256(convert_to(key_scope || ':' || host(address), 'UTF8')), 'hex');
end;
$$;
revoke all on function private.request_client_key(text) from public;

create or replace function public.join_group_by_code(group_join_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user_id uuid := auth.uid();
  requesting_client_key text := private.request_client_key('group-join');
  account_created_at timestamptz;
  matched_group_id uuid;
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Serialize one user's (and one address's) attempts so parallel calls cannot overshoot.
  perform pg_advisory_xact_lock(
    hashtextextended('join_group_by_code:' || requesting_user_id::text, 0)
  );
  if requesting_client_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('join_group_by_code:' || requesting_client_key, 0)
    );
  end if;

  if (
    select count(*)
    from private.group_join_attempts attempts
    where attempts.user_id = requesting_user_id
      and attempts.attempted_at > now() - interval '1 hour'
  ) >= 10
  or (
    requesting_client_key is not null
    and (
      select count(*)
      from private.group_join_attempts attempts
      where attempts.client_key = requesting_client_key
        and attempts.attempted_at > now() - interval '1 hour'
    ) >= 30
  ) then
    raise exception 'Too many join attempts. Try again later.'
      using errcode = 'P0001', hint = 'Wait an hour, then check the code with the group leader.';
  end if;

  -- Global budget: counted without a lock, so a burst can overshoot it slightly.
  if (
    select count(*)
    from private.group_join_attempts attempts
    where attempts.attempted_at > now() - interval '1 hour'
  ) >= 300 then
    select users.created_at into account_created_at
    from auth.users users
    where users.id = requesting_user_id;

    if coalesce(account_created_at, now()) > now() - interval '24 hours' then
      raise exception 'Too many join attempts. Try again later.'
        using errcode = 'P0001', hint = 'Wait an hour, then check the code with the group leader.';
    end if;
  end if;

  select groups.id
  into matched_group_id
  from public.groups groups
  where groups.join_code = upper(trim(group_join_code))
    and groups.archived_at is null
  limit 1;

  if matched_group_id is null then
    delete from private.group_join_attempts attempts
    where attempts.attempted_at <= now() - interval '1 hour';
    insert into private.group_join_attempts (user_id, client_key)
    values (requesting_user_id, requesting_client_key);
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

-- -------------------------------------------------------------------------------------------
-- G5: one server-checked claim per session push
-- -------------------------------------------------------------------------------------------

create table if not exists private.group_session_notifications (
  session_id uuid primary key,
  group_id uuid not null,
  course_id text not null,
  lesson_id text not null,
  sender_id uuid not null,
  sent_at timestamptz not null default now()
);
create index if not exists group_session_notifications_group_time_idx
  on private.group_session_notifications (group_id, sent_at desc);
create index if not exists group_session_notifications_sender_time_idx
  on private.group_session_notifications (sender_id, sent_at desc);
alter table private.group_session_notifications enable row level security;
revoke all on table private.group_session_notifications from public;

create or replace function public.claim_group_session_notification(
  p_session_id uuid,
  p_group_id uuid,
  p_sender_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.group_sessions;
  claimed_group_name text;
  claimed_recipients jsonb;
begin
  select * into session_row
  from public.group_sessions sessions
  where sessions.id = p_session_id;

  if not found
     or session_row.group_id is distinct from p_group_id
     or session_row.created_by is distinct from p_sender_id then
    return jsonb_build_object('status', 'not_found');
  end if;

  if not exists (
    select 1
    from public.group_members members
    where members.group_id = session_row.group_id
      and members.user_id = p_sender_id
  ) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  if session_row.created_at < now() - interval '15 minutes' then
    return jsonb_build_object('status', 'stale');
  end if;

  -- One claim at a time per group, so the checks below cannot race.
  perform pg_advisory_xact_lock(
    hashtextextended('claim_group_session_notification:' || session_row.group_id::text, 0)
  );

  if exists (
    select 1
    from private.group_session_notifications sent
    where sent.session_id = session_row.id
       or (
         sent.group_id = session_row.group_id
         and sent.course_id = session_row.course_id
         and sent.lesson_id = session_row.lesson_id
         and sent.sent_at > now() - interval '12 hours'
       )
  ) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  if (
    select count(*)
    from private.group_session_notifications sent
    where sent.sender_id = p_sender_id
      and sent.sent_at > now() - interval '1 hour'
  ) >= 5
  or (
    select count(*)
    from private.group_session_notifications sent
    where sent.group_id = session_row.group_id
      and sent.sent_at > now() - interval '24 hours'
  ) >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  delete from private.group_session_notifications sent
  where sent.sent_at < now() - interval '2 days';
  insert into private.group_session_notifications
    (session_id, group_id, course_id, lesson_id, sender_id)
  values
    (session_row.id, session_row.group_id, session_row.course_id, session_row.lesson_id, p_sender_id);

  select groups.name into claimed_group_name
  from public.groups groups
  where groups.id = session_row.group_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('user_id', members.user_id, 'language', preferences.language)
      order by members.user_id
    ),
    '[]'::jsonb
  )
  into claimed_recipients
  from public.group_members members
  left join public.user_preferences preferences on preferences.user_id = members.user_id
  where members.group_id = session_row.group_id
    and members.user_id <> p_sender_id;

  return jsonb_build_object(
    'status', 'ok',
    'group_id', session_row.group_id,
    'group_name', claimed_group_name,
    'recipients', claimed_recipients
  );
end;
$$;

revoke all on function public.claim_group_session_notification(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_group_session_notification(uuid, uuid, uuid)
  to service_role;
comment on function public.claim_group_session_notification(uuid, uuid, uuid) is
  'Service role only (send-group-notification). Records one push for a fresh session the sender '
  'recorded, within per-session, per-lesson, per-sender and per-group limits (groups health '
  'check G5), and returns the group name and recipients with their language.';

-- Post-apply check (read-only):
--   select proname, prosecdef, proacl from pg_proc
--   where proname in ('create_group', 'join_group_by_code', 'claim_group_session_notification',
--                     'new_group_join_code', 'request_client_key');
--   -- create_group / join_group_by_code: authenticated only; claim_...: service_role only.
--   select column_name from information_schema.columns
--   where table_schema = 'private' and table_name = 'group_join_attempts';  -- has client_key
