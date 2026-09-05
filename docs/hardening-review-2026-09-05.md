# Hardening and bug-fix review — 2026-09-05

This pass started from `7baca9b6` in the current worktree. The primary agent investigated the failures and reviewed the implementation; three GPT-6 Astra agents at high reasoning implemented bounded fixes with regression coverage. No deployment, production database change, notification delivery, merge, or commit was performed.

## Changes and evidence

| Area                        | Observed failure                                                                                                                                          | Result                                                                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analytics                   | The queue read `user.id`, but the authenticated app user exposes `uid`; signed-in events lost attribution.                                                | Use the real identity field while preserving event-time identity across account switches, sign-out, and persisted queues. Existing anonymous records remain anonymous.                             |
| Chapter feedback            | Retrying a 401 reused the rejected stored access token. Async work could also cross an account change.                                                    | Refresh the Supabase session once, verify the same user and auth generation, and stop when identity changes.                                                                                       |
| Admin upstream sync         | Upstream refreshes overwrote operator notes, availability, and distribution decisions. Missing publication dates also appeared newly published.           | Preserve operator-owned fields on updates, keep existing publication dates when omitted, and surface failure to record sync completion. New-row defaults remain explicit.                          |
| Admin data authorization    | Unauthenticated dashboard requests started privileged database reads while the layout redirected to login.                                                | Authorize before service-client creation in every data reader and audio signer, sharing authorization only within the current React render request.                                                |
| Device registration         | Late token requests, lazy imports, and sign-out cleanup could register stale sessions or clear a newer account's state.                                   | Scope work to user plus auth generation, serialize device writes, invalidate stale work, and guard both app effects.                                                                               |
| Group notification endpoint | A privileged endpoint accepted a group ID without verifying caller membership; delivery counts treated rejected Expo tickets as sent.                     | Authenticate the bearer token, require membership before reading recipients, exclude the verified caller, validate the request, deduplicate tokens, and count ticket outcomes.                     |
| Offline audio               | Timeout retries could overlap a still-running native transfer. Filesystem setup errors could leave jobs active; partial progress could report completion. | Cancel and await transport settlement before retry, treat failed cancellation as terminal, preserve partial files during cancellation, and finalize job state consistently.                        |
| Offline Bible text          | Failed updates removed the installed database, validation occurred after replacement, and checksum verification silently skipped on Hermes.               | Verify staging and close handles first, preserve/restore installed files on activation failure, check HTTP status, and enforce supplied SHA-256 using the existing pure-JavaScript implementation. |
| Deep links                  | Malformed percent-encoded input could reach the navigation dependency's expensive fallback decoder.                                                       | Reject invalid encoding before either parser runs, while forwarding valid links unchanged and avoiding double decoding.                                                                            |
| Dependencies                | The locked Next.js and sharp versions have published security advisories; the admin included an unused Trigger.dev SDK.                                   | Use Next 15.5.25 and sharp 0.35.4, remove the unused SDK, and apply compatible transitive security fixes while retaining the mobile framework versions.                                            |

Behavioral tests execute the actual queue, services, app effects, sync implementation, and edge handler with native/network boundaries replaced by fixtures. The new tests were first run against the old behavior and demonstrated failures before fixes. Source checks alone are not the evidence for these fixes.

Detailed contracts: [upstream sync](upstream-sync.md), [admin data authorization](admin-data-authorization.md), [group notifications](group-notifications.md), [offline text installation](offline-text-install.md), and [dependency changes](dependency-hardening-2026-09-05.md).

## Verification

Verification used Node 22.23.2 and repository-pinned npm 11.11.0. The final lock installs cleanly with `npm ci`; all three existing native package patches apply successfully. The earlier shared-dependency symlinks were replaced with a separate installation in this worktree; the main checkout's dependencies were not modified.

