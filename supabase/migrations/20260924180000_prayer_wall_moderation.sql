-- Prayer wall moderation (2026-09-24): App Store Guideline 1.2 (user-generated content).
-- docs/research/prayer-wall-moderation-2026-09-24.md
--
-- Apple asks an app with user-generated content for four things: a way to report objectionable
-- content, a way to block abusive users, a filter for objectionable material, and a developer
-- who acts on reports quickly. The prayer wall had none of the first three (PW5 in
-- docs/research/prayer-wall-health-check-2026-09-24.md). This adds:
--
--   Report   public.report_prayer_request(request_id, reason, note) files a report into the
--            service-only prayer_request_reports table. The request disappears for the reporter
--            at once (SELECT policy). When 3 different members have open reports on it, it is
--            hidden for the whole group (hidden_reason = 'reports') until an admin reviews it.
--            The author still sees their own hidden request, so hiding does not tip them off.
--            10 reports per reporter per rolling hour and 30 per day (SQLSTATE PT429,
--            'prayer_report_rate_limited').
--   Block    public.user_blocks, one row per (blocker, blocked). The blocker no longer sees the
--            blocked member's requests. The blocked member is not told and still sees the
--            blocker's requests. Rows are private to the blocker.
--   Filter   public.prayer_content_filter_terms, a service-only list the admin edits. A trigger
--            rejects a new or edited request containing a term (SQLSTATE PT422,
--            'prayer_request_blocked_content'). 'word' terms must stand alone, after lowercasing,
--            NFKC and treating punctuation as spaces. 'substring' terms match anywhere, ignoring
--            spaces and punctuation, for scripts that do not separate words with spaces.
--   Ban      public.prayer_wall_bans (service-only). A banned member cannot post or edit on any
--            wall (SQLSTATE PT403, 'prayer_wall_banned'). They can still delete their requests.
--
-- hidden_at / hidden_reason on prayer_requests are written only by the report RPC and the admin
-- (service role); a client insert or update keeps the stored values.
--
-- Production had 0 rows in prayer_requests on 2026-09-24 and the prayer wall is not reachable
-- in the app, so this changes no existing data. Verify with scripts/verify-prayer-wall-sql.mjs
-- (PGlite) first. Depends on 20260924042617_harden_prayer_wall.sql.

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------------------------
-- Moderation state on the request itself.
-- ---------------------------------------------------------------------------------------------
alter table public.prayer_requests
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_reason text;

alter table public.prayer_requests
  drop constraint if exists prayer_requests_hidden_reason_check;
alter table public.prayer_requests
  add constraint prayer_requests_hidden_reason_check check (
    (hidden_at is null and hidden_reason is null)
    or (hidden_at is not null and hidden_reason in ('reports', 'admin'))
  );

-- Clients may not hide, un-hide or pre-hide a request. SECURITY INVOKER on purpose: inside the
-- report RPC and for the service role, current_user is not a client role, so those writes pass.
create or replace function private.protect_prayer_request_moderation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.hidden_at := null;
      new.hidden_reason := null;
    else
      new.hidden_at := old.hidden_at;
      new.hidden_reason := old.hidden_reason;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_prayer_request_moderation()
  from public, anon, authenticated;

drop trigger if exists protect_prayer_request_moderation on public.prayer_requests;
create trigger protect_prayer_request_moderation
  before insert or update on public.prayer_requests
  for each row execute function private.protect_prayer_request_moderation();

