---
status: resolved
trigger: "Investigate issue: audio-player-hidden-old-book-keeps-playing"
created: 2026-04-03T11:49:26Z
updated: 2026-04-03T12:36:22Z
---

## Current Focus

hypothesis: Confirmed and fixed. MiniPlayer is no longer globally hidden on BibleReader; it now hides only when the reader is already displaying the active audio chapter.
test: Re-run regression source test plus lint/typecheck.
expecting: Tests pass and mini player remains available while viewing a different chapter than the currently active audio track.
next_action: human verification on-device with the original reproduction path.

## Symptoms

expected: When moving from one book/chapter to another, the player UI remains available for the currently active audio session, and background audio/state stays consistent with what is visible. If old audio should stop, it stops deterministically.
actual: Example reported flow: start audio in Galatians; navigate away; open Hebrews but do not press play. Galatians audio keeps playing in background, bottom player/tab disappears, and Hebrews has not started so user cannot pause the still-playing Galatians audio.
errors: no explicit runtime error provided yet
reproduction: Start playback in one Bible book -> navigate elsewhere -> come back to a different book without starting playback there -> observe hidden tab/player while previous book audio still plays.
started: reported current bug, exact intro commit unknown

## Eliminated

## Evidence

- timestamp: 2026-04-03T11:49:26Z
  checked: debug session bootstrap
  found: Created dedicated debug file with prefilled symptoms; status set to investigating due to symptoms_prefilled=true.
  implication: Investigation can proceed immediately without additional symptom-gathering prompts.

- timestamp: 2026-04-03T11:52:06Z
  checked: phase-0 knowledge base
  found: .planning/debug/knowledge-base.md does not exist.
  implication: No prior resolved pattern to prioritize; continue with first-principles investigation.

- timestamp: 2026-04-03T11:52:06Z
  checked: audio/navigation implementation (RootNavigator, MiniPlayer, BibleReaderScreen, bibleReaderModel)
  found: MiniPlayer returns null whenever currentRouteName === 'BibleReader'; BibleReader listen controls bind to viewed chapter and show idle when active audio belongs to a different chapter.
  implication: A playing old chapter can continue in background while current screen exposes no pause control for that old session.

- timestamp: 2026-04-03T11:53:37Z
  checked: regression reproduction test (node --test --import tsx src/components/audio/miniPlayerNavigationSource.test.ts)
  found: New test fails because MiniPlayer source contains currentRouteName === 'BibleReader' unconditional hide branch.
  implication: Reproduced deterministically before any fix; this branch is directly causing the hidden-control symptom.

- timestamp: 2026-04-03T11:55:44Z
  checked: implementation change (RootNavigator + MiniPlayer + source test expectations)
  found: RootNavigator now passes current route params to MiniPlayer; MiniPlayer hides only when BibleReader route book/chapter matches active audio book/chapter.
  implication: While reading a different chapter, the global mini player remains visible so old background audio can be paused/stopped.

- timestamp: 2026-04-03T11:55:44Z
  checked: regression and quality gates
  found: node --test --import tsx src/components/audio/miniPlayerNavigationSource.test.ts passes; npx eslint on changed files passes; npm run typecheck passes.
  implication: Fix is validated locally and does not introduce lint/typecheck regressions.

## Resolution

root_cause: MiniPlayer is hidden for all BibleReader routes regardless of whether the reader is showing the active audio session. When users navigate to another chapter while old audio keeps playing, the only global pause/control surface disappears.
fix: Passed current route params from RootNavigator into MiniPlayer and replaced the unconditional BibleReader hide guard with a route-aware check that hides only when BibleReader is already showing the active audio chapter.
verification: Reproduced via failing regression test pre-fix, then verified post-fix with passing regression test, lint on changed files, and full typecheck.
files_changed:
  - src/navigation/RootNavigator.tsx
  - src/components/audio/MiniPlayer.tsx
  - src/components/audio/miniPlayerNavigationSource.test.ts
