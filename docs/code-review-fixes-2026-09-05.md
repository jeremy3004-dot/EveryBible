# Code review fixes and verification — 2026-09-05

Seven review findings have code fixes and regression coverage. Database permissions and the aggregation Edge Function are live; admin, mobile, and CI changes remain in the working tree pending their normal rollout.

| Finding | Fix | Evidence |
| --- | --- | --- |
| Clients could assign `profiles.admin_role` | Revoke client INSERT/UPDATE on the privileged column; retain ordinary profile sync and service role management | Real API: signup, ordinary profile upsert, denied role UPDATE/upsert, authorized service role assignment |
| Aggregation admitted ordinary user JWTs | Admin action checks identity; Edge verifies the caller through a service-only PostgREST RPC before privileged database access | Actual-handler regressions; live anonymous, ordinary-user, and forged-claim denial; valid backend request succeeds |
| A failed Supabase refresh plus successful EL refresh removed cached translations | Preserve the unavailable source's cached entries and keep retries enabled until both configured sources refresh | Failed, empty, thrown, and recovered-source regression cases against the production merge reducer |
| Cron authentication failed open | Missing/blank secret returns 503; missing/wrong credentials return 401 | Actual route tests and HTTP checks against the production build; accepted-credential branch tested with a mocked sync boundary |
| EL selections and download markers were lost on restart | Use the verified catalog timestamp; allow valid zero-book audio-only entries; narrowly migrate the previous blank timestamp shape | Mapping, sanitizer, and restart → refresh → restart tests using the actual store action |
| Operator tools exposed raw support records to Gemini | Explicitly allowlist every nested provider-facing record | Synthetic push tokens, identities, unknown future fields, raw payloads, and notes are absent from tested tool results |
| Admin/site/backend tests and Android release gates were omitted | Discover all maintained workspace test roots; run lint/typecheck/tests in a reusable PR and pre-Android-build workflow | Runner discovery, failure propagation, and actual module-mock regressions; full release gate; actionlint |

## Verification

- Full `npm run release:verify` on Node 22: **1,546 tests passed, zero failures, zero skips**. This includes mobile/admin/site lint and typechecks, workspace tests, release metadata contracts, and Expo config validation.
- `npm run admin:build`: passed. Built-server HTTP checks returned cron 503 without configuration, cron 401 for missing/wrong credentials with configuration, analytics redirect to login, and operator GET/POST 401.
- `deno check --no-config supabase/functions/aggregate-engagement/index.ts`: passed.
- `actionlint .github/workflows/verify.yml .github/workflows/android-production-release.yml`: passed.
- The live integration script removed its disposable auth account and confirmed profile cascade deletion. Authorized aggregation used a new random target UUID and refreshed zero real users.
- Existing nonblocking warnings remain: the admin font lint warning and Next.js's workspace-root inference warning.

## Live changes and rollout boundaries

- Supabase project: `ganmududzdzpruvdulkg`.
- Applied migrations: `20260905015543_protect_profile_admin_role` and `20260905020427_authorize_engagement_refresh`. Local files match the remote migration versions.
- `aggregate-engagement` version 4 is ACTIVE with gateway JWT verification enabled. Deployment digest: `83ea3488d08a3ee37d0856a8db04fcdbeaa4c011fc739555184b10449d0e8f4d`.
- Live verification initially caught a valid existing service key differing from the Edge runtime key. The final RPC implementation accepts verified service-role credentials without depending on exact key identity; the live integration then passed.
- Production Vercel has no `CRON_SECRET`. Configure a random, nonblank production secret when deploying the admin fix; otherwise the fixed route intentionally pauses sync with HTTP 503. Scheduled execution with the vault-stored cron credential was not exercised.
- Admin and mobile fixes have not been published. Native device restart/download checks remain part of the release smoke checklist. CI wiring is verified locally and becomes active after the changes reach GitHub; remote CI and branch-protection configuration were not changed.
- Historical local/remote Supabase migration drift was left untouched. Only the two narrow security migrations were applied. Connector SQL cannot create fixtures or switch database roles, so authorization proof used actual API credentials instead; the SQL regression files remain available for local database testing.
- Existing user work was preserved, including the original `Info.plist`. Xcode and Android version metadata were aligned with its existing build 422. No commits or pushes were made.
