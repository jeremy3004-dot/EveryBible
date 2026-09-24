# Edge functions review — 2026-09-24

Scope: every function in `supabase/functions/` (project `ganmududzdzpruvdulkg`), compared with
what is deployed, then reviewed for consistency across functions. Branch base: `origin/main`
at `d69ebde0`.

## 1. Drift: deployed source vs repo

Method: `get_edge_function` (Supabase MCP, read-only) for all seven functions. Each deployed file
was written out and compared with `diff` against the repo copy, including every `_shared/` file
the bundle carries. Two small files were compared by eye: `aggregate-engagement/index.ts`
(84 lines) and `_shared/feedbackAudio.ts` + `submit-chapter-feedback/deno.json`.

| Function                     | Live version / deployed (+0545)    | Repo matches live? | verify_jwt live | verify_jwt config.toml          |
| ---------------------------- | ---------------------------------- | ------------------ | --------------- | ------------------------------- |
| aggregate-engagement         | v6, 04:52                          | yes                | true            | true                            |
| report-app-errors            | v1, 10:22                          | yes                | false           | false                           |
| review-chapter-feedback      | v13, 09:47                         | yes                | false           | false                           |
| send-group-notification      | v1, 10:09                          | yes                | true            | not listed (CLI default `true`) |
| submit-chapter-feedback      | v6, 05:26 (import map `deno.json`) | yes                | false           | false                           |
| track-analytics-events       | v13, 05:21                         | yes                | false           | false                           |
| track-anonymous-usage-events | v12, 05:20                         | yes                | false           | false                           |

Before this branch there was no drift. Every deployed bundle was byte-identical to `origin/main`
(`d69ebde0`), and the latest commit touching each function predates its deploy:
review-chapter-feedback 314c199a at 09:42, send-group-notification 86e44269 at 10:05, and
report-app-errors 90f37bf3 at 10:15. verify_jwt matches config everywhere.

`send-group-notification` has no `[functions.send-group-notification]` block. The CLI then
deploys it with `verify_jwt = true`, which matches live. If it is ever deployed through the MCP
`deploy_edge_function` tool, `verify_jwt: true` must be passed explicitly. Adding an explicit
config block would remove that ambiguity.

## 2. Consistency review

| Check                                                    | Result                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client IP trust (only `cf-connecting-ip` / `x-real-ip`)  | **Failed in 2 functions (fixed).** `track-analytics-events` and `track-anonymous-usage-events` each had a private `getClientIp` that fell back to `x-forwarded-for` for the geo lookup. It also preferred `x-forwarded-for` over `x-real-ip`. The throttle keys already used the trusted `_shared` helper.                                   |
| CORS                                                     | All use `Access-Control-Allow-Origin: *` with no `Allow-Credentials`. Auth is a bearer header, not cookies, so the wildcard is acceptable. Every function answers `OPTIONS`.                                                                                                                                                                 |
| JSON body size limits                                    | The analytics collectors and report-app-errors stream-cap the body. **review-chapter-feedback and submit-chapter-feedback (both `verify_jwt = false`) parsed `req.json()` with no bound (fixed).** send-group-notification and aggregate-engagement parse without a cap, but only after JWT/credential verification, so they are left as is. |
| Consistent error shape                                   | Mixed: `{ success: false, error }` (feedback, group, analytics-authenticated) vs `{ error }` (anonymous collector, report-app-errors). This is a client contract, so it was not changed.                                                                                                                                                     |
| No stack traces / secrets in responses                   | **aggregate-engagement echoed `error.message` (a Postgres message) on 500 (fixed).** Its callers are privileged, but it was the only function breaking the L7 rule. All others log the detail and return generic text.                                                                                                                       |
| Rate limiting on public (`verify_jwt = false`) functions | submit: 20/h per user or per hashed IP, fails closed. review: passcode lockout, fails closed. Anonymous collector: per-IP budget RPC. track-analytics-events: per-user budget RPC after token verification. report-app-errors: per-IP and global budget, fails closed.                                                                       |
| Service-role client per request                          | Yes in all seven (created inside the handler; none at module scope).                                                                                                                                                                                                                                                                         |
| Timeouts on outbound fetches                             | ipinfo/ipapi: 2 s. **send-group-notification's Expo push `fetch` had no timeout (fixed: 10 s per batch).** supabase-js calls rely on the platform wall clock.                                                                                                                                                                                |
| Local imports carry `.ts`                                | Yes, every relative import. `deno check` passes for all seven entry points.                                                                                                                                                                                                                                                                  |

