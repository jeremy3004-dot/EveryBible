# Android Performance Notes

## Startup Assumptions

- The first usable screen should not require opening the bundled Bible SQLite database.
- Runtime translation catalog hydration, stale text-pack reconciliation, Bible database warmup, audio download reattach, analytics session startup, and Android notification channel setup are best-effort background work.
- Home may show a loading state for verse-of-day text while the app remains navigable.
- Audio download reattach still runs automatically after onboarding, and again when the app returns to the foreground.

## Current Baseline From This Pass

Measured with Expo production Android bundling on this machine. `adb` exists at
`/Users/dev/Library/Android/sdk/platform-tools/adb`.

- Before: `npx expo export:embed --platform android --dev false --entry-file index.ts` bundled `4829` modules in `14397ms`; JS bundle `12,932,999` bytes, gzip `2,722,613` bytes; exported assets `48M`.
- After deferring Bible/audio/analytics/notification startup imports: same command bundled `4829` modules in `15453ms`; JS bundle `12,932,747` bytes, gzip `2,723,072` bytes; exported assets `48M`.
- After also deferring NetInfo/cloud sync and privacy app-state hooks: same command bundled `4830` modules in `18653ms`; JS bundle `12,933,308` bytes, gzip `2,724,490` bytes; exported assets `48M`.
- After trimming the Bible reader open path: same command bundled `4830` modules in `14404ms`; JS bundle `12,934,469` bytes, gzip `2,725,087` bytes; exported assets `48M`.
- After moving Bible-tab resume state out of root tab render: same command bundled `4830` modules in `17339ms`; JS bundle `12,934,294` bytes, gzip `2,725,070` bytes; exported assets `48M`.

Bundle size is essentially unchanged because Metro still packages dynamically imported modules into the release bundle. The intended win is lower module evaluation and less native/database/audio/network work before first usable screen on Android.

## Android Runtime Measurements

Repeat with:

```bash
npm run perf:android
```

The script uses an attached Android device when one is available. If no device is attached, it creates a temporary headless AVD named `EveryBiblePerfLow` from the installed Android `36.1` Google Play ARM64 system image, installs `android/app/build/outputs/apk/release/app-release.apk`, attempts to complete onboarding, measures the flows below, and removes the temporary AVD on exit. Override sample counts with `RUNS=... CONTENT_RUNS=...`. For targeted reruns, pass a comma-separated `FLOW_FILTER`, such as `FLOW_FILTER=reader_next_chapter,reader_search_no_results npm run perf:android`.

Measured flows:

- Cold app launch with `am start -W`.
- Reader deep-link launch with `am start -W`.
- Home content-ready polling.
- Fresh Home to Bible browser list open.
- Bible browser large-list scroll command response with Android `gfxinfo` frame summary.
- Reader content-ready polling.
- Home tab to Bible reader content-ready polling.
- Reader search query response for `love`.
- Reader no-result search settlement.
- Reader first audio-control response.
- Reader next-chapter navigation.
- Translation picker open.
- Translation picker scroll command response with Android `gfxinfo` frame summary.

Captured against `android/app/build/outputs/apk/release/app-release.apk` on a temporary headless emulator created from the installed Android `36.1` Google Play ARM64 system image. The emulator was configured as a 720x1280, 2-core, SwiftShader-rendered device; the emulator raised RAM to `2048MB` at boot. These numbers are useful for regression comparison, but physical mid/low-end Android hardware is still required before treating them as final product performance.

`am start -W` post-onboarding cold launches after `am force-stop`:

- Home launch: `574ms`, `365ms`, `637ms`, `377ms`, `401ms`; average `471ms`, median `401ms`.
- Bible reader deep link (`com.everybible.app://bible/john/3`): `387ms`, `399ms`, `352ms`, `388ms`, `353ms`; average `376ms`, median `387ms`.

Content-ready polling with `uiautomator` after `am force-stop` includes host-side XML dump overhead, so treat these as conservative upper bounds rather than pure app render time:

- Home content visible (`VERSE OF THE DAY` / home tab text): `3941ms`, `2819ms`, `3773ms`; average `3511ms`, median `3773ms`.
- Reader content visible from deep link (`John 3` / verse text): `2809ms`, `2819ms`, `2818ms`; average `2815ms`, median `2818ms`.
- Bible tab press from an already-running app into the last reader chapter: `2011ms`, `1991ms`, `1976ms`; average `1993ms`, median `1991ms`.

A first full-text search sample for `love` reported `2581ms` to a matching UI state, but the second `uiautomator dump` hung, so search timing still needs a cleaner on-device harness before it should be used as a baseline.

A validation run of `RUNS=2 CONTENT_RUNS=2 npm run perf:android` completed end-to-end and cleaned up the temporary emulator. It reported slower conservative content-ready values because each sample waits on bounded `uiautomator` XML dumps:

