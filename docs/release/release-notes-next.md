# Release notes: next release (draft, not shipped)

Drafted 2026-09-24 from `origin/main` @ `195717e1`, then updated the same day to `d57229c6`
(section A2 and the second technical changelog) and to `3316e4b2` for tonight's 1.0.9
TestFlight build (section A3 and the third technical changelog). This is a draft. Nothing
here has been uploaded to App Store Connect or Google Play.

Phone testing still to do before release: `device-qa-checklist.md`. Decisions waiting on the
owner: `owner-decisions-2026-09-24.md`. TestFlight "What to Test" text for tonight's build:
`testflight-what-to-test.md`.

## Baselines

| What                                                          | Build                                                                                    | Source commit                                                  | Where it is                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| Last iOS build                                                | 1.0.9 (447), ASC id `8a085101-2a56-4933-9c3d-6b7c9531c1b1`, uploaded 2026-09-18, `VALID` | `adac656b` (per `docs/qa/2026-09-18-feedback-rating-cards.md`) | **TestFlight only** (Internal Testers)                        |
| Last public iOS release                                       | 1.0.8 (build 437, uploaded 2026-09-09)                                                   | about `fda08d60` / `f3134d3d` (inferred from upload time)      | App Store, `READY_FOR_SALE`                                   |
| Last known public Android release                             | 1.0.8, versionCode 483                                                                   | `6a29d4dc`+ (per the 1.0.8 release memory)                     | Play production. Not re-checked: the Play API was not queried |
| Next counters (EAS remote, read-only `eas build:version:get`) | iOS 447 → next 448; Android 491 → next 492                                               |                                                                |                                                               |

**Important:** App Store Connect has **no 1.0.9 App Store version**. Builds 440–447 only went
to TestFlight. People who install from the App Store are still on 1.0.8, so they have not seen
the 1.0.9 TestFlight work either. The store "What's New" drafts in `docs/release/whats-new/`
therefore cover **everything since public 1.0.8**, not only what changed since build 447.
Section A below lists the changes since 447, as requested. Section B lists the 1.0.9
TestFlight work that store users have not received yet.

Commit ranges: A = `adac656b..195717e1` (189 non-merge commits, 80 of them test/docs only).
A2 = `195717e1..d57229c6` (200 non-merge commits). A3 = `d57229c6..3316e4b2` (336 non-merge
commits, most of them tests, docs and file splits). B = `fda08d60..adac656b` (75 non-merge
commits).

---

## For users (plain English)

### A. New since TestFlight build 447

**Listening (Android)**

- Bible audio keeps playing with the screen locked. Play, pause, previous/next chapter, a
  seek bar and 10-second skips are available in the notification, on the lock screen and
  from wired or Bluetooth headphones.
- In discreet mode the lock-screen entry shows only "Now playing", with no book, translation
  or artwork.

**Reading Plans**

