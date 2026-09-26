# App bug hunt — 2026-09-26, rounds nine through thirteen

Primary research and independently reproduced failures; GPT-6 Sol agents at high
reasoning implement the corrections. Work is saved on local `main` only. No
publishing, remote mutation, account deletion, or live prayer write was performed.
All destructive-action reproductions use local fakes.

## Round nine: async sharing, navigation, settings

| Area                     | Reproduced failure                                                                                                                | Regression evidence                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Verse-image sharing      | A late modal dismissal opens sharing after reader unmount; rejected native sharing then opens text fallback over a privacy lock   | `BibleReaderScreen.shareImage.render.test.tsx`; `/tmp/everybible-round9-image-red.log` |
| Reminder taps            | The 60-second navigation polling deadline silently discards a reminder while a reader is still unlocking or completing onboarding | `useNotificationTapRouting.test.ts`; `/tmp/everybible-round9-notification-red.log`     |
| Feedback identity editor | An account-A draft can overwrite account B's identity after an account switch                                                     | `SettingsScreen.render.test.tsx`; `/tmp/everybible-round9-settings-red.log`            |

Image sharing now cancels work at async boundaries, requires actual iOS dismissal,
and deduplicates requests. Notifications retain intent until an explicit navigation
ready signal, avoiding repeated timer polling. Feedback drafts bind to UID and
authentication generation and reject stale controls and completions.

Primary reran the image and navigation integration tests: 48 passed with no skips.
Evidence: `/tmp/everybible-round9-primary.log`.
Local commits: `c2fa7e79`, `75b121a2`.

## Round ten: private groups and destructive account actions

| Area                 | Reproduced failure                                                                                                            | Regression evidence                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Prayer wall          | Signing out leaves the prior account's private prayers visible; switching accounts retains the old viewer's interaction flags | `PrayerWallScreen.render.test.tsx`; `/tmp/everybible-round10-prayer-red.log`   |
| Group prayer preview | A new account keeps the prior account's prayer preview, including content that can be hidden for the new viewer               | `GroupDetailScreen.render.test.tsx`; `/tmp/everybible-round10-preview-red.log` |
| Delete confirmation  | A confirmation opened for A can invoke deletion after B signs in                                                              | `SettingsScreen.render.test.tsx`; `/tmp/everybible-round10-delete-ui-red.log`  |
| Deletion service     | An account switch during storage cleanup lets the final RPC target the new session                                            | `accountService.test.ts`; `/tmp/everybible-round10-delete-red.log`             |
| Sign-out             | An account switch during push-token cleanup lets the old sign-out end and clear the new account                               | `authStore.test.ts`; `/tmp/everybible-round10-signout-red.log`                 |

The destructive-action review also reproduced a late local sign-out event after a
new login and a delayed native key deletion completing after the new session was
saved. Both are inside the sign-out correction: cancellation must reach the local
session-removal sequence, and mutations of one secure-storage key must preserve
their call order. Evidence: `/tmp/everybible-round10-late-local-signout-red.log`
and the deterministic local adapter reproduction
`/tmp/everybible-round10-keychain-race.ts` (synthetic credentials only).

Study-group synchronization is currently disabled by the production feature flag;
group regressions exercise the existing feature-enabled screens and service paths.
The deletion correction binds its destructive RPC to the original verified
session, as well as guard UI and local cleanup ownership. No server migration is
needed for a per-request Authorization header supported by the installed client.

Primary independently reran 293 account, settings, sign-out, storage, fake-client,
and installed-client tests: all passed, no skips. The installed-client regression
waits until the newer session write actually reaches the secure-storage adapter;
it confirms the new account survives both a delayed old deletion and its sign-out
notification. Evidence: `/tmp/everybible-account-primary.log`.
Saved with the feedback identity correction as local commit `3cbce8cf`.

## Round eleven: private lists, language ordering, playback queue

| Area               | Reproduced failure                                                                                                         | Regression evidence                                                                                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved notes        | A visible notes list retains the previous account's notes after sign-out                                                   | `AnnotationsScreen.render.test.tsx`; `/tmp/everybible-round11-private-lists-red.log`                                                                                                                                                         |
| My Feedback        | A direct account switch leaves authentication true, so the list never reloads and retains old comments                     | `MyFeedbackScreen.render.test.tsx`; same red log                                                                                                                                                                                             |
| Interface language | Slow earlier locale loads overwrite a newer selection in the real i18n runtime, Settings hook, and onboarding picker       | `i18nStartup.persisted.test.ts`, `useI18n.test.ts`, `LocaleSetupFlow.render.test.tsx`; `/tmp/everybible-round11-language-runtime-red.log`, `/tmp/everybible-round11-language-red.log`, `/tmp/everybible-round11-onboarding-language-red.log` |
| Queue removal      | Removing an entry before the current queue cursor moves the cursor onto the next chapter and skips that chapter on advance | `audioStore.test.ts`; `/tmp/everybible-round11-queue-red.log`                                                                                                                                                                                |

