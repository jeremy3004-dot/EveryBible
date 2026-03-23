---
phase: quick-260323
plan: "01"
subsystem: bible-reader
tags: [bug-fix, navigation, audio, follow-along, font-size, background-download]
dependency_graph:
  requires: []
  provides: [correct-back-navigation, font-size-padding, follow-along-lag, background-download-mode]
  affects: [BibleReaderScreen, bibleReaderModel, audioDownloadStorage, app.json]
tech_stack:
  added: []
  patterns: [dynamic-padding-by-font-size, progress-lag-offset, UIBackgroundModes-fetch]
key_files:
  created: []
  modified:
    - src/screens/bible/BibleReaderScreen.tsx
    - src/screens/bible/bibleReaderModel.ts
    - src/services/audio/audioDownloadStorage.ts
    - app.json
decisions:
  - Use navigate('BibleBrowser') instead of goBack() to ensure back always lands on the book list regardless of navigation history
  - Apply an 8% lag as a subtracted offset from progressRatio (simplest change, preserves all existing loop logic)
  - Add UIBackgroundModes "fetch" to app.json to allow native OS download tasks to survive backgrounding
metrics:
  duration: ~15 minutes
  completed: "2026-03-23"
  tasks_completed: 4
  files_modified: 4
---

# Quick Task 260323: Fix 4 Bible Reader Bugs

**One-liner:** Fixed back button navigation, large-font clipping, premature follow-along verse advancement, and iOS background download mode in the Bible reader.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Fix back button navigation to BibleBrowser | c5620f6 | BibleReaderScreen.tsx |
| 2 | Fix font size clipping at largest size (legacy reader) | d878e31 | BibleReaderScreen.tsx |
| 3 | Fix audio follow-along verse advancing too early | e3f1467 | bibleReaderModel.ts |
| 4 | Verify download background persistence | 62a01fa | app.json, audioDownloadStorage.ts |

## Changes Made

### Task 1: Back button navigation
Both back-button `onPress` handlers in `BibleReaderScreen.tsx` (premium read layout ~line 1196 and legacy reader layout ~line 1425) called `navigation.goBack()`. This navigated to wherever the user came from rather than always returning to the book list. Replaced both with `navigation.navigate('BibleBrowser')` — type-safe since `BibleBrowser` is defined in `BibleStackParamList` with no required params.

### Task 2: Font size clipping (legacy reader)
The legacy reader scroll view's `contentContainerStyle` had a fixed `paddingTop: 18` (from `styles.content`). At `fontSize === 'large'` (scale 1.2), the first line of text clips against the bottom edge of the sticky header. Added an inline override: `paddingTop: fontSize === 'large' ? 28 : 18`. The `fontSize` value is already in scope from `useFontSize()`.

### Task 3: Follow-along verse timing lag
`getEstimatedFollowAlongVerse` in `bibleReaderModel.ts` was advancing to the next verse the moment any audio progress entered that verse's weight window. Added an 8% lag by subtracting `0.08` from `progressRatio` before computing `weightedProgress`:
```typescript
const laggedProgress = Math.max(0, progressRatio - 0.08);
const weightedProgress = laggedProgress * totalWeight;
```
All 21 existing bibleReaderModel tests pass with this change.

### Task 4: UIBackgroundModes "fetch" for background downloads
`app.json` had `UIBackgroundModes: ["audio"]` only. iOS requires `"fetch"` for native background download sessions (`@kesha-antonov/react-native-background-downloader` uses `URLSession` tasks). Without it, in-progress downloads can be suspended when the app moves to background mid-download. Added `"fetch"` to the array. Added a documentation comment in `audioDownloadStorage.ts` above `createBackgroundAudioDownloadTransport` explaining the requirement.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

Files created/modified:
- FOUND: src/screens/bible/BibleReaderScreen.tsx
- FOUND: src/screens/bible/bibleReaderModel.ts
- FOUND: src/services/audio/audioDownloadStorage.ts
- FOUND: app.json

Commits:
- FOUND: c5620f6
- FOUND: d878e31
- FOUND: e3f1467
- FOUND: 62a01fa
