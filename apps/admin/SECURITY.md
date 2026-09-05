# Admin server boundaries

- The upstream-sync cron requires a nonblank `CRON_SECRET`. Missing configuration returns HTTP 503 without starting a sync; missing or mismatched bearer credentials return HTTP 401.
- The engagement-refresh server action checks `requireAdminIdentity()` before creating the service-role client or invoking aggregation. Dashboard layout authentication is not a substitute for action-level authorization.
- `profiles.admin_role` has service-only INSERT/UPDATE privileges. Keep ordinary profile columns writable for mobile sync; add explicit grants when adding a client-editable profile column.
- The aggregation function keeps gateway JWT verification enabled and calls the service-only `authorize_engagement_refresh` RPC with the incoming bearer credential. PostgREST verifies the caller before the function creates its privileged aggregation client. Do not replace this with unverified JWT decoding or equality against a single runtime key: existing valid service keys can differ from that runtime key.
- Operator tool results are sent to the configured Gemini provider. Keep every result explicitly allowlisted, including nested records. Support results contain device platform/version/active state, reading preferences/progress, and engagement counts; they exclude push tokens, profile records, user/device IDs, emails, names, location, and support audit records. The operator's search query is still part of the conversation sent to Gemini.
- Translation detail excludes raw upstream payloads and admin notes. Sync results exclude actor IDs. Never spread raw admin data into provider-facing tool results when adding fields or tools.

Run the boundary regressions with `node --test --import tsx apps/admin/lib/security-boundaries.test.ts`. They execute the actual server modules with mocked auth, response, and data-service boundaries, including synthetic secrets and unknown future fields.

Before deploying the cron route, configure a nonblank, random `CRON_SECRET` in the Vercel production environment. Vercel sends it as the scheduled request's bearer credential. Without it, the route intentionally returns 503 and does not sync.

For database/Edge verification against an explicitly selected environment, run `EB_SECURITY_TEST_ALLOW_CREATE_USER=true node --env-file=.env scripts/verify-admin-security.mjs`. It uses the configured app/service credentials, creates one disposable account, proves normal profile sync and denied role escalation, checks caller authorization, then removes the account and profile. Its authorized aggregation targets a new random UUID so no real user's summary is recalculated. SQL regressions in `supabase/tests` are available for a local database session with role-switching privileges.
