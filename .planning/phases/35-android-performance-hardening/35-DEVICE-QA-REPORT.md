# Phase 35 — Android Device QA Report

**Branch:** `qa/android-perf-device` (from `main` @ `8dd55c0`)
**Date:** 2026-06-12
**Agent:** Sonnet QA executor (automated)

---

## STEP 0 — Environment Preflight

All commands run on macOS Darwin 25.3.0 (arm64). Full output captured below.

### adb

```
Android Debug Bridge version 1.0.41
Version 36.0.2-14143358
Installed as /Users/dev/Library/Android/sdk/platform-tools/adb
Running on Darwin 25.3.0 (arm64)
```

Binary found at `/Users/dev/Library/Android/sdk/platform-tools/adb`.
NOT on the default `$PATH` — required full path to invoke.

### adb devices

```
List of devices attached
```

**No devices or emulators connected.**

### emulator -list-avds

```
(empty output)
```

No Android Virtual Devices (AVDs) are configured on this machine.
`~/.android/avd/` directory exists but is empty.

### System images (required to create an AVD)

```
find /Users/dev/Library/Android/sdk -type d -name "system-images" → (no results)
```

The SDK directory at `/Users/dev/Library/Android/sdk/` contains:
`build-tools`, `cmake`, `emulator`, `licenses`, `ndk`, `platform-tools`, `platforms`, `sources`

**No `system-images/` subdirectory exists.** Platform stub JARs are present (android-34,
android-36, android-36.1) but these are compile-time stubs only — they cannot boot an emulator.
The `cmdline-tools/` package (which contains `avdmanager`/`sdkmanager`) is also absent, so no
AVD can be created without manual SDK installation.

### java -version

```
openjdk version "17.0.18" 2026-01-20
OpenJDK Runtime Environment Homebrew (build 17.0.18+0)
OpenJDK 64-Bit Server VM Homebrew (build 17.0.18+0, mixed mode, sharing)
```

**PASS** — JDK 17 present (required for R8 builds).

### node / eas-cli

```
node: v22.22.3
eas-cli/18.4.0 darwin-arm64 node-v22.22.3
```

`eas-cli` found at `/Users/dev/.local/bin/eas`. Version 18.4.0 (latest is 20.1.0, but 18.x runs
local builds fine). **PASS** — eas-cli present.

### sdkmanager

```
NOT FOUND — cmdline-tools not installed in SDK
```

### Preflight verdict

| Tool | Status | Notes |
|------|--------|-------|
| `adb` | PRESENT | v1.0.41, not on default PATH |
| Connected device/emulator | **MISSING** | 0 devices attached |
| AVDs configured | **MISSING** | `~/.android/avd/` is empty |
| System images | **MISSING** | No `system-images/` in SDK |
| `avdmanager`/`sdkmanager` | MISSING | cmdline-tools not installed |
| JDK 17 | PRESENT | OpenJDK 17.0.18 via Homebrew |
| Node.js | PRESENT | v22.22.3 |
| eas-cli | PRESENT | v18.4.0 |

**Critical blocker:** No Android emulator or physical device is available, and the SDK lacks the
system images and tooling needed to create one. This blocks BOTH test tracks.

---

## TRACK A — P1 Follow-Along Highlight

**Result: NOT RUN**

### Reason

A DEBUG build requires an Android emulator or physical device for installation and execution.

- `adb devices` returns an empty device list.
- `emulator -list-avds` returns empty — no AVDs exist.
- No Android system images are installed in the SDK (`/Users/dev/Library/Android/sdk/system-images/`
  does not exist), so an AVD cannot be created without first running `sdkmanager` to download a
  system image (which requires the `cmdline-tools` package, also absent).
- No physical Android device is connected via USB or TCP.

### What would be needed to run this track

1. Install Android cmdline-tools: `sdkmanager "cmdline-tools;latest"`
2. Install a system image: `sdkmanager "system-images;android-34;google_apis;arm64-v8a"`
3. Create an AVD: `avdmanager create avd -n Pixel_API34 -k "system-images;android-34;google_apis;arm64-v8a"`
4. Boot it: `emulator -avd Pixel_API34 -no-snapshot -no-boot-anim &`
5. `adb wait-for-device && adb shell getprop sys.boot_completed` → 1
6. Then: `npx expo run:android` from `/Users/dev/Projects/EveryBible`
7. Drive follow-along highlight flow and capture screenshots per the QA plan.

