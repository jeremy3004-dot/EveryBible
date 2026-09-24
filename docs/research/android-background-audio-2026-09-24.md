# Android background audio: decision and device QA (2026-09-24)

Follow-up to D1 in `android-health-check-2026-09-24.md` (and N11 / M4 from earlier health
checks). Base: `origin/main` @ `fe99d292`, Expo SDK 54, RN 0.81.5, legacy architecture,
Hermes.

## Problem

Bible audio plays through expo-av (`src/services/audio/trackPlayer.ts`), with
`staysActiveInBackground: true`. On Android nothing else is running while the screen is
locked. The app has no foreground service and no MediaSession. The now-playing bridge
(`audioNowPlaying.ts`) talks to a native module that only exists on iOS. The result:

- no media notification, and no lock-screen, headset or Bluetooth controls;
- the process has only "cached/background" importance, so HiOS (TECNO), One UI and Doze
  kill it some minutes after the screen locks, and playback stops.

## What expo-av already handles

The mechanics of focus, ducking and interruptions are fine. The process just needs to stay
alive. From `node_modules/expo-av/android/.../AVManager.java`:

- **Audio focus.** With `interruptionModeAndroid: DoNotMix` it requests `AUDIOFOCUS_GAIN`.
  It pauses on `LOSS` and `LOSS_TRANSIENT` (a phone call) and resumes on `GAIN`.
- **Ducking.** On `LOSS_TRANSIENT_CAN_DUCK` with `shouldDuckAndroid: true` it halves the
  volume.
- **Headphones unplugged.** It registers for `ACTION_AUDIO_BECOMING_NOISY` and abandons
  focus, which pauses every sound. ExoPlayer then reports `playWhenReady=false`, so the hook
  sees `paused`, and that state reaches the notification.
- **One focus owner.** Focus belongs to the module, not to a sound, so the background-music
  layer (also expo-av, 0.2 volume under the narration) shares it with the narration.

## Options considered