-- ---------------------------------------------------------------------------------------------
-- Reports (service-only).
-- ---------------------------------------------------------------------------------------------
create table if not exists public.prayer_request_reports (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.prayer_requests (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  -- Copied at report time: the author can edit the request afterwards, and the admin should
  -- see what was reported.
  request_author_id uuid not null,
  group_id uuid not null,
  content_snapshot text not null,
  reason text not null check (reason in ('spam', 'abuse', 'sexual', 'harm', 'other')),
  note text check (note is null or length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (request_id, reporter_id)
);

create index if not exists idx_prayer_request_reports_reporter_created
  on public.prayer_request_reports (reporter_id, created_at desc);
create index if not exists idx_prayer_request_reports_status_created
  on public.prayer_request_reports (status, created_at desc);
create index if not exists idx_prayer_request_reports_reviewed_by
  on public.prayer_request_reports (reviewed_by);

alter table public.prayer_request_reports enable row level security;
revoke all on table public.prayer_request_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.prayer_request_reports to service_role;

-- Used by the SELECT policy below. SECURITY DEFINER because the reports table is service-only;
-- it answers only for the caller's own reports.
create or replace function private.viewer_reported_prayer_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.prayer_request_reports reports
    where reports.request_id = p_request_id
      and reports.reporter_id = (select auth.uid())
  );
$$;

revoke all on function private.viewer_reported_prayer_request(uuid) from public, anon;
grant execute on function private.viewer_reported_prayer_request(uuid)
  to authenticated, service_role;

create or replace function public.report_prayer_request(
  p_request_id uuid,
  p_reason text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  target public.prayer_requests%rowtype;
  reports_last_hour integer;
  reports_last_day integer;
  open_reporters integer;
begin
  if viewer is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into target from public.prayer_requests where id = p_request_id;

  -- Only members of the request's group can see it, so only they can report it. The same
  -- error for "missing" and "not yours to see" keeps this from probing other groups.
  if not found or not exists (
    select 1 from public.group_members members
    where members.group_id = target.group_id and members.user_id = viewer
  ) then
    raise exception 'prayer_request_not_found' using errcode = 'P0002';
  end if;

  if target.user_id = viewer then
    raise exception 'cannot_report_own_prayer_request' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('prayer_report_rate:' || viewer::text, 0));

  select
    count(*) filter (where created_at > now() - interval '1 hour'),
    count(*)
  into reports_last_hour, reports_last_day
  from public.prayer_request_reports
  where reporter_id = viewer
    and created_at > now() - interval '1 day';

  if reports_last_hour >= 10 or reports_last_day >= 30 then
    raise exception 'prayer_report_rate_limited'
      using errcode = 'PT429',
            hint = 'A member may file 10 reports per hour and 30 per day.';
  end if;

  -- Serialise reports on one request so concurrent reports cannot all miss the threshold.
  perform pg_advisory_xact_lock(hashtextextended('prayer_report_request:' || p_request_id::text, 0));

  insert into public.prayer_request_reports (
    request_id, reporter_id, request_author_id, group_id, content_snapshot, reason, note
  )
  values (
    target.id, viewer, target.user_id, target.group_id, target.content, p_reason,
    nullif(btrim(p_note), '')
  )
  on conflict (request_id, reporter_id) do nothing;

  select count(*) into open_reporters
  from public.prayer_request_reports
  where request_id = target.id and status = 'open';

  if open_reporters >= 3 then
    update public.prayer_requests
    set hidden_at = now(), hidden_reason = 'reports'
    where id = target.id and hidden_at is null;
  end if;
end;
$$;

revoke all on function public.report_prayer_request(uuid, text, text) from public, anon;
grant execute on function public.report_prayer_request(uuid, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Blocks (private to the blocker).
-- ---------------------------------------------------------------------------------------------
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists idx_user_blocks_blocked on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own
  on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own
  on public.user_blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));

drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own
  on public.user_blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

revoke all on table public.user_blocks from public, anon, authenticated;
grant select, insert, delete on table public.user_blocks to authenticated;
grant select, insert, update, delete on table public.user_blocks to service_role;

-- ---------------------------------------------------------------------------------------------
-- Who sees which request: members of the group, minus requests hidden by moderation (except
-- their own), minus authors they blocked, minus requests they reported.
-- ---------------------------------------------------------------------------------------------
drop policy if exists prayer_select_member on public.prayer_requests;
create policy prayer_select_member
  on public.prayer_requests for select to authenticated
  using (
    exists (
      select 1 from public.group_members
      where group_members.group_id = prayer_requests.group_id
        and group_members.user_id = (select auth.uid())
    )
    and (prayer_requests.hidden_at is null or prayer_requests.user_id = (select auth.uid()))
    and not exists (
      select 1 from public.user_blocks blocks
      where blocks.blocker_id = (select auth.uid())
        and blocks.blocked_id = prayer_requests.user_id
    )
    and not private.viewer_reported_prayer_request(prayer_requests.id)
  );

