# Backend review, 2026-10-01

Scope: `supabase/migrations`, `supabase/functions`. Static review of the repo at 1e20e528.

## Limits of this review (read first)

- The Supabase MCP tools (`get_advisors`, `list_migrations`, `execute_sql`, ...) were not
  available to the worker that wrote this. No live advisor run and no `list_migrations` vs repo
  comparison was done. Nothing below describes the live database. Re-run both before acting.
- PGlite was not installed, so no `scripts/verify-*-sql.mjs` harness was run. No migration was
  added, so none was needed.

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
