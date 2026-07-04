# Deferred i18n — net-new keys for the reviewed translation pass

**Why deferred:** the polish pass fixed everything except introducing brand-new user-facing strings. Adding any key requires a real (non-English) translation in **all 25 non-English locales** (`coverage.test.ts` enforces identical keysets + non-English values). Machine-translating scripture-app copy into Nepali/Tamil/Urdu/etc. without native review is risky, so these were left for a proper pass.

**Status of the code today:** the *behavioral/visual* half of each finding is already done (haptics, touch targets, contrast, onAccent, tabular-nums, etc.). What remains below is only the string extraction. A few were shipped with `t('key', { defaultValue: '…English…' })` so they render correct English now and only need the key + 25 translations added (marked ✅ safe-now).

## How to complete each key
1. Add the key to `src/i18n/locales/en.ts`.
2. Add a translated value to all 25 other locale files (ar, bn, de, es, fr, hi, id, ja, ko, mr, ne, pa, pt, ru, ta, te, tr, ur, vi, zh — plus any others in `SUPPORTED_LANGUAGES`).
3. Replace the hardcoded string / drop the `defaultValue` at the call site.
4. `node --test --import tsx src/i18n/locales/coverage.test.ts src/i18n/locales/coreLocaleCoverage.test.ts` must pass.

---

## Bible reader
- `bible.fontsAndSettings` "Fonts & Settings" — BibleReaderScreen (×2 call sites, hardcoded)
- `bible.allSettings` "All Settings" — BibleReaderScreen (hardcoded)
- `bible.previousChapterHint` "Goes to the previous chapter" — BibleReaderScreen a11y hint (mirror existing `bible.nextChapterHint`)
- `bible.chapterActions` "More actions" — overflow header button a11y label (role already added)
- `bible.relatedVerses` "Related Verses" — CrossReferencePanel (component not yet mounted anywhere; hardcoded)
- `bible.noSearchResults` "No results for \"{{query}}\"" — BibleBrowserScreen + TranslationPickerList. **NOTE:** the zero-result empty-state UI was NOT added (no fitting key); add UI when the key lands.

## Common / a11y
- `common.close` "Close" — used by AuthScreen, ResetPassword, AudioPlayerBar, BibleBrowser, TranslationPickerList close/clear buttons (role + hitSlop added, label deferred). Does not currently exist.
- `common.clear` "Clear" — BibleBrowser/TranslationPickerList clear-search (only `settings.clear` exists)
- `common.shareApp` "Share App" — LessonDetailScreen
- `auth.showPassword` / `auth.hidePassword` — password eye toggles (AuthScreen + ResetPassword; role added, label deferred)

## Audio
- `audio.backgroundMusicTitle` "Music and sounds", `audio.backgroundMusicSubtitle` — PlaybackControls
- `audio.backgroundMusicA11y` "Background music: {{label}}", `audio.repeatCycleHint`, `audio.showText`, `audio.shareHint` — PlaybackControls a11y
- `audio.pauseChapter` / `audio.playChapter` / `bible.previousChapter` / `bible.nextChapter` — ReaderPlaybackDock a11y
- `audio.returnToPlaying` "Return to {{reference}}, now playing" — AudioReturnTab a11y
- **Option data** (`src/types/audio.ts` `SLEEP_TIMER_OPTIONS`, `src/constants/backgroundMusicCatalog.ts`): move `label`/`description` display strings ('Off','5 min','1 hour', music names) to `labelKey`s and render `t(option.labelKey)`. Data files were left untouched. The sleep-timer modal "selected" state is also blocked on this.

