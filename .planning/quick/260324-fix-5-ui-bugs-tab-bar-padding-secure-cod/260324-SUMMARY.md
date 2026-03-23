---
id: 260324
title: Fix 5 UI bugs — tab bar padding, secure-code keyboard, reader header, back button safe area, mini player overlap
type: quick
date: 2026-03-24
commits:
  - f68fe8a
  - d32fde6
  - 7bc941b
tags: [layout, safe-area, ui-bug, tab-bar, miniplayer]
key-files:
  created: []
  modified:
    - src/design/system.ts
    - src/navigation/TabNavigator.tsx
    - src/screens/learn/ReadingPlanDetailScreen.tsx
    - src/screens/learn/ReadingPlanListScreen.tsx
    - src/screens/more/TranslationBrowserScreen.tsx
    - src/screens/more/PrivacyPreferencesScreen.tsx
    - src/screens/bible/BibleReaderScreen.tsx
    - src/screens/more/AnnotationsScreen.tsx
    - src/components/audio/MiniPlayer.tsx
decisions:
  - Tab bar height is now dynamic (tabBarBaseHeight + insets.bottom) so label text is never clipped on home-indicator phones
  - tabBarBaseHeight set to 56 pt (icon + label only); safe-area inset added at runtime, not baked into the constant
  - Scroll-offset consumers use tabBarBaseHeight as the safe static minimum
---

# Quick Task 260324 Summary

**One-liner:** Fixed five safe-area layout bugs — dynamic tab bar height, PIN number-pad keyboard, reader header breathing room, AnnotationsScreen back-button inset, and MiniPlayer tab-bar overlap.

## What Was Done

### Task 1: Dynamic tab bar height (f68fe8a)

**Problem:** `tabBarHeight: 72` was a static constant. On iPhones with a 34 pt home-indicator inset the tab bar clipped label text.

**Fix:**
- `src/design/system.ts`: Renamed `tabBarHeight: 72` to `tabBarBaseHeight: 56`. The 56 pt base covers the icon and label area without any inset.
- `src/navigation/TabNavigator.tsx`: Added `useSafeAreaInsets` import; computes `tabBarHeight = layout.tabBarBaseHeight + insets.bottom` at runtime. `paddingBottom` uses `insets.bottom` when positive, otherwise falls back to `spacing.sm`.
- Updated all three scroll-offset consumers to use `tabBarBaseHeight`:
  - `src/screens/learn/ReadingPlanDetailScreen.tsx`
  - `src/screens/learn/ReadingPlanListScreen.tsx`
  - `src/screens/more/TranslationBrowserScreen.tsx`

### Task 2: PIN keyboard, reader header, AnnotationsScreen safe area (d32fde6)

**Fix A — PIN keyboard type** (`src/screens/more/PrivacyPreferencesScreen.tsx`):
- Both PIN `TextInput` elements now have `keyboardType="number-pad"` and `secureTextEntry`.
- Removed irrelevant `autoCapitalize="none"` and `autoCorrect={false}`.

**Fix B — BibleReaderScreen header top padding** (`src/screens/bible/BibleReaderScreen.tsx`):
- `styles.header.paddingTop` changed from `6` to `spacing.md` (12).
- `styles.followAlongHeader.paddingTop` also changed from `6` to `spacing.md` (12).

**Fix C — AnnotationsScreen safe area** (`src/screens/more/AnnotationsScreen.tsx`):
- Added `useSafeAreaInsets` import from `react-native-safe-area-context`.
- Added `const insets = useSafeAreaInsets()` in component body.
- Applied `paddingTop: insets.top` to the outer `View` container (inline prop).
- Reduced `styles.header.paddingTop` from `spacing.lg` (16) to `spacing.sm` (8) to avoid double-counting.

### Task 3: MiniPlayer bottom offset (7bc941b)

**Problem:** `styles.shell.bottom: 74` was hardcoded. On devices where `insets.bottom > 0`, the actual tab bar height exceeds 74 pt and the mini player overlaps tab bar icons.

**Fix** (`src/components/audio/MiniPlayer.tsx`):
- Added `useSafeAreaInsets` import.
- Computes `tabBarHeight = layout.tabBarBaseHeight + insets.bottom` inside the component.
- Shell bottom applied as inline override: `[styles.shell, { bottom: tabBarHeight + spacing.sm }]`.
- Removed `bottom: 74` from `styles.shell` in `StyleSheet.create`.

## Verification

```
npm run typecheck  — PASSED (0 errors)
npm run lint       — Pre-existing errors only (LessonDetailScreen.tsx set-state-in-effect,
                     supabase/functions Deno globals); none introduced by this task.
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/design/system.ts` — tabBarBaseHeight: 56 present
- `src/navigation/TabNavigator.tsx` — useSafeAreaInsets + dynamic height present
- `src/screens/more/AnnotationsScreen.tsx` — useSafeAreaInsets + paddingTop: insets.top present
- `src/components/audio/MiniPlayer.tsx` — dynamic bottom, no hardcoded 74 present
- Commits f68fe8a, d32fde6, 7bc941b all exist in git log
