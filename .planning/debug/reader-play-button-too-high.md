# reader-play-button-too-high

## Symptom
- On iPhone 17 Pro simulator, the reader playback dock / play button appears too high instead of sitting low above the bottom chrome area.

## Evidence
- Screenshot: `/tmp/everybible-17pro.png`
- The reader screen shows the top chrome and root tab bar, but the playback dock is not anchored where expected.
- The dock wrapper in `src/screens/bible/BibleReaderScreen.tsx` was rendered as a plain `View` while receiving `bottomDockAnimatedStyle`.

## Root Cause
- The dock wrapper must be an `Animated.View` for the `useAnimatedStyle()` bottom interpolation to apply correctly.
- With a plain `View`, the dock can end up laid out in the wrong vertical position for the reader chrome flow.

## Fix
- Render the overlay wrapper as `Animated.View` so the animated `bottom` style can control the dock position.

## Verification
- Source test already expects the `Animated.View` wrapper in `src/screens/bible/bibleReaderChromeSource.test.ts`.
- Next step: run the targeted source test and then re-check the simulator frame.
