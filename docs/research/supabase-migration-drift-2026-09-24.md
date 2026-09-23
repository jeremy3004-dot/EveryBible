# Supabase migration drift reconciliation — 2026-09-24

Project: EveryBible production, ref `ganmududzdzpruvdulkg`
Repo baseline: `main` @ `63ba5cf9` (73 files in `supabase/migrations/`)
Live baseline: 76 rows in `supabase_migrations.schema_migrations`
Method: read-only. Used Supabase MCP `list_migrations`, `list_extensions`, `get_advisors`, and
`execute_sql` with SELECT and catalog queries only (`supabase_migrations.schema_migrations`,
`pg_proc`, `pg_policies`, `pg_indexes`, `pg_trigger`, `pg_constraint`, `information_schema`,
`storage.buckets`, `cron.job`). No DDL or DML ran.

## Bottom line

- **No repo migration is waiting to be applied.** Every schema effect in the repo exists live,
  except one table that was dropped by hand (see next point). The drift is in the **history
  table**, not the schema.
- **One live regression:** `public.site_content_entries`, `public.get_live_homepage_content()`,
  the index `idx_site_content_entries_state`, and the trigger `update_site_content_entries_updated_at`
  are **missing live**. The history table still records `20260402210000` as applied. No repo
  migration drops these objects, so someone removed them outside migrations. `apps/site/lib/homepage-content.ts:205`
  still calls the RPC on every homepage render. It catches the error and falls back to defaults,
  so the site works, but each render makes a failing call.
- **The history table is out of sync with the repo:** 16 repo versions have no history row,
  and 18 history rows have no repo file with the same version. Of those 18, 15 are the same
  repo migrations recorded under the timestamp that MCP `apply_migration` assigned. In this
  state `supabase db push` is blocked: the CLI refuses to push while history rows have no
  matching local file. If the CLI were forced (`--include-all`), 2 migrations would fail and
  1 would roll back analytics logic (see "Replay hazards").
- The July group RLS helper migrations flagged on 2026-09-10 **have since been applied**
  (2026-09-11, versions `20260911050239/050249/050256`). The group-policy migration they were
  blocking (`restrict_group_members_direct_insert`) is live, and its policy definition matches
  the repo.

## How matching was done

1. **By name and version.** Compared `list_migrations` with the repo filenames.
2. **By recorded SQL.** For each history row I computed a hash of `statements` after removing
   `--` comments, whitespace, and `;`. I computed the same hash for each repo file and matched
   the two, ignoring version. This identifies a migration even when MCP recorded it under a
   different timestamp.
3. **By effect (final live state).** I compared the last repo definition of every function
   with the live `prosrc` (same normalized-hash method), plus `SECURITY DEFINER`, `proconfig`,
   and ACLs. I also checked that every policy, index, trigger, added column, named constraint,
   storage bucket, and cron job the repo leaves in place exists live. For the security-relevant
   policies (groups, `group_members`, `group_sessions`, `profiles`, `chapter_feedback_select_own`)
   I compared the `qual` and `with_check` text as well.

Effect results:

| Object class | Repo final state | Live | Diff |
|---|---|---|---|
| Functions (public, non-extension) | 25 | 25 | 24 bodies, configs, and ACLs identical; `get_live_homepage_content` **missing**; `count_user_sessions` exists **only live** |
| Tables (public) | 29 after the 6 langquest/workflow drops | 29 | `site_content_entries` **missing**; `translation_catalog_availability_backup_2026_08_25` exists **only live** (made by hand) |
| RLS policies (public + storage) | 87 | 87 | identical names; group, profile, and feedback `qual`/`with_check` identical |
| Named indexes | 72 | 71 (+ unique-key indexes) | only `idx_site_content_entries_state` missing |
| Triggers | 12 | 11 | only `update_site_content_entries_updated_at` missing |
| Added columns | 53 | 53 | none missing; `geo_accuracy_km` is `integer` as the repo intends |
| Named constraints | 13 (+ `profiles_admin_role_check`) | all present | definitions match (theme check includes `parchment` and `midnight`) |
| Storage buckets | 7 | 7 | identical |
| Column privileges (`profiles.admin_role`) | revoked from authenticated | revoked | match |

## Classification of the 73 repo migrations

