# Backend review, 2026-10-01

Scope: `supabase/migrations`, `supabase/functions`. Static review of the repo at 1e20e528.

## Limits of this review (read first)

- The static sections were written without live access. The live advisors were run afterwards
  (see "Live advisors, 2026-10-01 07:30 UTC" below); the `list_migrations` vs repo comparison
  was not done.
- PGlite was not installed, so no `scripts/verify-*-sql.mjs` harness was run. No migration was
  added, so none was needed.

## Live advisors, 2026-10-01 07:30 UTC

Run read-only against project `ganmududzdzpruvdulkg`. Nothing needs a migration.

Performance:

- No unindexed foreign keys, no `auth_rls_initplan` (per-row `auth.uid()`), no duplicate indexes,
  no multiple-permissive-policy findings.
- 40 unused indexes (INFO). Most are on admin, moderation and groups tables that see little
  traffic yet (groups sync is off in the app). Not worth dropping: they cover foreign keys and
  admin queries that will run once those features are used.
- 10 tables without a primary key: 9 are snapshots in the `backups` schema; the other is
  `public.analytics_monthly_rollup`. Owner can drop old `backups.*` tables when no longer needed.
- Auth server uses an absolute 10-connection pool; switch to a percentage strategy before any
  instance upgrade (dashboard).

Security:

- 18 tables with RLS on and no policies (INFO): all are service-role-only tables (admin,
  moderation, throttles, translator passcodes, backups). This denies client access, as intended.
- 6 SECURITY DEFINER RPCs executable by `authenticated` (WARN): `create_group`,
  `delete_my_account`, `join_group_by_code`, `leave_group`, `refresh_my_engagement`,
  `report_prayer_request`. These are the app's intended RPCs (hardened in the 2026-09-24 health
  checks); their bodies were not re-read for this review.
- Already-known owner items: leaked-password protection off, too few MFA options, `pg_net` in
  `public` (needs a Supabase support ticket).

## Migrations (static)

- RLS initplan: every policy created in the repo now uses `(select auth.uid())` or was replaced
  by one that does (`20260321060000_health_sweep_rls_policy_optimizations.sql`, later group
  policies, `20260924035637_wrap_auth_role_in_storage_service_policies.sql`). The remaining bare
  `auth.uid()` hits are inside RPC/function bodies, where it is evaluated once per call, or in
  policies that were dropped and recreated later. No fix needed.
- Foreign-key indexes: hot-table FKs (groups, group*members, group_sessions, prayer*\*,
  user_devices, annotations, reading-plan progress, saved plans, user_blocks) are indexed or
  covered by a unique/PK prefix. `20260910092000_index_unindexed_foreign_keys.sql` covered the
  rest of the earlier advisor list.
- Duplicate / prefix-redundant indexes were dropped in `20260924035626` and `20260924035633`.
- Unverified residue: the `workflow_runs` / `langquest_*` admin tables
  (`20260508090000_create_workflow_langquest_tables.sql`) have FKs to `profiles` and to each
  other (`created_by`, `decided_by`, `selected_by`, `approved_by`, `previous_decision_id`,
  `rollback_from_id`, `superseded_by_id`) with no index in the repo. The tables are small and
  admin-only; the cost is a sequential scan on a `profiles` delete. Left alone: it needs the live
  advisor output and row counts to justify a migration.

## Edge functions

All seven functions were read. Auth, body caps (`readBodyWithinLimit`), UUID validation, CORS and
OPTIONS handling, fetch timeouts (`AbortSignal.timeout`) and generic 500 bodies are in place and
covered by `*.test.ts`. No missing auth check, unbounded input or unhandled rejection found.

Minor observations, not fixed (not worth a blocking change):

- `submit-chapter-feedback` duplicate path looks the saved row up by `client_submission_id`
  only, not also by `user_id`. The id is a client-generated UUID under a global unique index, so
  exploiting it needs a guessed UUID and yields only a feedback id. Scope it if a test-first
  change is wanted.
- `report-app-errors` and `track-*` report `inserted: rows.length` even when `ignoreDuplicates`
  skipped rows. Cosmetic.
- `aggregate-engagement` CORS omits `Access-Control-Allow-Methods`; harmless, it is not called
  from browsers.
- Rate-limit check then insert in `submit-chapter-feedback` is not atomic, so a burst can
  overshoot the hourly cap slightly.

## Pending live actions

None. No migration or function change was made by this review.

## Owner decisions / dashboard

- Run the performance and security advisors in the dashboard (or via MCP) and diff
  `list_migrations` against `supabase/migrations` (see the drift note in CLAUDE.md); this review
  could not.
- Leaked-password protection and other Auth settings are dashboard-only and were not checked.
