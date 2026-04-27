---
status: resolved
trigger: "Investigate issue: reader-play-button-bounces-at-bottom"
created: 2026-04-12T14:00:00+09:00
updated: 2026-04-12T14:18:00+09:00
---

## Current Focus
hypothesis: The premium reader dock was bouncing because the ScrollView bottom padding and the dock overlay were both driven by the same live bottom-chrome progress, creating a layout feedback loop at the bottom of the chapter.
test: Confirmed by changing the premium reader bottom padding to a stable base value, rerunning the targeted source tests, the full test suite, typecheck, and lint, and then validating in the iPhone 17 Pro simulator.
expecting: If the hypothesis was right, removing the animated content-height coupling should eliminate the bounce while leaving the dock anchored.
next_action: Archive the session and record the simulator verification context now that the issue is confirmed fixed.

## Symptoms
expected: The reader play button should remain visually stable and anchored when the chapter is scrolled all the way to the bottom, including during play/pause interaction.
actual: At the bottom of the reading page, tapping the play button makes the button/dock jump up and down.
errors: None reported.
reproduction: Open the Bible reader in read mode, scroll to the bottom of the chapter, then tap the play button in the reader playback dock.
started: Observed on current branch `codex/buttonjumping`.

## Eliminated

## Evidence
- timestamp: 2026-04-12T14:00:00+09:00
  checked: Existing debug note about the dock being too high
  found: That prior issue was about the dock wrapper not being an Animated.View, which is a different anchoring bug.
  implication: The current issue is likely a runtime coupling/feedback problem rather than the old wrapper-type mistake.
- timestamp: 2026-04-12T14:00:00+09:00
  checked: `BibleReaderScreen.tsx` bottom-chrome logic
  found: Premium read mode animates both `bottomDockAnimatedStyle` and `premiumReaderBottomPadding` from `readerBottomChromeProgress`.
  implication: The dock position and the scroll content's bottom spacing are linked, so a layout feedback loop is plausible at the bottom of the chapter.
- timestamp: 2026-04-12T14:00:00+09:00
  checked: `handlePlayDisplayedChapter`
  found: The play button itself only starts/toggles audio; it does not intentionally move the reader scroll position.
  implication: The visible bounce is probably an indirect effect from layout state changing after the tap, not the handler directly scrolling the page.
- timestamp: 2026-04-12T14:00:00+09:00
  checked: `renderPremiumReadLayout` bottom chrome math
  found: `bottomDockAnimatedStyle` and `premiumReaderBottomPadding` both derive from `readerBottomChromeProgress`, while the progress is recomputed from `ScrollView` bottom state.
  implication: The dock and the content height are coupled tightly enough to create a bottom-of-page reflow loop.
- timestamp: 2026-04-12T14:18:00+09:00
  checked: `npm test`, `npm run typecheck`, and `npx eslint` on the touched files
  found: The full test suite passed, typecheck passed, and eslint passed after freezing the premium reader bottom padding to the base value.
  implication: The fix is locally healthy and ready for human verification in the simulator.

## Resolution
root_cause: The premium reader dock position and the ScrollView bottom padding were both animated from the same `readerBottomChromeProgress`, so tapping play at the chapter bottom could trigger a layout reflow loop that made the dock jump.
fix: Freeze the premium reader bottom padding to `premiumReaderBaseBottomPadding` instead of animating it from the live chrome progress, and update the chrome source test to expect the stable padding.
verification: `npm test`, `npm run typecheck`, and `npx eslint src/screens/bible/BibleReaderScreen.tsx src/screens/bible/bibleReaderChromeSource.test.ts src/components/audio/ReaderPlaybackDock.tsx src/components/audio/readerPlaybackDockSource.test.ts` all passed.
verification: `npm test`, `npm run typecheck`, and `npx eslint src/screens/bible/BibleReaderScreen.tsx src/screens/bible/bibleReaderChromeSource.test.ts src/components/audio/ReaderPlaybackDock.tsx src/components/audio/readerPlaybackDockSource.test.ts` all passed. Human verification in the iPhone 17 Pro simulator confirmed the play button stayed anchored with no bounce when tapped near the bottom of the chapter (verses 23-28 visible).
files_changed:
  - src/screens/bible/BibleReaderScreen.tsx
  - src/screens/bible/bibleReaderChromeSource.test.ts
