---
phase: 30-animated-chapter-swipe-and-reader-gestures
plan: "02"
subsystem: bible-reader
tags: [animation, reanimated, gesture, swipe, scroll, ui-thread]
dependency_graph:
  requires:
    - react-native-reanimated@3.19.5 (provided by 30-01)
    - react-native-gesture-handler@2.28.0 (provided by 30-01)
    - GestureHandlerRootView app root wrapper (provided by 30-01)
    - resolveSwipeChapterNavigation + SWIPE_THRESHOLD + SWIPE_VELOCITY_MIN (provided by 30-01)
  provides:
    - UI-thread scroll-driven header collapse via useAnimatedScrollHandler
    - Horizontal swipe chapter navigation in premium read mode
    - 150ms debounce guard on rapid swipes
  affects:
    - src/screens/bible/BibleReaderScreen.tsx (primary)
tech_stack:
  added: []
  patterns:
    - useAnimatedScrollHandler for UI-thread scroll tracking (replaces Animated.event on JS thread)
    - useAnimatedStyle + interpolate + Extrapolation.CLAMP for header collapse animation
    - Gesture.Pan() with activeOffsetX/failOffsetY for scroll-safe horizontal swipe
    - runOnJS to call JS-thread navigation handlers from worklet onEnd callback
    - useRef(false) debounce flag with 150ms timeout to prevent audio stacking on rapid swipes
    - GestureDetector wrapping Animated.View (required by gesture-handler for animation to work)
key_files:
  created: []
  modified:
    - src/screens/bible/BibleReaderScreen.tsx
decisions:
  - Use inline threshold check (wantsNext/wantsPrev) in .onEnd worklet rather than calling resolveSwipeChapterNavigation — avoids potential Reanimated Babel plugin bundling issues with imported functions in worklet context
  - Keep persistentReaderBottomBar outside GestureDetector so bottom nav buttons do not translate during swipe
  - Use useRef(false) debounce flag (not a shared value) because the in-flight guard is JS-thread state that only needs to survive the navigation promise lifecycle
metrics:
  duration: "~4 minutes"
  completed: "2026-03-25"
  tasks_completed: 2
  files_modified: 1
---

# Phase 30 Plan 02: Reanimated Scroll Handler and Swipe Gesture Summary

Replaced the old JS-thread Animated.Value scroll system with Reanimated 3's UI-thread `useAnimatedScrollHandler`, and wired a horizontal swipe gesture for chapter navigation in premium read mode.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Replace Animated.Value scroll system with Reanimated useAnimatedScrollHandler | 2068791 | BibleReaderScreen.tsx |
| 2 | Add horizontal swipe gesture for chapter navigation in read mode | bbf3b9d | BibleReaderScreen.tsx |

## What Was Built

**Task 1 — Reanimated scroll system replacement:**
- Removed `Animated` from `react-native` imports entirely
- Added `Animated` default export + `useSharedValue`, `useAnimatedScrollHandler`, `useAnimatedStyle`, `interpolate`, `Extrapolation` from `react-native-reanimated`
- Replaced `readerScrollY` (`useRef(new Animated.Value(0)).current`) with `scrollY = useSharedValue(0)`
- Replaced `readerScrollHandler` (`Animated.event`) with `scrollHandler` (`useAnimatedScrollHandler`) — runs entirely on UI thread
- Replaced four interpolated values (`topChromeOpacity`, `topChromeTranslateY`, `heroOpacity`, `heroTranslateY`) with two `useAnimatedStyle` objects: `topChromeAnimatedStyle` and `heroAnimatedStyle`
- Updated `scrollViewRef` type from `ScrollView` to `Animated.ScrollView` (from Reanimated) — no `as any` cast
- Updated `renderPremiumReadLayout` to use the new animated style objects on all three floating elements

