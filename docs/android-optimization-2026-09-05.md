# Android speed and offline daily Scripture — September 5, 2026

The local daily verse now works without a content-server request, with 200 bundled passages (42 added). The audio queue processing benchmark exceeds the 40% reduction target. The emulator startup improvement is smaller; this is not a claim that the whole app is 40% faster on older physical phones.

## Changes

- Home chooses a passage using the phone's local calendar date and reads its text from the installed Bible database. Artwork also remains local. The online verse override and fixed 2.5-second retry are removed. Local database initialization can start after Home's opening interaction instead of depending on the background catalog request. Foreground/midnight refresh and stale-response protection remain.
- The 200-entry rotation continues across New Year and advances by calendar day rather than elapsed hours, avoiding daylight-saving skips. Every passage and range was verified against all four bundled translations. Add future passages in `src/services/bible/popularVerseReferences.ts`; app updates carry the roster and the existing bundled database supplies the text. No database asset rebuild was needed.
- Android release builds enable Metro's inline requires while retaining Expo's other transform settings. This defers unused module evaluation; development and iOS keep their previous settings. Hermes and native shrinking were already enabled.
- Audio persistence compares the saved fields before JSON serialization or MMKV access. Live progress still updates every 250 ms, while resume checkpoints retain the existing five-second policy. Unchanged duration, status, and position snapshots no longer notify every subscriber. Settings, queue edits, backwards seeks, hydration, failed writes, and storage clearing retain their save behavior.

The mobile Home screen no longer consumes the admin content API's verse-of-day override. Other content API surfaces remain available.

## Measurements

Baseline source: `a608f1d7dc138c3a171a09971760269a98188fe4`. All numbers compare this baseline with the working-tree changes in this report.

| Measurement | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Audio CPU time, 30 queued chapters, median per simulated minute | 2.330 ms | 0.522 ms | 77.6% |
| Audio CPU time, empty queue, median per simulated minute | 0.470 ms | 0.465 ms | 1.1% |
| Audio JSON serialization / native storage reads per simulated minute | 421 | 13 | 96.9% |
| Audio store subscriber notifications per simulated minute | 421 | 241 | 42.8% |
| Android activity first-display time, median | 277 ms | 258 ms | 6.9% |
| Launch marker to App module evaluation, median | 231 ms | 209 ms | 9.5% |
| Android embedded Hermes bytecode | 17,842,610 bytes | 14,667,024 bytes | 17.8% |

The audio probe executes the actual store and Zustand middleware on Node 22.23.2/macOS, with native storage replaced by an in-memory adapter that preserves the existing duplicate-write behavior. It uses four progress updates per second plus one native snapshot per second, three warmup batches, and 25 measured batches with alternating before/after order. Native write counts remain 13: the improvement removes serialization, native reads, and notifications, not already-deduplicated writes. These are CPU/work-count results, not Android device playback latency.

Android startup used an API 36 ARM64 headless emulator with two CPU cores, 2 GB RAM, and a 720×1280 screen. Each build had one warmup and seven measured force-stop launches with onboarding and database initialization already completed. Builds used matching native resources/runtime configuration and Hermes `-O`; the baseline APK carried the unmodified baseline source bundle. An earlier misconfigured baseline was discarded. No build or full test job was running during the measured startup loops.

Raw activity display samples (ms): baseline `[269, 257, 305, 292, 277, 280, 259]`; final `[256, 282, 259, 337, 251, 242, 258]`. App module samples: baseline `[234, 217, 260, 237, 228, 231, 210]`; final `[203, 256, 209, 284, 210, 190, 205]`. Small emulator differences are noisy. Activity display and module evaluation do not measure a fully interactive Home screen or scrolling smoothness.

## Repeatable checks

```sh
npm run perf:android:audio -- a608f1d7
npm run perf:android:startup -- --serial DEVICE_SERIAL --label REVISION --output /tmp/android-startup.json
```

The startup probe requires an explicitly selected device with the intended release build already installed. It force-stops the app between launches; it does not install builds, clear app data, clear device logs, or create/reset emulators. Verify the actual screen separately. Keep hardware, app data, thermal state, network, and build settings consistent between comparisons.

## Verification

- `npm run release:verify`: 1,623 tests passed, zero failures/skips; mobile/admin/site lint and typechecks and Expo config passed. The existing admin custom-font lint warning remains.
- Android ARM64 `assembleRelease`: passed with the final source. Final APK SHA-256: `bf2a1d8cf963f54755b671941f1715d6a86b80d69e3b894cbd5b5c4d2cd42801`.
- Android native-library 16 KB alignment check: passed for the release APK.
- iOS production export: passed with Hermes bytecode. No iOS simulator state was changed.
- Focused regressions: 29 passed. New tests were observed failing before the fixes; the retained audio source contract was updated for the equivalent checkpoint expression.
- Local-date rotation tests passed in Asia/Kathmandu and America/New_York, including daylight-saving, leap-day, midnight, and New Year boundaries.
- Owned-file formatting and `git diff --check`: passed.
- Android offline smoke: fresh guest onboarding with both Wi-Fi and mobile data disabled showed Matthew 5:9 from the bundled BSB. Bible browser, Genesis 1 → Genesis 2, BSB → ASV selection, and the More screen passed. After three offline cold restarts, Home showed the ASV daily verse and retained “Continue Genesis 2.” The reusable startup probe also completed successfully in this offline run; those smoke timings are not part of the before/after comparison.

Local screenshots and raw measurement results are saved under `qa-evidence/android-optimization-2026-09-05/` (ignored by Git).

No publishing, version bump, commit, or merge was performed. Actual older Android hardware, full time-to-interactive, scrolling/frame-time comparisons, and background audio over slow networks still need device measurements before an app-wide 40% improvement can be claimed.

## Guidance used

- [React Native 0.81 performance](https://reactnative.dev/docs/0.81/performance): measure release builds and avoid unnecessary JavaScript-thread work.
- [React Native JavaScript loading](https://reactnative.dev/docs/0.81/optimizing-javascript-loading): defer module evaluation and account for import side effects.
- [Android startup optimization](https://developer.android.com/topic/performance/appstartup/analysis-optimization): remove unnecessary startup work and separate startup stages.
- [Android Macrobenchmark](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview): use representative release configurations and physical devices for reliable product-level performance conclusions.
