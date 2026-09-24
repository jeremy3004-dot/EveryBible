# Supabase advisors cleanup — 2026-09-24

Project `ganmududzdzpruvdulkg`. Baseline: `origin/main` @ `195717e1`, with all 94 repo migrations
recorded live (`list_migrations` matches the repo through `20260924023342`). I only read the
database: `get_advisors` (security and performance), and `execute_sql` limited to SELECT and
catalog queries (`pg_policies`, `pg_index`, `pg_stat_user_indexes`, `pg_constraint`, `pg_proc`,
`pg_depend`, `has_*_privilege`). Nothing was applied. The four migrations below are written
for the lead to apply.

## Before: advisor output (2026-09-24 03:45 UTC)

The advisors no longer report most of the lint families this pass was meant to cover:
`auth_rls_initplan`, `multiple_permissive_policies`, `unindexed_foreign_keys`,
`duplicate_index`, `function_search_path_mutable` and `security_definer_view` are all empty.
Earlier work this month cleared them (`20260321060000`, `20260910091000`, `20260910092000`,
`20260923233220`). I re-ran each check by hand across `public`, `private` and `storage` (see
Method) and found gaps the linter does not look for.

**Security**

| Lint                                               | Level | Count | Items                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ----- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| authenticated_security_definer_function_executable | WARN  | 6     | `is_group_member(uuid)`, `is_group_leader(uuid)`, `delete_my_account()`, `join_group_by_code(text)`, `leave_group(uuid)`, `refresh_my_engagement()`                                                                                                                                                                         |
| extension_in_public                                | WARN  | 1     | `pg_net`                                                                                                                                                                                                                                                                                                                    |
| auth_leaked_password_protection                    | WARN  | 1     | Auth setting                                                                                                                                                                                                                                                                                                                |
| auth_insufficient_mfa_options                      | WARN  | 1     | Auth setting                                                                                                                                                                                                                                                                                                                |
| rls_enabled_no_policy                              | INFO  | 11    | `admin_audit_logs`, `analytics_ingest_throttle`, `analytics_monthly_rollup`, `content_images`, `translation_catalog_admin`, `translation_catalog_availability_backup_2026_08_25`, `translation_sync_runs`, `translator_review_attempts`, `translator_team_passcodes`, `verse_of_day_entries`, `private.group_join_attempts` |

**Performance** (INFO only; there are no WARN-level lints)

| Lint                         | Count | Items                                                                                                                         |
| ---------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| unused_index                 | 35    | listed under "What's left"                                                                                                    |
| no_primary_key               | 9     | 8 backup tables (7 in `backups.*`, plus `translation_catalog_availability_backup_2026_08_25`) plus `analytics_monthly_rollup` |
| auth_db_connections_absolute | 1     | Auth pool fixed at 10 connections                                                                                             |

**Found by hand (the linter does not report these)**

- 4 non-unique indexes that are exact copies of a UNIQUE constraint index. `duplicate_index`
  skips them because the other copy backs a constraint.
- 11 indexes that are a leading-column prefix of another index. 3 of them also show up as
  `unused_index`.
- 4 `storage.objects` policies that call `auth.role()` bare, so it runs once per row. The
  linter only checks `public`.
- `storage.objects` has several permissive policies per role and action, one per bucket.
  `public` has none.

## Migrations written

All four are idempotent. None of them needs an app change. Apply them in version order; no
file depends on another.

### 1. `20260924035626_drop_duplicate_indexes.sql` — risk: very low

Drops `idx_groups_join_code`, `idx_user_preferences_user_id`, `idx_user_progress_user_id`
and `idx_user_translation_prefs_user`. Each has the same single column as a UNIQUE index that
stays, so every query gets an identical plan, and `ON CONFLICT (user_id)` upserts already infer
the unique index. The only change is less write amplification. `idx_groups_join_code` also
leaves the `unused_index` list.

### 2. `20260924035633_drop_prefix_redundant_indexes.sql` — risk: low

Drops 11 indexes whose key columns are the leading columns of a kept index, which is almost
always a UNIQUE constraint index:
`idx_group_plans_group`, `idx_prayer_interactions_request`, `idx_annotations_user_id`,
`idx_user_devices_user_id`, `idx_user_plan_progress_user`, `idx_user_saved_plans_user`,
`idx_translation_versions_tid`, `idx_plan_entries_plan_id`, `idx_plan_entries_plan_day`,
`idx_analytics_monthly_rollup_day`, and `idx_bible_verses_chapter_lookup` (10 MB, last used
2026-04-03). Three of these also clear `unused_index`: `idx_group_plans_group`,
`idx_prayer_interactions_request` and `idx_annotations_user_id`.

