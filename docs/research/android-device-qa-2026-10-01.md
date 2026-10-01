# Android device QA and performance, 2026-10-01

One thread of the 2026-10-01 optimization sprint. Branch `sprint/android-device` (from
`claude/deep-optimization-sprint-88be80`, re-merged three times; last at `d3ce8b51`).

## Limits of this pass (read first)

- **The Xiaomi never ran the sprint build.** HyperOS refused `adb install`
  (`INSTALL_FAILED_USER_RESTRICTED`) and input injection (`INJECT_EVENTS`); the owner could not
  turn on "Install via USB" / "USB debugging (Security settings)". Installing from the Files app
  needs a tap on the phone, which did not happen before the Xiaomi was unplugged. Only the Play
  app (1.0.10) was measured there, and it was atraced (that is where the expo-updates cost was
  found).
- **The device walkthrough ran on a Samsung Galaxy S25 Ultra** (SM-S938U, Android 16 / API 36,
  One UI, gesture navigation), which the owner plugged in mid-session. It is a flagship: startup
  and jank numbers on it are far below what a budget phone shows, and a JS CPU profile of startup
  on it has too few samples (about 20) to name a hotspot.
- **Screen-off and lock-screen audio were not tested.** The Samsung has a secure keyguard; turning
  the screen off would have locked it with no way for me to unlock. Background playback with the
  app in the background (screen on) was tested. HyperOS background reliability, the original
  reason for this thread, is still untested.
- EB Sprint is the sprint code built as `com.everybible.app.sprint` (debug-keystore signed,
  sideloaded, no Play cloud profile). The Play app it is compared with is a different release
  (1.0.10 on the Xiaomi, 1.0.12 on the Samsung) with the owner's real data.

## Results

### Startup and memory, Samsung S25 Ultra (same session, back to back)

`scripts/benchmark-android-startup.py --package ...`, one warm-up then 7 cold starts each;
medians. PSS is `dumpsys meminfo` TOTAL PSS on Home a few seconds after the last launch.

| Build                                | First frame | `App:module-start` | `Home:interaction-ready` | PSS on Home      |
| ------------------------------------ | ----------- | ------------------ | ------------------------ | ---------------- |
| Play 1.0.12 (versionCode 563)        | 274 ms      | 266 ms             | 436 ms                   | 356,626 KB       |
| EB Sprint (`ed1ed2f2` + this branch) | 177 ms      | 170 ms             | 348 ms                   | 325,780 KB       |
| Change                               | −97 ms      | −96 ms             | −88 ms                   | −30,846 KB (−9%) |

An earlier Play run in the same hour gave 284 / 271 / 449 ms and 360,501 KB. Final EB Sprint
build (`d3ce8b51`), three plain `am start -W` cold starts: 180, 176, 166 ms to first frame.

atrace of one cold start each: the Expo module package step fell from **61 ms to 11 ms**
(`UpdatesModule` alone was 45 ms) and the 8 ms `ExpoUpdates.jsObject` constants read on the JS
thread went away. That is about 58 ms of the ~96 ms gain; the rest is the sprint's other changes
and noise.

Memory, both builds: Graphics is ~133 MB of the total on this phone (4 × 10 MB window buffers,
~30 MB of image textures, one full-screen offscreen layer of 9.8 MB); the sprint build's saving
is in Native heap (73.5 → 61.8 MB) and Private Other (61.9 → 51.4 MB).

### Startup and memory, Xiaomi 25078RA3EY (HyperOS, API 36), Play 1.0.10 only

| Measure                           | Value                                                         |
| --------------------------------- | ------------------------------------------------------------- |
| `am start -W` TotalTime, 5 runs   | 1932, 1713, 1725, 1741, 1723 ms (median 1725)                 |
| Benchmark script medians (5 runs) | first frame 1502 ms, `App:module-start` 1465 ms, Home 2411 ms |
| PSS on Home                       | 159,905 KB                                                    |

The earlier run's 1289 ms median (same phone, same app, a few hours before) shows how much this
phone varies between sessions; compare only within one session.

