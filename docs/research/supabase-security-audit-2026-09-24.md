# Supabase security audit — 2026-09-24

Scope: production project `ganmududzdzpruvdulkg` (read-only catalog queries through the Supabase MCP),
edge functions in `supabase/functions/`, and the code in `src/` and `apps/` that calls Supabase.
Baseline: `main` @ 63ba5cf9. Nothing was applied, deployed, or written to the database.

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 1 |
| Medium   | 4 |
| Low      | 10 |

No finding lets one user read another user's private rows. Every per-user table (`profiles`,
`user_progress`, `user_preferences`, `user_annotations`, `user_devices`, `user_saved_plans`,
`user_reading_plan_progress`, `user_translation_preferences`, `user_engagement_summary`,
`analytics_events`, `chapter_feedback_submissions`) is scoped to `auth.uid()` for both USING and
the (explicit or defaulted) WITH CHECK. No policy reads `user_metadata`, and no write policy uses `true`.

The one High finding is a storage policy that authorizes writes against the wrong column. The
groups feature has not launched yet (`groups` = 0 rows, and `group-images`/`study-materials` hold 0
objects), so no user data is at risk today. The write primitive can still be abused now.

What the audit confirmed is in place:

- RLS is enabled on every table in `public`. Only `public` and `graphql_public` are exposed. I
  confirmed this with PostgREST, which returned `PGRST106 … Only the following schemas are exposed:
  public, graphql_public`. The `backups` schema has no grants.
- There are no views or materialized views in exposed schemas. The `supabase_realtime`
  publication is empty, and `pg_graphql` is not installed.
- All 15 SECURITY DEFINER functions pin `search_path`. None of them can be run by `anon`. The 7
  that `authenticated` can run each derive the caller from `auth.uid()` or are pure
  lookups (see L1).
- `profiles.admin_role` cannot be written by clients. `authenticated` has column-level INSERT and
  UPDATE on every other column except `admin_role`. The admin app gates on that column
  (`apps/admin/lib/admin-auth.ts:56`).
- The service-role key is only read in server-only modules (`apps/admin/lib/supabase/service.ts`,
  `apps/site/lib/supabase/service.ts`). Those modules are imported only by server actions
  and route handlers, and every admin one calls `requireAdminIdentity()` / `getAdminIdentity()`.
  No `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*` variable carries a secret key, and no JWT-shaped
  literal is committed.

---

## High

### H1 — Storage policies for `group-images` and `study-materials` bind `name` to `groups.name`, so any signed-in user can write to or delete from the whole bucket

**Evidence**

- `select policyname, qual, with_check from pg_policies where schemaname='storage'` shows
  `group_image_insert`, `group_image_update`, and `group_image_delete` with
  `(groups.id)::text = (storage.foldername(groups.name))[1]`. The inner leader check of
  `materials_delete` has the same expression.
- Source: `supabase/migrations/20260322140100_create_storage_buckets.sql:34-62,95-107` writes an
  unqualified `storage.foldername(name)` inside `SELECT … FROM public.groups`. `public.groups`
  has its own `name` column, so Postgres resolves the reference to the group's display name, not
  the object path. (The `group_members` subqueries are unaffected because that table has no
  `name` column.)
- Constraints make the exploit easy. `groups_name_check` allows 3–80 characters, so a 38-character
  `"<uuid>/x"` is valid. `groups.id` accepts client-supplied values, and the `Leaders can update
  groups` policy allows renaming.

**Exploit**

1. A signed-in attacker inserts `groups(id = G, name = 'G/x', leader_id = me, join_code = …)`.
2. The attacker inserts `group_members(G, me, 'leader')`, which the "Leaders can add group members
   directly" policy allows. This makes G visible to the attacker under the groups SELECT policy.
3. For every object in `group-images`, the EXISTS now reduces to "a group exists that I lead and
   whose name starts with its own id". That is true for every object, so the attacker can
   `upload`, `upsert`, or `remove` any path in the bucket. That includes other groups'
   `{groupId}/cover.*` images once the feature ships.
4. Right now the same steps give free public hosting under
   `…supabase.co/storage/v1/object/public/group-images/…`. Uploads are limited to jpeg/png/webp
   and 5 MB.