- Home `am start -W`: `1355ms`, `1008ms`.
- Reader deep link `am start -W`: `980ms`, `1509ms`.
- Home content visible: `6095ms`, `6075ms`.
- Reader content visible: `5058ms`, `5065ms`.
- Bible tab to reader content: `4054ms`, `4047ms`.

A follow-up one-sample validation run after adding search and audio probes completed end-to-end and cleaned up the temporary emulator:

- Home `am start -W`: `1768ms`.
- Reader deep link `am start -W`: `1446ms`.
- Home content visible: `6080ms`.
- Reader content visible: `6072ms`.
- Bible tab to reader content: `4053ms`.
- Reader search query for `love`: `5062ms`.
- Reader first audio-control response: `4057ms`.

Search and audio probes are smoke measurements, not a replacement for profiling. They confirm that those flows remain reachable under bounded polling and give a regression baseline for future Android checks.

A targeted validation run of `RUNS=1 CONTENT_RUNS=1 UI_POLL_ATTEMPTS=8 UI_DUMP_TIMEOUT_SECONDS=3 FLOW_FILTER=reader_next_chapter,reader_search_no_results,translation_picker_open npm run perf:android` completed end-to-end and cleaned up the temporary emulator:

- Reader next-chapter navigation (`John 3` to `John 4`): `4055ms`, `found=true`.
- Reader no-result search query (`zzzqxzv`) settled: `4064ms`, `found=true`.
- Translation picker open from the reader translation pill: `10529ms`, `found=true`.

A separate targeted validation run of `RUNS=1 CONTENT_RUNS=1 UI_POLL_ATTEMPTS=8 UI_DUMP_TIMEOUT_SECONDS=3 FLOW_FILTER=translation_picker_scroll npm run perf:android` completed end-to-end and cleaned up the temporary emulator:

- Translation picker repeated scroll command response: `4062ms`, `found=true`.

The script now targets reader controls by accessibility text when possible and falls back to known coordinates only when a UI dump cannot resolve the element. That makes the flow probes less dependent on exact Android viewport geometry, but they still depend on `uiautomator` and are not frame-time measurements.

A targeted `RUNS=1 CONTENT_RUNS=1 FLOW_FILTER=bible_browser_tab_open,bible_browser_scroll npm run perf:android` run added fresh-install browser-list coverage. It completed end-to-end and cleaned up the temporary emulator:

- Fresh Home to Bible browser list open: `5063ms`, `found=true`.

The first browser scroll target tried to reach New Testament rows in one sample and did not prove movement on the temporary emulator (`81482ms`, `found=false`). The harness now targets nearer post-scroll Old Testament rows instead. A follow-up `RUNS=1 CONTENT_RUNS=1 UI_POLL_ATTEMPTS=10 UI_DUMP_TIMEOUT_SECONDS=3 FLOW_FILTER=bible_browser_scroll npm run perf:android` run completed end-to-end and cleaned up the temporary emulator:

- Bible browser repeated scroll command response: `13802ms`, `found=true`.

After adding `dumpsys gfxinfo` reset/summary capture around scroll flows, a targeted `RUNS=1 CONTENT_RUNS=1 UI_POLL_ATTEMPTS=10 UI_DUMP_TIMEOUT_SECONDS=3 FLOW_FILTER=bible_browser_scroll,translation_picker_scroll npm run perf:android` run completed end-to-end and cleaned up the temporary emulator:

- Bible browser repeated scroll command response: `4053ms`, `found=true`, `79` rendered frames, `6` janky frames (`7.59%`), p50 `17ms`, p90 `26ms`, p95 `29ms`, p99 `31ms`.
- Translation picker repeated scroll command response: `4060ms`, `found=true`, `74` rendered frames, `8` janky frames (`10.81%`), p50 `24ms`, p90 `32ms`, p95 `48ms`, p99 `69ms`.

These `gfxinfo` numbers are the first frame/jank smoke data in this pass. They are still emulator measurements, not a substitute for physical low/mid-end Android profiling, but they give the harness a real rendering-smoothness regression signal instead of only XML state changes.

After deferring the Bible browser's static `TranslationPickerList` import, `cd android && ./gradlew assembleRelease` rebuilt the release APK successfully. Metro bundled the Android JS in `12810ms` with `4830` modules. A targeted `RUNS=1 CONTENT_RUNS=1 FLOW_FILTER=translation_picker_open npm run perf:android` run completed end-to-end and cleaned up the temporary emulator:

- Translation picker open from the reader translation pill: `4049ms`, `found=true`.

After deferring the browser's static SQLite search imports, `cd android && ./gradlew assembleRelease` rebuilt the release APK successfully. Metro bundled the Android JS in `14293ms` with `4830` modules. A targeted `RUNS=1 CONTENT_RUNS=1 FLOW_FILTER=reader_search,reader_search_no_results npm run perf:android` run completed end-to-end and cleaned up the temporary emulator:

- Reader search query for `love`: `8327ms`, `found=true`.
- Reader no-result search query (`zzzqxzv`) settled: `5066ms`, `found=true`.

## Startup Path Reduced In Code

The boot path in `App.tsx` now avoids static imports of:

- `src/services/bible/bibleService`
- `src/services/translations`
- `src/stores/bibleStore`
- `src/services/analytics`
- `src/services/notifications`
- `src/hooks/useSync`
- `src/hooks/usePrivacyLock`

Those modules are loaded after interactions or when their feature surface is used, while the foreground notification handler remains in a tiny bootstrap module that can safely run before React renders.

The root tab shell also avoids subscribing to `bibleStore` during initial render. Bible-tab resume state is read from the store only when the Bible tab is pressed, and plan-session tab hiding relies on route params plus the active root-tab navigation override from the reader. This keeps Bible database/audio metadata resolvers attached to `bibleStore` out of the app-shell render path.

## Reader Open Path Reduced In Code

`BibleReaderScreen.tsx` now avoids the broad stores, hooks, and components barrels. The reader imports only the stores, hooks, skeleton, and audio controls it needs for the initial chapter view.

Audio share preparation now loads lazily when the user chooses chapter audio sharing. This keeps the filesystem-backed audio download storage helpers, remote audio fetch helper, audio share preparation service, `expo-file-system/legacy`, and `react-native-video-trim` off the initial reader import path. The reader still preserves full chapter sharing and audio-portion trimming behavior once the share action is requested.

## Bible Browser Path Reduced In Code

`BibleBrowserScreen.tsx` no longer statically imports `TranslationPickerList`. The browser and search surface can render without immediately evaluating the shared translation picker, runtime catalog hydration, audio availability helpers, and translation download management code. The picker module is loaded when the translation modal is opened, and the existing modal sheet shows the shared loading copy while that module resolves.

The Bible browser also no longer statically imports the SQLite-backed `searchBible` service or `bibleDatabase` error class. Full-text search still uses the same debounced UI path, but the Bible database/search module graph is loaded only after the user enters a full-text query. Unsupported-search errors are classified by the existing error name to avoid importing the database module for initial browser render.

## Chapter Selector Path Reduced In Code

`ChapterSelectorScreen.tsx` now imports `CompanionSection`, `useBibleStore`, and `useProgressStore` directly instead of using the broad `components` and `stores` barrels. Book-hub analytics are loaded only when the user taps a chapter or companion item. This keeps unrelated audio, privacy, gather, and analytics exports off the chapter-selector render path while preserving the same navigation and event capture behavior.

After this selector import cleanup, `cd android && ./gradlew assembleRelease` rebuilt the release APK successfully. Metro bundled the Android JS in `13654ms` with `4830` modules. There is no currently wired runtime route into `ChapterSelector` from the visible Bible browser flow, so this pass is covered by source regression tests and release build verification rather than a dedicated Android UI smoke flow.

## Translation Picker Scroll Reduced In Code

`TranslationPickerList.tsx` now uses a typed `FlashList` row model for translation mode instead of eagerly rendering the search field, preference card, language search results, section headers, and every translation card inside one `ScrollView`. Language-picking mode and the audio-manager modal remain simple `ScrollView`s because those lists are smaller and lower risk.

This preserves the visible picker order and chip behavior, but changes the performance assumption for translation rows: offscreen translation cards may unmount/remount as the user scrolls. Download progress, current selection, theme colors, active audio-download key, and search state are included in `extraData` so visible rows still refresh when those states change.

After this picker virtualization pass, `cd android && ./gradlew assembleRelease` rebuilt the release APK successfully. Metro bundled the Android JS in `11149ms` with `4830` modules. The source regression test now asserts that translation mode renders from `translationRows` through `FlashList` with `getItemType`, and does not regress to eager `sections.availableTranslations.map(renderTranslationCard)` rendering.

The targeted Android `FLOW_FILTER=translation_picker_scroll` smoke run is currently blocked by first-run onboarding automation on the temporary headless AVD. The latest UI dump remained on `Set Up Your Bible Experience` step 1, so the `gfxinfo` samples from that run are not valid translation-picker measurements and should not be compared against the earlier picker-scroll baseline. The harness now attempts to pick a visible onboarding setup option before pressing the primary action, but this still needs a successful rerun on a device or an updated onboarding bypass fixture.

## Remaining Measurements To Capture On Device

- Cold start to first tappable Home interaction on physical mid/low-end Android hardware.
- Home to Bible reader open time for the last-read chapter on physical mid/low-end Android hardware.
- Chapter/translation navigation latency on physical mid/low-end Android hardware.
- Clean search latency for common and no-result queries on physical hardware.
- Large picker/list scroll smoothness with frame/jank data on physical hardware.
- Audio startup cost when first opening reader audio controls on physical hardware and slow networks.
- Supabase-backed translation catalog and sync timing on slow networks.