| Option                                                                                   | Next/prev chapter on lock screen                                                                               | Keeps bg-music layering                                                                                                                                                      | New native code                            | Verdict                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **expo-audio 1.1.x** (SDK 54's version) `setActiveForLockScreen`                         | **No.** `AudioMediaSessionCallback` explicitly removes `COMMAND_SEEK_TO_NEXT/PREVIOUS*`; only play/pause/±10 s | Only if bg music also moves to expo-audio                                                                                                                                    | Migrate both players                       | Rejected: fails a hard requirement. Also requests `AUDIOFOCUS_GAIN_TRANSIENT` (wrong for long-form audio), sets no becoming-noisy handling (`setAudioAttributes(DEFAULT, false)`), and has hardcoded English "Seek Forward/Backward" labels. |
| **react-native-track-player 4.1.2**                                                      | Yes                                                                                                            | **No.** RNTP and expo-av each request focus as separate clients in one process. Starting the bg-music sound takes focus from the narration (pause or duck), and the reverse. | Yes, and it replaces the player on Android | Rejected (see below)                                                                                                                                                                                                                         |
| RNTP 5 / `@rntp/player`                                                                  | Yes                                                                                                            | Same conflict                                                                                                                                                                | Yes                                        | Not possible: needs New Architecture (app is `newArchEnabled: false`) and has a commercial licence.                                                                                                                                          |
| react-native-music-control 1.4.1                                                         | Yes                                                                                                            | Yes                                                                                                                                                                          | Yes                                        | Rejected: unmaintained since 2021, and its service has no Android 14 `foregroundServiceType`.                                                                                                                                                |
| @notifee/react-native                                                                    | No MediaSession                                                                                                | Yes                                                                                                                                                                          | Yes                                        | Rejected: a plain notification with buttons, with no lock-screen media controls and no headset or Bluetooth buttons.                                                                                                                         |
| **expo-media-control 1.0.12** (player-agnostic MediaSessionCompat + `mediaPlayback` FGS) | Yes                                                                                                            | **Yes** (does not touch focus; expo-av keeps playing)                                                                                                                        | Yes, one Expo module, Android only         | **Chosen**                                                                                                                                                                                                                                   |

### Why not react-native-track-player

It was the planned migration (N11), but three things block it:

1. **Audio-focus conflict with background music.** The narration and the music layer would
   become two focus clients. Whichever starts second interrupts the other. Fixing that needs
   a third player for the music (for example expo-audio in `mixWithOthers`), so that means
   two new native dependencies.
2. **It does not build on RN 0.81 as published.** 4.1.2 is the frozen v4 line.
   `MusicModule.kt:548/587` passes `Bundle?` to `Arguments.fromBundle`, a compile error
   under Kotlin 2.1 (upstream issues #2530, #2579). It would need a patch.
3. **ExoPlayer version skew.** It pulls KotlinAudio 2.1.0, which uses ExoPlayer 2.19.0.
   expo-av pins ExoPlayer 2.18.1 and its okhttp extension. Gradle would move expo-av's core
   to 2.19 and leave the extension on 2.18.1.

It would also replace the narration player on Android, a much larger change to test than
adding a session next to a player that already works.

## Chosen approach

Keep expo-av. On Android only, add a MediaSession and a `mediaPlayback` foreground service
with `expo-media-control@1.0.12`, driven from the existing now-playing API:

- **Dependency.** `package.json` pins `expo-media-control` to exactly `1.0.12` and excludes
  it from iOS autolinking (`expo.autolinking.ios.exclude`). iOS pods, `Podfile.lock` and
  the Swift now-playing module are untouched. `expo-modules-autolinking resolve -p apple`
  confirms it is not linked. Its config plugin is deliberately **not** added to
  `app.json`, because it would write `AVAudioSessionCategory` into the iOS Info.plist. The
  Android manifest entries come from the library manifest through manifest merge:
  `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`, the service with
  `foregroundServiceType="mediaPlayback"`, and `MediaButtonReceiver`.
- **`patches/expo-media-control+1.0.12.patch`** (patch-package, applied on `postinstall`):
  - `START_NOT_STICKY` instead of `START_STICKY`, so a killed process cannot come back as
    a lone service posting an "Unknown" notification with dead buttons.
  - `onTaskRemoved` stops the foreground service. Swiping the app away destroys the React
    host, which releases every expo-av sound, so the notification must go too.
  - The notification channel name and action labels (read by TalkBack) are configurable
    from JS, with English fallbacks. The "Unknown"/"Unknown Artist" placeholders are now
    empty.
  - `disableMediaControls` cancels the coroutine scope it ran on. Before, it cancelled
    whatever `moduleScope` pointed to when it finished, so a quick stop → play killed the
    new enable's service bind.
  - Compile check: `MediaPlaybackService.kt`, before and after the patch, was compiled with
    the Kotlin 2.1.20 compiler (the same version RN 0.81 uses) against `android-36`,
    androidx.media 1.4.3, androidx.core 1.16.0 and coroutines 1.7.3. Both compile with
    only deprecation warnings. The module-file change (a captured `val`) could not be
    compiled here, because it needs expo-modules-core sources.
- **JS** (`src/services/audio/`):
  - `androidMediaSessionModel.ts` (pure): capabilities (prev/play/pause/next/seek/±10 s),
    compact view `prev · play/pause · next`, localized metadata, playback-state throttling,
    the artwork uri, and command mapping into the existing `BibleNowPlayingRemoteCommand`
    vocabulary.
  - `androidMediaSession.ts`: one serialized queue for enable/update/disable, with syncs
    coalesced behind a slow native call. The session is enabled once and kept across
    chapter changes and pauses, because re-enabling from the background is blocked on
    Android 12+. It waits 750 ms after a disable before re-enabling, and a failed enable is
    retried on the next sync. The native module is looked up lazily with
    `requireOptionalNativeModule('ExpoMediaControl')`, so iOS and Node never load it.
  - `audioNowPlaying.ts`: on Android, `sync` / `clear` / `subscribe` go to the session.
    The iOS path has not changed.
  - `useAudioPlayer.ts`: on Android only, passes `localized` strings (book name via
    `getTranslatedBookName`, and existing keys `audio.nowPlaying`,
    `interface.play/pauseChapterAudio`, `audio.previous/nextChapter`,
    `audio.skipBackward/Forward`). No new i18n keys. iOS input is unchanged.
    Notification, headset and Bluetooth commands go into the same handler the iOS remote
    commands already use (play/resume, pause, next/previous chapter, ±10 s, seek).
- **Metadata.** The title is `<book in interface language> <chapter>`. The artist is the
  translation name and the album is "Every Bible". The artwork is a new 300×300 copy of
  the app icon (`assets/audio/now-playing-artwork.png`), kept small so it stays well under
  binder and notification bitmap limits.
- **Discreet mode** (privacy store `mode === 'discreet'`). The notification shows only
  "Now playing" (localized), with no book, translation or artwork. If the privacy store
  cannot be read, it fails closed to the same entry.
- **Throttling.** The hook reports progress about once a second. The session pushes a new
  playback state only on play/pause, a rate change or a seek of more than 2 s from where
  Android already extrapolates. Metadata is pushed only when it changes. This avoids
  rebuilding the notification every second on budget phones.

**A new native build is required** (new native dependency plus native patch). JS-only OTA
updates must not ship this change to binaries built before it: without the native module,
the JS does nothing, and old builds keep today's behaviour.

## Known gaps and residual risks

- **Library maturity.** expo-media-control has one maintainer, is roughly a year old, and
  its release build logs through `println`. The patch covers the lifecycle bugs found in
  review; device QA is the real gate.
- **Next/previous are always enabled on Android.** The library takes capabilities only at
  enable time, and re-enabling mid-playback is unsafe from the background. At the last
  chapter the button is a no-op because the hook finds no next chapter. iOS still greys
  them out.
- **Localized strings are read when the session starts.** Channel name and action labels
  come from the interface language at that moment. Changing the language mid-playback
  updates the title at the next metadata change, and the labels at the next play-from-stop.
- **Streaming with the screen off.** expo-av's ExoPlayer sets no wake/Wi-Fi lock. The
  foreground service keeps the process and its network access. Prefetch of the next 2
  chapters covers auto-advance, but a stall while buffering a remote chapter on weak
  Wi-Fi is a QA item.
- **Exported browser service.** `MediaPlaybackService` is exported with an open
  `onGetRoot`, as media apps usually are. Another app on the device could send transport
  commands (play/pause/next). The risk is low: no data is exposed.
- **Play Console.** Apps targeting Android 14+ that use a `mediaPlayback` foreground
  service are expected to complete the foreground-service declaration in Play Console
  (description plus a short video). This is not verified against the current listing.
  Check it before the release that ships this.
- **Swipe-away.** Playback stops when the app is swiped from recents, as it does today,
  because expo-av releases sounds on host destroy. The notification now goes with it.

## Device QA checklist

Run on the **TECNO KL4 (HiOS, budget)** and on a **Pixel or Samsung (stock / One UI)**,
using a release-like build (`preview` or `production` profile, not Expo Go). Use both a
downloaded chapter and a streamed chapter where noted.

1. **Lock screen, 10+ minutes.** Start a chapter (streamed), lock the phone, leave it 15
   minutes with auto-advance on. Audio keeps playing across at least one chapter boundary,
   with no gap longer than the load time. Unlock: the app is still on the chapter that is
   playing.
2. **Notification.** Pull down the shade. It shows the book and chapter in the interface
   language (switch the app to Spanish or Hindi and start a chapter), the translation name,
   and the artwork. The small icon is the monochrome notification icon, not a white square.
   Check Settings → Apps → Every Bible → Notifications: the channel is named in the
   interface language.
3. **Notification controls.** Pause, play, next chapter and previous chapter work from the
   shade and from the lock-screen player. On Android 13+ drag the seek bar; audio jumps
   there. Compact view shows prev · play/pause · next.
4. **Headphones.** Wired: unplug during playback and audio pauses at once with nothing
   through the speaker. Plug back in; nothing auto-plays. Bluetooth: disconnect, same
   result. Headset button single-press toggles play/pause, and double-press goes to the
   next chapter.
5. **Phone call.** Receive a call during playback: audio pauses and the notification shows
   paused. End the call: playback resumes (expo-av regains focus). Repeat with an
   outgoing call.
6. **Other audio apps.** Start Spotify or YouTube while Bible audio plays: Bible audio
   pauses. A navigation prompt ducks the narration briefly.
7. **Chapter auto-advance while locked.** With auto-advance, repeat-book, a queue and a
   reading plan, lock and let two chapters finish. Each advances, and the notification
   title updates. At the end of a plan sequence the notification disappears.
8. **Battery saver.** Turn battery saver on (and HiOS "Power Marathon" / "Ultra power
   saving" on the TECNO). Repeat step 1. Also check the TECNO's per-app battery setting on
   its default: no manual "allow background activity" should be needed.
9. **Background music layer.** Pick a music layer, start a chapter, lock. Music and
   narration both keep playing; music stays under the narration and neither interrupts the
   other.
10. **Stop and restart.** Stop playback in the app: the notification disappears within a
    second. Tap play again immediately: the notification comes back (tests the re-enable
    gap and the patched scope race).
11. **Swipe away.** Swipe the app from recents during playback: audio stops and the
    notification disappears, with no stale "Unknown" notification afterwards.
12. **Discreet mode.** Turn on discreet mode, start a chapter, lock. The lock-screen entry
    reads only "Now playing" (localized), with no book, translation or cross artwork.
13. **Notifications denied** (Android 13+). Deny notification permission, then start
    playback and lock. Playback still survives, because media-session notifications are
    exempt.
14. **iOS regression spot-check** (iPhone). Lock-screen now-playing, remote next/previous,
    interruption resume and artwork are unchanged.

## Verification on this branch

- `npm test`: 4,883 tests, 0 failures (baseline 4,836). The new tests are
  `androidMediaSessionModel.test.ts`, `androidMediaSession.test.ts`,
  `audioNowPlaying.android.test.ts`, and one Android case in `useAudioPlayer.test.ts`. The
  iOS cases in `audioNowPlaying.test.ts` are unchanged and pass.
- `npm run typecheck` and `npm run lint` are clean.
- No locale files changed (existing keys only).
- Autolinking: `expo-media-control` resolves for Android and is absent for `ios`/`apple`.
- No eas, gradle or xcodebuild was run.
