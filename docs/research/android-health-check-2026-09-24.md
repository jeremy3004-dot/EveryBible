# Android health check — 2026-09-24

Base: `origin/main` @ `7376d690`. Scope: Expo SDK 54 / RN 0.81.5 (legacy arch), Hermes,
Android edge-to-edge, budget test device TECNO KL4. Read-only audit of `src/`, `app.json`
and the shipped Hermes binary, then test-first fixes for the top items. No builds were run,
so everything that depends on real hardware is listed under **Needs device QA**.

Line numbers are for `7376d690` (before the fixes) unless the item is still open, in which
case they are for the branch head.

## How the runtime was checked

The Hermes that ships with RN 0.81.5 was inspected directly instead of trusting memory:
`~/.gradle/caches/.../hermes-android-0.81.5-release.aar` → `jni/arm64-v8a/libhermes.so`,
`strings` over the builtin-name table. Result:

| API | In Hermes 0.81.5 |
| --- | --- |
| `Intl.Collator`, `Intl.DateTimeFormat` (+ `formatToParts`), `Intl.NumberFormat`, `Intl.getCanonicalLocales` | yes |
| `Intl.PluralRules`, `Intl.DisplayNames`, `Intl.RelativeTimeFormat`, `Intl.ListFormat`, `Intl.Segmenter`, `Intl.Locale` | **no** |
| `atob`, `btoa`, `TextEncoder` | yes (builtins) |
| `Array.prototype.at/findLast/toReversed/toSpliced/with`, `String.prototype.normalize/replaceAll` | yes |
| `Array.prototype.toSorted`, `structuredClone`, `globalThis.crypto` | no |

Correction to earlier notes: `atob` **is** a Hermes builtin in 0.81.5, so
`services/storage/storageService.ts:57` is safe. The hand-rolled base64 decoder in
`elEs256.ts` is still the right choice (it goes straight to bytes), and its comment now says so.

## Findings, ranked

### Fixed on this branch

**F1 — High — Russian and Arabic plurals are wrong on Android (Hermes has no `Intl.PluralRules`).**
`src/i18n/index.ts:69` initialises i18next 25, which builds plural rules with
`new Intl.PluralRules(code)`. On Hermes that throws; i18next catches it and falls back to
`count === 1 ? 'one' : 'other'` (`node_modules/i18next/dist/esm/i18next.js:999-1035`).
Russian then never reaches `_few`/`_many` and Arabic never reaches `_zero/_two/_few/_many`,
while every Node test passes (Node has full ICU).
Repro (Node, simulating Hermes): delete `Intl.PluralRules`, init i18next with ru
`d_one/d_few/d_many/d_other` → `t('d', {count: 5})` gives `5 дня`, expected `5 дней`. On a
device: interface language Russian, Home streak of 5+ days reads `дня` (`home.streakUnit_other`).
Fix: `src/i18n/pluralRulesPolyfill.ts` — CLDR cardinal rules for the 21 interface languages,
installed only when `Intl.PluralRules` is missing, before i18next init. The test compares every
locale against Node's ICU for 0–2000, fractions and whole millions, and drives i18next with
the real rule removed. Commit `8a75e3ac`.

**F2 — High — downloaded text packs and audio chapters were hashed from one whole-file base64 string.**
`src/services/bible/cloudTranslationService.ts:310` read the whole downloaded translation pack
(the bundled BSB DB alone is ~45 MB) with `readAsStringAsync(..., Base64)`, made two more full
copies with `replace`, and decoded it in one uninterrupted loop before hashing. The native side
also materialises the whole file and base64 string and sends it across the legacy bridge.
`src/services/audio/audioDownloadService.ts:823` did the same per chapter and hashed with
`sha256HexSync`, blocking the JS thread once per chapter for the whole of a whole-Bible download.
On a low-RAM phone this is an OOM/ANR risk at the end of every text-pack download, and jank
throughout an audio download.
Repro: on the TECNO, download a large text pack (or an EL whole-Bible audio set with manifest
checksums) with the Android Studio memory profiler attached; watch Java + JS heap spike and
frames drop during "verifying".
Fix: `sha256HexOfBase64Chunks` (`src/services/elMedia/elEs256.ts`) reads 192 KiB chunks with
`readAsStringAsync` `position`/`length` (implemented by the legacy module on Android,
`FileSystemLegacyModule.kt:191`, and iOS), decodes and hashes one chunk at a time, and fails
closed on a short or undecodable chunk. The audio adapter's `readBase64File` became
`readBase64Chunk`. Commit `cbf67feb`.