## 3. Fixes on this branch (test-first)

Each fix began as a failing test (9 failed before the fix, and all pass after it):

1. **Geo lookup trusted `x-forwarded-for`.** The fix is in `track-analytics-events/index.ts`
   and `track-anonymous-usage-events/index.ts`. The private `getClientIp` is removed and the
   shared trusted `getClientIp` from `_shared/analyticsIngest.ts` is used. An `'unknown'`
   address means no external lookup, and the free `cf-ipcountry` country is used instead.
   Impact before the fix: whenever `cf-connecting-ip` was absent, the caller chose which IP was
   geolocated and could put its events anywhere on the admin heat map. The edge normally stamps
   `cf-connecting-ip` (see `_shared/passcodeAttempts.ts`), so the practical exposure was low.
   The fix is for defence in depth and to make every function apply the same trust rule. The
   existing test that asserted the `x-forwarded-for` lookup was replaced.
   Tests: `handler.test.ts` and `collector.test.ts` each have "a client-sent x-forwarded-for
   address is never looked up" and "the edge-stamped x-real-ip wins over a client-sent
   x-forwarded-for".
2. **Unbounded bodies on public feedback endpoints.**
   - `review-chapter-feedback` is capped at 64 KB (the largest real request is about 20 KB)
     and returns 413. Malformed JSON now returns 400 `Invalid request body`; before, it was a
     logged 500.
   - `submit-chapter-feedback` is capped at the maximum base64 recording plus 64 KB. It checks
     the cap before auth, storage or database work and returns 413.
   - Both reuse `readBodyWithinLimit`.
   - Tests in `errors.test.ts` also prove that the largest legitimate requests still fit: a
     500-id bulk review, and a 5 MB recording.
3. **aggregate-engagement leaked database messages.** It now returns a generic 500 and logs
   the detail.
4. **Expo push fetch had no timeout.** It now uses `AbortSignal.timeout(10_000)` per batch. A
   hung batch is counted in `errors`.

## 4. Deploy list (for the lead, after merge; nothing was deployed)

Deploy with `supabase functions deploy <name> --project-ref ganmududzdzpruvdulkg` so that
`config.toml` supplies `verify_jwt`:

- `track-analytics-events` and `track-anonymous-usage-events`: fix 1 (security: IP trust).
- `review-chapter-feedback` and `submit-chapter-feedback`: fix 2 (public DoS surface).
  submit keeps its `deno.json` import map.
- `aggregate-engagement`: fix 3.
- `send-group-notification`: fix 4. Pass `verify_jwt: true` if using MCP.
- `report-app-errors`: no change, no deploy needed. `_shared/analyticsIngest.ts` is unchanged.

## 5. Noted, not changed

- `https://esm.sh/@supabase/supabase-js@2` is an unpinned major, so each deploy may bundle a
  different 2.x. Consider pinning an exact version.
- track-analytics-events calls `auth.getUser` for every request that has a token, before any
  throttle. Only Supabase Auth's own limits bound invalid-token floods.
- aggregate-engagement passes `body.user_id` through without a UUID check. Its callers are
  privileged, and the RPC parameter type rejects non-UUIDs.
- Requests with neither trusted IP header share one `'unknown'` throttle and lockout bucket.
  This is by design, but a missing header would make all such callers share a limit.
- Pre-existing Prettier drift in four function `index.ts` files was left alone to keep the
  diff focused. `format:check` was already red on main.
