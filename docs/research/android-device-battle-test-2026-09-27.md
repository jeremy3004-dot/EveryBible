# Android device battle test — 2026-09-27

Status: completed. All five fixes passed automated regression coverage and their
physical checks. The final QA build is installed on the phone. This is a bounded
real-device audit, not certification that every feature or Android device is
production-ready.

## Scope and device

GPT-6 Sol workers with high reasoning performed assigned implementation, builds,
and the device walkthrough. The primary agent investigated, reviewed changes,
and verified evidence. Start revision: `7eb71c54331e33a38a4d9d659d17dbcfb8210a63`.
Unrelated workspace changes and production app data were preserved. No release,
account deletion, community publication, or external image share was performed.

- Xiaomi Redmi `25078RA3EY`, MediaTek `MT6769`, Android 16 / API 36.
- 720 × 1600 display, density 320, reported RAM approximately 7.5 GiB.
- Production: `com.everybible.app`, Play-signed 1.0.10 (546); exact source revision
  unknown. Its version number is not source-provenance evidence.
- Source builds use separate `com.everybible.app.qa`, preserving production data.
- Tests ran while USB charging and mirroring. Initial battery was 9%; measured
  image comparisons were at 27–29%, 35°C, thermal status 0. These conditions do not
  establish battery endurance or unplugged deep-idle behavior.

## Working without a SIM

Xiaomi denied injected ADB taps (`INJECT_EVENTS`) and USB package installation
(`INSTALL_FAILED_USER_RESTRICTED`). Its additional developer toggles require a
SIM. The supported scrcpy UHID keyboard route works without changing those
settings: Tab/Shift+Tab moves focus and Space activates verified UI targets.
Normal on-device Files/package installation also works, including OEM security
checks. No rooting, SIM spoofing, lock bypass, or security disabling was used.

Files search and List view identify the exact APK. An early mistaken selection
of a same-version comparator was caught by installed-APK SHA verification and
corrected before acceptance claims. Direct ADB installation remains restricted.
Relative mouse control was unreliable, so this pass establishes keyboard-driven
UI coverage, not touch-gesture or TalkBack acceptance.

## Implemented fixes

| Finding                                                                        | Change                                                                                                   | Verification                                                                                                                            |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Opening the verse-image picker decoded full photographs for 45 tiny thumbnails | Set Android thumbnail `resizeMethod="resize"`; leave full preview unchanged                              | Failing-before render regression; matched physical A/B; primary visual inspection                                                       |
| Android More displayed build 417 although installed build was 546              | Read `expo-application.nativeBuildVersion`, omit unavailable suffix                                      | Two regressions; source-built phone footer visibly shows 546                                                                            |
| Next/Previous while paused tore down Android's media session and notification  | Publish new paused metadata immediately through existing synchronization, including after reader unmount | Failing-before background regressions; exact installed APK retained PAUSED session/notification on Next and Previous, then Play resumed |
| Translation management sheet collapsed and hid download controls               | Use explicit reactive window-based height                                                                | Regression and settled physical top y=288 / height 1,312px verified                                                                     |
| Expired timer chip retained a stale native countdown description               | Explicitly clear accessibility text                                                                      | Two failing-before regressions; physical selection and Off transition clear stale countdown                                             |

The third fix preserves silent navigation. Idle navigation and explicit Stop
still clear controls; playing navigation is unchanged. Tests also cover paused
translation changes and a newer playback request superseding an in-flight stop.

On the old two-fix APK, paused Next selected John 4 without sound, then the native
session disappeared and its notification was canceled. Both remained absent
20 seconds later. A later system Play successfully recreated the session and
played John 4. Thus recovery worked, but paused navigation unnecessarily destroyed
native controls. OEM cached-card visibility was not independently established.

## Physical image-picker comparison

Both comparator APKs used the same package, signing certificate, native code,
resources, retained app data, John 1:27 BSB, and default background. Each run began
after process restart. Only the JavaScript bundle differed; its source difference
was the thumbnail resize property. Installed APK hashes matched archived builds.