Queue removal is currently exposed by the player/store API, without a visible
remove-row control. Its invariant still needs to preserve the current track.

Primary review reproduced two integration regressions in the initial language
patch: a saved locale was canceled when an account changed with the same language,
or when the last of several consumers unmounted. The corrected saved-preference
effect follows the current stored language; explicit choices still retain account
and screen ownership. Evidence: `/tmp/everybible-round12-language-integration-red.log`.
Primary reran 67 language/runtime/onboarding tests, all passing, no skips:
`/tmp/everybible-language-primary.log`. Saved as local commit `6be668c8`.

## Round twelve: confirmation ownership and follow-up pass

A native leave-plan alert opened by account A can remove account B's same plan
when its retained confirmation callback runs after switching accounts. Reproduced
in both `PlansHomeScreen.render.test.tsx` and `PlanDetailScreen.render.test.tsx`
before implementation: `/tmp/everybible-round12-plan-confirmation-red.log`
and `/tmp/everybible-round12-plan-detail-red.log`.

Additional source tracing covered sleep timer pause/resume and completion,
playback takeover during coverage loads, private-store adoption and interrupted
adoption recovery, cache clearing allowlists, chapter cache generation invalidation,
daily Scripture dates, and account-keyed group list loading. These inspections
have produced no additional confirmed defects in those paths so far.

Primary independently ran 195 tests across those persistence/cache/playback
boundaries, including property tests: all passed, no skips.
Evidence: `/tmp/everybible-deep-pass-boundaries.log`.

Primary independently reran 175 prayer/group/private-list tests: all passed, no
skips. Evidence: `/tmp/everybible-round10-11-private-primary.log`.
Saved as local commits `57d4f381` and `50ee95cc`.

Primary independently reran 311 queue, plan screen, and plan service tests: all
passed, no skips. Evidence: `/tmp/everybible-round12-primary.log`.
Local commits: queue `04a7ca93`; plan confirmations `e5476df6`.

## Round thirteen: group-session screen and service integration

Further tracing found that `GroupSessionScreen` bypassed the existing completion
service. A member therefore attempted a leader-only lesson update after recording
a session; a late completion after an account switch also started the next write
and navigated using the new account. Both were independently reproduced in
`GroupSessionScreen.account.render.test.tsx` before implementation:
`/tmp/everybible-round13-group-session-red.log`.

The correction connects the screen to the completion service, preserves partial
save semantics, and checks account, authentication generation, group, and screen
lifetime before continuing. The production study-group sync flag remains off.

The adjacent local-group leave alert had the same stale-confirmation problem:
after an account switch it still invoked the old leave action and navigated back.
This was reproduced separately in `GroupDetailScreen.render.test.tsx`, before
its correction: `/tmp/everybible-round13-group-leave-red.log`.
The corrected confirmation is consumed once and invalidated by account, session,
route, or screen-lifetime changes. Primary independently reran all 24 detail
screen tests successfully: `/tmp/everybible-round13-group-leave-primary.log`.
Saved as local commit `d8ad3dc8`.

Session completion also deduplicates same-tick local taps, avoiding a second
navigation pop. Primary independently reran 96 session screen, service, and
repository tests with all passing and no skips:
`/tmp/everybible-round13-session-primary.log`. The screen integration uses the real
completion helper with a local fake backend, including member permissions,
partial saves, new-account busy state, and account/route/unmount transitions.
Saved as local commit `b27f6afc`.

The additional follow-up inspected synchronization queue identity/deduplication,
reminder scheduling order, and audio download cancellation/serialization. Primary
ran 306 related behavioral/property tests, all passing without skips:
`/tmp/everybible-final-followup-boundaries.log`. No further defect was confirmed in
those paths.

## Final verification

All implementation batches have completed primary review and focused verification.
Production exports passed for iOS and Android using Node 22:
`/tmp/everybible-deep-passes-export.log`, output `/tmp/everybible-deep-passes-export`.
The first full gate caught three strict TypeScript errors in new test assertions;
explicit existence assertions corrected them without changing production code.

The final `npm run release:verify` passed with **8,938 tests, zero failures,
zero skips**, workspace lint, mobile/workspace typechecks, the configured strict
typecheck, and Expo configuration validation. Evidence:
`/tmp/everybible-deep-passes-release-verify.log`. Existing diagnostics remain: one
admin custom-font lint warning, 47 deferred diagnostics outside the configured
strict set, and Metro's dependency subpath fallback warning for `@noble/hashes`.
Neither those warnings nor this audit establish a new confirmed runtime defect.

The final follow-up found no further reproducible defects in the reviewed paths.
The corrections and regressions are committed on local `main`; unrelated
untracked workspace files were preserved, and nothing was pushed or deployed.

Device-only modal timing and real backend RLS are separate from local render,
service, and unit-test evidence. This audit does not establish that the app is
free of all bugs.
