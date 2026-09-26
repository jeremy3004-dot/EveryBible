# Mapped app bug hunt — 2026-09-26, fourth pass

Base: `7a6ec0c5` on local `main`.

The primary agent mapped the areas below, traced the failures, and wrote failing
regressions before assigning implementation to GPT-6 Sol agents with high
reasoning. The primary agent owns patch review and final verification.

## Area map

| Area                            | Entry and screens                                                                                                    | State and service boundaries                                                                        | Investigation                                                                                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gather lessons and group routes | `LearnStack`, `GatherScreen`, `FoundationDetailScreen`, `LessonDetailScreen`; registered group/session/prayer routes | `gatherStore`, `fourFieldsStore`, passage fallback, lesson sound ownership, group repository        | Lesson selection, translation changes, playback callbacks, completion, remote group loading. Group routes are registered, but the current Gather screens do not link to GroupList; the reproduced fix is on the active lesson flow. |
| Feedback and translator review  | Reader feedback submission, `MyFeedbackScreen`, `ChapterFeedbackReviewScreen`                                        | Feedback outbox, authenticated submit service, review pagination/decisions, review voice-note state | Connectivity and account changes, retry ownership, filters, paging, and resource cleanup.                                                                                                                                           |
| Plans and rhythms               | `PlansStack`, `PlanDetailScreen`, `RhythmDetailScreen`, rhythm composer                                              | `readingPlansStore`, per-day resumes, plan entries, memoized rhythm sessions                        | Partial-day continuation, clearing a resume, store subscriptions, calendar refresh, and reader launch parameters.                                                                                                                   |

## Confirmed bugs

### Rhythm continuation ignored a newly saved chapter

Open a rhythm containing a plan, advance partway through its day, and return to
the still-mounted rhythm screen. The reader saved the resume chapter, but the
session hook subscribed only to the stable getter function. Updating the resume
map did not invalidate its memoized session, so Continue restarted the day.

The primary screen regression saved Psalm 3 and observed a launch of Psalm 1.
Sol changed the hook to subscribe to the resume map and derive the session from
that snapshot. Existing plan-day validation still rejects out-of-range resumes.
An additional regression covers clearing a resume while the screen remains open.

### A released lesson recording could control its replacement

Play a Gather lesson, change its Bible translation, then play the new recording.
A delayed completion callback from the released sound used the shared status
handler, which looked up whichever sound was current. It rewound the replacement
to zero and changed the screen back to Play even though the new sound was playing.

The primary render regression delivers the old native callback after the new
sound starts and observed `setPositionAsync(0)` on the new sound. The primary
integration review also reproduced pending Play and Pause completions writing
stale button state after release. Playback callbacks and control completions now
check sound ownership. Current-sound duration, seeking, and natural completion
remain supported, including status callbacks emitted during native loading.

### Feedback could cross an account boundary before submission

The feedback outbox captured the original user, awaited the native connectivity
check, and then called the authenticated service without rechecking ownership.
That service correctly captures identity when it starts, but this is after the
outbox's await. A draft started as account A could therefore be submitted as B.

The primary deterministic regression changes accounts during the connectivity
check and observed an unwanted submission. The outbox now checks identity after
the probe and before queueing a failed submission. In production it also checks
the authentication generation, so signing out and back into the same account
does not revive an old attempt. Regressions cover stale offline and retryable
responses recreating discarded data. Successful remote responses keep their
actual result, and normal same-account retries remain supported.

## Performance considerations

The rhythm fix retains memoization and selects only the state required for the
session. Passage reads, audio resolution, review paging, and existing request
guards were inspected; this pass does not claim a measured device speedup or
introduce a speculative performance refactor.

## Verification

The three original regressions failed before the implementation changes;
failure evidence is retained in the local
`/tmp/everybible-pass4-{rhythm,gather,feedback}-red.log` files. The additional
delayed-Pause screen reproduction is in
`/tmp/everybible-pass4-gather-pause-red.log`.

- The primary independently reran 90 plan tests, 119 feedback tests, and 101
  Gather tests; all passed.
- `npm run release:verify` passed: root/workspace lint and typechecks, all
  8,745 tests with zero failures or skips, and Expo configuration validation.
  Output: `/tmp/everybible-pass4-release-verify.log`.
- iOS and Android production exports passed at `/tmp/everybible-pass4-export`.
- Changed-file Prettier and `git diff --check` passed.

The local save includes only these fixes, their regressions, and this report.
Unrelated workspace files remain untouched. No push or release is included.

Render tests exercise real screens with native adapters replaced by test fakes.
They do not prove physical-device callback timing or live backend behavior.
