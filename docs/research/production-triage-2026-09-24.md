# Production triage — 2026-09-24

Window: 2026-09-24 00:00 → ~08:35 UTC. Compared against 2026-09-23. Project `ganmududzdzpruvdulkg`.
Sources: Supabase unified logs (`function_edge_logs`, `function_logs`, `postgres_logs`,
`edge_logs`, `auth_logs`), read-only SQL, advisors. All figures are aggregates.

**Verdict: no production failures from today's deploys. No code fix was needed.** One known,
pre-flagged gap is still open (pg_net, §6). The signed-in sync paths have **not had live
traffic yet** (§7), so they were checked by simulation, not by real requests.

## 1. Edge functions (deploys 04:24–05:29 UTC)

| Function | Versions seen today | 2xx | Non-2xx |
|---|---|---|---|
| track-anonymous-usage-events | v12 → v13 (05:19) | 90 + 146 | one 400 at 05:29:33 (smoke probe) |
| review-chapter-feedback | v12 → v13 → v14 (05:27) | 19 + 4 + 32 | one 403 per version (wrong-passcode probes) |
| aggregate-engagement | v6 (cron 02:00) | 1 | — |
| submit-chapter-feedback v7, track-analytics-events v14, send-group-notification v1/v2, report-app-errors v1 | — | 0 | one 400/401 each, all within seconds of their deploy (unauthenticated smoke probes) |

- No 5xx, no timeouts. The only `function_logs` lines are boot (22–57 ms) and shutdown events. No
  `console.error` output and no unhandled exceptions.
- track-anonymous-usage-events p50 went from 1.04 s (v11) to 1.28 s (v13). The new
  `consume_analytics_ingest_budget` round trip accounts for the increase. p95 is unchanged at
  about 2.5 s. No client is anywhere near its budget (largest window: 12 requests and 23 events;
  limits are 300 and 3000). Geo enrichment is 100% (the new `cf-worker` source now appears
  next to `ipapi`).
- track-analytics-events has had no 2xx for two days. This is expected: the app sends every
  event through track-anonymous-usage-events.

## 2. Postgres

Nine ERROR lines today. All nine came from ad-hoc `mgmt-api`/MCP sessions: typos in
exploratory queries, one deliberate 42501 check of `merge_reading_plan_progress` at 05:17, and
this triage's own read-only probes. There are **no errors from `authenticated`/`anon`/`authenticator`**:
no 42501, no 22023, no deadlocks, no statement timeouts, no permission-denied errors.
One slow-query log: `get_admin_analytics_overview` over 180 days took 27 s at 01:19 (cold cache,
ad hoc). Re-measured now it takes 3.0 s, which is under the 8 s `authenticator` timeout. Keep an
eye on it; no action needed.

## 3. API gateway / PostgREST

Excluding functions, there were only two 4xx today: 5 × `POST /auth/v1/token` 400 ("Invalid login
credentials", 04:55–05:04) and 1 × `GET /rest/v1/` 401. There were no requests to `rpc/merge_*`,
`user_progress`, `user_preferences` or `user_reading_plan_progress` (see §7). Yesterday's 27 ×
`POST user_preferences` 400 (builds 430 and 447, and Android) stopped before
`20260923230713_align_user_preferences_sync_contract` was applied at 23:07. That migration added the
missing column and the EL palette ids.

## 4. `public.app_error_reports`

0 rows. The only request was the 04:37 smoke probe, which got a 400. No installed build sends reports yet.

## 5. Cron

| Job | Last run | Result |
|---|---|---|
| 1 nightly-aggregate-engagement | 02:00 | succeeded; the edge call returned 200 (`refreshed: 25, errors: 0`). This ran on v6; v7 has the same auth flow, and `service_role`/`postgres` keep EXECUTE on both RPCs and `net.http_post` |
| 2 nightly-analytics-maintenance | 02:30 | succeeded |
| 3 nightly-app-error-reports-purge | — | created after 02:45; first run is 2026-09-25 02:45. `purge_old_app_error_reports` exists and `postgres` can execute it |

## 6. Open item: pg_net still callable by anon/authenticated

`20260923233714_revoke_client_execute_on_pg_net` is recorded as applied, but Postgres skipped its
REVOKEs because `supabase_admin` owns the net objects. The migration raised its own WARNING at
23:37 yesterday. Live state: `anon`/`authenticated` hold USAGE on `net`, EXECUTE on every `net.*`
function, and SELECT/INSERT on `net._http_response`/`net.http_request_queue`. Exposure is low:
`net` is not a PostgREST schema and pg_graphql is not installed. **Lead action:** open a Supabase
support ticket to run the migration's statements as `supabase_admin`, then run
`supabase/tests/pg_net_client_access.sql`.

## 7. What had no live traffic (verified by simulation)

No signed-in session was active today: no `/auth/v1/user` calls, no refresh-token grants, and 0
signed-in analytics events (the previous 4 days had 3–4 signed-in users). None of the new
signed-in paths has handled a real request yet. Read-only checks, each inside
`BEGIN READ ONLY … ROLLBACK` as `authenticated`:

- `merge_user_progress` and `merge_reading_plan_progress` accept payloads in exactly the shape
  `syncService`/`buildRemoteReadingPlanProgressPayload` build. Both passed every 22023/42501 check
  and stopped only at the read-only guard. Stored `user_progress` rows are all compatible (numeric
  `chapters_read` values, at most 558 keys, no bad books or streaks).
- The RLS policies that call `private.is_group_member`/`is_group_leader`/`viewer_reported_prayer_request`
  evaluate for `authenticated` without error (EXECUTE is granted; schema USAGE is not needed at
  execution time).
- The installed 1.0.9 payloads still pass: the `profiles` upsert (it sends `email`; only
  `created_at` and `admin_role` are column-revoked, and the email trigger overwrites the value),
  the plan upserts (the new tombstone skip only makes `.single()` return an error, which 1.0.9
  swallows), and the `user_preferences` upsert (treated as a legacy writer by the stamp trigger).
- No FK to `profiles`/`auth.users` blocks account deletion. The unenrollment trigger is guarded by `pg_trigger_depth()`.

**Re-check after the first signed-in session:** filter `edge_logs` on `/rest/v1/rpc/merge_%` and
`postgres_logs` on `authenticated` errors.
