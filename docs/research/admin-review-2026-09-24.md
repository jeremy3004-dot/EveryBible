# Admin dashboard security and correctness review (2026-09-24)

Scope: every `apps/admin` change on `origin/main` since 2026-09-18 (`git diff 63ba5cf9..d69ebde0 -- apps/admin`).
That covers the 195717e1..HEAD range from the brief (translator-access shared-passcode panel and usage log,
/app-errors, the MapLibre 6.10 upgrade) plus the earlier 2026-09-24 admin commits: per-team passcodes, the
`translation_catalog_admin` side table, the METRICS fixes, the feedback resolution filter, and the proxy
redirect-loop fix.

Branch: the worktree branch for this review, 3 fix commits (258ce823, 82ceea05, 33391d37). Not pushed.

## Fixed (test-first)

### 1. The session middleware never ran in production (high)

`apps/admin/proxy.ts` uses the Next 16 file convention. The app is on Next 15.5.25, which loads only
`middleware.ts` (`MIDDLEWARE_FILENAME = 'middleware'` in `next/dist/lib/constants.js`). The build's
`.next/server/middleware-manifest.json` was empty, and the build output had no `ƒ Middleware` line. It has
been like this since the admin app was created on 2026-04-02.

Effects:
- The Supabase session refresh never ran. `createAdminServerClient` ignores cookie writes in Server
  Components ("the proxy handles cookie refresh"), so refreshed tokens were never saved. Admins were probably
  signed out soon after the access token expired.
- The signed-out redirect never ran at the edge. This was not an access-control hole: the layout, every
  page, every action and every route handler still check `requireAdminIdentity` or `getAdminIdentity`, and
  `app/serverBoundaryAuth.test.ts` enforces that.
- The 2026-09-24 "redirect loop" fix (ce1ae776) changed code that production never ran.

Fix (33391d37): renamed the file to `middleware.ts` and exported `middleware`. Added `/api/cron` to
`PUBLIC_PATHS`, because Vercel Cron sends no session and that route checks its own bearer secret. Without
this exemption, turning the middleware on would have broken the daily upstream sync. `maplibre/` is excluded
from the matcher. When public env keys are missing, the middleware now passes the request through, so
`AdminSetupCard` still renders instead of every request failing with a 500. New tests load the entry file
by Next's own `MIDDLEWARE_FILENAME` and check the cron exemption and the missing-env case.

Checked locally with `next start`: the build shows `ƒ Middleware 86.8 kB`. Signed-out requests to `/`,
`/analytics`, `/translator-access`, `/app-errors` and `/api/language-atlas` return 307 to
`/login?reason=auth`. `/login` returns 200, `/maplibre/maplibre-gl-worker.mjs` returns 200, and
`/api/cron/upstream-sync` reaches the route: it returned 503 because CRON_SECRET is not set locally, not a
redirect.

**After deploy:** sign in, confirm you are still signed in after more than an hour, and confirm the next
06:00 UTC cron run creates a `translation_sync_runs` row.

### 2. A catalog change went unaudited when the notes write failed (medium)

`updateTranslationMetadataAction` commits the `translation_catalog` update (`is_available`,
`distribution_state`) and then upserts the notes into `translation_catalog_admin`. If the notes write
failed, the action redirected with the error but wrote no audit row, so a publish or hide stayed live with
no record of who made it. The previous test asserted this gap as intended.

Fix (258ce823): the action now audits the committed change with `adminNotesError` in the metadata and
revalidates the affected paths.

### 3. The translator-access safety data was capped by PostgREST's row limit (medium, latent)

`getTranslationIdsWithFeedback` used `.limit(5000)`. PostgREST caps each response at `max_rows` (the
Supabase default is 1000; not confirmed for this project), so translation ids that sort after the first page
would drop out of the warning "no active team passcode", which is shown right before the shared passcode is
switched off. `getSharedPasscodeUsage` set `truncated` only when it received 5000 or more rows, so a capped
page of 1000 would show as an exact total. Neither is live yet: there are 25 feedback rows and 4 usage rows
today.