I kept `idx_bible_verses_translation` on purpose. The text-pack export still uses it, and
the disk-IO follow-up keeps it until a `(translation_id, id)` index replaces it.

I checked the live catalog before writing this: every FK these indexes covered is still led by
a kept index, so `unindexed_foreign_keys` stays empty.

Guards in migrations 1 and 2: each drop runs only if, at apply time, a valid btree on the same
table outside the drop list covers the index's key columns with the same opclass, collation and
sort option. The index also must not back a constraint, be the replica identity, or be
clustered. If any check fails, the migration keeps the index and raises a NOTICE. This protects
against another branch removing a unique key first; `user_devices` uniqueness is a known
candidate (audit L10).

Both files use a plain `DROP INDEX` with `lock_timeout = 5s`. `CONCURRENTLY` cannot run inside
the migration transaction. Every table involved is small or not read. For zero locking, run
`drop index concurrently if exists public.<name>;` per index outside a transaction instead.

### 3. `20260924035932_move_group_helpers_to_private_schema.sql` — risk: low

This clears 2 of the 6 `authenticated_security_definer_function_executable` WARNs. It moves
`is_group_member(uuid)` and `is_group_leader(uuid)` into the non-exposed `private` schema with
`ALTER FUNCTION … SET SCHEMA`, which removes their `/rest/v1/rpc/*` routes.

- The only dependents are 9 group RLS policies (`pg_depend`). Policies reference a function by
  OID, and the schema move keeps the OID, so the policies behave the same. `pg_policies` will
  print them as `private.is_group_member(...)`.
- No function body names either helper, and no code in `src/`, `apps/` or `supabase/functions`
  calls them over RPC.
- Grants stay as they were: EXECUTE for `authenticated` and `service_role`, and no USAGE on
  `private` for client roles. Evaluating a function by OID needs EXECUTE only; the schema USAGE
  check happens only when a name is looked up.
- I tested this with `scripts/verify-group-policies-sql.mjs` (PGlite), which now includes this
  migration. Every group client flow and every M4/L1/L5 assertion passes as `authenticated`
  without USAGE on `private`. New assertions check that the helpers can no longer be reached
  by name from `public` or `private`.

### 4. `20260924035637_wrap_auth_role_in_storage_service_policies.sql` — risk: very low

This rewrites the four "Service role upload/delete for Bible audio / verse timestamps"
`storage.objects` policies from `auth.role() = 'service_role'` to
`(select auth.role()) = 'service_role'`. The migration header quotes the old expressions.
`auth.role()` is STABLE and has no arguments, so evaluating it once per statement gives the
same value for every row. Command, roles and bucket tests are unchanged.

PGlite check: the insert and delete allow/deny matrix is identical before and after, across
anon, authenticated, and authenticated with a `service_role` claim, and across three buckets.

## What's left, and why