- Plan cards show your days as a compact dot grid. The tally now says it counts days.
- A slim header stays pinned at the top of a plan page when you scroll.
- From a plan reading you can swipe back (or use Android's Back button) to return to the plan.
- Opening a plan day no longer restarts audio you had paused.
- The empty "My Plans" screen now explains itself in a full sentence.

**Your account and your devices**

- Settings sync field by field. Changing the theme on one phone no longer undoes a font-size
  change you made on another.
- The first time you sign in, the choices you already made on the device are kept. They are
  no longer replaced by the account's default settings.
- If you leave a reading plan on one device, another device no longer brings it back.
- Morning, midday and evening plan sessions now sync between devices.
- Notes, highlights, bookmarks, your library, Gather and Four Fields progress belong to the
  account that made them. If someone else signs in on the same phone they don't see your
  data, and it comes back when you sign in again. Anything you did while signed out moves
  into your account the first time you sign in.
- Fixed: opening the app offline after a long break could clear unsynced reading progress,
  plan progress and streaks, and reopen onboarding.
- Deleting your account now also deletes your profile photo and any recorded feedback audio.

**Reader and Home**

- The follow-along audio highlight no longer lands on the previous chapter's text.
- The tab bar stays readable over the Bible text on iOS 26.
- Chapter tiles in the Bible browser fill each row evenly.
- On Home, "Next up" moves on to the next chapter once you finish the current one.

**Accessibility**

- Screen readers (VoiceOver/TalkBack) now name the audio controls, including skip, sleep
  timer, speed and the scrubber. They also name the plan, reader, Bible browser, translation
  picker, Settings and Learn controls, and screen titles are announced as headings.
- With large text sizes, labels, country and language names, and the Verse of the Day wrap
  onto new lines instead of being cut off or shrunk.
- Improved contrast on text drawn over the success colour and the reader's plan strip.

**Android**

- Floating buttons and the last controls on a screen are no longer hidden behind the
  navigation bar.
- The keyboard no longer covers fields in Feedback review and Settings.
- If Android has stopped showing the notification or microphone prompt, the app now offers a
  button that opens system Settings.

**Languages**

- Russian and Arabic now use their correct plural forms (for example, «5 дней», not «5 дня»).
  Before, Hermes had no plural rules and fell back to one/other.

**Translation teams**

- Each translation team now has its own passcode, which opens only that team's translations.
  Codes can be 6 to 12 digits long.
- If a code doesn't cover the translation you have open, the app says so, lists the
  translations it does open, and lets you switch to one of them.

**Speed**

- The app starts faster. About 15% fewer modules load before Home, and the startup
  JavaScript is roughly 0.7 MB smaller.
- Large downloads are checked in smaller pieces, so the app stays responsive while a
  download finishes.

### A2. Also new since build 447 (landed later on 2026-09-24)

**Search**

- Hindi, Nepali and other Devanagari-script searches find the whole word. Before, a search
  for प्रेम ("love") in the Nepali Bible matched about 21,000 verses; now it finds the few
  hundred that contain the word. Words with an apostrophe, such as "Father's", work too.
- Chinese, Japanese, Korean and Thai searches find words inside text written without
  spaces, and a single character is a valid search.
- Word search works in Bibles you downloaded. Before, it said "search unavailable". The
  app builds a search index in the background after the download, and gives simple results
  while it works.
- Typing "Jude 1", "Obadiah 1", "Philemon 1", "2 John 1" or "3 John 1" opens the chapter.

**Reading**

- Changing or removing a highlight on part of a longer highlight now works, and each verse
  shows one colour. Editing a note changes that note instead of adding a second one.
- While the next chapter or Bible is loading, the old text no longer shows the new
  chapter's highlights, and a tap in that moment is ignored.
- Switching Bible while audio is paused no longer starts the audio.
- Links and saved positions that point to a chapter that doesn't exist (such as Jude 2) are
  ignored instead of opening an empty page.
- Every Verse of the Day is now a complete sentence. Fourteen used to stop mid-sentence.

**Listening**

- Lock-screen, notification and headphone controls, and the sleep timer, keep working after
  you leave the reading screen while audio plays.
- The sleep timer pauses when you pause, and carries on when you play again.
- When a chapter finishes, Play starts it again from the beginning, and the lock-screen
  entry goes away at the end of a book or plan day.
- A half-finished audio download is never kept as if it were complete. Delete now stops a
  download that is still running.

**Reading plans, streaks and reminders**

- A missed day now breaks the streak, and Home no longer shows an old streak after you stop
  reading. Flying west across time zones no longer resets it.
- Finishing a plan day records every chapter in it as read, so it counts for the streak and
  the reading calendar.
- A weekly or monthly plan day ticked just after midnight counts for the night before.
- Monthly plans show one dot for each day of the current month.
- "Next up" on Home shows what you have not read today first.
- The daily reminder follows your setting: it changes language with the app, keeps the same
  local time after a time-zone change, follows a setting changed on another device, and
  stops after sign-out.
- Tapping the daily reminder opens Plans, or your plan if you have only one.
- Settings warns you if the daily reminder is on but the phone blocks notifications, with a
  button that opens the phone's settings. On Android this also covers turning off only the
  reminder category, and the category name follows the app language.

**Sign-in and your account**

- Password-reset links are safer. A link now works only on the phone that asked for it.
  Opened anywhere else, the app explains why and offers to send a new link. If someone else
  is signed in, the app says it will sign them out first.
- Signing out works straight away when you are offline.
- Opening the app offline with an expired sign-in no longer waits several seconds on a
  blank screen.
- Reading progress and plan progress are merged on the server, so two phones syncing at the
  same moment both keep their chapters and days.
- Deleting an account removes more: saved names on feedback, backup copies, and usage data
  still waiting on the phone. A former group leader can now delete their account.
- Clear cache and Delete account keep other accounts' private notes on the same phone.

**First run and languages**

- Setup stays in your language. Before, a French or Arabic user could see setup (and the
  app after signing out) in English.
- Android phones set to Indonesian start in Indonesian.
- On a phone set to Arabic or Urdu, the very first launch is no longer mirrored.
- If the Bible list can't load or a download fails during setup, the app says what went
  wrong and still offers the Bibles that work offline. Tapping a second Bible waits for the
  first instead of starting both.
- The language list is faster to search, and each letter appears as one section.
- All new wording was reviewed language by language in all 20 translations. The app now
  calls itself "Every Bible" everywhere.

**Learn**

- A lesson story is never blank. If your Bible has no text for it, the Berean Bible is used
  and named, and its audio plays.
- Story audio can be replayed after it finishes, a failed passage has a Retry button, and
  Share audio, Share text and Share link each do what they say.
- Opening a lesson from Home no longer traps the Learn tab on that lesson.
- Lesson progress can no longer read 11 of 10.
- The Four Fields key verses quote the Berean Standard Bible.

**Accessibility**

- Layouts on Home, Plans, the Bible picker, lessons, sign-in and Settings wrap or stack at
  the largest text sizes instead of cutting words off.
- Screen readers announce search result counts, highlight changes, saved notes, the chapter
  reached with the arrow buttons, the sleep timer choice and reading-calendar days.
- TalkBack no longer reads some error messages twice.
- Buttons have a clearer outline, and error text in dark mode is easier to read.

**Reliability**

- If one screen hits an error, only that screen shows an error page. The tab bar and Back
  still work. Before, the whole app was replaced.
- Damaged saved data no longer crashes the app on start.
- Anonymous error reports (no names or emails) are sent to the team, on Wi-Fi only, so
  problems can be fixed sooner.

**Speed**

- The app's built-in code is about a quarter smaller again, and it loads fewer pieces on
  start-up.

**Translation teams**

- The chapter feedback screen is now a simple list with Open and Done tabs. Each concern
  has "Mark addressed" and "No change needed", each with a short reason.
- The English text now calls the translator code a "passcode" everywhere.

### A3. New in tonight's 1.0.9 TestFlight build (landed in the evening of 2026-09-24)

Items already listed in A or A2 are not repeated here.

**Sharing**

- Sharing a verse as an image works every time. Before, on iPhone the share sheet often
  never appeared and the Share button kept spinning. The reference sits on a solid chip in
  the reader's text colour, so it is readable on every background, and the lettering uses a
  font that has the Bible's script (Hindi, Arabic and so on).
- Sharing the app from a Gather lesson now includes the link to everybible.app.
- A new profile photo shows straight away instead of the old one staying cached.

**Listening**

- Listening time is counted on the phone as you listen. Reading activity and your profile
  now show it, even before it syncs.
- iPhone: the wired or Bluetooth headset button (and CarPlay) pauses and plays Bible audio.
  Before, it could start a chapter but never pause it.
- After a phone call, audio resumes only if the call interrupted it. Audio you had paused
  stays paused.
- Background music pauses and plays with the narration, also after you leave the reading
  screen, and pauses when the next chapter fails to load.
- When the sleep timer runs out, the next chapter does not start.
- Auto-advance and the lock-screen next button skip chapters that have no audio in that
  Bible, instead of stopping on an error.
- A chapter you resume starts from where you left it, also after the app was closed.
- A stream that dies while loading shows an error and a working Play button, instead of
  spinning for ever. A speed picked while a chapter loads is kept.
- A download that runs out of space part-way tells you so.
- Android: the Now playing notification uses a neutral icon, and its progress bar stays put
  while paused.

**Reminders and notifications**

- A daily reminder turned on from another phone now shows a one-tap button to allow
  notifications on this phone. Before, it looked on but could never arrive.
- A reminder the phone fails to schedule is reported instead of silently looking on.
- The reminder time picker opens on the saved time, and the time is written in the app
  language's clock format.
- In discreet mode, notifications stay neutral.

**Discreet mode**

- The app no longer locks itself while its own prompts are open (microphone permission,
  profile photo picker and other system screens it raised).
- Unlocking takes you back to where you were in the reader.
- Android: the code form stays above the keyboard.
- The app still starts if the phone's keychain can't be read, and a failed icon change is
  reported and retried.

**Reading, Bibles and search**

- A Bible you switch to while offline is still chosen after the next launch.
- A full-text search with no results says "No verses match your search."
- Android: removing a highlight clears it at once, without reloading the chapter. Splitting
  or recolouring part of a highlight no longer reports an error.
- A chapter that loaded no verses is not marked read.
- A failed English download never falls back to a regional Bible, and a Bible picked while
  the saved one is still downloading at launch is kept.
- A book outside the catalog shows a way back.
- The reader, the Bible picker and Plans redraw less: tapping a verse redraws only its
  paragraph, and download progress no longer redraws Home or the picker.

**Reading plans, calendar and Home**

- Plan days count correctly overnight: a reading or listen after midnight counts for the new
  day, and Plans home, plan pages and the reading calendar move to the new date while open.
- The reading calendar is laid out as weeks of seven days, and its legend wraps at large
  text sizes.
- A double tap on a rhythm preset saves one rhythm, a rhythm's edits show on its open page,
  and a plan delete that fails says so.
- Home's greeting changes at noon and 5 pm while Home stays open, the Verse of the Day falls
  back to the Berean Bible (and says so) when your Bible lacks it, and Listen appears only
  when that audio can play.

**Offline and robustness**

- Stalled server requests time out, so spinners no longer hang for ever. Screens that need
  the server say "you're offline".
- Chapter feedback written offline is kept and sent on the next sync.
- Many fixes for damaged saved data, interrupted Bible downloads and storage errors.

**Size and permissions**

- The app takes about 45 MB less space: the built-in Bible was packaged twice.
- Android: the unused camera and "display over other apps" permissions are removed, so they
  no longer show on the Play listing.

### B. In 1.0.9 TestFlight builds (440–447) but not yet on the App Store

- **Reading:** the section heading at the start of a chapter is shown again. It was missing
  in 1,189 chapters, for example "Salvation Confirmed" over Hebrews 2:1. Highlights refresh
  straight away, and search results scroll to the verse you picked.
- **Languages:** the app's text was reviewed and corrected in all 20 non-English interface
  languages. The Tamil streak label no longer gets cut off.
- **Sharing:** sharing the Verse of the Day shares the verse and the photo only, without
  your name, greeting or the date.
- **Audio:** cancelling a whole-Bible or New Testament download now actually stops it.
  Downloaded chapters are checked so a broken or partial file isn't kept. You're told up
  front if there isn't enough space, and progress counts up while books download. Skipping
  backwards no longer jumps forward again, and play/pause taps made while a chapter is
  loading are no longer lost.
- **Offline Bibles:** downloading, installing and removing Bible text packs is more reliable.
- **Reading Plans:** plan content was audited and reading progress corrected.
- **Look and feel:** a squarer, tighter top bar in the reader. Settings and the lesson sheet
  use the new design. The side margin in the translation picker is back, and lesson
  numerals are no longer clipped.
- **Hindi:** the Hindi Contemporary Version no longer appears as installed when it has no
  text on the device.
- **Profile:** uploading a profile photo works again.
- **Sign-in:** a successful Apple sign-in no longer fails if the display name can't be saved.
- **Feedback:** Scripture Council and community chapter feedback are reviewed separately,
  and each response card shows a clear Accurate or Needs work colour.
- **Security and privacy:** password-reset links are confirmed before they sign you in, and
  the privacy PIN is stored hashed.

---

## Internal technical changelog (since build 447, `adac656b..195717e1`)

### Native / build (needs a new binary)

- `3aef164a` added `expo-media-control@1.0.12` (exact pin). Android only: it is excluded from
  iOS autolinking in `package.json`, and there is **no** config plugin in `app.json`.
  `patches/expo-media-control+1.0.12.patch` changes it to `START_NOT_STICKY`, stops the
  service in `onTaskRemoved`, makes labels localisable and fixes the coroutine scope race.
- `7674c4e4` adds `androidMediaSession.ts` and `androidMediaSessionModel.ts`, and routes
  `audioNowPlaying.ts` through them on Android. The iOS path is unchanged. The merged
  manifest now contains `FOREGROUND_SERVICE_MEDIA_PLAYBACK` and a `mediaPlayback` service,
  so a **Play Console foreground-service declaration is required** (see
  `play-foreground-service-declaration.md`). Device QA checklist:
  `docs/research/android-background-audio-2026-09-24.md`.
- The main checkout's `node_modules` does not contain `expo-media-control`. Run `npm ci` and
  confirm patch-package applied before a local Android build.

### Sync and auth (the backing migrations were applied to production 2026-09-24, per `5b8b4809`)

- `ff73b81b`, `87241da2`, `90eff6fa`, `de98fd6f`, `35f422cb`: per-field three-way preference
  merge. Uses `user_preferences.field_updated_at` and a trigger (`20260924023259`) plus a
  stamp backfill (`20260924023303`). Older builds keep working.
- `386a6ef1`, `389a97c0`, `b248ccaa`, `bda12ace`: reading-plan sync reads before it pushes
  and merges server echoes. Unenrol tombstones (`20260924023340`) and session columns
  (`20260924023342`).
- `768d388a`, `aa690b4d`, `7ccbf00a`: account-scoped private storage with guest adoption and
  idempotent merges. Four Fields leaves the sign-out reset list.
- `ad76bf6b`: an offline cold start with a retryable refresh failure is no longer treated as
  an auth boundary.
- `50890389`: account deletion removes storage objects (avatar, feedback audio).
- `df5861e7`: an inert Supabase client when backend config is missing, instead of a crash.

### Feedback / translator review

- `965eadfb`, `1ae09228`, `361a2cc9`, `20e9794d`, `2f8f13b6`, `c7e91a45`: per-team passcodes
  (`translator_team_passcodes`, applied as `20260924014137`), 6–12 digit codes and the
  `translation_not_covered` UX. The shared `TRANSLATOR_REVIEW_PASSCODE` still works during
  the transition, limited to `TRANSLATOR_REVIEW_PASSCODE_TRANSLATIONS` (default `bsb`).
  **Verify the updated `review-chapter-feedback` edge function is deployed** before shipping.
- `516bb87b`, `36394b54`, `aed09050`: review endpoint PII minimisation and a fail-closed
  lockout keyed on edge-stamped IPs.

### Backend security (server-side, already live or independent of the binary)

- `c0e6ba30`, `75ef4550`, `e4539fe7`, `82a11399`, `bc7c11f6`, `913a3f18`, `42a7ce21`,
  `4468e840`, `02491a2b`, `4d6003fd`, `42ca3954`, `a60de661`, `c70b1859`, `25c4aca4`,
  `d7e9f087`, `4e3ff623`, `fe99d292`: service-only grants revoked, pg_net EXECUTE revoked,
  public bucket listing closed, profile email kept in step, analytics ingest
  throttle/budget/body cap, group-scope pinning and join-code rate limit, catalog reads
  limited to available rows, admin-only catalog columns moved to `translation_catalog_admin`.

### Performance

- `3e1078c1`, `376d4789`, `1b92c979`, `39e20661`: boot graph trimmed. 1,329 → 1,127 modules
  before Home, 6.67 → 5.95 MB unminified (iOS export).
- `419419b4`: the audio interpolation tick runs only while the reader is mounted and the app
  is active. Catalog refreshes are shared. Unchanged progress writes are skipped. Optional
  reporting is gated on connectivity.
- `cbf67feb`: text-pack and audio hashing in bounded chunks.

### i18n

- `8a75e3ac`: `Intl.PluralRules` polyfill (CLDR cardinals for the 21 locales), installed only
  when the runtime lacks it.
- `20e9794d`: 5 new strings, translated into all 21 locales.

### Accessibility

- `fa11ecfc`, `5c237660`, `8c8f5687`, `297cd4a9`, `1388ec6c`, `bf1d284d`, `f1aaf10a`,
  `b495c33c`, `cbca48d3`, `57608edc`, `40507d5e`, `996af07f`, `d6e3ce57`, `c0e587be`,
  `24df1f9c`, `898aed74`.

### UI fixes

- Plans: `195717e1`, `d61a66e3`, `adb92126`, `a9097fde`, `b038c325`, `9679b6b4`, `495a84dc`.
- Reader, tabs and home: `7e17d2e2`, `7539226d`, `f13cc1d6`, `791507c2`, `a8a62c5b`.
- Android: `6193c4a4`, `bab8f42b`, `09becc47`.

### Refactors with no intended behaviour change

- `6cb29cef`, `be4ab99d`, `31e75004`, `ac97684b`, `63e36e62`, `349b5418`, `a0f7735a`,
  `68d8d89f`, `90a0bc72`.

### Web / admin (not in the mobile binary)

- Site: `51956da4`, `bf295bd1`, `21307837`, `a8e554b8`, `93775870`, `7e5a7115`, `46535d0d`.
- Admin: `ce1ae776`, `55f8f554`, `b0b25c39`, `b93e5e43`, `505c3142`, `984f2d39`, `6bc50fad`.

### Tests and docs

- 80 commits, mostly the move from source-text/vm tests to behavioural tests run with
  `mock.module`.

---

## Internal technical changelog, part 2 (`195717e1..d57229c6`)

200 non-merge commits: 49 test/docs, 15 chore/style/build. The user-visible ones are in A2.

### Native / build (needs a new binary)

- `4712f1ad`: `expo-localization` `supportsRTL: false` in `app.json`, plus
  `ExpoLocalization_supportsRTL=false` in the committed iOS `Info.plist`.
- `34479d1a`: new iOS build phase (`plugins/withReleaseAtsLockdown.js`) strips
  `NSAllowsLocalNetworking` from non-Debug builds.
- `67cab515`: `flowType: 'pkce'`, and a `crypto.getRandomValues` shim backed by
  `expo-crypto` (installed only when missing). `0f636d8c` refreshed `Podfile.lock` for
  `expo-updates` and `expo-crypto`.
- `30f65e44`: 4 GB Gradle heap at prebuild; `android/app/build.gradle` is no longer tracked.
- `1cca0ec1`: Babel plugin keeps `u`-flag regexes native on Hermes (iOS bytecode
  14.38 → 10.77 MB). Also round 3 of the performance pass (bundle 4,545 → 2,207 modules),
  `62ca2bd4` (verse timings packed per translation) and `38ce9bc2` (Gather artwork loaded
  one SVG at a time).

### Sync and auth

- `333bf312`, `c12031be`, `1cb66cf9`: `merge_user_progress` and plan-progress merge RPCs,
  both refusing payloads for another account (live as `20260924041000`, `20260924035821`,
  `20260924051658`).
- `5ace46b0`, `47fc5cc1`: an offline expired-session restore no longer holds first paint;
  cold-start analytics wait for the restore.
- `67cab515`, `24018376`, `00902ea1`: PKCE reset links; sign the current account out before
  the exchange; hear a reset link that arrives while startup restores the session.
- `8947d3c0`, `2b39d13b`: offline sign-out; local sign-out when the server can't be reached.
- `c446e8d2` (live as `20260924041136`), `728f1f40`: account-deletion leftovers; other
  accounts' private buckets kept on Clear cache / Delete account.

### Reader, search and Bible data

- `e163d4f9`, `8b3a10f9`, `17697c16`, `58588858`: Devanagari/apostrophe FTS phrases, CJK and
  Thai `instr()` search, on-device FTS index for text packs, one-chapter book references.
- `666d8612`, `1864509b`, `f66bd411`, `b8ad6dcb`, `bd17a494`: highlight and note edits over a
  selection; annotations held back until the new text loads; paused audio stays paused on a
  translation switch.
- `9d75340b`, `12a9240a`: reject deep links and stored positions for missing chapters.
- `8564905f`: a server `is_bundled` flag can no longer create a phantom bundled translation.
- `caf39f66`, `b70ee78a`, `5b37648f`, `60d089d8`: text-pack download and activation edge cases.
- `8c433fc9`: plain-http catalog media upgraded to https in release builds.
- `6917cbfe`: the Every Language dev signing key is trusted only in dev builds.
- `3d1682ec`: Verse of the Day ranges widened to full sentences.

### Audio

- `89357ef6`, `46f03c54`, `45270d18`, `56612231`, `0151005f`, `cf2df288`: remote commands and
  the sleep timer outlive the reader; the sleep timer pauses with playback; replay after
  finish; finish ordering; seek clamp.
- `363112e5`, `78d3b4f2`, `3c20d0e1`, `9d76195b`: partial downloads never trusted, Delete
  stops a download, share-export path validation.

### Plans, streaks, reminders, notifications

- `a049ff89`, `554a264f`, `7612e54f`, `60ef2d7e` / `1925a1e0`, `0a1526a7`, `c7c11bb4`,
  `2e422255`, `594ca0d9`: streak rules, plan-step reads, midnight grace, monthly dot grid,
  Next up order, leave-plan confirmation, tab bar hidden for an early plan-session reader.
- `1394e0d2`, `aee13d73`, `c72078de`, `a99af456`: reminder reconciler, tap opens Plans,
  blocked-notifications notice, Android channel check and localized channel name.

### Onboarding and i18n

- `831bca51`, `1567367c`, `92aacec5`, `a43cfc8f`, `9f1a2b51`, `61e8edca`, `60263b41`,
  `e3d04d1d`: stored language applied only after onboarding, legacy Android codes,
  contiguous letter sections, queued second download, failure copy, faster list.
- `6787d0c0`, `20575fd2`, `9d687c57`, `bc1c7c10`, `16c79240`, `8c06e4a2`: strings that
  bypassed `t()`, the "Every Bible" display name, count-of-one agreement, "passcode" wording.
- `09898e55`, `a1102f06`, `340aee0e`, `09c39ac2`: native review of the new strings in the 20
  locales. The Portuguese feedback strings moved from European to Brazilian Portuguese to
  match the rest of `pt.ts`.

### Learn / Gather

- `f3dfc0f1`, `2c82ee68`, `36db50dc`, `965bb5d1`, `4485038e`, `d31b7fd8`, `b6eb48af`,
  `71d20d2c`, `2cb635f9`, `8dbbad0c`: route fix, BSB fallback, replay, retry, share actions,
  catalog-side counts, localized up-next reference, lesson sound ownership, BSB key verses
  (no NIV wording remains; a data-integrity test guards it).

### Crash-proofing and crash reporting

- `79d2785f`, `8d122274`, `e80b946e`, `75d9ecd1`, `fe03a779`: per-screen and root error
  boundaries, sanitized persisted stores, safe Diagnostics rows, privacy lock fails closed.
- `2af3cc14`, `c5a988c6`, `90f37bf3` (live `app_error_reports`, edge function
  `report-app-errors` v1), `73ac6335`: scrubbed crash-report queue, collector, retention,
  admin App errors page.

### Accessibility

- `ef1482f3`, `47a00b40`, `e5c5e029`, `9862b56e`, `bf0cdcc9`, `70fa3bee`, `2105fbbc`,
  `e3345f93`: large-text layouts, screen-reader pass, announcements, TalkBack double read,
  3:1 control outlines and dark error contrast.

### Translator feedback

- `35146fdf`, then `2415c3d2` and `928459a3`: feedback inbox, then a plain reading list with
  reasoned decisions. `41dcce00`, `16dba894`: a decision saved after closing, trimmed
  passcode.
- `314c199a`: admin switch and usage log to retire the shared passcode.

### Groups and Prayer Wall (still switched off in the app)

- `bb83ca33`, `86e44269`, `c509c68c`, `2ea3df78`, `d041075f`, `9d61f7ef`, `f4a90331`: leader
  read and leave guard, atomic `create_group`, join throttle, server-written group pushes,
  prayer wall hardening, report/block/filter/ban. The migrations are live and
  `send-group-notification` v2 is deployed. None of it is reachable until `studyGroupsSync`
  is turned on.

### Backend (live, independent of the binary)

- `d29af195`, `34110778`: edge functions trust only edge-stamped IPs, cap public bodies and
  bound Expo push. Deployed 2026-09-24 (checked with `list_edge_functions`:
  track-analytics-events v14, track-anonymous-usage-events v13, aggregate-engagement v7,
  review-chapter-feedback v14, submit-chapter-feedback v7, send-group-notification v2).
- `db9cbec4`: `20260710095000_capture_live_only_objects.sql`. Record it on production with
  `supabase migration repair --status applied 20260710095000`; do not run it there.

### Web / admin (not in the mobile binary)

- Site: `d6102727`, `af50d88e`, `82b21dec`, `f178c74b`, `36913465`, `c3600f69`.
- Admin: `88d31edd`, `5b64f0b9`, `33391d37` (the session middleware now actually runs),
  `258ce823`, `82ceea05`, `e4c94c3e`, `5322a437`, `e45ba376`, `4faf9234`.

---

## Internal technical changelog, part 3 (`d57229c6..3316e4b2`)

336 non-merge commits. Most are characterization tests and file splits with no intended
behaviour change. The user-visible ones are in A3.

### Native / build (needs a new binary)

- `edf5661b`: the bundled `bible-bsb-v2.db` was packaged twice. The `expo-asset` plugin
  entry in `app.json` and the matching pbxproj "Copy Bundle Resources" entry are gone; the
  Metro asset copy is the only one (−44.7 MB). Existing installs keep their imported copy.
- `7adbbed5`: the native now-playing module sends `toggle` for `togglePlayPauseCommand`.
  Older binaries keep sending `play`.
- `bcaaf226`: `blockedPermissions` removes `CAMERA` and `SYSTEM_ALERT_WINDOW` from the
  Android manifest. `RECORD_AUDIO` stays.
- `e1eefea0`: required-reason APIs declared in `app.json` `privacyManifests`. `e9a4d95b`:
  the feedback purpose string is the base microphone description.
- `25c6357d`: neutral small icon on the Android Now playing notification.
- `b21cd441`: Gradle metaspace cap raised so local release builds finish.

### Audio

- `847a7626`, `c9ad6e6d`, `3a54dd02`, `c6505bc7`: listening time banked on the device as it
  plays; Reading activity and Profile show device or cloud minutes; one telemetry timer
  across reader mounts.
- `8cd2547c`, `ca48b8eb`, `5029bd2a`, `c6250bed`, `09477d10` (new
  `services/audio/audioChapterCoverage`): call interruption, music bed, sleep timer holding
  the next chapter, per-translation coverage for auto-advance.
- `41ecf30b`, `a7f77268`, `dec4200d`, `491b9974`, `22d24751`, `76bbfe8f`, `8eb2175a`,
  `1f66fddc`, `2037c14d`, `1d63f34b`, `234ec2db`, `51a26ac2`: resume offsets, loading vs
  paused state, dead-stream recovery, speed kept mid-load, out-of-space, first concurrent
  failure reported, Android notification progress on pause.
- `3f04a3f4`, `e2e00b31`, `4fce9334`, `98aa3da8`: `useAudioPlayer` (1,666 → 510 lines),
  `audioDownloadService` and `PlaybackControls` split into modules; pure player models.

### Privacy (discreet mode)

- `240b9b0f`, `40ea1e2b`, `5e248e78`, `af32ac83`: lock grace while the app's own system UI
  is up (not for share sheets). `9151392f`: restore the reader route after unlock.
- `fb8e11f8`, `aca9ad77`, `ea315f52`, `d8dbb918`: keychain read failure, icon change retry,
  Android-only code-form keyboard avoider.
- `b65cda52` (P2-11), `086ae916` (P2-12), `04592e4f` (P2-13): neutral notifications,
  keychain wiped after an iOS reinstall, scrubbed on-device crash log.

### Reader, sharing, translations and search

- `9188c0f0`, `d5b0395f`, `d53d7f63`, `4c49d662`: verse-image share after the picker's
  `onDismiss`, opaque reference chip, script-aware font, versioned avatar URLs, share-app link.
- `20ab9b02`: the current-translation choice carries its own timestamp, so an offline switch
  wins over an older saved primary. `74743dce`, `09a7bc73`, `aee2e1b6`, `ce85a88e`,
  `9654109a`, `74a4a4bb`: download fallbacks, launch-time pick kept, labels by id, picker
  load recovery, onboarding "Continue" only for user downloads.
- `f179f998`: visible "No verses match" message. `dd1e9640`, `24e308c1`: highlight removal
  and splitting. `7cda2e81`, `c1ef07b3`, `c16496f6`, `864dede9`, `69ad3119`, `820e947d`.
- Links: `d919e3d5`, `b77bd519`, `a55572c6`, `f62f8a73`, `17007586`.
- Text packs and the Bible DB: `3224b9b1`, `9ec96038`, `e0f880d1`, `e61cde89`, `019e66ee`,
  `2fbb774f`, `0ad3e1be`, `a31f3e74`, `e83a4022`, `9315ec86`, `0f0c14a8`.

### Plans, calendar, reminders and Home

- `43d0c33f`, `bfc56035`, `b32c2573`, `96306e6c`: after-midnight day attribution; Plans
  home, rhythm detail, plan detail and the calendar follow the date overnight.
- `48730fd2`, `0bfbc5a6`: calendar as week rows of seven; legend wraps.
- `e9bf1d28`, `571753e4`, `d0a7617f`, `16234a0a`, `ca49c73c`, `069c69e0`, `d85c8ba3`,
  `586d1738`, `6df1e4cd`, `f54790a5`, `ed0bed2b`, `8391e4e0`, `95b8580c`, `c1bb46ce`.
- `36538d0c`, `a9a13049`, `344b31d8`, `3be73fc2`, `10d6ac48`, `32769c96`, `ceb8eee9`: synced
  reminder without permission (one-tap allow), push token after a mid-session grant,
  schedule failure, picker time and clock format.
- Home: `2281619c`, `8176259b`, `7a52e494`, `2b9be352`, `98b259d6`, `99f31a24`, `672552f8`,
  `562dfa0a`.

### Sign-in, sync and storage

- `d4df97ac`, `19658334`, `76f1780a` / `43c4dad4`, `fce55651`: Apple double-tap guard, late
  recovery session ended, reset verifier kept across the pre-exchange sign-out, trimmed email.
- `8616c8b1`, `3aaf5959`, `3289736d`: client-side bounds on read dates and chapter times,
  plus server-side migrations that the commits themselves mark **not applied**
  (`20260924122045_merge_user_progress_clock_bound`,
  `20260924111958_merge_user_progress_same_day_ties`). Check `list_migrations` before
  release.
- `6f273f0a`, `ab9e7c09`, `c86984c5`, `bf883147`, `3ae8d624`: MMKV and AsyncStorage failures,
  interrupted guest adoption, translator-review hydration.
- `791fd9e6`, `2be97353`, `ddd721bb`, `5b1bd3ed`: Supabase request timeouts, offline
  messages, offline chapter feedback queued.

### Diagnostics

- `27c96d0e`, `495305e1`, `b00265d5`, `32b9c633`, `f7b5da5c`, `7b3f2f8f`, `e166850d`: audio
  and text-pack failures reported, startup warm-up failures, reports sent at launch,
  `reportHandledError`, redaction and message-encoding fixes.

### Performance

- `c2927e9c`, `16f2bc33`, `75e44cd9`: reader redraws only the tapped paragraph; memoized
  verse list and follow-along sheet.
- `b07dfd7a`, `be0b4831`, `56b5705c`, `f7a9349b`, `f1cb2a9b`: picker indexes and rows stay
  still on audio ticks and host re-renders.
- `d615aa12`, `eebb3f5c`, `a31ab4e4`, `908a3db0`, `3004ee65`: Plans rows and date formatters.
- `174b4834`, `d4abf674`, `b34e1b8b`, `45a86372`, `5faf42c7`, `39e662fd`, `ec06e95c`,
  `f9b054b8`, `3ac26829`, `e927e499`, `514971b1`, `d07591dc`: startup and provider re-render
  trims.
- `b102fd49`, `2ccaa122`, `730744b1`: lossless image recompression.

### Accessibility and i18n

- `11295a67`, `f4b46fcf`, `de195358`, `edeb2a9b`, `ba37db1e`, `4d1c0d87`, `b7a0246e`.
- `a0bd5fb1`, `26f8dd27`: native review of the new strings across all 20 locales.

### Feedback, Gather, Prayer Wall and groups

- `9180ce4e` (`20260924121042_chapter_feedback_client_submission_id`), `83e51ebd`,
  `1a04baaa`, `d9f28b50` (`20260924113023_feedback_submission_budget`), `0b935009`,
  `09c40d8b`, `03cb5716`, `c14907a5`.
- Prayer Wall and groups (still switched off): `5223bee6`, `cc9f4722`, `78e1f1f5`,
  `36dd603f`, `6219c0f0`.

### Backend (server-side; deploy and migration status not checked for this draft)

- Edge functions changed: `_shared`, `aggregate-engagement`, `report-app-errors`,
  `review-chapter-feedback`, `send-group-notification`, `submit-chapter-feedback`,
  `track-analytics-events`, `track-anonymous-usage-events` (`f70af308`, `350337a1`,
  `72d43ad5`, `77551abe`, `cd011160`, `21d9641a`, `28dad6ef`, `e991ba3b`).
- 13 new migrations, `20260924080029` to `20260924122045` (`85b0ad73`, `97eb982f`,
  `291bc7fa` and the ones above). Diff `list_migrations` against the repo before shipping.

### Refactors with no intended behaviour change

- Files split into modules: `bibleStore`, `useAudioPlayer`, `readingPlanService`,
  `readingPlansStore`, `persistedStateSanitizers`, `audioDownloadService`,
  `TranslationPickerList`, `RhythmDetailScreen`, `RhythmComposerScreen`,
  `ReadingActivityScreen`, `AuthScreen`, `ResetPasswordScreen`, `PlaybackControls`. Persisted
  bytes were pinned by tests before each store split.

### Web / admin (not in the mobile binary)

- `2d5d6865` (security headers), `169212fb`, `9529168b`.

---

## Store copy files

| File                                       | Use                       | Limit           |
| ------------------------------------------ | ------------------------- | --------------- |
| `docs/release/whats-new/<locale>.txt`      | App Store "What's New"    | 4000 characters |
| `docs/release/whats-new/play/<locale>.txt` | Google Play release notes | 500 characters  |

The App Store text leaves out Android-only items. The Play text leads with lock-screen audio.

**Update 2026-09-24 (A2):** only the English files (`en.txt` and `play/en.txt`) were
rewritten to include the A2 changes. es, fr, pt, ru, id, de, ja, tr, vi and ko were then
re-translated from the new English (both App Store and Play), and so were zh, hi, ar, bn,
ur, pa, mr, te, ta and ne. All 21 locales now match the new English.

**Update 2026-09-24 evening (A3):** `en.txt` and `play/en.txt` were rewritten again to add
the A3 changes (verse-image sharing, listening time, audio fixes, discreet mode, reminders,
overnight plan days, the calendar, the offline Bible switch, "no verses match", the 45 MB
smaller app). All 20 other locales in both folders were re-translated from that English.

Locale mapping when a store localization exists:

| App locale | App Store Connect | Google Play    |
| ---------- | ----------------- | -------------- |
| en         | en-US             | en-US          |
| zh         | zh-Hans           | zh-CN          |
| hi         | hi                | hi-IN          |
| es         | es-MX / es-ES     | es-419 / es-ES |
| ar         | ar-SA             | ar             |
| fr         | fr-FR             | fr-FR          |
| bn         | (none)            | bn-BD          |
| pt         | pt-BR             | pt-BR          |
| ru         | ru                | ru-RU          |
| ur         | (none)            | ur             |
| id         | id                | id             |
| de         | de-DE             | de-DE          |
| ja         | ja                | ja-JP          |
| pa         | (none)            | pa             |
| mr         | (none)            | mr-IN          |
| te         | (none)            | te-IN          |
| ta         | (none)            | ta-IN          |
| vi         | vi                | vi             |
| ko         | ko                | ko-KR          |
| ne         | (none)            | ne-NP          |
| tr         | tr                | tr-TR          |

Both store listings are **en-US only** today. The 1.0.8 App Store version has a single en-US
localization, and `scripts/publish_google_play_listing.mjs` hard-codes `en-US`. The other 20
files are ready for when localized listings are added. App Store Connect accepts "What's
New" only for locales that have a version localization, and it has no Bengali, Urdu, Punjabi,
Marathi, Telugu, Tamil or Nepali storefront locale. `eas submit` does not set Play release
notes; add them in Play Console or through the Publisher API track update.