- `npm run release:verify`: passed, including mobile/admin/site lint and typechecks, **1,831 tests passed, zero failed, zero skipped**, and Expo config validation.
- `npm run admin:build` and `npm run site:build`: passed on Next 15.5.25 and the final dependency lock.
- `expo export --platform ios` and `expo export --platform android`: passed, producing production Hermes bytecode bundles (17.9 MB iOS, 18.1 MB Android). These verify bundling, not native installation or device behavior.
- Admin runtime: the original three unauthenticated HTML/RSC requests triggered **15 privileged backend reads** against a local fake backend. After the fix, **16 HTTP checks passed with zero backend reads**, covering all 11 dashboard pages, the RSC redirect, login, disabled cron, and both operator API methods. RSC carries its login redirect in the Flight response; its HTTP 200 was checked for the redirect digest, not treated as an authorized response.
- Public site runtime: `/`, `/about`, `/privacy`, `/terms`, and `/support` returned HTTP 200. The Next image endpoint returned a valid WebP generated from a local site asset.
- sharp runtime: PNG, WebP, and AVIF resize/encode/decode checks passed at 128×128 using sharp 0.35.4 and libvips 8.18.6.
- Group notification handler: Deno typecheck passed; actual-handler tests exercise authentication, membership, malformed requests, recipient filtering, and Expo ticket outcomes without sending notifications.

Changed mobile files pass Prettier, and `git diff --check` passes. Local verification logs, HTTP results, audit reports, and a bundle manifest are saved in `qa-evidence/hardening-2026-09-05/` (ignored build evidence, not application source). All temporary local HTTP servers were stopped.

## Remaining dependency findings

Comparable production-lock audits (`npm audit --package-lock-only --omit=dev --json`) went from **48 to 32 package/metavulnerability entries** after the compatible transitive pass: critical 2→1, high 19→9, moderate 26→22, low 1→0. These are propagated package findings, not counts of distinct exploitable application defects. Next's direct server advisories, sharp, and the removed SDK were addressed before that comparison.

Five underlying advisory packages remain: `tar`, `postcss`, `image-size`, `decode-uri-component`, and `uuid`. Parent constraints prevent replacing all of them through this compatible lock update. `tar` is pinned by the Supabase CLI; PostCSS and image-size belong to the current Next/Expo build tooling; UUID is used by the Xcode tooling chain. These require separately validating their owning tool/framework upgrades or an explicit override. The navigation decoder remains locked but its malformed-input path is now guarded in the app, with tests using the installed React Navigation parser. No blanket `npm audit fix --force` or framework upgrade was applied.

## Practical limits

- No live Supabase writes or real push messages were used for testing. The deployed edge function remains unchanged until this revision is deployed.
- Native push entitlements, reminder delivery, actual provider sign-in, and downloads through device backgrounding still require the device checks in the [release smoke checklist](release-smoke-checklist.md).
- Offline database replacement recovers ordinary filesystem errors. Process termination during replacement or a failed restoration can require recovery from the retained `.rollback` files; it is not a crash-safe filesystem transaction.
- Supabase device deactivation remains best effort if the network or backend rejects it. No client-only change can guarantee remote deactivation while offline.
- This is a focused hardening pass, not a claim that every dependency advisory is reachable or that the application has no remaining bugs. The remaining dependency findings are recorded separately with their paths and verification limits.

## Sources checked

- [Next.js App Router / Server Actions denial of service advisory](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj).
- [Next.js middleware segment-prefetch bypass advisory](https://github.com/vercel/next.js/security/advisories/GHSA-26hh-7cqf-hhc6).
- [sharp / libvips security advisory](https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj) and [sharp 0.35 migration notes](https://sharp.pixelplumbing.com/changelog/v0.35.0/).
- [Navigation decoder advisory](https://github.com/SamVerschueren/decode-uri-component/security/advisories/GHSA-vcc3-ghjq-m6fr) and the installed React Navigation/query-string decoder implementations.
- Installed Expo 54 filesystem/background-downloader implementations and official documentation through Context7 were used to confirm cancellation, SQLite, and authentication API behavior.
