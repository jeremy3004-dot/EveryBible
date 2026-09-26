# Sync, permissions, and simulator audit — 2026-09-26

## Scope

Primary-agent investigation, Sol high implementation, and independent primary
verification. Work started on local `main` at `042def2f`. No production database
changes, deployment, push, or physical device were used. Existing simulator data
and unrelated workspace files were preserved.

## Confirmed and fixed

### Account changes could slip between sync validation and a local write

`createSyncIdentityBoundary.runIfCurrent` awaited an asynchronous wrapper around
a synchronous account/generation check. An account change during that microtask
gap allowed an old sync callback to mutate the new account's store. The same
boundary guards preferences, reading progress, and reading-plan commits.

Validation and callback entry now happen in the same synchronous turn. The public
Promise API, asynchronous operation results, and rejected-operation behavior are
preserved. This does not make arbitrary asynchronous callbacks atomic; the local
store mutations at the audited callers are synchronous.

Evidence: two deterministic account/generation regression tests failed before
the fix. An integration test drives the real preference sync service and switches
accounts immediately after validation. It proves the new account's preferences
survive and the stale upload is skipped. All 185 sync tests pass independently.

### The group permission harness stopped before its final security checks

`verify-group-policies-sql.mjs` referenced a nonexistent migration timestamp. It
stopped with ENOENT after 11 passing checks and never exercised the direct-group-
insert retirement. The reference now matches the committed migration. All 12
checks pass, including denied direct inserts and successful authorized creation.
No policy or assertion was weakened.

### Home used 31 days for every monthly Proverbs cycle

Simulator testing on September 26 showed Home saying `Day 26 of 31` while Plan
Detail correctly said `Day 26 of 30`. Home also divided completed days by 31 for
its progress bar. It now reuses the plan ledger's calendar-aware day count and
uses the same screen clock for completed-entry counting. Render tests cover
September, February, leap February, October, and unchanged weekly/sequential
durations. The focused Home/ledger suite passes all 57 tests. The rebuilt native
app visibly shows `26/30` on Home.

## Database evidence

Seven PGlite harnesses pass against local PostgreSQL with simulated API roles and
JWT subjects: sync contract, group policies, profiles, prayer wall, analytics,
analytics ingestion, and error reports. These execute SQL, rather than checking
policy source text. Each has an explicit schema/migration scope; they do not
prove that production has the same schema or grants.

The new profile harness replays four canonical migrations and runs the existing
profile admin-role and email-integrity SQL tests unchanged. Its eight checks
cover denied self-promotion, canonical Auth email propagation, owner writes,
anonymous/other-account isolation, and rejected ownership reassignment for
profiles, reading progress, and preferences. It uses minimal Auth, Storage, and
translation-catalog fixtures, not a complete Supabase deployment.

## Verification

- `npm run release:verify`: passed; 8,948 tests, zero failed or skipped. Workspace
  lint/typechecks and Expo config verification passed. Existing admin font lint
  warning and 47 diagnostics outside the configured strict set remain.
- Android production export and fresh iOS Release simulator build: passed with
  test-only disabled backend settings, including rebuilds after the Home fix.
- Changed source, tests, SQL scripts, and testing guide pass Prettier checks.
- Local SQL commands are documented in `docs/testing.md`.

## Simulator evidence

Used a newly created iPhone 17 Pro / iOS 26.5 simulator named `EveryBible Sync Audit
Sep26`. Production backend configuration was replaced at build time with a local
test URL and dummy key; the Release client treats that HTTP URL as unconfigured.
The built Constants manifest was checked for those test values. Expo Updates was
disabled in the built artifact. This validates bundled/offline workflows, not a
signed-in production session or complete network isolation.

Observed through native UI interactions and screenshots:

- Unavailable Bible-library onboarding still offered bundled Bibles; the BSB
  reader displayed chapter text.
- Search for `John 3:16` opened John 3 with its text. A chapter favorite survived
  relaunch (`Remove from favorites` was present afterward).
- Daily Proverbs enrollment, reading, and day completion worked. The completed
  day survived relaunch. Canceling the leave confirmation preserved it; confirming
  leave removed it, and the empty My Plans list persisted after another relaunch.
- Changing the interface to Spanish and the theme to dark survived relaunch.
  The interface was subsequently returned to English.
- A guest note on Proverbs 26:1 appeared in Notes & Highlights and survived both
  relaunch and installation of the rebuilt app over the same simulator container.
- The Home month-count regression was reproduced in the first build, then
  confirmed fixed in the rebuilt app. Both text and screenshot showed `26/30`.

Screenshots are saved in `sync-permissions-simulator-2026-09-26/`: Home before and
after the fix, the note after restart, and the empty plan list after leaving and
restarting. Some automation snapshots returned stale references or inaccurate
bounds; screenshots and refreshed selectors/observed coordinates were used to
verify actions. Those automation failures were not counted as app defects.

Final embedded `main.jsbundle` SHA-256:
`be14b463199fc58b3f6e573909fca2baf5234ab32004bc25253551fd11d2a41a`.
The local simulator build used arm64, disabled code signing, and disabled Swift
explicit modules for this Xcode toolchain. These were command-line QA settings,
not changes to release configuration. This is not an App Store signing gate.

The initial native attempts exposed stale local dependency setup: missing
generated SQLite sources, unapplied committed package patches, and CocoaPods
references to obsolete package paths. The repository's postinstall patches were
reapplied and CocoaPods was restored in deployment mode. Investigation confirmed
the tracked lockfile already has the correct patched VideoTrim checksum; it was
not changed. These setup failures are distinct from application defects.

Physical-device background audio, hardware interruptions, production RLS parity,
and live multi-device authentication/sync remain separate verification gates.