Fix (82ceea05): the ids are now read page by page with `range()`, with a 200k-row backstop. Usage takes
its total and truncation flag from `count: 'exact'`. A `select distinct` RPC would be cheaper long-term.

## Verified, no change needed

- **Guards before queries:** `/translator-access` calls `requireAdminIdentity()` before any query.
  `/app-errors` goes through `getAuthorizedAdminServiceClient`, which checks the admin first. All four
  translator-access actions call `requireAdminIdentity()` first, and discovery in `serverBoundaryAuth.test.ts`
  covers them. No API routes changed.
- **Audit logging:** team passcode create, revoke and rotate, the shared-passcode enable and disable, and a
  rotate that fails half-way (the revoke is still audited) all write `admin_audit_logs`. The plaintext
  passcode never goes into the audit log, a URL or the database.
- **Confirmations:** rotate and revoke use `window.confirm`. Turning the shared passcode off requires a
  checkbox, and the server checks it too. Turning it back on is not destructive and has no confirmation.
- **Input validation:** the team label is limited to 120 characters (matching the database check).
  Translation ids must match a pattern, at most 50 per team. The code length must be 6, 10 or 12. The window
  on `/app-errors` is limited to 7 or 30 days.
- **Client bundles:** built with the real `.env.local`, then searched `.next/static` (42 files) for the 4
  server-only env values (service role key, upstream key and URL, OIDC token): no matches. There were also
  no matches for `service_role`, `passcode_hash`, `passcode_salt`, `node:crypto` or service-only table
  names. The client passcode form imports only types and the client-safe `translator-access-options`.
- **Live schema** (read-only MCP): `translator_team_passcodes`, `translator_access_settings` (1 row),
  `translator_shared_passcode_uses` (outcome check `allowed|refused`), `app_error_reports`,
  `translation_catalog_admin` (foreign key to `translation_catalog`, so the embed works) and
  `admin_audit_logs` columns all match the code. The old admin columns are gone from `translation_catalog`.
  `get_admin_app_error_summary(timestamptz, int)` returns the camelCase keys the parser expects; its
  `jsonb_object_agg` keys (`app_version`, `platform`) are NOT NULL. `count_user_sessions(uuid)` and the
  `activeLocationCount` key in `get_admin_analytics_overview` both exist. All new tables have RLS turned on,
  with no policies and no grants to `anon` or `authenticated`. The two RPCs can be executed only by
  `service_role`.
- **Missing tables:** the shared-passcode switch and usage reads handle a missing table
  (`PGRST205`/`42P01`). `/app-errors` has an `error.tsx`.
- **MapLibre worker:** a clean build with no `public/` directory creates `public/maplibre/` with both files,
  byte-identical to the installed 6.10.0. `/public/maplibre/` is gitignored. Vercel's Git build clones the
  whole repo, so the `../../scripts/copy-maplibre-worker.mjs` import resolves. (`.vercelignore` does not
  exclude `scripts/`.) Note: `output: 'standalone'` does not copy `public/`. That matters only for
  self-hosting, not on Vercel.

## Open (low, not fixed)

- The data helpers in `lib/translator-access.ts` do not check for an admin themselves, unlike
  `admin-data.ts` and `app-errors.ts`; they rely on the page's guard. Safe today, but a future page could
  import them without that guard.
- `/translator-access` has no `error.tsx`. `getTranslatorTeams` throws if its table is missing. The table is
  applied live, so this cannot happen today.
- `getSupportUserDetail` ignores a `count_user_sessions` error and shows 0 sessions.
- `teamId` is not checked to be a UUID, so a bad value shows the Postgres cast error to the operator.
- The cron bearer comparison is not constant-time. This predates the reviewed changes.
- `SpreadDots.tsx` reads MapLibre's private `map._camera.transform`, which can break on a minor MapLibre
  upgrade.
- Six-digit team codes (the default) rely on the lockout of 10 failures per 15 minutes. This is documented on
  the page. Move new codes to 10 or 12 digits once most translators run the updated app.

## Commands run

`npm run typecheck` and `npm run lint` in `apps/admin` (0 errors, 1 existing font warning); root `npm test`
(5683 passed, 0 failed); `cd apps/admin && npx next build` (passes, and now includes the middleware).
