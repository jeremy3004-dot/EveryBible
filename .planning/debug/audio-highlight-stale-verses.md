---
status: fixed
created: 2026-06-19
updated: 2026-06-19
trigger: "I thought we worked on this, but still when the audio bible's being read, it highlights the verse, but then as the verse audio bible keeps reading and the verses move down, it's basically h highlighting more and more verses but doesn't unhighlight the earlier ones."
---

# Audio Highlight Stale Verses

## Symptom

- Expected: while audio Bible playback advances, only the currently spoken verse is highlighted.
- Actual: prior verses remain highlighted as playback advances and the reader scrolls, so visible highlights accumulate.
- Reported surface: audio Bible follow-along / reader view during playback.
- Error messages: none reported.

## Known Context

- Prior Phase 35 device QA claimed follow-along highlighting auto-advanced under audio.
- The current report says the real app still keeps old verse highlights, so the old verification likely missed a reader path, a scroll/recycling path, or an Android text repaint issue.

## Current Focus

- Root cause: the old fix remounted the verse text when a row rerendered, but the virtualized Android reader list was not explicitly invalidated when `readerInlineActiveVerse` changed.
- Fix: pass an `extraData` key derived from `readerInlineActiveVerse` and `paragraphRenderSignature` into the premium reader `Animated.FlatList`, so visible rows refresh when the spoken verse changes.
- Regression: `BibleReaderScreen tells the virtualized reader when the active audio verse changes`.

## Verification

- `node --test --import tsx src/screens/bible/bibleReaderChromeSource.test.ts src/screens/bible/bibleReaderPlanFlowSource.test.ts src/screens/bible/bibleReaderModel.test.ts` passed: 98/98.
- `npm run typecheck` passed.
- Android device install was attempted, but local Gradle daemon startup wedged before compilation; no updated APK was installed during this pass.