5. In `study-materials`, any member of a real group G2 who also leads a crafted group can delete
   all of G2's files. Normally only G2's leader can delete them.

**Fix**

Migration `supabase/migrations/20260923225732_fix_group_storage_policy_name_resolution.sql` (not
applied). It recreates the four policies with `storage.foldername(objects.name)` and aliased
tables, and adds an explicit WITH CHECK to `group_image_update`. I checked the qualified
expression with `EXPLAIN`, and the plan binds `(storage.foldername(objects.name))[1] =
(g.id)::text`. After applying it, re-run the verification query in the migration footer.

---

## Medium

### M1 — The anonymous analytics collector has no authentication and no throttle; every analytics write path accepts backdated or oversized rows

**Evidence**

- The deployed `track-anonymous-usage-events` runs with `verify_jwt=false`.
  `supabase/functions/track-anonymous-usage-events/index.ts:338-339,399-455` accepts up to 500
  events per request, each with up to 4 KB of properties. It writes with the service role and has
  no per-IP or per-install rate limit. Any request that lacks a country code triggers
  `resolveRequestGeo`, which calls ipinfo.io using the paid `IPINFO_TOKEN`, or ipapi.co.
- `track-analytics-events` requires a verified user but does not clamp `queued_at`: the handler
  writes `created_at: event.queued_at || now` (`index.ts:390`). It also has no size cap on
  `event_properties`.
- Clients can bypass both edge functions. `analytics_events` has an `events_insert_own` policy, so
  `authenticated` can insert rows directly with any `created_at` and any size of properties.
  `public.batch_track_events(jsonb)` (SECURITY DEFINER, callable by `authenticated`) inserts an
  unbounded array with a caller-chosen `created_at`.

**Exploit**

- A script with no credentials can loop over 500 × 4 KB batches, about 2 MB per request, without
  limit. This fills `analytics_events`, which drives disk growth and I/O (see
  `docs/research/supabase-disk-io-2026-09-15.md`). It also spends ipinfo quota and floods the
  admin dashboards.
- A single account can rewrite historical rollups with backdated events.

**Fix**

- Add a per-IP-hash token bucket to the collector, reusing the `client_ip_hash` pattern from
  `submit-chapter-feedback`. Skip the geo lookup when a request is over budget.
- Apply the collector's 30-day floor, clamp to now, and 4 KB cap in `track-analytics-events`.
- Drop the `events_insert_own` INSERT policy and revoke `batch_track_events` from
  `authenticated`, if the app no longer calls them. `grep` finds no `rpc('batch_track_events')`
  in `src/`; confirm this before revoking.

### M2 — One shared translator passcode gives every holder all chapter feedback PII for every translation

**Evidence**

- `supabase/functions/review-chapter-feedback/index.ts:228-230` authorizes with a single
  `TRANSLATOR_REVIEW_PASSCODE`. After that check, `translationId` comes from the caller
  (`:346`), so one passcode reads every translation. The response includes participant names and
  roles, comments, and one-hour signed URLs to voice recordings (`:506-560`).
- Actors are only identified when a JWT happens to be present (`:172-192`), so there is no
  per-translator audit trail.
- `isPasscodeLockedOut` fails open when the counter query errors (`:153-156`).
- Both the lockout and the anonymous submit throttle key on `cf-connecting-ip`, and fall back to
  the first `x-forwarded-for` entry, which the client controls (`:111-115`,
  `_shared/councilAccess.ts:9-11`). **Not verified:** whether the Supabase edge always overwrites
  a client-sent `cf-connecting-ip`. If it does not, the 10-per-15-minute lockout can be bypassed
  by rotating the header.

**Exploit**

Anyone who has the passcode, including a former translator, a leaked build config, or a shared
chat, can scrape every submitter's name, comments, and recordings across all languages. They can
also mark anyone's feedback as resolved.

**Fix**

- Short term: make the lockout fail closed, as `verifyCouncilAccess` already does. Rotate the
  passcode. Confirm the header behaviour by sending a request with a forged `cf-connecting-ip`
  to a staging copy.
