# Android Read Along controls

The owner reported that opening Read Along before pressing Play left text on screen without playback controls. The connected Redmi reproduced this on both the prior QA APK and an APK built from current main `637c59ed`. The footer was also absent after starting and pausing audio, so the defect was Android layout rather than an idle-state visibility condition.

## Reproduction and change

Fresh QA process → John 1 → speaker/audio options → Read Along, without pressing Play. The native hierarchy contained only Close and a scrolling text area extending from y=195 to the bottom of the 720 × 1600 screen. No transport controls were visible. Native media state remained empty, confirming that the opening did not start playback.

`FollowAlongTextSheet` now bounds its Android content to the reactive window height instead of relying on its root flex allocation. The text and transport share that bounded viewport. The iOS root retains its existing flex layout. Playback handlers are unchanged; opening remains silent until Play is pressed.

## Verification

- Regression coverage checks both idle entry paths, no autoplay, Play starting the displayed chapter, Android viewport resizing, and unchanged iOS layout.
- `npm run release:verify` passed: 8,963 tests, lint/typechecks, and Expo configuration. Existing deferred strict diagnostics remain unchanged.
- The fixed APK was installed and its SHA-256 verified on the phone. Idle Read Along now visibly renders the progress rail and Previous/Play/Next; Play bounds are `[308,1464][412,1568]`. Native audio remains idle on opening.
- Pressing the visible Read Along Play control produced native PLAYING John 1; pressing the same control again produced PAUSED John 1. Existing retained playback position was preserved, so this does not claim a zero-position start.
- Before the Android-only change, current-code iPhone simulator checks confirmed idle controls and actual playback from Read Along. The Android-only layout branch is covered by tests; no new iOS native build was required for this fix.

## Artifact provenance

Current-main failing baseline APK: `916e0b24b330488fbf110dda4ef79bd83160f32858d9a641eb7edb4d67c0dfad`.

Fixed APK: `66ac4cb976e4162badb05b9c2f660e7ae3bc31bb7e6d6d6660cbe6d8f61aebf3`.

All 795 bundled repository source modules match the fixed checkout. Only `FollowAlongTextSheet.tsx` changed at runtime between those APKs; native binaries, package identity, and signing remained unchanged. Evidence is archived outside Git under `/tmp/everybible-readalong-idle-2026-09-27/`. The separate QA identity preserves production app data. This is device verification, not a store release.