| Class | Count |
|---|---|
| Applied, same version | 55 |
| Applied under a different version (MCP timestamp) | 15 |
| Applied, then reverted outside migrations (effect missing live) | 1 |
| Superseded, never recorded (do not apply) | 1 |
| No-op history placeholder | 1 |
| **Not applied** | **0** |

### Applied, same version (55)

The recorded statements are identical to the repo file after normalization, unless a note
says otherwise.

`20240101000000` through `20260523051500`: all 49 files except `20260402210000`
(reverted, below) and `20260412084907` (placeholder, below). That is 47 files. Also:

| Version | Note |
|---|---|
| `20260710071844` revoke_public_execute_on_security_definer_functions | exact |
| `20260710094508` fix_listening_minutes_double_count | exact. The history name is `fix_listening_minutes_double_count_datebased`. An earlier draft is recorded as `20260710094049` (see "Live-only history rows") |
| `20260710095248` analytics_retention_rollups_indexes | **cosmetic difference only.** The live copy has no `--` comment inside `purge_old_analytics_events` and uses `$do$` where the repo uses `$$`. The function body is identical live |
| `20260710095622` align_geo_accuracy_km_integer | exact |
| `20260710102135` harden_analytics_numeric_casts_safe_numeric | exact |
| `20260804043450` drop_langquest_ingest_tables | exact (the 6 tables are gone live) |
| `20260905015543` protect_profile_admin_role | exact |
| `20260905020427` authorize_engagement_refresh | exact |

Other notes:

- `20260326122907` and `20260326184500` (`hide_orphan_translation_catalog_rows`) are two repo
  files with identical content. Both are recorded, which is harmless.
- `20260411093000` is recorded twice: once under its own version and again under
  `20260412084907`.

### Applied under a different version (15)

The recorded content matches the repo file, but under the timestamp MCP assigned.

| Repo version | Live version | Name | Note |
|---|---|---|---|
| 20260704120000 | 20260911050239 | fix_group_members_rls_recursion | Applied 2026-09-11. Group policies verified |
| 20260710120000 | 20260710060139 | add_chapter_feedback_scripture_council_resolution | |
| 20260710130000 | 20260710061830 | add_chapter_feedback_select_own_policy | |
| 20260710140000 | 20260710062921 | add_translator_review_attempts | |
| 20260710150000 | 20260710153150 | analytics_authoritative_listener_counts | |
| 20260711100000 | 20260711093142 | bound_safe_numeric_magnitude | |
| 20260711100100 | 20260911050249 | revoke_group_membership_helpers_from_public | Applied 2026-09-11. `anon` cannot execute `is_group_member` |
| 20260905060000 | 20260910121405 | repair_usage_reporting | The 2026-09-10 MCP apply (backups in schema `backups`) |
| 20260905061000 | 20260910121503 | align_engagement_usage | Same |
| 20260910090000 | 20260910172231 | enable_rls_on_catalog_availability_backup | Cosmetic: the repo splits the COMMENT string into adjacent literals; the resulting text is the same |
| 20260910091000 | 20260910172235 | pin_search_path_on_pure_sql_helpers | |
| 20260910092000 | 20260910172241 | index_unindexed_foreign_keys | |
| 20260910093000 | 20260911050256 | restrict_group_members_direct_insert | Cosmetic: adjacent-literal COMMENT. Policy `with_check` verified |
| 20260910094000 | 20260910172244 | add_client_ip_hash_to_chapter_feedback | Cosmetic: adjacent-literal COMMENT |
| 20260917120000 | 20260918043624 | feedback_participation_and_review | |

### Applied, then reverted outside migrations (1)

**`20260402210000_create_homepage_content_operator_contract`.** The recorded statements
differ from the repo file only in two comment strings: "OpenClaw operator" became "EveryBible
admin surface" / "approved admin tools" in commit `a6356873` on 2026-04-08. The migration ran,
but every object it creates is now gone:

- `public.site_content_entries`
- `public.get_live_homepage_content(timestamptz)`
- `idx_site_content_entries_state`
- `update_site_content_entries_updated_at`

No repo migration drops them. Nothing in the repo writes to the table: the OpenClaw operator
was removed in `a6356873`, and `apps/admin` has no references. The only reader is the site's
RPC call, which fails and falls back to defaults.