- Proper fix: replace the shared secret with per-translator accounts. Store a `reviewer_scopes`
  (user_id, translation_id) table, require a verified JWT, and filter by scope.

### M3 — `translation_catalog` shows `admin_notes` and pre-launch download URLs to `anon`

**Evidence**

- `catalog_select_anon` / `catalog_select_all` use `qual = true`. The table has 216 rows, 214
  of them `is_available = false`. Seven rows carry `admin_notes`, and seven carry
  `upstream_payload` with `downloadUrl`, `sha256`, and `packVersion`.
- Columns are listed in `information_schema.columns`. Anyone can read them with the
  publishable key.

**Exploit**

Anyone can list gated or unlaunched translations, read internal notes, and fetch their packs
directly. This bypasses the client-side launch gate, for example `EXPO_PUBLIC_EL_MEDIA_SOURCE`.

**Fix**

Change both SELECT policies to `using (is_available)`. Do not use column revokes:
`src/services/translations/translationService.ts:43-46` does `select('*')`, so column revokes
would break shipped builds. It already filters `is_available = true`. The case-insensitive lookup
in `src/services/bible/cloudTranslationService.ts:426-432` falls back to `storeId` when no row is
visible, so it degrades safely. Move `admin_notes` and `upstream_payload` to an admin-only side
table later.

### M4 — UPDATE policies do not constrain `group_id`, which bypasses the membership INSERT checks (groups feature, not launched)

**Evidence** (from `pg_policies`)

- `prayer_update_creator`: USING `user_id = auth.uid()`, no WITH CHECK. INSERT requires
  membership, but UPDATE lets the author set `group_id` to any group.
- `Session creators can update sessions` (`group_sessions`): same pattern on `group_id`. It also
  keeps working after the creator leaves the group.
- `Leaders can update membership` (`group_members`): WITH CHECK is only
  `is_group_leader(group_id, auth.uid())`, so a leader can rewrite `user_id` and enroll any user
  without consent.
- `Leaders can update groups`: WITH CHECK calls `is_group_leader(id, auth.uid())`. That
  STABLE function reads the pre-update snapshot, so a leader can set `leader_id` to any profile.

**Exploit**

This needs a target group UUID, which only members can see. That limits it to former members,
leaked links, and push payloads (`send-group-notification` puts `groupId` in `data`). Once an
attacker has the UUID, they can post prayer requests or sessions into a group they do not belong
to, or force-add users.

**Fix**

Add WITH CHECK clauses that re-assert membership on the new row:
`is_group_member(group_id, auth.uid())` for prayers and sessions. For `group_members`, check
`user_id = old user_id`. Postgres has no OLD in policies, so do this with a BEFORE UPDATE trigger
that raises when `group_id` or `user_id` changes, or revoke UPDATE on those columns. For
`groups.leader_id`, require that the new leader is an existing member. Land this before the groups
feature ships.

---

## Low

**L1 — The group membership helpers work as a membership oracle.** `is_group_member(p_group_id,
p_user_id)` and `is_group_leader(…)` are SECURITY DEFINER functions that `authenticated` can call
through `/rest/v1/rpc/…` (advisor `authenticated_security_definer_function_executable`). They
accept any `p_user_id`, so any user can test whether user X belongs to group Y. Fix: move both to
a non-exposed `private` schema and keep EXECUTE for `authenticated` so the policies still work.
The advisor also lists `delete_my_account`, `join_group_by_code`, `leave_group`,
`refresh_my_engagement`, and `batch_track_events`. All of those derive the caller from
`auth.uid()` and are intentional, apart from M1 for `batch_track_events`.

**L2 — Tables with RLS on and no policies still carry full grants to `anon` and `authenticated`.**
This covers `admin_audit_logs`, `analytics_monthly_rollup`, `content_images`,
`translation_sync_runs`, `translator_review_attempts`, and `verse_of_day_entries` (advisor
`rls_enabled_no_policy`), plus a DELETE grant on `profiles` that no policy uses. RLS blocks
access today. One stray `permissive … using (true)` would expose them. Fix: `revoke all … from
anon, authenticated` on these tables. Only the service role reads them.

