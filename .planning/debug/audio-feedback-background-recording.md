---
status: resolved
trigger: "Tried to record audio feedback and saw EXModulesErrorDomain: This experience is currently in the background, so the audio session could not be activated."
created: 2026-05-21
updated: 2026-05-21
---

## Current Focus
- hypothesis: iOS microphone permission or app-state transition leaves Expo AV seeing the app as inactive/background when recording is prepared.
- test: guard audio recording startup until AppState is active and verify source/tests/build.
- expecting: Record audio no longer displays raw native background error after permission prompt.
- next_action: complete

## Evidence
- timestamp: 2026-05-21T18:29:57+07:00
  observation: Screenshot shows feedback modal error from Expo AV prepare step: "This experience is currently in the background, so the audio session could not be activated."
- timestamp: 2026-05-21
  observation: `startFeedbackAudioRecording` requests permission and immediately calls `Audio.setAudioModeAsync` and `Audio.Recording.createAsync` without waiting for AppState to return to active.

## Eliminated
- hypothesis: missing microphone permission string
  reason: Permission UI path exists and the error is audio-session activation, not denied permission.

## Resolution
- root_cause: `startFeedbackAudioRecording` requested microphone permission and immediately prepared the Expo AV recording session. On iOS, returning from the permission prompt can briefly leave React Native/Expo reporting the experience as inactive/background, so the prepare step failed.
- fix: wait for `AppState.currentState` to be `active`, then wait for pending interactions before calling `Audio.setAudioModeAsync` and `Audio.Recording.createAsync`. The start-recording catch path now shows the localized friendly fallback instead of raw native exception text.
- verification: `node --test --import tsx src/screens/bible/bibleReaderFeedbackSource.test.ts`; `npm run typecheck`; `npm run lint -- --quiet`; XcodeBuildMCP `build_run_sim` on iPhone 17 Pro.
- files_changed: `src/screens/bible/BibleReaderScreen.tsx`, `src/screens/bible/bibleReaderFeedbackSource.test.ts`