| Metric                             |     Baseline |       Fixed |
| ---------------------------------- | -----------: | ----------: |
| Reader PSS before opening, KiB     |      157,701 |     150,201 |
| Picker-open PSS, KiB               |      813,763 |     263,558 |
| Picker-open bitmap allocation, KiB |      198,020 |      24,099 |
| Immediately closed PSS, KiB        |      405,555 |     235,464 |
| Later closed/backgrounded PSS, KiB |      279,164 |     187,519 |
| Janky / sampled frames             |       8 / 19 |      3 / 29 |
| Reported frame p50 / p95           | 500 / 900 ms | 44 / 350 ms |

Picker-open PSS fell **537 MiB (67.6%)**; bitmap allocation fell **170 MiB (87.8%)**.
The full verse preview remained intact and thumbnails looked appropriate at their
displayed size. This is one matched pair, not a statistical benchmark. Frame
samples are short. Later closed samples were approximately +38 and +46 seconds,
with the app backgrounded by Files; they do not prove a memory leak was fixed.
A separate fresh Play-build reproduction grew from 162,142 to 678,327 KiB PSS,
but its source is unknown and it is not the controlled comparator.

## Device acceptance ledger

| Area                   | Observed result                                                                                                                           | Remaining limitation                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Startup/navigation     | Guest onboarding, online/offline cold starts, all five tabs and tested overlays passed                                                    | Expired authenticated session not exercised                                                 |
| Reader/search          | John 1; normal reference search John 3:16; full-text “God so loved”; no-result state; cold offline Psalm 119:176                          | Rapid-query races and touch scrolling not covered                                           |
| Offline/library        | Built-in BSB offline; Philemon audio download and cold offline playback passed; Wi-Fi restored                                            | No non-preinstalled text pack in current catalog; download cancel/retry not covered         |
| Notes                  | Synthetic QA create → force-stop/relaunch → edit → delete passed; empty list restored                                                     | Production annotations inspected read-only                                                  |
| Highlights             | Synthetic QA green highlight survived force-stop/relaunch; tapping its selected color removed it; final Highlights list empty             | Touch selection not covered                                                                 |
| Image export           | Actual image capture opened Android chooser with expected image; explicitly dismissed                                                     | No external destination selected or message sent                                            |
| Plans                  | Daily Proverbs browse/start/read Proverbs 27/complete/leave passed; empty QA list restored                                                | Cross-device sync and all schedule types not exercised                                      |
| Gather                 | Wisdom → Courage → Joshua lesson, Fellowship prompts, Story Scripture, Back passed                                                        | Authenticated group participation not exercised                                             |
| Audio                  | UI play/pause, app/Android Home, background auto-advance, native Next/Previous/Play/Pause; paused-session fix passed                      | Not every queue/rate/repeat combination; OEM shade rendering unverified                     |
| Lock/background        | Genuine Asleep/keyguard state; five-minute sample PLAYING with advancing output and John 3 → 4                                            | Fifteen-minute run interrupted; charging test only                                          |
| Sleep timer            | Background-awake playback paused automatically after 299.918 seconds; Off selected afterward                                              | Locked/deep-idle timer expiry not tested                                                    |
| Settings/accessibility | Maximum in-app Large/Dark reader passed; original QA Medium/Light and production Small/Dark/English preserved; native footer 546 verified | OS font scaling, TalkBack speech/navigation, and touch gestures untested                    |
| Auth/sync              | Guest path passed                                                                                                                         | No dedicated test account or second device supplied; QA OAuth/callback registration differs |

The offline Psalm screenshot precedes loading completion; the subsequently saved
UI hierarchy contains verses 175–176. It proves offline content availability,
not startup latency. Supported reference links established reproducible test
positions; they do not replace normal navigation coverage.

### Interrupted locked-audio run

