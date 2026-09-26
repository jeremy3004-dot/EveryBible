# App bug hunt — 2026-09-26, rounds five through seven

Base: `4a7be24b` on local `main`.

The primary agent mapped and researched each area, then wrote failing behavioral
regressions. GPT-6 Sol agents with high reasoning implemented the confirmed fixes.
The primary reviewed the changes and owns the independent verification below.

## Area map

| Round | Area                                   | Entry points and boundaries                                                                                                                  | Investigation                                                                                                                                    |
| ----- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5     | Saved annotations and reading activity | `AnnotationsScreen`, `ReadingActivityScreen`, local annotation/progress stores, `useEngagementSummary`, analytics service                    | Returning to mounted screens, offline recovery, delayed cloud responses, local/cloud totals, calendar memoization                                |
| 6     | Profile, settings, and onboarding      | `ProfileScreen`, avatar storage/auth services, settings participation access, onboarding Bible selection queue and runtime catalog hydration | Account changes during native/network work, picker cancellation, failed requests, selection ordering, catalog retry and cleanup                  |
| 7     | Reminders and background sync          | Settings reminder controls, notification service, daily reminder reconciler, `useSync`, sync coordinator, debounced progress sync            | Failed cancellation recovery, native-call deduplication, foreground/reconnect retries, pull-before-push ordering, identity and generation checks |

## Confirmed fixes

### Round 5: reading activity could retain an offline result indefinitely

The cloud engagement hook fetched only on mount or authentication changes.
Returning to the still-mounted screen after an offline first visit did not retry,
so chapters and listening totals from other devices remained absent.

The hook now refreshes on each focused visit. Blur and unmount invalidate pending
results, and an older visit cannot overwrite the next visit's totals. Regression
coverage exercises the installed navigation focus lifecycle, including duplicate
initial focus and signed-out visits.

The initial reproduction failed with the expected cloud chapter total missing.
Local evidence: `/tmp/everybible-round5-activity-red.log`.

### Round 6: avatar work could outlive its owning account

A photo picker, upload, or profile update could finish after the account changed.
The old screen then continued the next stage using the active account, or applied
an old response to the auth store. A same-account sign-out and sign-in also needs
to invalidate the earlier operation.

The screen now checks the initiating user, authentication generation, and mount
lifetime after asynchronous stages and before updates or error alerts. Storage
also checks ownership around its asynchronous account lookup, local file read,
and upload. The storage regression reproduced an old photo being uploaded under
the next account's folder when the account lookup completed late.

Existing successful uploads, cancellation, format handling, and failure recovery
remain covered. Regression cases include sign-out, a different account, a new
session for the same account, unmount, and stale failures.

Initial evidence: `/tmp/everybible-round6-profile-red.log` and
`/tmp/everybible-round6-storage-red.log`.

### Round 7: a failed reminder cancellation suppressed further retries

When native cancellation threw, the service correctly kept its persisted
"may still be scheduled" marker, but incorrectly cached the schedule as off.
Subsequent foreground reconciliation therefore skipped cancellation until the
process restarted, even though the reader had disabled the reminder.

Only successful cancellation now caches the off state. Failure leaves the native
state unknown so the next reconciliation retries. Tests cover both reconciliation
and direct Settings cancellation on iOS and Android, and confirm that a successful
cancel still prevents repeated native calls.

Initial evidence: `/tmp/everybible-round7-reminder-red.log`.

## Other checks and performance

The annotation list already reloads after editing or deleting a note. Onboarding
uses an ordered Bible selection queue, memoized rows with stable handlers, and
mounted checks for catalog retries. Participation validation invalidates pending
attempts when its modal closes. Sync coordinates pull before push, deduplicates
requests, and checks account generations; progress writes remain debounced.

The changes retain those optimizations. Reading activity adds one necessary load
per visit, and reminders still skip redundant native work after success. This
pass does not claim a measured device speedup or introduce speculative refactors.

## Verification

- Primary verification: 40 reading-activity/annotation tests, 73 profile/settings/
  onboarding tests, 67 profile/storage tests, and 157 reminder/sync tests passed.
  The two profile runs intentionally overlap while checking the expanded service
  fix. Evidence: `/tmp/everybible-round5-primary-confirm.log`,
  `/tmp/everybible-round6-primary-confirm.log`,
  `/tmp/everybible-round6-primary-storage-confirm.log`, and
  `/tmp/everybible-round7-primary-confirm.log`.
- `npm run release:verify` passed: root/workspace lint, typechecks including the
  strict gate, all 8,763 tests with zero failures or skips, and Expo configuration
  validation. The existing admin custom-font lint warning remains unrelated.
  Evidence: `/tmp/everybible-rounds5-7-release-verify.log`.
- iOS and Android production exports passed at `/tmp/everybible-rounds5-7-export`.
- Changed-file Prettier and `git diff --check` passed.

The local save contains only the three fixes, their regression tests, and this
report. Unrelated workspace files remain untouched.

These are automated screen and service checks with native adapters and backend
responses replaced by controlled test fixtures. They do not prove physical-device
notification delivery or live backend behavior. No push or release is included.
