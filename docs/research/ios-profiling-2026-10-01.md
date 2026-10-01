# iOS release profiling — October 1, 2026

Goal: measure a real **Release** iOS build (Hermes bytecode, no Metro, no dev-mode React)
instead of bundle exports, find where cold start and the main interactions spend their
time, and fix what is app code.

Branch `sprint/ios-profiling`, started from `claude/deep-optimization-sprint-88be80` at
`7f388271`. Everything ran on an iPhone 17 simulator (iOS 26.5) on an Apple Silicon Mac,
with a "heavy reader" data set: 1,189 chapters read, 595 listened, a 325-day heatmap,
a 45-day streak and 400 annotations. Simulator numbers are not device numbers (see
[Caveats](#caveats)). The before and after columns below come from the same machine,
interleaved, so the comparison holds even though the absolute times do not transfer.

## Result

Three builds, measured interleaved: 3 rounds × 3 scenario runs each, n = 9 per build.
Each run is a cold start to Home, then the interactions in order.

- **Before:** the branch start plus the profiling marks (`28145240` + the `reader:committed` mark).
- **After:** my fixes on the same base, without the day's other sprint merges.
- **Branch HEAD:** `5ec06bc2`, which also contains 120 commits merged from the sprint branch.

Latencies run from the release of the tap (a root `touch:end` mark) to the screen's own
mark. _Committed_ is the effect of the React commit that drew the chapter; its view
updates reach the native side when that JS batch ends. _Painted_ is the next
`requestAnimationFrame` callback after it, which any JS work queued behind the
chapter delays (see [the two reader marks](#the-two-reader-marks)).

| Measurement (median ms, min–max)             |         Before |         After |   Branch HEAD |
| -------------------------------------------- | -------------: | ------------: | ------------: |
| Open Psalm 119 from Home: → committed        |  170 (162–173) | 111 (107–169) | 113 (111–164) |
| Open Psalm 119 from Home: → painted          |  239 (232–246) | 182 (179–183) | 184 (177–188) |
| Next chapter (Ps 120): → committed           |     44 (41–50) |    32 (29–36) |    35 (29–39) |
| Next chapter (Ps 120): → painted             |     54 (50–61) |    34 (31–38) |    37 (30–41) |
| Previous chapter (Ps 119): → committed       |     74 (72–82) |    65 (62–72) |    66 (61–73) |
| Previous chapter (Ps 119): → painted         |     83 (81–91) |    67 (64–73) |    68 (62–75) |
| Audio sheet: → painted                       |     25 (22–27) |    24 (20–26) |    25 (22–26) |
| Gather / Plans / More tab, first visit       |   31 / 33 / 31 |  29 / 34 / 32 |  30 / 34 / 32 |
| Home tab (populated heatmap), revisit        |     30 (24–33) |    25 (22–29) |    24 (19–28) |
| Bible tab (reader), revisit                  |     25 (23–28) |    23 (21–25) |    22 (19–24) |
| Cold: process start → JS starts executing    |  798 (750–890) | 778 (734–845) | 786 (739–837) |
| Cold: JS starts → Home first layout          |  115 (111–135) | 109 (107–127) | 117 (105–126) |
| Cold: process start → Home first layout      | 913 (863–1025) | 886 (843–972) | 895 (844–963) |
| Cold: process start → Home interaction-ready | 938 (887–1049) | 905 (863–991) | 914 (863–983) |

JS thread time from Hermes sampling profiles (1 kHz) of the same builds. "Busy" means
samples outside the idle root; "settles" is the last busy sample before a 100 ms gap.

| JS busy (ms)                     |    Before |     After | Branch HEAD |
| -------------------------------- | --------: | --------: | ----------: |
| Cold start to Home (3 runs each) |   163–170 |   144–156 |     147–160 |
| Open Psalm 119 (settles at)      | 330 (379) | 266 (310) |   263 (309) |
| Next chapter                     |        57 |        31 |          36 |
| Previous chapter                 |        88 |        63 |          70 |
| Audio sheet                      |        22 |        25 |          27 |

The reader got faster: opening a long chapter from Home is about a third quicker to its
commit, and moving to the next chapter about a quarter quicker. Cold start barely moved,
because about 85% of it is native work before the JavaScript bundle runs at all (next
section). The audio sheet and tab switches were already cheap and did not change beyond
noise.

## Where a cold start goes

Medians of the before build (n = 9). The process start is the kernel's start time for the
app process (`sysctl KERN_PROC_PID`); the native marks come from the profiling shim
described under [Method](#method). These are wall-clock times on the simulator.

| ms from process start | Event                                                                                                                                                                                            |
| --------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|                   374 | Images loaded and initialized (the shim's `+load`; dyld before it)                                                                                                                               |
|                   420 | Bridge starts loading the bundle (`didFinishLaunching` returns at 437)                                                                                                                           |
|             420 → 798 | **Native module setup on the main thread: 324–346 ms** (`RCTPerformanceLogger` `NativeModuleMainThread`, 14 modules). The JS thread exists but idles: the bundle cannot run until this finishes. |
|                   798 | JS bundle starts executing                                                                                                                                                                       |
|                   829 | `App.tsx` body runs (its static imports are evaluated: `ScriptExecution` 31–42 ms)                                                                                                               |
|                   913 | Home's first layout                                                                                                                                                                              |
|                   938 | Home interaction-ready (an idle JS turn after layout)                                                                                                                                            |

A `sample` of the launch shows what fills the main-thread gap
([native-launch-sample.txt](assets/ios-profiling-2026-10-01/native-launch-sample.txt)).
Nearly all of it is one call: `RCTCxxBridge _prepareModulesWithDispatchGroup` →
`EXNativeModulesProxy setBridge:` → `AppContext.useModulesProvider` →
`ModuleRegistry.register` → each Expo module's Swift `definition()`. Some per-module
sample counts: SQLite 48, FileSystem 34 + FileSystemLegacy 20, AppleAuthentication 21,
Clipboard 20, GlassEffect 18, ExpoFetch 17, and 30 more modules under 10 each. The
leading top-of-stack symbol in the whole trace is
`swift_conformsToProtocolMaybeInstantiateSuperclasses` (529 samples): Swift protocol
conformance lookups made by the module definition DSL. `EXAV setModuleRegistry` adds
33 samples setting the audio session category, which on the simulator initializes the
simulated audio hardware. This is framework code, so it is listed under
[left](#hot-spots-left-and-why).

## Hot spots fixed

Ordered by effect. Each has a regression test; the Hermes evidence is in
[interactions-baseline.txt](assets/ios-profiling-2026-10-01/interactions-baseline.txt) and
[interactions-after.txt](assets/ios-profiling-2026-10-01/interactions-after.txt).

1. **A loaded chapter rendered the reader up to four times** — `f56559f4` (fixture fix `961d4d0b`).
   After the SQLite read resolves, `loadReaderChapter` set the verses, their chapter key,
   marked the chapter read (a progress-store update) and cleared loading. The old
   architecture renders each update made outside an event on its own, so each was a full
   synchronous pass over the reader
   ([reader-chapter-render-passes.txt](assets/ios-profiling-2026-10-01/reader-chapter-render-passes.txt)):
   opening Psalm 119 took 39.7 + 11.9 + 11.1 + 5.9 ms, now one 39.5 ms pass; next chapter
   went from 26.7 to 9.7 ms, previous chapter from 59.3 to 38.8 ms. The loader now applies
   the four updates through `unstable_batchedUpdates`, passed in from the screen like its
   other dependencies. Test: `readerChapterLoader.test.ts`, "a loaded chapter reaches the
   reader as one update".
2. **The Bible browser rendered underneath the reader before the reader's chapter** —
   `80725f54`, `3e709211`, `15d4d55a`. Home's Continue card opens the reader with
   `initial: false`, so `BibleBrowser` mounts under it in the same commit. It rendered all
   66 book rows and the expanded current book's chapter grid (150 tiles for Psalms) before
   the reader could load its chapter. Now an unfocused browser renders its header only and
   fills in the list after interactions. The reader holds an `InteractionManager`
   interaction handle until its first chapter is committed (`useInteractionHandleUntil`,
   capped at 1.5 s), so the list waits for the chapter. The next chapter's prefetch and the
   search warm-ups, also queued with `runAfterInteractions`, now wait for it too. The handle is released on a 0 ms timer, not in the
   commit's effect. `InteractionManager` drains its queue with `setImmediate`, at the end
   of the current JS batch and before that batch's view updates reach native. `3e709211`
   released it in the effect and the list still went first; `15d4d55a` fixes that. Opened
   as the Bible tab, the browser is focused and draws the list at once, as before. Tests:
   `BibleBrowserScreen.render.test.tsx` (both cases) and `useInteractionHandleUntil.test.ts`.
   The navigation test fake's focus is now settable (`NavigationFake.focused`).
3. **The hidden verse-picture editor did its whole render on every reader and Home render**
   — `c6d09deb` (`fa16b54f` keeps the Modal props literal for the source guards). React
   Native's `Modal` draws nothing while hidden, but `VerseImageShareSheet` still built its
   tabs, background rail and font checks: 87 `t()` calls per render, ~16 ms of cold-start
   JS on Home and 11–19 ms of each reader open and chapter change.
   `useModalContentPresence` keeps the content while visible and, on iOS, until the
   fade-out reports `onDismiss` (iOS draws the children until then). Editor choices still
   live in the sheet's state. Tests: `useModalContentPresence.test.ts` and
   `VerseImageShareSheet.render.test.tsx`, "a hidden picture editor does no work…".
4. **Every skeleton bar asked the OS about reduce motion** — `7e7185df`. A chapter skeleton
   draws 23 bars. Each called `AccessibilityInfo.isReduceMotionEnabled()` and set its own
   state when the answer arrived, which meant 23 unbatched passes over the app tree (~17 ms
   while the reader opened, mostly React's context propagation and bailout traversal). The
   setting now lives in one store read with `useSyncExternalStore`: one query and one
   listener per skeleton, one batched update, and later skeletons start from the last
   answer. Test: `Skeleton.render.test.tsx`.
5. **Translator-feedback badges subscribed to i18n with nothing to show** — `ee667df6`. Every
   book row and chapter tile renders a `TranslatorFeedbackBadge`, nearly always without a
   status, and each ran `useTheme` and `useTranslation` before returning null.
   `useTranslation` subscribes to i18n and builds a wrapper with
   `Object.getOwnPropertyDescriptors`. With Psalms' 150 tiles that was ~15 ms of opening
   the reader. Test: `TranslatorFeedbackBadge.render.test.tsx`.
6. **ICU collation on every reader render** — `d62f02d4`.
   `getBibleSelectionShareTranslationLabel` compared labels with
   `localeCompare(…, { sensitivity: 'accent' })` on every `BibleReaderScreen` render (5.7 ms
   in the reader-open profile), and `getTranslationLanguageDisplayLabel` did the same for
   each picker row. Both only test equality, which lowercase comparison answers the same
   way; `getCompactTranslatedBookName` made the same swap earlier. Tests in
   `bibleSelectionModel.test.ts` and `bibleTranslationModel.test.ts` also fail if
   `localeCompare` is called.

Instrumentation, also on the branch:

- `28145240` adds `services/diagnostics/perfMarks.ts`: `[EB-P] <name> <epoch ms>` lines that
  exist only when the bundle is built with `EXPO_PUBLIC_EB_PERF_MARKS=1`. Babel inlines the
  flag, so shipped builds fold the check away. The marks are `touch:end`,
  `home:first-layout`, `reader:committed` / `reader:painted`, `audioSheet:painted` and
  `tab:focus`.
- The same commit restores the release `[EB-T] Home:interaction-ready` line. `ba905c4f`
  (earlier today) put it behind `__DEV__`, but `scripts/benchmark-android-startup.py` and
  `android_startup_metrics.py` read it from release logcat, so the Android cold-start
  benchmark could not finish. `App.tsx` documents that contract.
- `5ec06bc2` adds the `reader:committed` mark.

## Follow-up: expo-updates and the main-queue modules

Requested by the sprint coordinator after the Android thread found the disabled
expo-updates module on its critical path (`529dcf4a` left it out of Android builds).

**expo-updates is now left out of iOS builds too** (`59426615`). The app ships no update
URL, so the module only ever ran disabled. The change adds it to
`expo.autolinking.ios.exclude` and runs `pod install`, which drops the EXUpdates and
ReachabilitySwift pods and their two resource bundles; the shared manifests/interface
pods stay because other Expo pods use them.

Two Release simulator builds were measured interleaved, 4 rounds × 3 launches, n = 12 each,
on fresh heavy-reader data: A is the sprint branch at `eebacbcd`, B is the same tree with
the exclusion. p is a two-sided Mann-Whitney test.

| ms from process start (median, min–max)    |    A (linked) |  B (excluded) |   Δ |    p |
| ------------------------------------------ | ------------: | ------------: | --: | ---: |
| JS starts executing                        | 768 (726–803) | 746 (709–770) | −22 | 0.05 |
| `App.tsx` body runs                        | 806 (756–843) | 776 (739–812) | −30 | 0.05 |
| Home first layout                          | 886 (836–924) | 855 (816–892) | −31 | 0.05 |
| Home interaction-ready                     | 905 (855–943) | 874 (834–911) | −30 | 0.05 |
| Native module main-thread setup (`rctpl`)  | 306 (294–351) | 296 (286–315) | −10 | 0.02 |
| Bundle execution (`rctpl` ScriptExecution) |    31 (29–44) |    30 (29–42) |   0 | 0.44 |

That is a smaller win than Android's but a consistent one, about 3% of cold start.
Roughly 10 ms comes out of native setup. The other ~20 ms falls between bundle load and
`App.tsx`: with the module present, expo-constants reads the updates manifest at
import. A temporary check in both builds logged the following 2 s after launch (it was
never committed):

- `Constants.expoConfig` was identical in A and B: "Every Bible", its slug, version 1.0.12
  and the four `extra` keys.
- A font and a plan cover resolved through expo-asset to `file://` URLs inside the app
  bundle in both builds.
- The ExpoUpdates module was linked in A and missing in B.

Release builds load `main.jsbundle` from the app bundle (`AppDelegate.bundleURL`), so
launch does not depend on the network either way. The network was not physically cut
on the simulator. Home, its plan covers and the reader rendered normally in B.
`src/config/androidAutolinkedModules.test.ts` now asserts that both platforms leave
expo-updates out; it failed against the old configuration.

**What the 14 main-queue modules cost.** React Native sets these up on the main thread
before the bundle may run:

- React Native core: `RCTDeviceInfo`, `RCTAccessibilityManager`, `RCTStatusBarManager`,
  `RCTAppState`, `RCTPlatform` and `RCTAppearance` (plus `RCTDevMenu` in debug builds);
- safe-area-context and NetInfo;
- the app's own `EveryBiblePrivacyModule` and `EveryBibleAudioNowPlayingModule`;
- Expo's `EXNativeModulesProxy`.

In gated `sample` traces of build B
([native-main-queue-modules.txt](assets/ios-profiling-2026-10-01/native-main-queue-modules.txt))
the main-queue block is 246 samples, all inside `EXNativeModulesProxy setBridge:`:

- 206 samples: Expo's `ModuleRegistry` building each module's definition;
- 24 samples: expo-av's `EXAudioSessionManager` setting the audio session category when
  its registry initializes;
- 15 samples: lazily loading `ExpoBridgeModule`.

The other 13 modules do not register a sample.

None of it can be made lazy from app code. Expo's old-architecture proxy builds every
definition eagerly, and JS needs the registry before any module import runs. The levers
are:

- **Drop modules nobody uses.** Per launch, the definitions cost, in samples:
  - SQLite 36, FileSystem 27.5 + FileSystemLegacy 15 and GlassEffect 14.5, all used at
    launch;
  - AppleAuthentication 15.5, Clipboard 15, Crypto 6.5 and ImagePicker 3, used only on
    demand but still needed;
  - expo-av's video view 7, which the app never uses but cannot drop separately from
    expo-av audio;
  - WebBrowser 2. **expo-web-browser has no JS consumer** in `src/` or `node_modules`
    (it outlived expo-auth-session) and could be removed outright, from `package.json`
    and the `app.json` plugin list. The gain is a couple of milliseconds, below what
    n = 12 can resolve, so it was left for an owner decision.
- **Patch the framework.** One option is to make chosen modules register lazily in
  `expo-modules-core`. Another is to have expo-av set its audio session on first
  playback rather than at registry start. Both are upstream-sized changes with
  background-audio risk.
- **Move to the new architecture.**

## Hot spots left, and why

- **Native module setup, ~296 ms on the main thread after the expo-updates exclusion.** This is
  the largest single cost of cold start. It is nearly all Expo's module registry on the
  old architecture: every module's Swift definition is built synchronously in
  `EXNativeModulesProxy setBridge:` before the bundle may run (breakdown in
  [the follow-up](#follow-up-expo-updates-and-the-main-queue-modules)). It is framework
  code, and the simulator may overstate it. The trace is dominated by Swift conformance
  lookups, which on a device can use dyld's prebuilt conformance tables, and the
  audio-session part initializes simulated hardware. Measure it on a device first
  (Instruments' App Launch template, or this shim's `rctpl:NativeModuleMainThread` line).
  The new architecture is a separate migration; the app pins `react-native-mmkv` v2 for
  the old one.
- **About 370 ms before `+load`.** This is dyld and image loading on the simulator, which
  does not use the launch closures a device does. It is not representative and has no app
  lever here.
- **Plan covers are palette PNGs.** All 96 covers in `assets/plans/covers/` are 1200×900
  indexed-colour PNGs. Home's plan shelf shows several at launch, and Core Animation
  expands each to RGBA on the main thread during the commit (`CA::Render::prepare_image` →
  `convert_indexed`, ~37 ms of main-thread samples at launch). Emitting RGB(A) JPEG or WebP
  from `scripts/generate-plan-covers.py`, at closer to display size, would remove that.
  Not done here: it changes a generator and 96 binary assets, and flat cover art needs a
  visual check after re-encoding. The Home verse backgrounds are progressive JPEGs
  (`aj_prog_decode_AC_refine` in the trace), which are slower to decode than baseline
  JPEGs; that is minor.
- **Mounting the reader shell costs 64–74 ms of JS on the simulator.** `BibleReaderScreen`
  (~1,600 lines) mounts nine Modal-hosting sheets and their hooks with the screen. Each
  hidden sheet is now cheap, but their hooks and the tree still mount. Moving sheets
  behind first use is a structural change that needs device QA of every sheet.
- **`PressableScale` creates a Reanimated shared value and animated style per instance** (74
  call sites). That is ~5 ms of Reanimated work during Home's first render. Making it lazy
  changes the app-wide press primitive; it was left for a dedicated change.
- **Small Home items.** Home builds an `Intl.DateTimeFormat` on each mount (2.4–3.2 ms on
  Hermes), and the reading-stats date math runs over the whole ledger. Another sprint
  thread is working on that hot path (`bcced999`, `72f4e7b8`, now in the branch), so it
  was not duplicated here.
- **Persisting the progress store on every chapter read.** `markChapterRead` writes the whole
  ledger (1,189 chapters here) through `JSON.stringify` to MMKV synchronously, about 2 ms
  per chapter on the simulator. Debouncing the write trades durability if the app is
  killed, so it was left.
- **Library start-up work.** Reanimated's `makeShareableClone` (~10 ms) and
  `zustand/middleware` evaluation (~6 ms) run during start-up with no app frame on the
  stack.

## Method

### Builds

A Release configuration for the simulator, arm64 only, with Hermes bytecode from the
normal "Bundle React Native code and images" phase. React Native's script passes
`--minify false` when Hermes is used, so profiles keep function names. Two extras, both
off in every shipped build:

```bash
export EXPO_PUBLIC_EB_PERF_MARKS=1         # perf marks in the bundle
export SOURCEMAP_FILE=/abs/path/main.map   # composed Hermes source map, for symbolication
xcodebuild -workspace ios/EveryBible.xcworkspace -scheme EveryBible -configuration Release \
  -sdk iphonesimulator -destination id=<UDID> ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
  'OTHER_LDFLAGS=$(inherited) -force_load /abs/path/libEBHermesProfiler.a' build
```

`scripts/perf/ios/EBHermesProfiler.mm` is a profiling-only Objective-C++ shim, linked with
`-force_load` and never added to the app target. Its header has the compile command.
When the app is launched with environment variables (`SIMCTL_CHILD_*` through
`simctl launch`), it:

- logs native lifecycle marks (`native:load`, `didFinishLaunching`,
  `jsWillStartExecuting`, `jsDidLoad`, `contentDidAppear`), and React Native's own
  `RCTPerformanceLogger` values 3 s after first content;
- with `EB_LAUNCH_GATE=1`, holds `+load` until a file appears in the app's `tmp`, so an
  external sampler can attach before any app work;
- with `EB_HERMES_PROFILE=1`, starts Hermes' sampling profiler before the runtime exists,
  then dumps it to `Documents/` on a Darwin notification.

Pods were installed in the worktree (`LANG=en_US.UTF-8 pod install`; the Xcode 26 `fmt`
header patch in the Podfile applied). `pod install` and the first full build took about
15 minutes together; later builds took 35–65 s, since only the bundle phase and the
link re-run.

### Data and timing

The app was installed on a dedicated simulator (`EB-Profile`, iPhone 17, iOS 26.5) and
onboarded once (English, BSB). A one-off seed build, never committed, then wrote the
heavy-reader data through the real stores. The measured builds were installed over it,
which keeps the data container.

`scripts/perf/ios/ebperf.py` streams `[EB-T]`/`[EB-P]` lines from the simulator's unified log
and lines them up with the kernel start time of the app process. Simulator apps are Mac
processes, so `Date.now()` in the app matches the host clock. Taps go through fb-idb. A
scenario is:

1. Cold start to Home.
2. Open the reader from the Continue card (the reading position is Psalm 119, 176 verses).
3. Next chapter, then previous chapter.
4. Open and close the Audio sheet.
5. First visits to Gather, Plans and More, then back to Home and Bible.

Builds were interleaved so that drift on the machine (other agents' builds were running)
spreads across all of them.

### Profiles

- **JS.** Hermes' sampling profiler at 1 kHz, in the release build. Traces are symbolicated
  with the composed source map; Hermes maps use line 1 and the bytecode address as the
  column. `scripts/perf/ios/hprof.cjs` reports self time, module evaluation, app files on
  the stack and per-interaction windows. Frames in compiler-generated code have no mapping;
  they are attributed (marked `~`) to the nearest mapped code before them and left out of
  the per-file table.
- **Native.** macOS `sample` at 1 ms against the gated launch. `xcrun xctrace record`
  (Time Profiler) hung indefinitely against this simulator with both `--launch` and
  `--attach` on Xcode 26, so it was not used. `sample` suspends the process for each sample,
  which inflates wall time; use its counts as proportions. Wall-clock native durations
  come from `RCTPerformanceLogger` instead.

### The two reader marks

`reader:painted` is a `requestAnimationFrame` callback, which runs on the JS thread, so it
waits for whatever JS is queued behind the chapter. In the after builds that is mostly
the Bible browser's book list, which now renders just after the chapter commit, once the
chapter's view updates have gone to native. In both builds the callback lands about
70 ms after the commit. `reader:committed` marks the commit itself. Neither is a screen
capture. The time the chapter is actually visible lies between them, plus native layout
and drawing.

### Caveats

- These are simulator numbers on an Apple Silicon Mac. Hermes on a mid-range phone runs
  JS several times slower, so the JS savings should grow in absolute terms on a device,
  while dyld and the Swift registry costs may shrink. This needs checking on an iPhone and
  on a low-end Android phone (Android release builds have `inlineRequires` on and a
  different native start-up).
- The reader fixes are all JS and platform-independent, but the batching fix matters most
  where updates outside events are not batched: React Native's old architecture, which
  this app uses on both platforms.

### Repeating it

```bash
python3 -m venv /tmp/idbenv && /tmp/idbenv/bin/pip install fb-idb
export EB_UDID=<simulator udid> EB_IDB=/tmp/idbenv/bin/idb
python3 scripts/perf/ios/ebperf.py cold 5
python3 scripts/perf/ios/ebperf.py scenario 3 results.json
python3 scripts/perf/ios/ebperf.py profile-scenario trace.json
node scripts/perf/ios/hprof.cjs trace.json /abs/path/main.map --interactions
python3 scripts/perf/ios/ebperf.py native-sample launch.txt
python3 scripts/perf/ios/ebperf.py ab <dir with Base.app, After.app> Base,After 3 3
```

Raw traces were not kept in the repository: they are only readable with their build's
20 MB source map. Text summaries and the A/B results are in
[assets/ios-profiling-2026-10-01](assets/ios-profiling-2026-10-01/).

## Noticed, not performance

Psalm 119:1 (BSB) renders "Blessed" alone on its own line before "are those whose way is
blameless,". In the BSB that is one poetry line, and 119:2 renders normally. It looks like
the poetry lead-in handling; it was raised as a separate task, not changed here.