At +300.4 seconds the phone was still asleep, John 4 was PLAYING, and speaker
output frames had increased from 15,185,920 to 28,772,352. At approximately
9 minutes 31 seconds Android recorded a power-key wake and subsequent user
activity. The ten-minute sample showed the unlocked phone paused on John 5 at
53.9 seconds. Neither test agent sent input during that interval. This supports
an external interruption; owner attribution is unconfirmed. It is neither an
app-failure result nor an uninterrupted fifteen-minute pass. No screen-timeout
or security setting was changed.

## Automated and artifact verification

With Node 22.23.2, `npm run release:verify` exited 0: **8,961 tests passed**, none
failed or skipped; workspace lint/typechecks and Expo configuration checks
passed. The 301 focused audio tests passed. The existing admin font lint warning
and 47 diagnostics outside the configured strict set remain. A bounded review
found 28 deferred diagnostics in test helpers and 19 production diagnostics with
guards or fixed-array/regex invariants; these remain type debt.

Local release builds use Hermes, release shrinking, OTA disabled, a separate QA
identity, and a local debug certificate. All 29 packaged arm64 libraries passed
16 KiB ELF alignment checks. Other bundled ABIs were not physically exercised.
The QA universal APK is approximately 171 MB; it is not the per-device Play
App Bundle download size. No EAS cloud build or GitHub Actions was used.

Final five-fix APK SHA-256:
`a0aa0123873619808c02e51051de5d3a441110bf255619effc5db43606daa210`.
Embedded bundle SHA-256:
`d7b761657211c60f8beeb3a6dadb693c48497fb7cb5a0e4db95624b9ff25a6a3`.
The final installed APK was pulled back and its SHA-256 independently matched
this artifact. Its source map matches all seven changed runtime modules. All native and DEX
entries are identical to the previous four-fix QA build; only the JS bundle changed.
The previous three-fix installed APK was pulled back and its SHA independently verified. In the background, Next selected John 4 PAUSED and Previous returned to John 3 PAUSED, retaining the same native media session and active transport notification with Previous/Play/Next actions. System Play then resumed John 3 through that same session. Native records prove presence and behavior; actual OEM notification-shade rendering remains unverified because shade expansion did not visibly respond in this control setup.

Comparator APK hashes:

- Baseline: `d7d99e0d7355c00655f4a3d3134e6e15a99d4cc3821d8220ce8b7a6dee906dea`.
- Thumbnail fix: `eceab9484cbcab3353a46df2125ee21b7beceacf046446d5d746026f8942698e`.
- Management-sheet fix: `aa1fc10f168e7ea0724efc4d37b8ce18fcf60e192522900e908c22f59ab51f73`.
- Paused-media fix: `6b95eeeee9ff93f6d2070f4ced9dc6f4a87d09f79b3f01e9e467b3d99e88a5ae`.
- Prior two-fix QA: `a533d27caf2339163d92cbbbdb3009707239554ae872dad085dbb16d22481bdc`.

Raw screenshots, logs, installed APK copies, source manifests, and mappings stay
in the task's temporary evidence directory outside the repository because they
may contain personal app state. The filtered capture has shown no app fatal
exception, ANR, or React Native error in exercised paths; this is not a guarantee
about uncaptured activity or untested flows.

## Recommendations and release gates

1. Complete a dedicated-account, two-device sync pass and a Play-signed in-place
   upgrade before release. The separate QA app cannot prove existing-user data
   migration or production OAuth callbacks.
2. Run touch/TalkBack checks, interruption/recovery during downloads, and an
   uninterrupted unplugged background-audio test on a lower-RAM phone. This
   MediaTek device is useful performance evidence but reports 7.5 GiB RAM.
3. Make note deletion more discoverable: currently clearing text and Done deletes
   it. This behavior passed but is easy to miss.
4. Clarify calendar-rhythm percentages. Daily Proverbs showed Day 27 of 31 / 87%
   because this is calendar position, as designed in `getActivePlanProgressRatio`,
   not 27 personally completed days. The actual completion ledger recorded only
   the test day's completion. No product redesign was included in this pass.

