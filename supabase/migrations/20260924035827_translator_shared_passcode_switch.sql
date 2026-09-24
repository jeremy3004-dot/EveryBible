-- Retiring the shared translator passcode (follow-up to 20260924014137_add_translator_team_passcodes).
--
-- 1. public.translator_access_settings: a single-row switch, shared_passcode_enabled, that the
--    admin dashboard (/translator-access) toggles. When false, review-chapter-feedback treats
--    the shared TRANSLATOR_REVIEW_PASSCODE exactly like a wrong code. The row is created with
--    true, so applying this migration changes nothing.
-- 2. public.translator_shared_passcode_uses: one row per request that presented the shared
--    passcode: the translation it asked for, the kind of request, whether it was allowed, and
--    when. No passcode, hash, IP address or user id is stored. The owner reads it in the admin
--    dashboard to see whether anyone still depends on the shared code before switching it off.
--
-- Readers and writers: review-chapter-feedback (reads the switch, inserts uses) and the admin
-- dashboard (reads both, updates the switch), both with the service role. RLS is on with no
-- policies and client roles hold no grants.
--
-- Rollout: apply this migration, then deploy review-chapter-feedback, then the admin app.
-- Each step is backward compatible: the current function ignores these tables; the new function
-- treats a missing settings table as "allowed" and only logs a failed usage insert; the admin
-- page is the only writer of the switch.
--
-- Once the shared passcode is retired and its secrets are unset, the uses table can be dropped.

begin;

create table if not exists public.translator_access_settings (
  id boolean primary key default true,
  shared_passcode_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint translator_access_settings_singleton_check check (id)
);

comment on table public.translator_access_settings is
  'Single-row translator access switches. shared_passcode_enabled=false turns the old shared '
  'TRANSLATOR_REVIEW_PASSCODE off in review-chapter-feedback. Service role only; toggled in the '
  'admin dashboard (/translator-access).';

insert into public.translator_access_settings (id, shared_passcode_enabled)
values (true, true)
on conflict (id) do nothing;

-- Foreign keys to auth.users are indexed (see 20260910092000_index_unindexed_foreign_keys).
create index if not exists idx_translator_access_settings_updated_by
  on public.translator_access_settings (updated_by);

alter table public.translator_access_settings enable row level security;

revoke all on table public.translator_access_settings from public, anon, authenticated;
grant all on table public.translator_access_settings to service_role;

create table if not exists public.translator_shared_passcode_uses (
  id uuid primary key default gen_random_uuid(),
  used_at timestamptz not null default now(),
  translation_id text,
  request_kind text not null,
  outcome text not null,
  constraint translator_shared_passcode_uses_translation_id_check
    check (translation_id is null or char_length(translation_id) between 1 and 64),
  constraint translator_shared_passcode_uses_request_kind_check
    check (request_kind in ('unlock', 'read', 'resolve', 'reopen', 'audio', 'bulk_review')),
  constraint translator_shared_passcode_uses_outcome_check
    check (outcome in ('allowed', 'refused'))
);

comment on table public.translator_shared_passcode_uses is
  'One row per review-chapter-feedback request that presented the shared translator passcode '
  '(translation, request kind, allowed or refused, time). Holds no passcode, hash, IP or user '
  'id. Service role only; shown in the admin dashboard (/translator-access).';

-- The admin page reads the most recent window, newest first.
create index if not exists idx_translator_shared_passcode_uses_used_at
  on public.translator_shared_passcode_uses (used_at desc);

alter table public.translator_shared_passcode_uses enable row level security;

revoke all on table public.translator_shared_passcode_uses from public, anon, authenticated;
grant all on table public.translator_shared_passcode_uses to service_role;

commit;