Cold-start trace (atrace, app sections on) of the Play app: JS does not start until ~1.5 s, and
the biggest single block before it was **`ModuleRegistry.register(UpdatesModule)`: 428 ms of the
549 ms Expo package step**, on the critical path (`create_react_context`), for a module that is
disabled in this app. Other pre-JS costs, none of them app-fixable in a small change:
`bindApplication` 327 ms (MIUI font/feature init ~80 ms of it), `createUIManagerModule` 125 ms
(old-architecture view-manager constants), `JavaModuleWrapper.getConstants` 160 ms on the JS
thread, React Native `.so` loading ~100 ms. After JS starts, the first Home commit spent 254 ms in
one frame creating native views, with the native-modules thread blocked on the UI thread's lock.

### Reader scroll, Samsung (EB Sprint, Psalm 119, 10 fling swipes, `dumpsys gfxinfo`)

| Direction | Frames | Janky     | p50  | p90  | p95  | p99   |
| --------- | ------ | --------- | ---- | ---- | ---- | ----- |
| Down      | 450    | 7 (1.56%) | 5 ms | 6 ms | 6 ms | 11 ms |
| Up        | 449    | 7 (1.56%) | 5 ms | 6 ms | 6 ms | 11 ms |

The scroll handler is a Reanimated worklet, so scrolling does no per-frame JS work. Not measured
on a slower phone.

### Background audio, Samsung

Psalm 119 playing, app sent to the launcher with Home, sampled every 30 s for 5 minutes: state
PLAYING throughout, same process, `MediaPlaybackService` foreground (`mediaPlayback` type, ongoing
notification), oom adj 250, PSS trimmed from 226 MB to ~204 MB. Resuming the app showed playback
still running. Play/pause, drag-to-scrub on the mini-player bar (20 s → 7:15) and the Audio sheet
all worked.

### Gather lesson open, Samsung

Screen-recorded three times (`screenrecord` + frame differencing): the lesson screen settled
383–433 ms after the first frame that reacted to the tap, including the stack push animation.

## Fixed on this branch

| Commit     | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `529dcf4a` | **Leave the disabled expo-updates module out of Android builds** (`expo.autolinking.android.exclude`). The app ships no update URL; JS reaches the module only through `requireOptionalNativeModule` (expo-asset, expo-constants), which treat a missing module like a disabled one. Emulator A/B: Expo package step 70–74 ms → 13–14 ms, nothing else grew. Test: `src/config/androidAutolinkedModules.test.ts`. The coordinator later did iOS too (`59426615`). Native change: needs a new binary.                                                                                               |
| `13ef2459` | **Fresh install of any suffixed build stuck on "Error loading data / Retry".** The generated `EveryBiblePrivacyModule` named the launcher-alias classes from the installed application id, but `.DefaultLauncherAlias` resolves against the code namespace. On `com.everybible.app.qa` / `.sprint`, `setAppIcon` threw, the fresh-install privacy reset failed, the install marker was never written, and every launch stopped on the retry screen (screenshots were black because the app fails closed). Release builds were unaffected. Test: `src/config/androidPrivacyLauncherSource.test.ts`. |
| `167cb7a7` | `Home:interaction-ready` was guarded behind `__DEV__` earlier the same day, which left the release startup benchmark unable to time Home. Another thread made the same fix in parallel; the sprint's wording was kept at merge.                                                                                                                                                                                                                                                                                                                                                                    |
| `bfcbfc9a` | `scripts/benchmark-android-startup.py --package` so a side-by-side build can be timed next to the Play app on one phone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Caught on the device and fixed by other threads

- **Crash on every Android launch from the first tab-pill fix (`bb1d7f99`).** It animated
  `translateX` with a percent string; on the old architecture (`newArchEnabled: false`) Android's
  `TransformHelper` only takes numbers, so creating the pill view threw
  `UnexpectedNativeTypeException: Value for translateX cannot be cast from String to double` as soon
  as Home rendered. Caught on the Samsung before the sprint's push to main; a numeric-points patch
  was verified on the device; landed as `5bbd0b6a`, whose render harness now throws on string
  translates. Re-verified PASS on a fresh install of `d3ce8b51`.
- **Tab pill stuck on Home after the first Bible-tab visit following onboarding** (accessibility
  said Bible was selected). Fixed by the same change; re-verified on a fresh install, after the
  verse tray hid and showed the bar, and frame by frame across tab switches (no flash at the new
  slot).

## Checked and working (Samsung, EB Sprint)

