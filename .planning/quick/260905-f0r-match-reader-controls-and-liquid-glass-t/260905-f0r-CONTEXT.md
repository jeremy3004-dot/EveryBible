# Quick Task 260905-f0r: Reader controls and native glass parity

## Goal

Match the supplied target recording's reader control geometry, coordinated scroll motion, and native glass material in the existing EveryBible app. This is an authorized implementation task; the user has delegated design decisions and does not require another design approval.

## Evidence and confidence

- Current recording: `/Users/dev/Downloads/ScreenRecording_09-05-2026 10-38-39_1.MP4`.
- Target recording: `/Users/dev/Downloads/ScreenRecording_09-05-2026 10-39-21_1.MP4`.
- Observed by the orchestrator after final measurement: both recordings correspond to a 440 × 956 logical viewport. Target resting capsule is approximately 398 × 60 at x=21, y=874, with a 22-point bottom gap; selected segment is approximately 84 × 54. Play is 64 points, centered at x=220, y=824; side controls are 40 points centered at x=44/396, y=837. Collapsed play center is approximately y=889 (65-point travel), while arrows and capsule travel approximately 132 points. These are frame measurements, not exact constraints for every device size.
- Observed target behavior: controls move in coordinated continuous collapse, with different travel distances from shared progress; play does not gain a progress ring or grow in scale. Direction reversal restores chrome even deep in a chapter.
- Verified source behavior: current capsule inset is 24 points and bottom gap is 21; play is 66 points inside a 78-point ring; side controls scale and independently translate; scroll updates cross to JavaScript at a 48-point interval; tab collapse is binary. The resulting motions cannot remain synchronized.
- Inferred implementation: one shared UI-thread progress value should drive tab and dock translation; safe-area-aware geometry should reproduce reference positions without hardcoding a device's screen height.
- Research supplied by the orchestrator: Expo SDK 54 supports the MIT-licensed `expo-glass-effect` approximately `~0.1.10`; native availability must be checked at runtime. Glass and its ancestors must keep opacity 1. Native iOS 26.5 / Xcode 26.6 is available; current RN is 0.81.5 with the old architecture. Native build verification is still required.
- Unknown until native QA: exact material/refraction appearance in the final build, frame-perfect travel timing, physical-device accessibility settings, and unsupported-platform appearance. Do not label any of these verified from source tests alone.

## Decisions

- **D-01:** Treat the second recording as the parity target and first as the baseline. Match measured resting/collapsed geometry and continuous movement; keep play size constant and remove the decorative progress ring.
- **D-02:** Use actual supported native Liquid Glass surfaces on iOS 26, with the existing blur/material approach on unsupported systems. Keep glass/ancestor opacity at 1; move surfaces rather than fading their parent.
- **D-03:** Keep React Navigation and the current route architecture. Share transient Reanimated progress through a nonpersisted Zustand store containing a `makeMutable` shared value, consumed by an animated tab wrapper and focused reader. Use the repository's existing state convention; no new Context provider.
- **D-04:** Preserve read/listen continuity, playback, previous/next and plan-completion actions, Bible-tab resume, Plans-tab reset, nested-route/plan/verse-selection hiding, and restoration after leaving the reader. Hidden controls must not receive touches or accessibility focus.
- **D-05:** Preserve all 21 bundled interface locales and existing translated accessibility labels. Respect reduced motion, safe areas, theme colors, and minimum touch targets; no new English-only UI copy.
- **D-06:** Verify deterministic continuous progress, reversal, top/bottom overscroll, route restoration, and hidden control behavior; then record native iPhone 17 Pro Max QA against the target clip. Keep unresolved device or build gates explicit.

## Implementation discretion

Tune bounded collapse distance and small geometry offsets using frame comparisons. A 40-point visible arrow must retain a larger invisible touch target. Use native material availability instead of introducing another navigation framework. Preserve unrelated WIP; the orchestrator owns source integration and final verification.

## Deferred Ideas

No new features are requested. Router migration, new reader content, backend changes, and publishing are outside this task.

## Working state

Started on `main` at `a608f1d7`. Existing changes include `ios/EveryBible/Info.plist`, `package.json`, and unrelated untracked assets/docs/configuration. Preserve them; dependency edits must merge only this task's required package changes.