## Reading plans / rhythms
- `readingPlans.durationDaysShort` "{{count}}d" — PlansHome badge
- `readingPlans.start` "Start" — PlansHome (currently uses an English `.replace()` hack on `startPlan`)
- `readingPlans.deletePlanConfirmTitle` / `deletePlanConfirmBody` — PlansHome swipe-delete confirm (confirm dialog NOT yet added there; ReadingPlanList's equivalent IS added, see below)
- ✅ `readingPlans.removePlanConfirmTitle` / `removePlanConfirmBody` — ReadingPlanList swipe-delete (shipped with `defaultValue`, works in English now)
- ✅ `readingPlans.dayRowA11y` "Day {{day}}: {{refs}}" — ReadingPlanDetail a11y (shipped with `defaultValue`; `refs` are already translated via `getTranslatedBookName`)
- `readingPlans.currentDayRowA11y` / `dayRowA11y` / `sessionActionA11y` — PlanDetail DayRow a11y labels
- `readingPlans.rhythmAllDoneTitle` / `rhythmAllDoneBody` — RhythmDetail empty-sequence copy (currently misuses "no rhythms" copy)
- `readingPlans.category.*` — ReadingPlanList category chip (one key per catalog category; currently `category.replace('-',' ')`)
- **`readingPlans.rhythmComposer.*` (~20 keys)** — RhythmComposerScreen is almost entirely hardcoded English: anyTime, historicRoots, includes, notFound, heroTitle "Historic rhythms", heroSubtitle, heroBody, prayerAndScripture, tapToAdd, `presetsCount` "{{count}} presets", replaceTitle/replaceBody, timeOfDay, all, tradition, allTraditions, emptyTitle/emptyBody, replaceRhythm/addRhythm. 'Midday' should use `RHYTHM_SLOT_META.afternoon.shortLabelKey`. **Also** the preset `title`/`description`/`historicRoots`/`tradition` values in `src/data/rhythmPresets.ts` and `RHYTHM_PRESET_TRADITIONS` need label keys.

## Groups / Prayer / Gather
- `groups.activeCount` "{{count}} active" — GroupDetail prayer preview
- `groups.aboutSessionsTitle` + `aboutSessionsBody` + 3 bullet keys — GroupDetail explainer
- `groups.shareInvite` "Join my discipleship group \"{{name}}\" in EveryBible!\n\nJoin code: {{code}}" — GroupDetail share message
- `harvest.memberCount` "{{count}} members" — GroupList member-count unit label (currently a bare number)
- GroupList empty-state CTA — title + body + button keys (icon/layout done; copy deferred)
- `prayer.justNow` / `prayer.minutesAgo` / `prayer.hoursAgo` / `prayer.daysAgo` (all `{{count}}`) — PrayerWall relative time (logic kept; no `Intl` on hot path)
- `gather.progressA11y` "{{done}} of {{total}} complete" — GatherScreen card a11y append
- `gather.share` "Share" — LessonBottomSheet (to collapse the 3 identical share rows into one; currently 3 rows kept)
- `gather.playbackAndText`, `gather.noPassageText`, `gather.listenAgain` — LessonDetailScreen (hardcoded)

---

## Deferred non-i18n (larger refactors, flagged as beyond the low-risk bar)
- **SettingsScreen full token migration + theme-picker rework** (spec §2E items 11/25): the theme-picker `maxWidth:220`/wrapping-pills rework touches the 5-mode × 4-palette × long-language matrix — highest regression surface in the app. Targeted P0/P1 correctness fixes (dead touchable, AM/PM, haptics, switch a11y, disabled contrast, back target) were landed; the layout rework was left.
- **LocaleSetupFlow full token migration + step-dots indicator** (§2E items 24/30): first-run screen; P0 (keyboardShouldPersistTaps), header target, search spacing, and titleKey were landed; the broad raw-value→token migration + 2-up grid + step dots were left.
- **Shared component extraction** (`ScreenHeader`, `ProgressBar`, `InitialsAvatar`): applied the concrete per-file fixes inline instead of extracting shared components, to keep the parallel agents from colliding. Extraction is a clean follow-up.
- A few P2s intentionally skipped as low-value/higher-risk: TranslationPickerList disabled-chip dimming (would hide the success checkmark), AudioProgressScrubber `pageX` PanResponder refinement, `resolveActiveNestedRoute` hoist.