**L3 — `anon` and `authenticated` can run `net.http_post`, `net.http_get`, and `net.http_delete`.**
They also have USAGE on schema `net` (from `has_function_privilege` and `has_schema_privilege`).
`net` is not exposed (PGRST106), so this is only reachable through a future SQL-injection path or
an invoker function. Fix: revoke those privileges. The advisor also flags `pg_net` as installed
in `public`.

**L4 — Storage buckets can be listed, and group images are world-readable.** `avatar_select`
(role `public`) and `content_images_public_read` allow `list()` on public buckets. Avatar folders
are user UUIDs, so this enumerates every user who uploaded an avatar. `group-images` is
`public = true`, so its members-only SELECT policy has no effect on public URLs. Fix: drop the
broad SELECT policies on public buckets, since public URLs don't need them. Make `group-images`
private and serve signed URLs.

**L5 — `join_group_by_code` can be brute-forced.** It is SECURITY DEFINER with a 6-character
`[A-Z0-9]` code (`groups_join_code_check`) and no attempt limit. Today there are 0 groups. At
scale, N groups gives N/2.2B odds per call. Fix: add a per-user attempt counter, or use longer
codes.

**L6 — Auth hardening options are off.** Leaked-password protection (HaveIBeenPwned) is disabled,
and few MFA factors are enabled (advisors `auth_leaked_password_protection` and
`auth_insufficient_mfa_options`). Fix: enable both in the Auth settings. The one
`super_admin` should use TOTP.

**L7 — Edge functions return raw database or storage error messages and send `CORS: *`.**
Examples: `submit-chapter-feedback/index.ts:499,529`, `review-chapter-feedback/index.ts:280,300,…`,
`track-anonymous-usage-events/index.ts:458`. These unauthenticated callers receive PostgREST error
text such as constraint and column names. Fix: return a generic error and `console.error` the
detail. CORS `*` is acceptable because no endpoint uses cookies.

**L8 — `profiles.email` is user-editable and does not track `auth.users.email`.**
`authenticated` has column UPDATE on `email` and `created_at`. The admin identity prefers
`profile.email` (`apps/admin/lib/admin-auth.ts:62`). This only affects display, but any future
use of `profiles.email` for a lookup would be spoofable. Fix: revoke UPDATE on
`(email, created_at)`, or sync the column from `auth.users` in a trigger.

**L9 — Account deletion leaves storage objects behind.** `delete_my_account()` deletes
`auth.users` and relies on FK cascades. Objects under `avatars/{uid}/…` and
`chapter-feedback-audio/{uid}/…` are not removed (12 feedback recordings exist). Fix: delete the
user's storage prefix in an edge function before calling the RPC. Also confirm that deletion is
covered for privacy requests.

**L10 — Secondary items.** `send-group-notification` is not deployed. When it ships, any member
can push arbitrary text to every member with no rate limit. The dev translator passcode is read
only under `__DEV__` (`src/stores/translatorReviewStore.ts:48-55`); I did not verify that the
literal is absent from a release IPA bundle. Users can register another user's Expo push token,
because `user_devices` is unique only on `(user_id, push_token)`.

---

## Edge functions: deployed vs repo

I fetched the deployed sources with MCP `get_edge_function` and diffed them against the repo.

- `submit-chapter-feedback` (v5, including `_shared/councilAccess.ts` and `feedbackAudio.ts`),
  `track-analytics-events` (v12), and `track-anonymous-usage-events` (v11) are **identical** to
  the repo.
- `review-chapter-feedback` (v10) matches the repo source.
- `aggregate-engagement` (v5) **has drifted from the repo, but not in a way that affects
  security.** The auth gate (lines 1–68) is identical: a bearer check, then
  `authorize_engagement_refresh` called with the caller's token. After that point, the deployed
  version still runs the old inline per-user N+1 aggregation (217 lines). The repo delegates to
  `rpc('refresh_engagement_summaries')` (84 lines). Redeploy to remove the drift. The response
  shape also differs.
- `send-group-notification` is in the repo but **not deployed**.

Function auth summary:

| Function | verify_jwt | Auth in code | Notes |
|---|---|---|---|
| submit-chapter-feedback | false | optional user JWT via `auth.getUser`; council category requires `SCRIPTURE_COUNCIL_PASSCODE` | 20/h per user or per IP hash, fails closed; audio re-validated server-side (container parse, own-prefix path, `..` rejected) |
| review-chapter-feedback | false | shared `TRANSLATOR_REVIEW_PASSCODE` | M2 |
| track-analytics-events | false | requires a user JWT verified with `auth.getUser` | M1 (no clamp or cap) |
| track-anonymous-usage-events | false | none; attributes `user_id` only after `getUser` | M1 (no throttle) |
| aggregate-engagement | true | also calls `authorize_engagement_refresh()` with the caller's token, which PostgREST resolves to the service role | cron uses a vault-stored key |
| send-group-notification | (not deployed) | user JWT plus a membership check | L10 |

## Performance advisors (for completeness)

There are no security-relevant performance lints. Findings: 5 tables without a primary key
(backups, plus `analytics_monthly_rollup`), 30 unused indexes, mostly on unlaunched group tables,
and the Auth connection pool set to an absolute value.

## Method and queries

All queries were run read-only through MCP `execute_sql`:

- RLS status and grants: `pg_class.relrowsecurity` joined with `has_table_privilege('anon'|'authenticated', …)`
  for every relation outside system schemas.
- Policies: `select * from pg_policies where schemaname in ('public','storage')`.
- SECURITY DEFINER functions: `pg_proc.prosecdef`, `proconfig`, and `has_function_privilege`, with
  bodies from `pg_get_functiondef`.
- Column grants: `information_schema.column_privileges` for `profiles`.
- Buckets: `storage.buckets`. Object counts: `storage.objects group by bucket_id`.
- Cron and realtime: `cron.job` (secrets redacted in output) and `pg_publication_tables`.
- Schema exposure: a single GET to `/rest/v1/` with `Accept-Profile: net` and the publishable key,
  which returned PGRST106.
- Advisors: `get_advisors` for both security and performance.

Not verified: whether Supabase's edge overwrites a client-supplied `cf-connecting-ip` (M2);
whether the release JS bundle omits the dev passcode (L10); Auth dashboard settings beyond what
the advisors report.

## Status — remediation applied 2026-09-24

Applied to production (versions as recorded in `supabase_migrations.schema_migrations`; repo files renamed to match):

| Finding | Migration / deploy | Verified |
|---|---|---|
| H1 group storage policies | `20260923230718_fix_group_storage_policy_name_resolution` | policies reference `objects.name` |
| M1 analytics ingest | `20260923233256_analytics_ingest_throttle`, `20260923233653_close_analytics_direct_insert`; `track-anonymous-usage-events` v12, `track-analytics-events` v13 | anon/authenticated INSERT on `analytics_events` = false; collectors answer probes |
| M2 translator passcode | `review-chapter-feedback` v11, `submit-chapter-feedback` v6 | wrong passcode → 403 |
| M3 catalog exposure | `20260923233258_restrict_translation_catalog_to_available_rows` | anon sees 2 rows (was 216) |
| M4 / L1 / L5 groups | `20260923233220_pin_group_scope_and_harden_group_helpers` | no 2-arg helpers remain; 9 policies use 1-arg helpers |
| L2 service-only grants | `20260923233710_revoke_client_grants_on_service_only_tables` | anon SELECT on `content_images` = false |
| L3 pg_net | `20260923233714_revoke_client_execute_on_pg_net` | **not effective**: objects are owned by `supabase_admin`; anon still has EXECUTE. Needs a Supabase support request. |
| L4 bucket listing | `20260923233717_restrict_public_bucket_listing` | applied |
| L8 profile email | `20260923233721_protect_profile_email` | 0 profile/auth email mismatches |
| L7 raw errors, L9 account deletion | edge deploys above; L9 ships with the next app release | — |

Still open: per-team translator passcodes / contributor-name policy (see `translator-access-options-2026-09-24.md`), leaked-password protection and TOTP MFA (dashboard settings), and the M3 side-table move below.