**Task 2 — Swipe gesture:**
- Added `withSpring`, `runOnJS` to Reanimated imports
- Added `Gesture`, `GestureDetector` from `react-native-gesture-handler`
- Added `SWIPE_THRESHOLD`, `SWIPE_VELOCITY_MIN` to bibleReaderModel imports
- Added `swipeX = useSharedValue(0)` and `swipeInFlightRef = useRef(false)` in component body
- Added `handleSwipeNavigation` — JS-thread debounced wrapper that sets in-flight flag, calls existing `handleNextReadChapter` / `handlePreviousReadChapter`, and resets after 150ms
- Added `Gesture.Pan()` with `.activeOffsetX([-15, 15])` and `.failOffsetY([-10, 10])` so vertical scrolling is not intercepted
- Added `swipeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: swipeX.value }] }))`
- Wrapped premium read layout content (`floatingReaderTopBar`, `floatingReaderTranslationDock`, `floatingReaderHero`, `Animated.ScrollView`) in `GestureDetector > Animated.View` with `swipeStyle`
- Left `persistentReaderBottomBar` outside GestureDetector so it does not translate during swipe

## Verification Results

```
npm run typecheck → clean (0 errors)
npx eslint src/screens/bible/BibleReaderScreen.tsx → 0 errors, 1 pre-existing warning (SafeAreaView unused)
npx prettier --check src/screens/bible/BibleReaderScreen.tsx → clean after --write
node --test --import tsx src/screens/bible/bibleReaderSwipeModel.test.ts → 9/9 pass
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Deviation from plan suggestion] Inline threshold logic instead of resolveSwipeChapterNavigation in worklet**
- **Found during:** Task 2 implementation
- **Issue:** Plan noted that calling `resolveSwipeChapterNavigation` in a worklet context may fail if Reanimated's Babel plugin cannot resolve the imported module path at bundle time. The plan provided an "inline fallback" as the safer approach.
- **Fix:** Used the inline approach (`wantsNext`/`wantsPrev` computed from event.translationX and event.velocityX directly) instead of calling the imported function. The logic is identical to `resolveSwipeChapterNavigation` — constants `SWIPE_THRESHOLD` and `SWIPE_VELOCITY_MIN` are still imported and used.
- **Files modified:** BibleReaderScreen.tsx (.onEnd worklet body)
- **Commit:** bbf3b9d

## Known Stubs

None. All functionality is fully wired — `handleSwipeNavigation` calls the existing `handleNextReadChapter` / `handlePreviousReadChapter` handlers which perform real chapter navigation.

## Self-Check: PASSED

- `BibleReaderScreen.tsx` does NOT import `Animated` from `react-native`: confirmed
- `BibleReaderScreen.tsx` imports `useSharedValue`, `useAnimatedScrollHandler`, `useAnimatedStyle`, `interpolate`, `Extrapolation` from `react-native-reanimated`: confirmed
- `BibleReaderScreen.tsx` imports `Gesture`, `GestureDetector` from `react-native-gesture-handler`: confirmed
- `BibleReaderScreen.tsx` imports `withSpring`, `runOnJS` from `react-native-reanimated`: confirmed
- `BibleReaderScreen.tsx` uses `scrollY` (useSharedValue) instead of `readerScrollY` (Animated.Value): confirmed
- `BibleReaderScreen.tsx` uses `scrollHandler` (useAnimatedScrollHandler) instead of `readerScrollHandler`: confirmed
- `BibleReaderScreen.tsx` uses `topChromeAnimatedStyle` and `heroAnimatedStyle` (useAnimatedStyle): confirmed
- `BibleReaderScreen.tsx` has `Gesture.Pan()` with `.activeOffsetX([-15, 15])` and `.failOffsetY([-10, 10])`: confirmed
- `BibleReaderScreen.tsx` has `swipeInFlightRef` for debounce: confirmed
- `BibleReaderScreen.tsx` wraps premium read content in `GestureDetector > Animated.View` with `swipeStyle`: confirmed
- `persistentReaderBottomBar` is NOT inside the GestureDetector: confirmed
- `scrollViewRef` typed as `Animated.ScrollView | null` (not `as any`): confirmed
- Commit `2068791` exists: confirmed
- Commit `bbf3b9d` exists: confirmed
- npm run typecheck passes: confirmed
- 9/9 swipe model tests pass: confirmed