### Evidence files

None — track not run.

### Pass/Fail criteria (for when re-run)

**PASS A:** screenshots showing highlighted verse on ≥2 different verse numbers over time,
scroll/select/bookmark visibly updating, no JS red-box errors in logcat.

---

## TRACK B — P2 R8/ProGuard Minification Smoke

**Result: NOT RUN**

### Reason

The local production AAB build (`eas build --platform android --profile production --local`)
requires Gradle to invoke R8 during the build, but executing the minified APK requires an Android
emulator or device. The same blocker from Track A applies: no emulator, no physical device.

Additionally, even completing the build step alone (which does not require a device) would be
unverifiable without a device to install and launch it on — a build that exits 0 does not confirm
absence of runtime ClassNotFoundException/NoSuchMethodError. Per hard rule 2, claiming a pass
without observed evidence is forbidden.

### What the existing keep rules cover (for reference)

The `extraProguardRules` in `app.json` (added in commit `6dd8571`) already covers:

- `com.swmansion.reanimated.**` — react-native-reanimated
- `com.facebook.react.turbomodule.**` — Turbo modules
- `com.swmansion.gesturehandler.**` — react-native-gesture-handler
- `com.horcrux.svg.**` — react-native-svg
- `com.tencent.mmkv.**`, `com.reactnativemmkv.**` — react-native-mmkv
- `com.shopify.reactnative.flash_list.**` — @shopify/flash-list
- `com.swmansion.rnscreens.**` — react-native-screens
- `com.google.android.gms.**`, `com.google.android.libraries.**` — Google Play Services
- `com.google.android.exoplayer2.**` — ExoPlayer / expo-av
- `expo.modules.notifications.**` — expo-notifications
- `com.eko.**` — background-downloader
- `com.facebook.jni.**`, `com.facebook.react.bridge.**`, `com.facebook.hermes.**` — Hermes/RN JNI
- `expo.modules.**` — Expo modules core

No `app.json` modifications were needed or made in this QA run.

### What would be needed to run this track

1. Same emulator/device prerequisites as Track A.
2. From `/Users/dev/Projects/EveryBible`:
   ```bash
   eas build --platform android --profile production --local
   ```
3. Locate the output AAB, convert to APK via `bundletool`, install, and exercise all 5 flows.
4. Capture logcat and grep for `FATAL|ClassNotFoundException|NoSuchMethodError`.

### Evidence files

None — track not run.

---

## Summary

| Track | Result | Root Cause |
|-------|--------|------------|
| **Track A — P1 highlight advance** | NOT RUN | No Android emulator/device available |
| **Track B — P2 R8 minification smoke** | NOT RUN | No Android emulator/device available |

### Blocking gap: Android emulator not provisioned

The machine has the Android SDK emulator binary and platform-tools, but is missing:

1. `cmdline-tools` package (contains `sdkmanager` and `avdmanager`)
2. Any `system-images` package (required to boot an emulator)

To unblock both tracks, a human operator must run:

```bash
# Using Android Studio or SDK Manager GUI, OR via command line after installing cmdline-tools:
sdkmanager "cmdline-tools;latest"
sdkmanager "system-images;android-34;google_apis;arm64-v8a"
avdmanager create avd -n EveryBible_QA -k "system-images;android-34;google_apis;arm64-v8a" --device "pixel_7"
```

Once an emulator is running (`adb devices` shows it as `emulator-5554 device`), re-run this QA
agent and both tracks can execute fully.

### No app.json changes made

No `-keep` rules were added or modified. The existing `extraProguardRules` from commit `6dd8571`
are unchanged.

### No working-tree changes touched

The following pre-existing uncommitted changes were left untouched per hard rule 5:
- `ios/EveryBible/Info.plist`
- `src/i18n/locales/en.ts`
- `src/screens/home/HomeScreen.layoutSource.test.ts`
- `src/screens/home/HomeScreen.shareSource.test.ts`
- `src/screens/home/HomeScreen.tsx`
- `src/screens/home/homeLayoutModel.ts`
- `src/services/plans/CLAUDE.md`
- Untracked: `.playwright-mcp/`, `logs/`, `onboarding-language-prototype.mp4`,
  `.easignore.openclaw-backup-20260509-161259`