**F3 — Medium — two keyboard avoiders do nothing on Android.**
`src/screens/bible/ChapterFeedbackReviewScreen.tsx:456` and
`src/screens/more/SettingsScreen.tsx:778` used `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`.
Edge-to-edge makes the window's `adjustResize` inert (see `components/ui/Sheet.tsx`), so on
Android nothing moves: the translator note field and the chapter-feedback identity modal's
name/role inputs sit under the keyboard.
Repro: Android device, open a chapter feedback review and tap the note field; or Settings →
chapter feedback identity and tap the role field.
Fix: `'height'` like every other avoider, plus `src/androidKeyboardAvoidingSource.test.ts`, an
AST guard over all `.tsx` that fails on a missing or Android-`undefined` behavior. The modal
guard (`src/modalTranslucencySource.test.ts`) now also requires `onRequestClose` on every
`<Modal>`, which is how Android's back button reaches a modal. Commit `bab8f42b`.

**F4 — Medium — the lesson listen strip parks under a three-button navigation bar.**
`src/screens/learn/LessonDetailScreen.tsx:437` used `insets.bottom > 0 ? 26 : 16`, an iOS
home-indicator rule. A 48 dp three-button bar gives `insets.bottom = 48`, so the strip sits
26 dp from the bottom and its play control overlaps the system bar. `useTabBarHeight` had
already fixed the same pattern for the tab capsule.
Fix: shared `resolveFloatingBottomOffset(os, insetBottom, indicatorGap)` in
`src/hooks/useTabBarHeight.ts` (Android clears the whole inset, iOS keeps the tuned gap), with
behavioural tests for both platforms; used by the tab bar and the strip. Commit `6193c4a4`.

**F5 — Medium — two screens' last controls cannot scroll clear of the bottom chrome.**
`src/screens/more/PrivacyPreferencesScreen.tsx:141` reserves 32 pt of bottom padding but sits
under the floating tab capsule (content has to clear 96–128 pt), so its last card cannot
scroll above it (both platforms; worse on Android with the navigation bar under the capsule).
`src/screens/auth/ResetPasswordScreen.tsx:202` is top-edge-only safe area with no bottom inset.
Fix: `contentClearance` from `useTabBarHeight` and `insets.bottom` respectively. Layout-only,
no automated test. Commit `6193c4a4`.

**F6 — Low/Medium — a blocked notification or microphone permission is a dead end.**
After repeated denials Android 13+ stops showing the prompt and returns `denied` with
`canAskAgain: false` every time. `src/screens/more/SettingsScreen.tsx:217` showed the same
OK-only alert forever; the feedback recorder (`src/screens/bible/BibleReaderScreen.tsx:3208`)
only described where to go.
Fix: `requestNotificationPermissionOutcome()` (`granted | denied | blocked`) in
`notificationService.ts` with behavioural tests; the reminder alert adds a Settings button
(`Linking.openSettings`) when blocked, and the microphone help line gets a Settings button.
Reuses `common.settings` / `common.cancel`, so no new strings. Commit `09becc47`.

### Open (deferred)

**D1 — High — no foreground service or media notification for background audio.**
`src/services/audio/trackPlayer.ts:244` sets `staysActiveInBackground: true` on expo-av, but
expo-av has no MediaSession / foreground service on Android and the app's now-playing bridge
is iOS-only (`src/services/audio/audioNowPlaying.ts:78,95`). HiOS on the TECNO is aggressive
about killing background processes without a foreground notification, so playback is likely
to stop some time after the screen locks, with no lock-screen controls. Needs the planned
track-player (or expo-audio) migration with a `mediaPlayback` foreground service; expo-av is
deprecated in favour of expo-audio anyway. Same as N11 from 2026-09-10.
Repro: start chapter audio, lock the phone for 5–10 minutes, unlock.
Update: addressed on a follow-up branch with a MediaSession and `mediaPlayback` foreground service
next to expo-av (not a player migration). See `android-background-audio-2026-09-24.md`
for the decision and the device QA checklist. It needs a new native build.

