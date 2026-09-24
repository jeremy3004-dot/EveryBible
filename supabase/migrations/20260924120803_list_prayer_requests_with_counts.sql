-- Prayer wall listing with server-side counts (2026-09-24).
-- docs/research/prayer-wall-health-check-2026-09-24.md (PW13)
--
-- listPrayerRequests read every prayer_interactions row for the listed requests and counted them
-- on the device. PostgREST caps a response at 1000 rows (max-rows) without saying so, so in a
-- busy group the counts came out low and "you already prayed" could be missing, which let the
-- next tap withdraw a real prayer. The requests themselves were not paged either.
--
-- public.list_prayer_requests(group, limit, before_created_at, before_id) returns one page of the
-- group's requests, newest first, each with prayed_count, encouraged_count, viewer_has_prayed and
-- viewer_has_encouraged aggregated in the database. Pages follow a (created_at, id) cursor: pass
-- the last row's created_at and id to get the next page. The limit is clamped to 1..200.
--
-- SECURITY INVOKER on purpose: the existing prayer_requests and prayer_interactions policies
-- decide what it returns, so group membership, requests hidden by moderation (visible to their
-- author only, as "under review"), blocked authors and requests the viewer reported all apply
-- exactly as they do to a plain select. Counts include only interactions the viewer may read.
--
-- The app falls back to its old two-query path while this function is missing (PGRST202), so it
-- can ship before or after this is applied. Production had 0 rows in prayer_requests on
-- 2026-09-24; this changes no data. Verify with scripts/verify-prayer-wall-sql.mjs (PGlite).

-- The cursor orders by (created_at, id); this index serves the group filter, order and cursor
-- together and supersedes idx_prayer_requests_group (group_id, created_at desc).
create index if not exists idx_prayer_requests_group_created_id
  on public.prayer_requests (group_id, created_at desc, id desc);
drop index if exists public.idx_prayer_requests_group;

create or replace function public.list_prayer_requests(
  p_group_id uuid,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  group_id uuid,
  user_id uuid,
  content text,
  is_answered boolean,
  answered_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text,
  prayed_count integer,
  encouraged_count integer,
  viewer_has_prayed boolean,
  viewer_has_encouraged boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    pr.id,
    pr.group_id,
    pr.user_id,
    pr.content,
    pr.is_answered,
    pr.answered_at,
    pr.created_at,
    pr.updated_at,
    pr.hidden_at,
    pr.hidden_reason,
    counts.prayed::integer,
    counts.encouraged::integer,
    coalesce(counts.viewer_prayed, false),
    coalesce(counts.viewer_encouraged, false)
  from public.prayer_requests pr
  cross join lateral (
    select
      count(*) filter (where pi.type = 'prayed') as prayed,
      count(*) filter (where pi.type = 'encouraged') as encouraged,
      bool_or(pi.type = 'prayed' and pi.user_id = (select auth.uid())) as viewer_prayed,
      bool_or(pi.type = 'encouraged' and pi.user_id = (select auth.uid())) as viewer_encouraged
    from public.prayer_interactions pi
    where pi.request_id = pr.id
  ) counts
  where pr.group_id = p_group_id
    and (
      p_before_created_at is null
      or pr.created_at < p_before_created_at
      or (p_before_id is not null and pr.created_at = p_before_created_at and pr.id < p_before_id)
    )
  order by pr.created_at desc, pr.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

comment on function public.list_prayer_requests(uuid, integer, timestamptz, uuid) is
  'One page of a group''s prayer requests, newest first, with interaction counts and the '
  'viewer''s own flags. SECURITY INVOKER: prayer wall RLS decides what is returned.';

-- Supabase grants EXECUTE on new public functions to anon by default; anon has no access to the
-- tables anyway, so only signed-in members (and the service role) may call it.
revoke all on function public.list_prayer_requests(uuid, integer, timestamptz, uuid)
  from public, anon;
grant execute on function public.list_prayer_requests(uuid, integer, timestamptz, uuid)
  to authenticated, service_role;

-- Post-apply checks (read-only):
--   select prosecdef, proconfig from pg_proc where proname = 'list_prayer_requests';
--   -- f, {search_path=""}
--   select grantee from information_schema.routine_privileges
--    where routine_name = 'list_prayer_requests' order by 1;
--   -- authenticated, postgres, service_role (no anon)
--   select indexname from pg_indexes where tablename = 'prayer_requests' order by 1;
--   -- idx_prayer_requests_group_created_id present, idx_prayer_requests_group gone
--   notify pgrst, 'reload schema';  -- if PostgREST does not pick the function up by itself