-- ---------------------------------------------------------------------------------------------
-- Bans and the content filter (service-only).
-- ---------------------------------------------------------------------------------------------
create table if not exists public.prayer_wall_bans (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  reason text check (reason is null or length(reason) <= 500),
  banned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_prayer_wall_bans_banned_by on public.prayer_wall_bans (banned_by);

alter table public.prayer_wall_bans enable row level security;
revoke all on table public.prayer_wall_bans from public, anon, authenticated;
grant select, insert, update, delete on table public.prayer_wall_bans to service_role;

-- Lowercase, NFKC, drop invisible characters, and turn runs of spaces and punctuation into one
-- space, padded with a space on both ends so ' term ' matches a whole word.
create or replace function private.normalize_prayer_text(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select ' ' || btrim(
    regexp_replace(
      regexp_replace(lower(normalize(coalesce(value, ''), nfkc)), '[­​-‍⁠﻿]', '', 'g'),
      '[[:space:][:punct:]]+', ' ', 'g'
    )
  ) || ' ';
$$;

revoke all on function private.normalize_prayer_text(text) from public, anon, authenticated;

create table if not exists public.prayer_content_filter_terms (
  id bigint generated always as identity primary key,
  term text not null check (
    length(term) between 1 and 100
    and length(replace(private.normalize_prayer_text(term), ' ', '')) > 0
  ),
  match_mode text not null default 'word' check (match_mode in ('word', 'substring')),
  language text check (language is null or language ~ '^[a-z]{2,3}$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists prayer_content_filter_terms_unique
  on public.prayer_content_filter_terms (lower(term), match_mode);
create index if not exists idx_prayer_content_filter_terms_created_by
  on public.prayer_content_filter_terms (created_by);

alter table public.prayer_content_filter_terms enable row level security;
revoke all on table public.prayer_content_filter_terms from public, anon, authenticated;
grant select, insert, update, delete on table public.prayer_content_filter_terms to service_role;

create or replace function private.prayer_content_is_blocked(content text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with normalized as (select private.normalize_prayer_text(content) as spaced)
  select exists (
    select 1
    from public.prayer_content_filter_terms terms, normalized
    where case terms.match_mode
      when 'word' then
        strpos(normalized.spaced, private.normalize_prayer_text(terms.term)) > 0
      else
        strpos(
          replace(normalized.spaced, ' ', ''),
          replace(private.normalize_prayer_text(terms.term), ' ', '')
        ) > 0
    end
  );
$$;

revoke all on function private.prayer_content_is_blocked(text) from public, anon, authenticated;

-- SECURITY DEFINER to read the service-only ban and term tables. Runs before the rate limit
-- (triggers fire in name order), so a banned or filtered post does not use up the budget.
create or replace function private.enforce_prayer_wall_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then
    return new;
  end if;

  if exists (select 1 from public.prayer_wall_bans bans where bans.user_id = new.user_id) then
    raise exception 'prayer_wall_banned' using errcode = 'PT403';
  end if;

  if private.prayer_content_is_blocked(new.content) then
    raise exception 'prayer_request_blocked_content' using errcode = 'PT422';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_prayer_wall_rules() from public, anon, authenticated;

drop trigger if exists enforce_prayer_wall_rules on public.prayer_requests;
create trigger enforce_prayer_wall_rules
  before insert or update on public.prayer_requests
  for each row execute function private.enforce_prayer_wall_rules();

-- Starter list. The admin Reports page edits it; see the moderation doc for how it was chosen.
insert into public.prayer_content_filter_terms (term, match_mode, language)
values
  ('nigger', 'word', 'en'),
  ('nigga', 'word', 'en'),
  ('faggot', 'word', 'en'),
  ('kike', 'word', 'en'),
  ('spic', 'word', 'en'),
  ('wetback', 'word', 'en'),
  ('tranny', 'word', 'en'),
  ('cunt', 'word', 'en'),
  ('motherfucker', 'word', 'en'),
  ('fuck you', 'word', 'en'),
  ('kill yourself', 'word', 'en'),
  ('kys', 'word', 'en'),
  ('maricón', 'word', 'es'),
  ('hijo de puta', 'word', 'es'),
  ('sudaca', 'word', 'es'),
  ('mátate', 'word', 'es'),
  ('filho da puta', 'word', 'pt'),
  ('viado', 'word', 'pt'),
  ('fils de pute', 'word', 'fr'),
  ('enculé', 'word', 'fr'),
  ('bougnoule', 'word', 'fr'),
  ('pédé', 'word', 'fr'),
  ('hurensohn', 'word', 'de'),
  ('schwuchtel', 'word', 'de'),
  ('kanake', 'word', 'de'),
  ('bring dich um', 'word', 'de'),
  ('пидор', 'substring', 'ru'),
  ('убей себя', 'word', 'ru'),
  ('شرموط', 'substring', 'ar'),
  ('मादरचोद', 'substring', 'hi'),
  ('madarchod', 'word', 'hi'),
  ('bhenchod', 'word', 'hi'),
  ('chutiya', 'word', 'hi'),
  ('操你妈', 'substring', 'zh'),
  ('傻逼', 'substring', 'zh'),
  ('去死吧', 'substring', 'zh'),
  ('씨발', 'substring', 'ko'),
  ('병신', 'substring', 'ko'),
  ('orospu', 'word', 'tr'),
  ('bangsat', 'word', 'id'),
  ('ngentot', 'word', 'id'),
  ('địt mẹ', 'word', 'vi')
on conflict do nothing;

-- Post-apply checks (read-only):
--   select tgname from pg_trigger where tgrelid = 'public.prayer_requests'::regclass
--     and not tgisinternal order by 1;
--   -- enforce_prayer_wall_rules, forbid_scope_change, limit_prayer_request_rate,
--   -- protect_prayer_request_moderation, stamp_prayer_request, update_prayer_requests_updated_at
--   select grantee, string_agg(privilege_type, ',' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_name in ('prayer_request_reports', 'prayer_wall_bans',
--                         'prayer_content_filter_terms', 'user_blocks')
--    group by grantee;
--   -- anon absent; authenticated only DELETE,INSERT,SELECT (user_blocks)
--   select count(*) from public.prayer_content_filter_terms;  -- 42