Fresh-install onboarding (English BSB) to Home; Bible tab, book browser search, chapter picker
search (`psalm 119`); verse highlight; verse tray; verse-picture editor; chapter audio play,
pause, scrub; Audio sheet; Plans → Find plans → plan detail; Gather → lesson; Settings font size
and Dark/Light; Reading Activity; interface language to Arabic and back (emulator). Hardware Back
closes the picture editor, then the verse tray, then the Audio sheet, then leaves the reader; Back
dismisses the keyboard on search fields. With gesture navigation the last item of Home, Gather,
Plans and More scrolls clear of the floating tab bar. Keyboard over search: the Plans and
onboarding search inputs stay visible above the IME.

## Open findings

| Finding                                                                                                                     | Severity          | Notes                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One empty tab-bar capsule frame when leaving the reader (bar with the audio mini-player) for another tab                    | Low               | Seen in two screen recordings, one recorded frame each time. Reported to the tab-bar owner.                                                                                                                                                                                                                            |
| Lock-screen artwork missing on side-by-side builds                                                                          | Low, variant-only | `androidMediaSession` builds `android.resource://` from `expoConfig.android.package`, which is the release id on `.sprint`/`.qa` builds; expo-media-control logs "No package found for authority" and drops the artwork. Release builds are correct. Using the runtime application id (expo-application) would fix it. |
| Psalm 119:1 shows "Blessed" alone on its own line                                                                           | Low, data         | `bible-bsb-v2.db` stores it as a separate poetry line. Not Android-specific.                                                                                                                                                                                                                                           |
| Picker search for a bare book name (`psalm`) lists verse-text hits but no Psalms book row; `psalm 119` works                | Low, UX           | Not Android-specific.                                                                                                                                                                                                                                                                                                  |
| Onboarding language search in this region finds only English and Nepali; `span` finds nothing, `french` returns English ASV | Check             | Looks like the current catalog plus fuzzy matching, not a device issue.                                                                                                                                                                                                                                                |
| JS time from `App:module-start` to Home (~950 ms on the Xiaomi) not profiled                                                | Next step         | Needs a slow phone; the QA build's Hermes sampling-profiler hook (below) is ready for it.                                                                                                                                                                                                                              |

## Still needs the owner

1. **Screen off with audio playing, 2+ minutes, then the lock-screen controls**, on the Samsung
   (secure keyguard) and above all on the Xiaomi, where HyperOS background limits are the risk.
   EB Sprint is installed on the Samsung; start Psalm 119, press the side button, wait, then check
   it is still playing and that pause/play on the lock screen work.
2. **The Xiaomi**: either tap `Download/EBSprint.apk` → Install in Files (that copy is from
   `bfcbfc9a` and predates later sprint merges; ask for a fresh one), or turn on "Install via USB"
   and "USB debugging (Security settings)" in Developer options, which HyperOS ties to a Mi
   account. Then rerun the cold-start comparison and the screen-off test there.
3. The expo-updates change is native: it only reaches users with the next store binary.

## Incident

While checking plan detail, a Back press left EB Sprint for the launcher and the next scripted tap
(at the Plans tab position) opened the owner's White Noise Lite app from the dock. Its media
session stayed PAUSED; nothing in it was changed, and it was left in the background with Home. The
tap helper now refuses to inject anything unless EB Sprint is the top activity.

## How the testing was done (for repeat runs)

- Build: rsync the worktree into a scratch copy (no `node_modules`, `android`, `ios`), symlink
  `node_modules`, copy `.env`, `npx expo prebuild --platform android --no-install`, set
  `applicationId 'com.everybible.app.sprint'` and the label, `./gradlew assembleRelease
-PreactNativeArchitectures=arm64-v8a`. Local only.
- QA-only hooks added to the scratch copy, never committed: an `Instrumentation` declared in the
  manifest that injects taps, swipes, keys and text into the app's own windows (no `INJECT_EVENTS`
  needed, which is the way around HyperOS's block once the app is installed; attach it to a running
  process with `am instrument --no-restart`), plus Hermes sampling-profiler start and dump commands;
  and a `getJSBundleFile` override that loads `Android/data/<pkg>/files/qa/index.android.bundle`
  when present, so JS-only changes can be pushed over adb (with the generated `drawable-*`/`raw`
  folders next to it) without reinstalling.
- uiautomator returns a stale snapshot of a dismissed RN `Modal` while audio keeps the UI busy;
  confirm sheet state with screenshots and `dumpsys window`, not the dump.
- `adb shell atrace --async_start -a <pkg> ... am view dalvik sched` around a cold start gives app
  trace sections (Expo module registration, React context setup) on a release build with no
  extra tooling; the text output parses with a short script.