**M3 follow-up (written, not applied).** `admin_notes`, `upstream_payload`, `upstream_external_id`
and `sync_run_id` move from `translation_catalog` to `translation_catalog_admin` (RLS on, no
policies, client grants revoked). Dropping the columns keeps `select('*')` working in every shipped
build; it just stops returning them. Apply in this order:

1. `20260924014149_add_translation_catalog_admin_side_table` — creates and backfills the side table
   and installs a transition trigger that mirrors the old admin build's writes to the old columns.
   Safe while the old admin build is still serving.
2. Deploy `apps/admin` (reads the side table through a PostgREST embed, writes notes and upstream
   provenance to it).
3. `20260924014641_drop_translation_catalog_admin_columns` — only after step 2 is live everywhere;
   the old build selects these columns by name. Drops the trigger, reconciles, drops the columns.

Verify after step 3: `select column_name from information_schema.columns where table_name =
'translation_catalog'` lists none of the four; `has_table_privilege('anon',
'public.translation_catalog_admin', 'SELECT')` is false; the admin translation detail page still
shows notes and the upstream payload.

---

## Pass 2 — adversarial review of the day's changes (2026-09-24, evening)

Scope: `git log --since="2026-09-24 00:00"` on `hardening/security` (base `91c0a8f4`): per-team
translator passcodes, prayer-wall hardening and moderation, `app_error_reports` +
`report-app-errors`, group create/join RPCs, throttles and `send-group-notification`, the atomic
merge RPCs, account-deletion leftovers, per-account private data, and the PKCE reset link. Live
state was checked read-only (MCP `execute_sql` with SELECT / `pg_get_functiondef`, a
`begin read only; set local role authenticated` policy probe, `get_advisors`,
`list_migrations`, `get_edge_function`). Nothing was applied or deployed.

### Findings

