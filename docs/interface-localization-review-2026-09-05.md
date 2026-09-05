# Interface localization review — 2026-09-05

Reviewed checkout: `main` at `ec736d5a9466e9e6fdf0f2e0b5b598b391e83bce` plus the uncommitted workspace changes.

## Scope and changes

The mobile app supports 21 interface languages: English, Chinese, Hindi, Spanish, Arabic, French, Bengali, Portuguese, Russian, Urdu, Indonesian, German, Japanese, Punjabi, Marathi, Telugu, Turkish, Tamil, Vietnamese, Korean, and Nepali.

Every locale now contains all 1,505 English source keys. This pass added 178 strings per locale and corrected existing copied English, damaged translation markers, contextual mistranslations, Bible book names, and outdated reading-plan descriptions. Arabic, Russian, Spanish, French, and Portuguese also have the additional plural forms their languages require.

Previously hardcoded surfaces now use the selected interface language:

- Audio controls, music choices, sleep timers, accessibility hints, download progress, and playback errors.
- Group instructions and sharing, prayer timestamps, book references, and visible book companion cards.
- Prayer rhythm presets and descriptions, saved built-in rhythm titles, and passage references. Custom user titles remain unchanged.
- Calendar month/day labels and dates in Home, activity, annotations, feedback, diagnostics, and groups.
- All 249 country names in all 21 languages, including an offline fallback when the mobile engine lacks `Intl.DisplayNames`. The generated CLDR data is 181,038 bytes and loads lazily.
- Camera, microphone, photo-library, and Face ID permission explanations in native iOS resources.

Fixed an audio error path that replaced translated failures with the English store default. Three regression tests reproduce unavailable chapter, failed lookup, and failed playback through the actual hook callback and store actions.

Live simulator testing additionally exposed Home using the device locale for its date, and country names falling back to English on the mobile engine. Both now have regression coverage and were verified in French and Nepali after rebuilding. Arabic settings and navigation wording also received a final contextual correction pass.

## Prevention

Locale checks require complete keys, exact interpolation tokens, required plural categories, nonblank values, and no translation artifacts. English equality exceptions are now exact locale/key/value entries for legitimate cognates, proper names, units, and email examples; entire feature areas are no longer exempted. Runtime tests load every bundled locale with fallback disabled. Source checks cover static translation calls, JSX text, and literal accessibility labels/hints.

Native permission resources are generated from the same locale files with `npm run i18n:native`. `npm run i18n:native:check` and the workspace tests detect stale resources. The Tolgee workflow and CLAUDE.md document maintenance. The legacy translation helper now requires its API key through the environment.

## Verification

- Focused locale/source/render/native tests: 30 passed.
- Updated audio/control/about/plan source regressions: passed.
- All 21 native InfoPlist.strings files: `plutil -lint` passed.
- Android production export: passed.
- Final `npm run release:verify`: passed with 1,614 tests, zero failures or skips, workspace lint/typechecks, and Expo configuration validation. The admin lint retains its pre-existing nonblocking font warning.
- iOS Release simulator build: passed, including the final rebuild with Arabic wording corrections. The installed final build showed the corrected Medium, theme, feedback, sharing, continue, and navigation labels.
- Live iOS 26.5 / iPhone 17 Pro Max simulator: French onboarding, settings, calendar, Home date and country; Nepali settings, Bible book names, reader/audio controls, date and country; Arabic settings, Home date, and Plans. Nepali and Arabic selections survived relaunch; Nepali also survived installing the rebuilt app.
- The built app contained all 21 native locale resources with all 84 permission values matching the sources.
- Android was verified through production bundle export and shared tests; no Android device/emulator run was performed.

## Final evidence

The final Release bundle SHA-256 is `9d96c1bb3729100470dab74b0b37fe96fdbaea7a9c37d449eda74861f745546a`. Foundation also recognized all 21 app localizations. Native permission values were compared against the source JSON again after the final build.

Local evidence from this run:

- `/tmp/eb-i18n-release-verified.log`: complete release verification, 1,614 passing tests.
- `/tmp/eb-i18n-ios-verified.log`: successful final iOS Release build.
- `/tmp/eb-i18n-android-verified.log`: successful final Android production export.
- `/tmp/eb-i18n-build-receipt.json`: bundle hash and verification receipt.
- `/tmp/eb-i18n-fr-home-final.png`, `/tmp/eb-i18n-fr-calendar.png`, `/tmp/eb-i18n-ne-audio.png`, `/tmp/eb-i18n-ar-settings-verified.png`: inspected UI captures.
- `/tmp/eb-i18n-ui.ad`: saved simulator interaction sequence.

The temporary localization simulator was removed after verification. The original simulator remained shut down with its original data and last-boot state. The pre-existing Info.plist edits were preserved byte for byte.

## Boundaries

This work covers the bundled mobile interface. Scripture, user-authored content, remote provider titles/descriptions, product names, and diagnostic data retain their original meaning and provenance. Automated coverage and contextual agent review do not replace native-speaker editorial approval of every phrase.

iOS permission prompts follow the device or per-app OS language; the in-app picker controls the JavaScript interface. Native permission changes require a new native build. No app-store publishing or production deployment was performed. Existing unrelated work and native version changes were preserved.