| Item                                                                                                                              | Why it stays                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `delete_my_account`, `join_group_by_code`, `leave_group`, `refresh_my_engagement` (SECURITY DEFINER, callable by `authenticated`) | These are app RPCs by design. Each gets the caller from `auth.uid()`, and `join_group_by_code` has a limit on attempts. Removing them would break the app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `extension_in_public` (`pg_net`)                                                                                                  | Owner-only. The objects belong to `supabase_admin`, and `pg_net` cannot be relocated with `ALTER EXTENSION … SET SCHEMA`. It needs a Supabase support request, the same one as for the ineffective L3 revoke.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Leaked-password protection, MFA options, Auth pool strategy                                                                       | Dashboard settings, owner-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `rls_enabled_no_policy` (11 tables)                                                                                               | Intentional: these tables are service-only. I checked live that `anon` and `authenticated` have no SELECT, INSERT, UPDATE or DELETE on any of the 11, and no USAGE on `private`. Adding deny-all policies would only silence the INFO lint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `no_primary_key`: 8 backup tables                                                                                                 | Owner decision. Drop `backups.*` and `translation_catalog_availability_backup_2026_08_25` once the Sept 10 and Sept 24 repairs are accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `no_primary_key`: `analytics_monthly_rollup`                                                                                      | Its natural key is the UNIQUE `analytics_monthly_rollup_grain … NULLS NOT DISTINCT`. That key cannot be a PK because `country_code` and `translation_id` are nullable. A surrogate identity column would only silence an INFO lint, and it would rewrite a table that one function owns.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `unused_index`, the remaining 31 after these migrations                                                                           | Not dropped. 17 are the only index on an FK column, so dropping them would bring `unindexed_foreign_keys` back. 2 are `user_annotations` composites (`idx_annotations_user_type`, `idx_annotations_user_book_chapter`) that serve different query shapes on a table with 0 rows. The other 12 sit on tables with 0–25 rows, where the planner always seq-scans, so "0 scans" says nothing about the real query shape; `analytics_ingest_throttle_window_idx` is also only hours old. Non-FK candidates to revisit once the tables grow: `idx_chapter_feedback_{audio_response_created_at, client_ip_hash_created_at, export_status_created_at, language_book_chapter_created_at, scripture_council_fixed_at, scripture_council_open}`, `idx_content_images_window`, `idx_admin_audit_logs_entity`, `idx_group_sessions_completed_at`, `idx_user_devices_active`, `idx_user_plan_progress_plan_slug`, `analytics_ingest_throttle_window_idx`. Stats have run since 2025-12-08. |
| Multiple permissive `storage.objects` policies                                                                                    | One policy per bucket is the standard Supabase pattern, and the linter does not report it. Merging them would couple unrelated buckets for a negligible gain on small buckets.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| The four "Service role …" storage policies                                                                                        | Migration 4 only rewrites them. They never grant anything, because service-role requests bypass RLS. Dropping them changes no behaviour but alters the policy set, so that is left to the owner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `idx_bible_verses_translation`                                                                                                    | Kept as described above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Expected advisor state after applying

- Security: `authenticated_security_definer_function_executable` falls from 6 to 4. The
  remaining WARNs are the 4 intentional RPCs, `pg_net`, and the 2 Auth settings.
- Performance: `unused_index` falls from 35 to 31 (migration 1 clears `idx_groups_join_code`; migration 2 clears 3 more). There are still no WARNs.
- Manual checks: no bare `auth.*()` calls remain in any policy in `public`, `private` or
  `storage`, and no redundant btree indexes remain apart from `idx_bible_verses_translation`.

## Method

- `get_advisors` security and performance, run 2026-09-24 03:45 UTC.
- `pg_policies` with a regex match for bare `auth.(uid|jwt|role)()` in `qual` or `with_check`,
  and a GROUP BY over (table, role, action) for multiple permissive policies. Both covered
  `public`, `private` and `storage`.
- Unindexed FKs: `pg_constraint` (contype `f`) checked against `pg_index.indkey` leading
  columns.
- Redundant indexes: `pg_index` pairs on the same table where one index's key columns,
  opclasses and collations are a leading prefix of the other's. I then checked
  `indisvalid`, `indisreplident`, `indisclustered`, `pg_constraint.conindid` and
  `pg_stat_user_indexes`.
- Mutable `search_path`: `pg_proc.proconfig` for non-extension functions in `public` and
  `private`. None found.
- Group helpers: `pg_depend` on the two functions, `pg_proc.prosrc` for callers by name,
  and a `grep` of `src/`, `apps/`, `scripts/`, `supabase/functions/`.
- Grants on the policy-less tables: `has_table_privilege` and `has_schema_privilege`.
- Local proof: `scripts/verify-group-policies-sql.mjs` (committed) and a scratch PGlite harness
  for migrations 1, 2 and 4. The harness is not committed. It covers drop-set exactness, replay,
  the guard keeping an index that has no cover, and the storage decision matrix.

**Not verified:**

- Planner choices on production after the drops. The reasoning is standard btree prefix use,
  but I could not run EXPLAIN against a hypothetical dropped index. After applying, spot-check
  with `EXPLAIN` on `user_progress` by `user_id`, and on `bible_verses` by
  `(translation_id, book_id, chapter)`.
- That `postgres` can `ALTER POLICY` on `storage.objects`. Earlier migrations
  (`20260923230718`, `20260923233717`) ran DROP and CREATE POLICY there, which need the same
  ownership rights.

## Applied live 2026-09-24

Applied: 20260924035626 drop_duplicate_indexes, 20260924035633 drop_prefix_redundant_indexes, 20260924035637 wrap_auth_role_in_storage_service_policies (all 15 indexes confirmed gone). Held: 20260924035932 move_group_helpers_to_private_schema until the groups health check lands.