| #     | Sev                | Location                                                                                                                   | Exploit                                                                                                                                                                                                                                                                                  | Status                                                                                                                                                                 |
| ----- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-1  | High               | `review-chapter-feedback/index.ts` (lockout read at the top, failure recorded after the check); `_shared/councilAccess.ts` | Lockout was read-then-record. N parallel guesses from one address all read "under 10" and were each evaluated, and a correct guess answered 200 regardless. A 30-request burst tested 30 codes (reproduced in `councilAccess.test.ts`: 30 evaluated where the limit is 10).              | **Fixed** + migration `20260924200000_claim_passcode_attempt`                                                                                                          |
| P2-2  | High               | Shared translator and council secrets; `apps/admin` `DEFAULT_TEAM_PASSCODE_LENGTH = 6`                                     | Codes are very likely 6 digits (keypad builds before today stop at 6), and the lockout is per IPv4 address only. With 1,000 rotating proxies at 10 guesses per 15 minutes each, a 10⁶ space falls in about 12 h on average. Every active team code adds another target per guess.        | **Reported.** Rotate shared/council codes to ≥10 digits once the 12-digit keypad build is widespread; default team codes to 10. Not verified: the live secret lengths. |
| P2-3  | Med                | `submit-chapter-feedback/index.ts` (row count, then a later insert)                                                        | The 20/h limit (per user or hashed IP) was a COUNT in one request and an INSERT in another, after an optional 5 MB upload. A parallel burst stored unbounded rows and recordings, with no auth required.                                                                                 | **Fixed** + migration `20260924200100_feedback_submission_budget`                                                                                                      |
| P2-4  | Med                | `send-group-notification/index.ts`; `user_devices` is unique on `(user_id, push_token)`                                    | Deactivating the token on sign-out is best effort: it is skipped offline and impossible once the server has ended the session. After an account switch, the phone kept the previous account's active row and kept receiving its group pushes and group names.                            | **Fixed** server-side: a token goes only to its most recent registrant, which covers all shipped builds                                                                |
| P2-5  | Low–Med            | `_shared/analyticsIngest.ts` `consumeIngestBudget` (repo only, not deployed)                                               | A limiter error or today's 3 s timeout failed open for writes. A flood that queues on its own throttle row made the limiter "unavailable" on demand and bypassed the per-address budget.                                                                                                 | **Fixed**: degraded now refuses with `Retry-After: 60`; the app queue keeps the batch and retries it                                                                   |
| P2-6  | Low                | `src/services/auth/authDeepLink.ts` `activatePendingPasswordRecovery`                                                      | auth-js 2.101.1 deletes the PKCE verifier on every sign-out (`GoTrueClient.js` 3169/3979). Signing a signed-in user out before the exchange guaranteed failure. Any crafted `reset-password?code=` link signed the user out, and reset their per-user stores, once they tapped Continue. | **Fixed** (ships with the next app build)                                                                                                                              |
| P2-7  | Low                | `groups` policy "Leaders can create groups"                                                                                | `create_group()` replaced the direct insert, but the policy stayed. Any user can still POST `/rest/v1/groups` with a chosen id, join code, `created_at` and `archived_at`, and skip the leader membership.                                                                               | **Migration** `20260924200200_retire_direct_group_inserts`                                                                                                             |
| P2-8  | Low                | `submit-chapter-feedback/index.ts` pre-uploaded path check                                                                 | Only a literal `..` or `\` was rejected, so `uid/%2e%2e/…`, `//` and `./` passed the prefix check. Not confirmed exploitable against Storage.                                                                                                                                            | **Fixed**: segment allowlist, `.m4a` only                                                                                                                              |
| P2-9  | Low                | `_shared/passcodeAttempts.ts:55-59`; `chapter_feedback_submissions.client_ip_hash`, `translator_review_attempts.ip_hash`   | Unsalted SHA-256 of an IPv4 address. Anyone with a DB export recovers every submitter IP by hashing all 2³² addresses.                                                                                                                                                                   | Reported. Use HMAC-SHA256 with a new function secret (resets live lockout windows once).                                                                               |
| P2-10 | Low                | `review-chapter-feedback/teamPasscodeHash.ts:9-13`                                                                         | One SHA-256 over `salt:code`. A leaked table gives up 6-digit team codes instantly; the salt doesn't help with a 10⁶ space.                                                                                                                                                              | Reported. Add a server-side pepper (`sha256-salt-v2`, HMAC), with the matching change in `apps/admin`.                                                                 |
| P2-11 | Low (privacy)      | `src/services/notifications/notificationBootstrap.ts:22-28`                                                                | Discreet (calculator) mode still shows banners labelled "Every Bible", the daily reminder text, and group names.                                                                                                                                                                         | Reported. When discreet mode is on, return `shouldShowBanner: false`, neutralise or cancel the reminder, and flag the token so the server skips group pushes.          |
| P2-12 | Low                | `src/services/privacy/privacyInstallationAdapter.ts` (fresh-install branch)                                                | iOS keeps keychain items after uninstall. The fresh-install reset clears only the privacy PIN, so a reinstall restores the Supabase session and the translator/council passcodes.                                                                                                        | Reported. Also delete `sb-<ref>-auth-token` (plus `-code-verifier`, `-user`) and both passcode keys there.                                                             |
| P2-13 | Low                | `src/services/diagnostics/crashLogEntry.ts:31-35` (owned by the diagnostics agent)                                         | The on-device crash log keeps unscrubbed `error.message`/`stack`. It is shared across accounts, survives sign-out, and can be exported from Diagnostics.                                                                                                                                 | Reported. Apply `scrubErrorText` to `message` and `stack` in `toCrashLogEntry`.                                                                                        |
| P2-14 | Low                | `prayer_interactions` policy `interaction_insert_member`                                                                   | Checks membership only. A member can still react to a request hidden by reports or moderation, or by a user they blocked, if they hold its id.                                                                                                                                           | Reported. Add `pr.hidden_at is null` to the policy's EXISTS.                                                                                                           |
| P2-15 | Low (pre-existing) | `storage.buckets` `study-materials`                                                                                        | `allowed_mime_types` is null, so any member can upload any type (HTML/SVG) up to 10 MB. The groups feature is unlaunched and the bucket holds 0 objects.                                                                                                                                 | Reported. Set an allowlist before launch.                                                                                                                              |
| P2-16 | Info               | All 7 deployed edge functions                                                                                              | Every deployed function predates today's later repo commits. The access-control files are byte-identical. `submit-chapter-feedback` v7 lacks the text-length caps from 72d43ad5.                                                                                                         | Redeploy (list below)                                                                                                                                                  |

