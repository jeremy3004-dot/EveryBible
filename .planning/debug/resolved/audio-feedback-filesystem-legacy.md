---
status: resolved
trigger: "Submitting recorded Bible chapter feedback shows Expo SDK 54 deprecation error for FileSystem.getInfoAsync."
created: 2026-05-22
updated: 2026-05-22
---

## Current Focus
- hypothesis: chapter feedback audio upload imports the SDK 54 top-level FileSystem module while calling legacy helpers.
- test: search the feedback audio upload path for FileSystem imports and run targeted feedback tests after switching to the legacy import.
- expecting: audio upload no longer surfaces the getInfoAsync deprecation error when sending feedback.
- next_action: complete

## Evidence
- timestamp: 2026-05-22T06:39:00+07:00
  observation: Screenshot shows the feedback modal error: `Method getInfoAsync imported from "expo-file-system" is deprecated`.
- timestamp: 2026-05-22
  observation: `src/services/feedback/chapterFeedbackAudio.ts` imported `expo-file-system` and called `getInfoAsync` plus `readAsStringAsync`.
- timestamp: 2026-05-22
  observation: Other current call sites using `getInfoAsync` already import `expo-file-system/legacy`.

## Eliminated
- hypothesis: recording failed before upload
  reason: The UI showed `Audio response ready`, and the error happened after tapping `Send feedback`.

## Resolution
- root_cause: Expo SDK 54 deprecates the legacy async helper methods on the top-level `expo-file-system` import. The chapter feedback audio upload path still imported from the top-level module while using `getInfoAsync`.
- fix: Import `FileSystem` from `expo-file-system/legacy` in `chapterFeedbackAudio.ts`, matching the rest of the app's legacy helper usage.
- verification: `node --test --import tsx src/services/feedback/chapterFeedbackAudioSource.test.ts src/services/feedback/chapterFeedbackService.test.ts`; `npm run typecheck`; `npx eslint src/services/feedback/chapterFeedbackAudio.ts src/services/feedback/chapterFeedbackAudioSource.test.ts`.
- files_changed: `src/services/feedback/chapterFeedbackAudio.ts`, `src/services/feedback/chapterFeedbackAudioSource.test.ts`