## Translation-management sheet finding

More → Translations → BSB more opened a persistently clipped management sheet.
On the 720 × 1600 display, the backdrop ended at y=1387, the header began around
y=1421, and the scroll viewport was only y=1557–1600. Download controls were
outside the viewport. An independent mirror screenshot approximately thirty
seconds after opening confirmed this was not the slide animation. Source uses
a percentage sheet height under flex containers; the scoped fix now supplies a reactive numeric height. The full release gate
passed again with all four fixes; physical retest passed: the sheet now begins at y=288, with Text, audio collections, and individual-book controls visible. A fresh settled screenshot and UI hierarchy confirm the geometry; the installed APK hash matches the four-fix artifact.

The current public catalog has no non-preinstalled text pack for a fresh-text
download test: its available text entry maps to built-in BSB; its other entry is
a hidden audio-only Berean variant. Every Language entries are audio-only.
Spanish entries exist in version metadata but are not offered by the available
catalog. No backend/catalog publication was changed. Instead, BSB Philemon (one chapter, approximately 1 MB) was saved through Chapter options → Download book audio. With Wi-Fi disabled, a cold restart played Philemon 1 and the QA audio track advanced; output frames increased from 46,956,544 to 47,867,904. These samples show muted gain, so this proves offline decoding/playback progress rather than audible speaker output. Wi-Fi was restored.

The pre-fix APK source map was checked against the then-current source: both the modal and shared styles matched exactly, including the existing `height: '82%'`. A standalone harness using the installed React Native Yoga engine lays out the percentage correctly; it does not reproduce the mounted Android failure. The implemented fix removes reliance on that percentage resolution by deriving an explicit numeric height from the reactive window dimensions. Physical remeasurement confirmed the explicit-height fix: top y=288 and height 1,312 pixels on this device.

## Five-minute sleep timer

Five minutes was selected while paused, then playback resumed and the app was
sent to Android Home with the screen awake. The native media session advanced
Hebrews 1 → 2 → 3, then paused at Hebrews 3 position 25.8 seconds, before any
foregrounding or user input. Native update timestamps were 7,496,214 at resumed
playback and 7,796,132 at pause: **299.918 seconds**. On returning to the app, Off
was selected. The timer freezes while paused by design, so the initially planned
315-second sample measured from selection was too early; the elapsed playback
timestamps are the relevant evidence. This is a background-awake timer pass,
not locked/deep-idle timer proof.

## Stale timer accessibility description

After successful timer expiry, the visual UI showed Off selected and the 5 min
chip unselected, but Android's hierarchy retained `5 min, 1 min` as that chip's
description. Installed RN 0.81 code explains the retention: TouchableOpacity
turns an omitted accessibility value into an empty map, while Android rebuilds
the native description only when that map supplies a text field. The fix sends
an explicit empty text value when a chip no longer has a value. Off and expiry
regressions failed before the change; all 24 scoped sheet tests now pass. On the
final installed APK, selecting five minutes produced `5 min, 5 min` with selected
true. Switching Off changed the chip to selected false and `5 min, `, with no
stale countdown. The remaining separator is produced by the native description
builder. This verifies native description clearing, not a full TalkBack
speech/navigation audit.

## Final device cleanup

The final five-fix QA build remains installed alongside the untouched production
app. Synthetic QA notes, highlights, and the test plan were removed; the bounded
Philemon download remains available offline. QA is on Home, playback is stopped,
and the sleep timer is Off. Wi-Fi is connected; Medium/Light/English QA settings,
original volume, and the original screen timeout are preserved.

Six exact task-created APK installers were removed from phone Downloads after
archival and hash verification, recovering 1,028,947,104 bytes (approximately
981 MiB). Unrelated Downloads content was preserved. The task's scrcpy mirror
and its child process exited, and the parent-owned logcat monitor was stopped.
No source changes were committed, pushed, or published.
