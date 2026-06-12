# Phase 35 — Android Device QA Plan (P1 + P2)

**For:** a Sonnet executor agent running an Android emulator/device on this machine.
**Goal:** Close the two on-device gates that static verification cannot prove. Produce EVIDENCE
(logcat captures, screenshots, command output) — never claim a pass you did not observe.

Repo: `/Users/dev/Projects/EveryBible`. Bundle/package id: `com.everybible.app`.
Branch with the fixes: `main` (Phase 35 already merged). Apple/iOS rules do not apply here.

---

## STEP 0 — Environment preflight (do this first; if blocked, STOP and report)

Run and record output. If a required tool is missing, document exactly what's missing and STOP that
track — do NOT fake results.

```bash
adb --version
adb devices                      # need at least one emulator/device "device" (not offline)
emulator -list-avds              # available Android Virtual Devices
java -version                    # R8 build needs JDK 17
node -v ; npx eas --version      # eas-cli present?
sdkmanager --version 2>/dev/null # Android SDK
```
If no AVD is running: `emulator -avd <name> -no-snapshot -no-boot-anim &` then wait for
`adb wait-for-device` + `adb shell getprop sys.boot_completed` == 1.

---

## TRACK A — P1 follow-along highlight (behavioral; a DEBUG build is fine — faster)

**What to prove:** During audio playback with follow-along, the highlighted verse still ADVANCES
(the memoized `ReaderParagraphBlock` must not freeze the highlight on position ticks), and
scrolling / verse-selection / bookmarking still visibly update.

1. Build + install a debug/dev build on the emulator (cheapest path that exercises the JS):
   - Preferred: `npx expo run:android` (debug variant) — installs + launches on the emulator.
   - If that's too heavy or fails for env reasons, document why and note P1 stays UNVERIFIED.
2. Drive the flow (use Maestro if a `.maestro/` flow exists, else `adb` taps via `adb shell input`
   guided by `adb shell uiautomator dump`, else computer-use on the emulator window):
   a. Open a Bible chapter with many verses (e.g. Psalms 119 or John 3).
   b. Start audio playback and enable Follow Along.
   c. Observe for ~30–45s: capture 3+ screenshots spaced over time
      (`adb exec-out screencap -p > /tmp/p1_t<n>.png`) showing the highlighted verse at DIFFERENT
      verse numbers over time → proves the highlight advances.
   d. While playing, scroll the chapter — confirm it scrolls smoothly and the highlight is still
      correct after scrolling.
   e. Tap a verse to select it, and (if signed in) bookmark/highlight it — confirm the UI updates
      immediately (proves non-position re-renders still flow through the memo).
3. Watch JS for errors during the above: `adb logcat -s ReactNativeJS:* | tee /tmp/p1_logcat.txt`
   — there must be NO red-box / uncaught errors.

**PASS A:** screenshots show the highlight on ≥2 different verses over time, scroll/select/bookmark
update, no JS errors. **FAIL A:** highlight is frozen/stale, or any flow stops updating → capture it
and report (root cause is likely a missing input in `paragraphRenderSignature`).

---

## TRACK B — P2 R8/ProGuard minification smoke (MUST use the minified PRODUCTION build)

**What to prove:** R8 + resource shrinking did not strip a reflection/JNI class that crashes at
runtime. This REQUIRES the minified production build — a debug build does NOT exercise R8.

1. Local production build only (NEVER cloud — user is out of EAS credits):
   ```bash
   cd /Users/dev/Projects/EveryBible
   eas build --platform android --profile production --local
   ```
   - Exit 0 + an `.aab` on disk is required. An R8/ProGuard error here = a missing keep rule
     (read the class from the log, add `-keep class <pkg>.** { *; }` to `extraProguardRules` in
     `app.json`, rebuild). If the build cannot run in this environment, document why and STOP — P2
     stays UNVERIFIED (do not approximate with a debug build).
2. AAB → universal APK → install:
   ```bash
   AAB=$(ls -t /Users/dev/Projects/EveryBible/*.aab | head -1); echo "$AAB"
   npx bundletool build-apks --bundle="$AAB" --output=/tmp/eb-rel.apks --mode=universal --overwrite
   npx bundletool install-apks --apks=/tmp/eb-rel.apks
   ```
3. Launch + watch for minification crashes:
   ```bash
   adb logcat -c
   adb shell monkey -p com.everybible.app -c android.intent.category.LAUNCHER 1
   adb logcat | tee /tmp/p2_logcat.txt | grep -iE "AndroidRuntime|ClassNotFound|NoSuchMethod|FATAL"
   ```
4. Exercise each keep-ruled library (capture a screenshot per flow):
   - Open a Bible chapter and scroll (FlashList + Reanimated)
   - Play chapter audio (ExoPlayer / expo-av)
   - Download a chapter for offline (background-downloader)
   - Tap a Google sign-in entry point (Play Services)
   - Open a screen with SVG icons (react-native-svg)
   This also re-confirms P1, P3, P4, P5, P6 on the real release binary.

**PASS B:** cold-launches to home, all 5 flows work, logcat shows NO `FATAL EXCEPTION` /
`ClassNotFoundException` / `NoSuchMethodError`. **FAIL B:** any crash → capture the logcat line with
the missing class and report; do NOT ship.

---

## Report back (write to `.planning/phases/35-android-performance-hardening/35-DEVICE-QA-REPORT.md` AND return it)

- **Environment:** what was available (emulator name, API level, java version, eas version).
- **Track A (P1):** PASS / FAIL / NOT RUN (reason). Attach screenshot paths showing the highlight on
  different verses; note scroll/select/bookmark behavior; paste any JS error lines.
- **Track B (P2):** PASS / FAIL / NOT RUN (reason). Paste the build exit status, the bundletool
  install result, and the launch logcat grep output (even if empty — "no crash lines" is the result).
  If you had to add any `-keep` rule, show the diff to `app.json`.
- **Anything you could not run** and why (be honest — "no AVD available", "production build exceeds
  env limits", etc.). NEVER report a pass you didn't observe.
- Commit the report + any `app.json` keep-rule additions on a branch `qa/android-perf-device`
  (do NOT touch unrelated working-tree changes), and hand back for verification.
