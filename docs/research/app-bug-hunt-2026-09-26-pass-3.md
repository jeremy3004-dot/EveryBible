# App bug hunt and optimization — 2026-09-26, third pass

Base: `2f3bf3e3` on local `main`. This pass inspected search, Home/startup,
reading-plan catalog/search, download recovery and cancellation, and account and
password-recovery flows. GPT-6 Sol with high reasoning owns the fixes; the
primary agent reviews integration and runs final verification.

## Confirmed findings

### Search results belonged to the previously selected Bible

Search for a word in BSB, wait for results, then select WEB. Until WEB answers,
BSB's text remained tappable under WEB's header. The reader opened the selected
translation, so the text the user tapped could differ from the passage opened.

Results now retain their producing translation ID and are hidden immediately
when it differs from the current selection. Query edits within the same Bible
still keep existing results visible. Real-screen regression tests cover both
switch directions, late responses, and a new translation with no matches.

### Download recovery duplicated work and could expand the requested books

Returning to the foreground while a book was downloading started another JS
orchestrator for it. Repeated collection requests also started duplicate work.
Overlapping book and collection requests could write the same chapter path, and
registering their identical job IDs replaced the earlier cancellation owner.

A separate recovery defect lost the selected collection: persisted collection
jobs recorded only translation scope, so resuming a selection such as Matthew
and Mark requested all 66 books. Deterministic tests reproduced both duplicate
writers and the unwanted expansion.

- Identical in-flight store requests share a promise. Completion and failure
  release it, allowing later retries.
- A book's chapter files and verification receipts have one writer at a time;
  other books can still download concurrently. The overlap regression now
  measures one actual transfer and one metadata lookup.
- Cancellation retains every registered writer for a job ID and waits for all
  of them before deletion. Canceled queued work never starts writing.
- Collection jobs persist their requested book IDs and recovery uses them.
  Older records without that optional field retain their full-Bible behavior.

The UI disables starting another collection while a download is active. Direct
service callers still share one persisted translation-job record for distinct
simultaneous collections; this pass does not introduce a persistent scheduler.

### Signed-in password recovery closed its own form

Opening a reset link while signed in and confirming the account change called
the normal sign-out. That reset `onboardingCompleted`; the app replaced its
navigator with onboarding. The code exchange then finished after the reset
screen had unmounted, so its cleanup signed the recovery session out and no
new-password form appeared.

A render reproduction using the real recovery screen and exchange orchestration
observed one successful exchange, one recovery-session sign-out, and onboarding
instead of the form.

Opening a reset link now replaces the previous navigation history with fresh
More and recovery screens. An explicit recovery sign-out preserves only an
already-completed onboarding flag; account preferences, progress, private-data
ownership, sync metadata, and push-token cleanup retain their normal clearing
behavior. This keeps the reset form mounted without retaining the old account's
screen-local data. Ordinary sign-out still resets onboarding.

Repeated delivery of the same link does not remount the form. Cleanup belongs
to the intent the screen opened, so a replaced unconfirmed link cannot clear its
replacement. Once activation starts, another link does not interrupt that flow;
close the current flow before opening a different link. Installed navigation
router tests verify fresh route keys and dismissal to a fresh More screen.

## Performance scope

The download work targets redundant transfers and file writes, with transfer
counts as deterministic evidence. No phone latency or battery improvement is
claimed without device measurements.

Existing deferred startup imports, debounced search, cached reference-parser
instances, and memoized plan-search indexes were retained. A desktop probe of
warmed reference parsing found ordinary English/Nepali queries below 0.06 ms per
parse in this run; it did not justify changing reference grammar behavior.

## Verification

- `npm run release:verify` passed: root/workspace lint and typechecks, all
  8,732 tests (zero failures or skips), and Expo configuration verification.
- The primary agent independently reran 50 search tests and 96 download tests.
  The Sol workers also ran the affected recovery and download suites on Node 22.
- Fresh iOS and Android production exports passed at
  `/tmp/everybible-pass3-export`; these are bundle checks, not device proof.
- Changed-file Prettier and `git diff --check` passed before the local save.

No release, remote changes, simulator reset, or edits to unrelated workspace
files are part of this pass. Native background-download and recovery-link
behavior still require device checks before release.