Also reported, with no fix proposed: account deletion has no re-authentication (a single confirm
in `DeleteAccountModal.tsx`); the privacy PIN lockout is wall-clock based, so changing the device
clock skips it; analytics and crash reporting continue in discreet mode. Repo migration
`20260924111958_merge_user_progress_same_day_ties` (repo name was 20260924130000) was applied live on 2026-09-24.

### Checked and sound

- All 28 SECURITY DEFINER functions in `public`/`private` pin `search_path`. Only `create_group`,
  `join_group_by_code`, `leave_group`, `report_prayer_request`, `delete_my_account`,
  `refresh_my_engagement`, and the `private` helpers used by policies are executable by
  `authenticated`. Each one derives the caller from `auth.uid()`. `claim_group_session_notification`
  and the budget/purge functions are service role only.
- `private` is not exposed, and client roles have no USAGE on it. Policies still call
  `private.is_group_member()` because stored expressions bind by OID. I reproduced this in PGlite
  and did not treat it as a finding.
- New tables (`translator_team_passcodes`, `translator_access_settings`,
  `translator_shared_passcode_uses`, `prayer_request_reports`, `prayer_wall_bans`,
  `prayer_content_filter_terms`, `app_error_reports`, `private.group_join_attempts`,
  `private.group_session_notifications`) have RLS on and no client grants.
- Prayer moderation columns cannot be written by clients. `protect_prayer_request_moderation`
  resets `hidden_at`/`hidden_reason` for `anon`/`authenticated`, `stamp_prayer_request` pins
  `created_at` (so the posting throttle can't be backdated), and `forbid_scope_change` pins
  group/author.
- The `join_group_by_code` throttle keys on `cf-connecting-ip`/`x-real-ip`, never
  `x-forwarded-for`. Storage policies after H1 reference `objects.name`.
- `send-group-notification` sends only server-written text, gated by the atomic claim. Push
  `data` carries only the verified `groupId`, and the app routes no group payloads.
- Reset links: exact scheme and host, PKCE code only, `access_token`/`refresh_token` fragments
  refused, `detectSessionInUrl` off, constant redirect.
- No live secrets in today's diffs. The JWT-shaped strings are test fixtures, `.env` has never
  been tracked, and the dev passcode is read only under `__DEV__`.

### Migrations written (NOT APPLIED)

1. `20260924200000_claim_passcode_attempt.sql`: `claim_passcode_attempt(ip_hash, threshold,
window_seconds)`, service role only. It counts and records under an advisory lock, returns null
   when locked out, and prunes rows older than 1 day about 1% of the time. Rollback:
   `drop function if exists public.claim_passcode_attempt(text, integer, integer);`
2. `20260924200100_feedback_submission_budget.sql`: `consume_feedback_submission_budget(key,
max, window_seconds)`, service role only, restricted to `feedback-submit:*` keys on the UNLOGGED
   `analytics_ingest_throttle`. Rollback: drop the function and `delete from
public.analytics_ingest_throttle where client_key like 'feedback-submit:%';`
3. `20260924200200_retire_direct_group_inserts.sql`: drops "Leaders can create groups" and
   revokes INSERT on `groups` from anon/authenticated. Rollback: re-grant INSERT and recreate
   the policy (SQL in the file header).

1 and 2 were run in PGlite: threshold, window, release, other keys unaffected, analytics keys
untouched, and client roles denied. 3 is covered by `scripts/verify-group-policies-sql.mjs`,
which now fails without it. The edge functions fall back to their previous behaviour only while
1 and 2 return PGRST202, so deploy order cannot lock translators out. Apply them first anyway.

### Edge functions to redeploy (after the migrations)

`review-chapter-feedback`, `submit-chapter-feedback`, `send-group-notification`,
`track-analytics-events`, `track-anonymous-usage-events`, and `report-app-errors` (shares the
drifted `_shared` helpers). `aggregate-engagement` is drifted with no security impact.
