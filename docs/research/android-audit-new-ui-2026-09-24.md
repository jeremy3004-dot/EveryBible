# Android audit of the UI and flows added 2026-09-24

Base: the `claude/integrate-2026-09-24e` integration head (`d69ebde0`), scope
`git diff 195717e1..HEAD -- src App.tsx app.json plugins`. The code was read, and the RN 0.81.5,
expo-notifications 0.32.17 and expo-localization sources in `node_modules` were checked. One
`npx expo prebuild --platform android --no-install` was run (`android/` is gitignored and was not
committed). No device or emulator was used, so anything that depends on hardware is under
**Device QA**. Companion to `android-health-check-2026-09-24.md` (F1–F6, D1–D6), which is not
repeated here.

## Fixed on this branch

**A1: TalkBack read four messages twice.** The Settings passcode error, the Settings
chapter-feedback identity error, the Bible search error and the translator notice's "needs
download" line each sit in an `accessibilityLiveRegion` and also call
`announceForAccessibility`. The comments said the announcement was for VoiceOver, but the call ran
on both platforms. TalkBack reads a live region when it appears, so Android users heard every one
of these messages twice. Fix: `announceLiveRegionText` in `src/utils/a11y.ts` announces on iOS
only. Tests in `src/utils/a11y.test.ts`. Commit `70fa3bee`.

**A2: a switched-off reminder channel was not caught.** On Android the user can turn off only the
"Daily reminder" channel while the app-level permission stays granted. The new blocked-notifications
notice only read the permission, so the reminder stopped appearing and nothing warned about it. Fix:
`isDailyReminderBlockedBySystem()` in `notificationService.ts` also reports a channel at
`AndroidImportance.NONE` (Android only; an unreadable channel counts as not blocked), and
`useNotificationsBlockedBySystem` uses it. It is still re-read on every return to the foreground.
Commit `a99af456`.

**A3: the reminder channel's name stayed in English.** `setupAndroidChannels` ran once per launch,
right after mount, which is before a non-English interface language finishes loading (`i18n/index.ts`
loads locales on demand and falls back to English). The channel name shown in Android's
notification settings was therefore English, and switching language in the app never renamed it.
Fix: the memo is keyed by the localized name, so the next setup after the language loads renames the
channel (every reminder reschedule awaits it, and the reconciler reschedules on `languageChanged`).
Commit `a99af456`.

## Checked, no change needed

- **Reset password / "send a new link".** `KeyboardAvoidingView` uses `'height'` on Android. Read
  against RN 0.81 source: `adjustResize` is inert under edge-to-edge (see the IME memory note), and
  `ReactRootView.checkForKeyboardEvents` reports `screenY` as the bottom of the visible display
  frame, which stops at the keyboard's top edge. The screen fills the window with no header, so the
  avoider's `frame.y + frame.height - screenY` is the real overlap and the ScrollView shrinks to
  sit above the keyboard. The ScrollView does not scroll a focused field into view after it
  shrinks, so a field that ends up low (large text) needs one manual scroll (QA 1). The
  `paddingBottom: insets.bottom` keeps the buttons clear of a three-button bar.
- **Per-screen error boundary and the back button.** The boundary sits inside each screen
  (`screenLayout`), so React Navigation's own back handling is unaffected. Back leaves a crashed
  pushed screen, and `canGoBack()` also counts parent navigators, so the Auth modal's root offers
  Back too. A crashed screen's own `BackHandler` subscriptions unmount with it. With target SDK 36,
  Android 16 would stop delivering `onBackPressed`, but the generated manifest still has
  `android:enableOnBackInvokedCallback="false"` (from `predictiveBackGestureEnabled: false`), so
  `BackHandler` still receives it.
- **Notification tap routing.** The only channel is `daily-reminder` (`DEFAULT` importance: sound
  and shade, no heads-up), and the trigger awaits its creation. `RECEIVE_BOOT_COMPLETED` and
  `POST_NOTIFICATIONS` come from the expo-notifications library manifest, and taps go through its
  `NotificationForwarderActivity`. For a cold start: the native last response is stored on the
  module instance, so it lasts as long as the JS context. After back-exit on Android 11 and older
  the App remounts in the same context, and the module-level router's `lastHandledKey` stops the
  stale response from being routed again. `MainActivity` is `singleTask`, so a warm tap arrives
  through the response listener.
- **Blocked-notifications notice.** On Android 13+ with target SDK ≥ 33, expo reports
  `undetermined` before the first prompt, `denied` after it (with `canAskAgain` false once Android
  stops asking), and `denied` whenever `areNotificationsEnabled()` is false. On Android 12 and older
  there is no prompt, so the status is `granted` or `denied` by the system switch. The Settings
  toggle offers `Linking.openSettings()` (app info) only when blocked. That is correct on Android.
- **Sleep timer and media session.** RN Android JS timers stop while the activity is paused
  (`JavaTimerManager.onHostPause`), so the sleep timer's 1 s interval does not run with the screen
  locked. Expiry is also enforced from expo-av's native progress callbacks
  (`progressUpdateIntervalMillis: 1000`, posted on a native handler), which keep coming with the
  screen off. The pause then updates the Android MediaSession through `syncCurrentNowPlaying(…, true)`.