### Superseded, never recorded (1)

**`20260612153524_fix_anonymous_listener_count_and_session_dedup`** only does a
`CREATE OR REPLACE` of `get_admin_analytics_overview`. Its fix,
`COUNT(DISTINCT COALESCE(x.user_id::text, x.session_id))`, is carried into every later
definition (`20260710094508`, `…102135`, `…150000`, `20260905060000`). The live function is
byte-identical (normalized) to the `20260905060000` version, including `SET timezone TO 'UTC'`
and the `service_role`-only grant. **Applying this file now would roll the function back** to
the June logic: it would drop the timezone setting, the `safe_numeric` casts, the listening
double-count fix, and the window clamp. Record it in history only; never run it.

### No-op placeholder (1)

**`20260412084907_remote_history_placeholder`** contains only comments. The history row with
that version holds a duplicate of `add_plan_slug_to_user_reading_plan_progress`. The version
numbers already match, so no action is needed.

## Drift the other way (live but not in the repo)

### Live-only history rows (3 have no repo file with any version)

| Live version | Name | Effect live | Recommendation |
|---|---|---|---|
| 20260710094049 | fix_listening_minutes_double_count | Earlier draft, overwritten by `20260710094508` | Add a no-op placeholder file (same pattern as `20260412084907`) so the history keeps a matching local file |
| 20260910122849 | count_user_sessions | `public.count_user_sessions(uuid)`: SECURITY DEFINER, `search_path=''`, `service_role` only | **Add a real repo file** with this version and the live SQL (get it from `schema_migrations.statements`). No caller in this repo, not even `apps/admin`, so the caller is unverified; it is probably the separately deployed admin dashboard |
| 20260918100723 | correct_jeremy_curry_historical_community_attribution | One-time data repair of 16 BSB rows, guarded by assertions (documented in `docs/qa/2026-09-18-feedback-audio-repair.md`) | Add a **no-op placeholder** with this version. Do not replay it on other environments; its guards would raise an exception there anyway |

### Live objects created outside migrations

- `public.translation_catalog_availability_backup_2026_08_25` (216 rows). Made by hand
  during the 2026-08-25 R2 cutover. RLS is on, there are no policies, and `anon` and
  `authenticated` have no grants (verified). Migration `20260910090000` handles this case
  already.
- Schema `backups` holds 3 tables from 2026-09-10: `analytics_monthly_rollup_20260910`,
  `function_defs_20260910` (6 rows), and `user_engagement_summary_20260910`. `anon` and
  `authenticated` have no USAGE on the schema (verified). Drop these once the Sept 10 repair
  is accepted.
- Extensions `pg_cron` 1.6.4 and `pg_net` 0.19.5 have no `CREATE EXTENSION` in the repo.
  `pg_net` is installed in `public`, which the advisor flags as WARN `extension_in_public`.
- Cron job `nightly-aggregate-engagement` (`0 2 * * *`, uses `net.http_post`) and vault
  secret `aggregate_engagement_service_key`. This is the known live-only engagement job;
  a database reset loses it. The other cron job, `nightly-analytics-maintenance`, comes from
  a repo migration.

## Ordered action list

No schema migration needs to run against production to catch up with the repo. The actions
below are history bookkeeping and one decision. Each step is a production write, so each
needs explicit approval.

1. **Add the missing repo files** (repo only, no database change):
   - `20260910122849_count_user_sessions.sql`: the real function SQL, copied from the live
     `statements`.
   - `20260710094049_fix_listening_minutes_double_count_draft.sql`: comment-only placeholder.
   - `20260918100723_correct_jeremy_curry_historical_community_attribution.sql`:
     comment-only placeholder that points to the QA doc.

   Risk: none. These files make the 3 live-only history rows match local files.

