# Release notes: next release (draft, not shipped)

Drafted 2026-09-24 from `origin/main` @ `195717e1`. This is a draft. Nothing here has been
uploaded to App Store Connect or Google Play.

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
B = `fda08d60..adac656b` (75 non-merge commits).

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

## Store copy files

| File                                       | Use                       | Limit           |
| ------------------------------------------ | ------------------------- | --------------- |
| `docs/release/whats-new/<locale>.txt`      | App Store "What's New"    | 4000 characters |
| `docs/release/whats-new/play/<locale>.txt` | Google Play release notes | 500 characters  |

The App Store text leaves out Android-only items. The Play text leads with lock-screen audio.

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
