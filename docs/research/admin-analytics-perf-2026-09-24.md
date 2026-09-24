# Admin analytics performance (2026-09-24)

Scope: what admin.everybible.app runs for the overview, analytics, languages (atlas) and support pages, plus the catalog, app-errors, prayer-reports and translator-access pages. All database work was read-only on production (`ganmududzdzpruvdulkg`): SELECT, EXPLAIN (ANALYZE, BUFFERS), `pg_stat_statements`, catalog views. No DDL was run.

## Summary

- **The only slow query is `get_admin_analytics_overview`.** It is slow because of CPU, not I/O and not a missing index. Each row goes through `public.safe_numeric` and `public.analytics_listened_ms`. Both functions have `SET search_path` (added in `20260910091000`), and Postgres never inlines a SQL function that has a SET clause. The result is a full function call plus a GUC save/restore for every row and every field. Four helper calls over 27k rows took **3,111 ms**. The same expressions written inline took **25 ms**.
- **The fix belongs to another session.** Its migration `20260924150000_speed_up_admin_analytics_overview.sql` inlines the helpers and reads the window once, with byte-identical output. This branch has **no migration**. A version I wrote and measured is described below for comparison.
- **Every other admin query takes under 12 ms.** Every table they read has fewer than 250 rows (`analytics_events` is the only large one, at 27k rows and 16 MB). **No index is justified.**
- **App-side changes on this branch:**
  1. A 60 s shared cache for the overview's database result, which "Refresh stats" clears.
  2. One Supabase Auth round trip per render instead of four to six.
  3. The language atlas index is sent as the stored gzip file instead of 48 MB of re-serialized JSON.

## What each page runs

| Page | Loader → database call | Production timing |
| --- | --- | --- |
| Overview `/` | `getDashboardSummary` (4× `count exact`, parallel), `getHealthIssues` (sync runs + 216-row catalog), `getRecentAuditLogs`, `getAnalyticsOverview(30)`; all in `Promise.all` | counts ≤0.2 ms mean; catalog 2.7 ms mean; RPC see below |
| Analytics `/analytics?window=` | `getAnalyticsOverview(7/30/90/180)` → RPC + `user_engagement_summary` max `updated_at` (parallel) | RPC see below; summary <1 ms (25 rows) |
| Languages `/languages` | No database access. `/api/language-atlas` streams `data/language-atlas/index.json.gz`; profiles read one of 16 detail shards | stringify 55 ms + encode 12 ms per request, 48.3 MB body (before) |
| Support `/support/users[/id]` | profiles (≤100) then preferences/progress/engagement `in (...)` in parallel; detail: 8 parallel reads incl. `count_user_sessions` | all ≤1 ms mean; `count_user_sessions` for the heaviest user 4.5 ms (index-only scan on `idx_analytics_user_event`) |
| Translations, health, settings, feedback | catalog, versions, sync runs, audit log, chapter feedback | ≤3 ms mean each (`pg_stat_statements`, service_role) |
| App errors | `get_admin_app_error_summary` | table empty; `occurred_at` index exists |
| Prayer reports, translator access | reports/bans/terms, passcodes/uses | tables have 0–61 rows; needed indexes (`status, created_at`, `used_at`) already exist |

`pg_stat_statements` for service_role showed that nothing except the overview RPC averages above 3 ms. The RPC called through PostgREST had 352 calls, a 64 ms mean and a 3,005 ms max. The heaviest calls were the ad-hoc triage runs from earlier today: 26,973 ms and 37,571 ms (the latter a multi-window `WITH params` probe).

## `get_admin_analytics_overview` measurements

Both columns come from the same statement on production. Each row ran the live function and the rewritten body in turn, timed with `clock_timestamp()`, so both saw the same data and load:

| Window | Live function | Rewritten body | Output |
| --- | --- | --- | --- |
| 7 d | 244 ms | 77 ms | identical jsonb |
| 30 d | 797 ms | 284 ms | identical jsonb |
| 90 d | 1,920 ms | 452 ms | identical jsonb |
| 180 d | 3,021 ms | 612 ms | identical jsonb (120 KB, 147 locations) |

EXPLAIN (ANALYZE, BUFFERS) at 180 d:

| Metric | Live function | Rewritten body |
| --- | --- | --- |
| Execution time | 3,067 ms | 655 ms |
| Shared buffer hits | 3,015 | 4,912 |
| Temp read / written | 6,648 / 1,108 blocks | 2,275 / 455 blocks |

The rewritten body used more buffer hits because it read the window through `idx_analytics_created` with a poor row estimate. Neither version read from disk. The 27 s outlier was the same CPU-bound work running slower under load; the 8 s statement limit leaves little headroom for a 3 s query.

### What I would have changed, compared with the other session's migration

My version, not committed, was verified on production (jsonb equality for 7, 30, 90 and 180 days) and in PGlite (the `verify-analytics-sql.mjs` fixtures plus edge cases). It covered the same two main points as theirs: inlining the helpers and reading the window once. It differed in the following ways; the lead may want to fold them in:

1. **Add `SET work_mem TO '16MB'` on the function.** After the rewrite, the per-event rows for 180 days (~3.6 MB) still spill past the 3.5 MB default. Each call writes 455 temp blocks and reads them back several times. That temp I/O counts against the Micro instance's disk-IO budget, which was the subject of the September 11 alert. A function-level setting affects only this admin-only call. **Not measured:** a read-only session could not set it. Verify after applying with `EXPLAIN (ANALYZE, BUFFERS) SELECT public.get_admin_analytics_overview(...)` and look for `temp read/written`.
2. **Project narrow columns into the materialized CTE, not `event.*`.** Parse every number once, and tag each row with a family (`listening`, `reading`, `download`) and its minutes or units there. The downstream CTEs then never carry the jsonb.
3. **Aggregate the daily series first** (`GROUP BY day`, then `LEFT JOIN` the calendar), instead of joining every event to the calendar on `date_trunc(...)`.
4. **Watch out for `jsonb_to_record`.** I did not use it, and a single-pass property extraction via `jsonb_to_record` needs its own equality check if anyone tries it.

### Why no index and no rollup

- `analytics_events` has 27k rows (9 MB heap), and the window filter already uses `idx_analytics_created` or `idx_analytics_event_created`. The time goes to per-row expression evaluation, which an index cannot remove.
- `analytics_monthly_rollup` cannot serve this RPC without changing its numbers:
  - Its grain is `(day, country_code, translation_id, event_family)`. It has no 0.1° location buckets, no distinct listener counts, no session counts and no collection-health counts.
  - Its country is column-only, while the RPC falls back to the property for audio and downloads.
  - It is refreshed by job, not live.

  It could feed only the daily series and country totals, and those are the cheap parts. Revisit it when `analytics_events` reaches millions of rows.
- Every other admin table has fewer than 250 rows. Advisors already list 30 unused indexes, so adding more would only cost writes.

## App-side changes on this branch

1. **Short-TTL overview cache** (`apps/admin/lib/admin-data.ts`):
   - How it works:
     - The RPC result and the engagement timestamp are cached with `unstable_cache` for 60 s, keyed by window start and window length, with the tag `admin-analytics-overview`.
     - The admin check runs before the cache is touched. A test asserts that a refused caller never reaches it.
     - Shaping stays outside the cache, so a deploy that changes it takes effect immediately.
     - Errors are thrown, so they are never cached.
   - What it saves: the overview page's 30 d RPC, the analytics page and the operator assistant now share one database call per minute.
   - Refreshing: `refreshEngagementStats` (the "Refresh stats" button) calls `revalidateTag` in a `finally` block. A failed engagement job still shows live numbers.
   - `retrievedAt` now reports when the data was actually read.
2. **One auth round trip per render** (`apps/admin/lib/admin-auth.ts`):
   - **Before:** `requireAdminIdentity` called `supabase.auth.getUser()` twice, once directly and once through `getAdminIdentity`. The layout, the data layer and some pages each ran it. A dashboard render made 4–6 Auth API round trips and 2–3 profile reads.
   - **After:** it reuses the verified user and is wrapped in React `cache`. A render makes one `getUser()` and one profile read.
   - Server actions, route handlers and calls outside a render still verify on every call. Tests cover both cases.
3. **Language atlas index** (`apps/admin/app/api/language-atlas/route.ts`, `lib/language-atlas/server.ts`):
   - **Before:** every request ran `JSON.stringify` on the memoized 48.3 MB index (55 ms), encoded it (12 ms, plus about 100 MB of transient allocation) and streamed 48 MB.
   - **After:** clients that accept gzip (every browser) get the stored 4.36 MB `index.json.gz` bytes, streamed with `Content-Encoding: gzip` and `Vary: Accept-Encoding`. Other clients keep the JSON path.
   - Auth, `no-store` and the error handling are unchanged. The index handler now takes the `Request`, which Next already passes.

## Verification

- `npm test`: 6,723 pass, 0 fail.
- Admin `tsc -p tsconfig.typecheck.json`: passes.
- Admin lint: 0 errors, 1 warning that was already there.
- `npm run format:check`: clean.
- `next build` (apps/admin): succeeds.
- New tests:
  - `lib/admin-auth.test.ts`: one `getUser` per check, sharing within a render, re-verification outside one. The single-`getUser` test fails on the old code.
  - `lib/admin-data.behavior.test.ts`: cache key, TTL and tag; a refused caller never reaches the cache.
  - `app/(dashboard)/serverActions.test.ts`: the tag is revalidated on refresh success and on failure.
  - `lib/language-atlas/api.test.ts`: gzip passthrough, the `q=0`, `br` and `identity` fallbacks, 401 before any read, read failures.
  - `lib/language-atlas/server.test.ts`: the stored bytes are read once, and a failed read is retried.
- `apps/admin/lib/testing/adminTestHarness.ts` gained `mockNextCache`, and `mockNextServerRuntime` now records `revalidateTag`.

## Follow-ups

- **After deploy:** confirm that `/api/language-atlas` returns `content-encoding: gzip` at about 4.4 MB in DevTools. Vercel should pass through an existing `Content-Encoding`; this was not observed live, because the route needs an admin session.
- **After the other session's migration is applied:** re-run the 7, 30 and 180 day EXPLAIN. If temp blocks remain, apply point 1 above.
- The Vercel data cache skips entries over 2 MB. The 180 d payload is 120 KB, so this is not near the limit.
- `scripts/verify-analytics-sql.mjs` loads only `20260905060000`, and its `safe_numeric` stub lacks the 1e9 bound. The other session's migration should be added to it, with the real helper definitions from `20260910091000`, so the fixture checks the live definition.