2. **Repair the history table.** This writes only to `supabase_migrations.schema_migrations`
   and runs no DDL.
   - `supabase migration repair --status applied` for the 16 repo versions with no history
     row: `20260612153524 20260704120000 20260710120000 20260710130000 20260710140000
     20260710150000 20260711100000 20260711100100 20260905060000 20260905061000
     20260910090000 20260910091000 20260910092000 20260910093000 20260910094000
     20260917120000`
   - `supabase migration repair --status reverted` for the 15 duplicate MCP versions:
     `20260710060139 20260710061830 20260710062921 20260710153150 20260711093142
     20260910121405 20260910121503 20260910172231 20260910172235 20260910172241
     20260910172244 20260911050239 20260911050249 20260911050256 20260918043624`

   Risk: low. "Reverted" deletes the history row, which also deletes its recorded
   `statements`. Snapshot the table first with a SELECT export if you want to keep them.
   After this step, `supabase migration list --linked` should show local and remote aligned,
   and `db push` works again.

   Alternative: rename the 15 repo files to the MCP versions instead. This keeps the history
   table untouched but rewrites repo filenames, and `20260704120000` would then sort after
   `20260910093000`. It is valid, but reads worse.

3. **Decide on the homepage override contract (`20260402210000`).** Do not edit the old
   file; its version is already recorded, so a push would skip it. Write a new migration for
   one of these:
   - **(a) Retire it (recommended).** Nothing writes to the table since OpenClaw was removed.
     Add `DROP FUNCTION IF EXISTS public.get_live_homepage_content(timestamptz); DROP TABLE IF
     EXISTS public.site_content_entries;` and remove the RPC call in
     `apps/site/lib/homepage-content.ts`. On production this does nothing; it makes local,
     preview, and CI environments match production. Risk: very low.
   - **(b) Restore it.** Copy `20260402210000` as-is into a new version. All its statements
     are idempotent (`IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`, `CREATE OR REPLACE`), and its
     dependencies (`public.profiles`, `public.update_updated_at()`) exist. It is safe to apply
     unedited. Risk: low. Do this only if someone plans to use the override.

4. **Optional hygiene:**
   - Move `pg_net` out of `public`. This is a separate change; check first that
     `nightly-aggregate-engagement` refers to `net.http_post`, which it does.
   - Drop the `backups.*_20260910` tables and the `_2026_08_25` backup table once they are no
     longer needed.
   - Codify `pg_cron`, `pg_net`, and the engagement cron job in a migration. The job needs the
     vault secret, which must stay out of the repo.

## Replay hazards (why the repair must not be "just run the missing files")

If the 16 unrecorded repo versions were pushed as SQL instead of repaired:

- `20260910093000` fails: `CREATE POLICY "Leaders can add group members directly"` has no
  `DROP POLICY IF EXISTS` for the new name.
- `20260917120000` fails: `CREATE TRIGGER protect_feedback_attribution` has no
  `DROP TRIGGER IF EXISTS`.
- `20260612153524` does not fail, but it overwrites the live `get_admin_analytics_overview`
  with June logic. Later files in the same push would overwrite it again, so the final state
  would depend on the whole batch succeeding. Because the two failures above abort the batch
  first, the function could be left on the June version.
- `20260905060000` ends with `SELECT public.refresh_analytics_monthly_rollup(...)`, which
  deletes and rebuilds 13 months of rollup rows. That is harmless when run alone, but it is a
  data rewrite.

Every other file in the set is idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, or
drop-then-create).

## Could not verify

- **Who dropped `site_content_entries` and when.** There is no DDL audit trail. Postgres logs
  only reach back about a day, and `backups.function_defs_20260910` does not include the
  function.
- **Who calls `count_user_sessions`.** Nothing in this repo references it. The likely caller
  is the separately deployed admin dashboard; not confirmed.
- **Why `20260612153524` was never recorded.** The git log shows it landed on 2026-06-12. It
  was probably superseded before anyone pushed it. The live state makes this moot.
- **Storage bucket settings and storage policy bodies.** Checked by name and public flag only;
  the policy expressions and bucket size and MIME limits were not diffed.
- **Supabase Auth settings, edge functions, and vault contents** beyond secret names were out
  of scope.
- **The hashes normalize `--` comments and whitespace.** Two statements that differ only in
  comment text inside string literals would compare equal. The four files where this matters
  were inspected by hand (the cosmetic cases above).
- **Advisors at report time:** security shows only expected INFO/WARN items (7 service-role-only
  tables with no policies, `pg_net` in public, 7 intentional authenticated SECURITY DEFINER
  RPCs, and the auth leaked-password and MFA settings). None of these indicate schema drift.