- **Onboarding RTL.** `expo-localization` with `supportsRTL: false` writes
  `ExpoLocalization_supportsRTL=false` to `strings.xml` (confirmed in the prebuild output).
  `LocalizationModule` copies that into RN's `RCTI18nUtil_allowRTL` preference in `OnCreate`, before
  JS reads `I18nManager`, so an Arabic- or Urdu-locale device gets LTR on the very first launch
  rather than only after `enforceLtrLayoutPolicy()` and a restart. `forcesRTL` is not set, and the
  JS policy still clears any stored force. The manifest keeps `android:supportsRtl="true"`, which
  only affects native views (system dialogs mirror, which is expected).
- **Gradle heap and ATS plugins.** The prebuild wrote `org.gradle.jvmargs=-Xmx4096m
-XX:MaxMetaspaceSize=512m`. `withReleaseAtsLockdown` is a `withXcodeProject` mod and does not
  touch Android. `edgeToEdgeEnabled=true`, `newArchEnabled=false` and `hermesEnabled=true` are
  unchanged. Target and compile SDK are 36 and min SDK is 24.
- **Large text.** `useLargeText` reads `useWindowDimensions().fontScale` (Android
  `Configuration.fontScale`), so 2.0 is above the 1.3 stacking threshold. Android 14+ scales text
  non-linearly, so big text grows less than 2x.

## Open

- **O1 (Medium): a reminder that is on but was never granted is silent.** When
  `notificationsEnabled` arrives through preference sync, or the app is reinstalled, on Android 13+
  the permission is `undetermined`. The reconciler schedules the reminder, Android suppresses it,
  and the notice stays hidden because it only warns on `denied`/blocked. The fix is a
  "Allow notifications" variant of the notice that calls `requestNotificationPermissionOutcome()`.
  It needs a new string in all 21 locales, so it was not done here. The same gap exists on iOS.
- **O2 (Low): `announceForAccessibility` is deprecated at API 36.** It still speaks today. The
  ErrorBoundary fallback, reader and prayer announcements depend on it, and a future TalkBack could
  drop it. Live regions or focus moves are the long-term replacement.
- **O3 (Low): `accessibilityState.busy` is not spoken by TalkBack.** Onboarding rows also restate
  progress through `accessibilityValue`, so the download is still announced, but the "busy" state
  itself is iOS-only.
- **O4 (Info): the shared `node_modules` is behind `package.json`.** `expo-media-control@1.0.12`
  is declared and patched but is not installed in `/Users/dev/Projects/EveryBible/node_modules`.
  That means the prebuild here could not show its `mediaPlayback` foreground service or
  `FOREGROUND_SERVICE_MEDIA_PLAYBACK` permission. Run `npm install` in the main checkout before any
  local Android build.
- The prebuild main manifest also still lists `SYSTEM_ALERT_WINDOW`, `READ/WRITE_EXTERNAL_STORAGE`
  and `VIBRATE` from the Expo template. This is part of health check D4 (`blockedPermissions`).

## Device QA checklist (Android 13+ phone plus one Android 11/12 device; three-button and gesture nav)

1. Reset password via a `com.everybible.app://` link (cold and warm). On the "problem" phase,
   focus the email field: the field and the Send button stay above the keyboard. Repeat at font
   scale 2.0; one manual scroll is acceptable. Do the same with both password fields in the form phase.
2. Force a screen render error (dev build) on a pushed screen: hardware back and the Back button
   both leave it, and the tab bar stays usable. On a root tab screen, back follows the tab back
   behaviour. Check this on Android 16.
3. With TalkBack on: open the fallback and hear it announced once. Enter a wrong translator passcode,
   save an empty feedback identity, trigger a search error and the translator needs-download line:
   each message is spoken **once** (A1).
4. Daily reminder: enable it and grant permission. Kill the app and tap the reminder: Plans (or the
   single active plan, with Back going to Plans) opens. Tap it again while the app is in the
   background. Reboot the phone and confirm the reminder still fires.
5. Permission states on Android 13+: never asked, then toggle (prompt appears). Deny once (OK
   alert). Deny again (alert offers Settings, which opens app info). Revoke in system settings with
   the reminder on (notice appears on return, clears after re-allowing).
6. A2: with permission granted, turn off only the "Daily reminder" category in app notification
   settings and return to the app: the notice appears. Turn it back on: the notice clears.
7. A3: device language Russian (or any non-English), fresh install. Enable the reminder, then check
   the channel name in app notification settings. Switch the in-app language: the channel is renamed.
8. Sleep timer set to 5 min, screen locked: audio pauses at about 5 min (not at unlock), and the
   lock-screen/notification control shows paused. Pausing from the lock screen freezes the timer.
9. Font scale 2.0 (Android 14+): Home, Plans, plan detail, Settings and the annotation sheet stack
   rows. Change the font size with the app open and confirm the layout updates.
10. Device language Arabic, fresh install: the first launch is LTR (no mirrored tab bar), and
    onboarding rows read correctly with TalkBack.
11. Release build: `./gradlew assembleRelease` completes without an R8 out-of-memory error (4 GB heap).

## Verification

- Tests added first and failing: `src/utils/a11y.test.ts` (2 of 4), notificationService behaviour
  (6 new), useNotificationsBlockedBySystem (hook switched to the new check, plus one channel case).
- `npm test`: 5,689 tests, 0 failures. `npm run typecheck`: clean. ESLint and Prettier on the
  changed files: clean.