**D2 — Medium — Android remote push is inert.** No `googleServicesFile` in `app.json`, so
`Notifications.getExpoPushTokenAsync` (`src/services/notifications/notificationService.ts:239`)
throws on Android and the error is swallowed; no Android `user_devices` rows. Only
`supabase/functions/send-group-notification` sends pushes, and groups are flagged off, so this
bites when groups launch. Needs a Firebase project, `google-services.json` and FCM v1
credentials in EAS (external). Local daily reminders are unaffected.

**D3 — Medium — whole-Bible download runs up to 8 chapter transfers at once.**
`src/services/audio/audioDownloadService.ts:7-8` (4 chapters × 2 books) with no low-RAM tier.
F2 removed the biggest per-chapter memory cost; whether 8 is still too many on the TECNO is a
measurement, not a code-reading question.

**D4 — Low — unused CAMERA and legacy storage permissions reach the merged manifest.**
`expo-image-picker` and `expo-file-system` library manifests add `CAMERA`,
`READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`; the app never calls `launchCameraAsync`,
and the image library uses the system photo picker. `android.blockedPermissions` would drop
them from the Play listing, but that needs a build to confirm the picker still works on
Android 9–12.

**D5 — Low — no Android App Links.** `app.json` has no `intentFilters` for
`https://everybible.app`, and `src/navigation/linkingConfig.ts:23` only lists the custom
scheme. Nothing uses https links today (password reset uses the custom scheme); needs
`assetlinks.json` on the site first. Same as N19.

**D6 — Low — `app.json` `userInterfaceStyle: "dark"` forces system dialogs dark** (Alert,
time picker) even when the in-app theme is the light vellum default. Cosmetic.

### Checked and healthy

- No `globalThis.crypto`, `structuredClone`, `toSorted`, `Object.groupBy`, Set methods,
  `AbortSignal.timeout/any` or streaming `response.body` in `src/`.
- `Intl.DisplayNames` use in `services/onboarding/localeSelection.ts` is feature-detected with
  an offline fallback. Date formatting only uses `DateTimeFormat`/`toLocale*`, which Hermes has.
- Every `<Modal>` has `onRequestClose`, `statusBarTranslucent` and `navigationBarTranslucent`
  (now guarded by a test). `BackHandler` users (`LocaleSetupFlow`, `AnnotationActionSheet`)
  use `subscription.remove()`; onboarding back steps through its own steps.
- Tab capsule, translation manage sheet and `AnnotationActionSheet` bottom insets are right.
- Notification channel is awaited before scheduling; `POST_NOTIFICATIONS` comes from the
  expo-notifications manifest; daily reminders use an inexact `DAILY` trigger, so no exact-alarm
  permission is needed.
- Audio downloads live under `documentDirectory` (not purgeable cache); the background
  downloader strips `file://` itself; interrupted-download resume, cancel, free-space preflight
  and HTTP-status checks from 2026-09-10 are intact.
- Custom fonts pick weights by family name (`design/fonts.ts`), so Android's
  fontWeight-with-custom-font trap is avoided.

## Needs device QA (TECNO KL4, three-button and gesture navigation)

1. Interface language Russian and Arabic: Home streak and chapter counts show the right forms
   (ru `5 дней`, `3 дня`; ar zero/two/few/many). Also check iOS: only the Android Hermes binary
   was inspected, so whether iOS Hermes lacks `Intl.PluralRules` too is unconfirmed (the
   polyfill installs only when it is missing, so it is harmless either way).
2. Download a large text pack and an EL audio book with checksums; confirm "verifying" no longer
   stalls the UI and the pack still activates; cancel during verification still cancels.
3. Chapter feedback review note field and Settings → chapter feedback identity inputs stay above
   the keyboard.
4. Lesson detail listen strip sits above the three-button bar; unchanged under gesture nav and on iOS.
5. Privacy preferences: last card scrolls clear of the tab capsule. Reset password: button clear
   of the navigation bar.
6. Deny notifications twice, toggle reminders on: alert offers Settings and it opens app info.
   Deny the microphone twice, tap record: Settings button opens app info.
7. D1 background audio with the screen locked for 10 minutes.
8. D3 whole-Bible audio download memory and frame time with the profiler attached.

## Verification

- `npm test`: 4,765 tests, 0 failures (baseline 4,724).
- `npm run typecheck`: clean. `npm run lint`: clean.
- i18n checks (`coverage`, `coreLocaleCoverage`, `interfaceCoverage`, `interfaceRendering`): pass.
