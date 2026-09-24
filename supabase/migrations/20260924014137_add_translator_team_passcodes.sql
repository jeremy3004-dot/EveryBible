-- One translator passcode per translation team (owner decision 2026-09-24; follow-up to
-- audit finding M2 in docs/research/translator-access-options-2026-09-24.md).
--
-- Each row is one team's passcode and the translations it opens in review-chapter-feedback.
-- The passcode itself is never stored: passcode_hash is lowercase hex SHA-256 of
-- `${passcode_salt}:${passcode}` (hash_algorithm 'sha256-salt-v1'), with a random 16-byte
-- salt per row. The admin dashboard generates the passcode server-side, shows it once, and
-- writes only the salt and hash. Revoking sets revoked_at; rows are kept for the audit trail.
--
-- Readers and writers: the review-chapter-feedback edge function (reads active rows) and the
-- admin dashboard (creates, lists, revokes), both with the service role. RLS is on with no
-- policies and client roles hold no grants, so the table is invisible to anon/authenticated.
--
-- Rollout: apply this migration BEFORE deploying the updated review-chapter-feedback
-- function. (If the function is deployed first, the shared passcode still works and any
-- other code gets 503 until the table exists.)

begin;

create table if not exists public.translator_team_passcodes (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  translation_ids text[] not null,
  passcode_salt text not null,
  passcode_hash text not null,
  hash_algorithm text not null default 'sha256-salt-v1',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  constraint translator_team_passcodes_label_check
    check (char_length(btrim(label)) between 1 and 120),
  constraint translator_team_passcodes_translation_ids_check
    check (
      cardinality(translation_ids) between 1 and 50
      and array_position(translation_ids, null) is null
      and array_position(translation_ids, '') is null
    ),
  constraint translator_team_passcodes_salt_check
    check (passcode_salt ~ '^[0-9a-f]{32}$'),
  constraint translator_team_passcodes_hash_check
    check (passcode_hash ~ '^[0-9a-f]{64}$'),
  constraint translator_team_passcodes_algorithm_check
    check (hash_algorithm = 'sha256-salt-v1'),
  constraint translator_team_passcodes_revoked_by_check
    check (revoked_by is null or revoked_at is not null)
);

comment on table public.translator_team_passcodes is
  'Hashed translator review passcodes, one per translation team. Service role only. '
  'Managed in the admin dashboard (/translator-access); read by review-chapter-feedback.';

-- The edge function reads every active row on each translator request.
create index if not exists idx_translator_team_passcodes_active
  on public.translator_team_passcodes (created_at desc)
  where revoked_at is null;

-- Foreign keys to auth.users are indexed (see 20260910092000_index_unindexed_foreign_keys).
create index if not exists idx_translator_team_passcodes_created_by
  on public.translator_team_passcodes (created_by);
create index if not exists idx_translator_team_passcodes_revoked_by
  on public.translator_team_passcodes (revoked_by);

alter table public.translator_team_passcodes enable row level security;

revoke all on table public.translator_team_passcodes from public, anon, authenticated;
grant all on table public.translator_team_passcodes to service_role;

commit;
