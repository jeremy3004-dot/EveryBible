# Source-text test inventory (2026-09-24)

This inventory covers every test file under `src/` and `apps/` that matched
`grep -rln "readFileSync\|vm\.Script\|runInNewContext" src apps --include='*.test.ts' --include='*.test.tsx'`.
81 files matched at the start of the pass and 76 match after it. No file uses `vm.Script` or
`runInNewContext`.

Each file is in one of three classes:

1. **Keep.** These are legitimate guards: the startup import graph, codebase-wide
   static lints, or artefacts that are not TypeScript (native projects, SQL,
   Python, config) and have no module to load.
2. **UI behaviour.** These should be render tests using `src/testing/render.tsx`.
3. **Non-UI behaviour.** These should be ordinary unit tests against the real
   module.

Other agents own two groups today, and this pass did not touch them:
BibleReaderScreen tests (the reader-chrome conversion), and BibleBrowser,
TranslationPickerList, TabNavigator and LocaleSetupFlow tests.

Every new test was mutation-checked. The behaviour was broken once in the
component, the test was seen to fail, and the component was restored. The
commits list the mutations.

## Converted in this pass

| Former source-text test                                                                                                                                  | Class | Now                                                                                                                                                                                                                                                  | Mutations that fail it                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `screens/bible/bibleReaderPlanBannerColors.test.ts` (regex-parsed hexes out of ThemeContext.tsx)                                                         | 3     | Same file. It feeds `getPlanSessionBannerColors` the real `createThemeColors(mode, palette)`.                                                                                                                                                        | `onAccentLight` greyed; `completeIcon` swapped           |
| `design/contrastAudit.test.ts`: disabled treatment of IconButton/ListRow                                                                                 | 2     | `components/ui/primitives.render.test.tsx`: a disabled IconButton is announced as disabled, dimmed to 0.45, and ignores presses (the ListRow case was already rendered)                                                                              | `accessibilityState` dropped; opacity changed            |
| `design/displayFontWiring.test.ts`: primitives merge `displayFont`                                                                                       | 2     | `primitives.render.test.tsx`: SectionHeader title and eyebrow and ListRow value are rendered in `en` and `ru`. In Cyrillic they drop the Alte Haas family, the tracking and the leading.                                                             | each of the 3 `displayFont` merges removed               |
| `screens/learn/gatherIconVectorization.test.ts`                                                                                                          | 2     | Deleted. `HomeScreen.render.test.tsx` already asserts that the Gather badge gets the active foundation's `iconImage`.                                                                                                                                | badge pinned to the first foundation                     |
| `navigation/screenErrorLayout.test.ts`: every `*Stack.tsx` passes `screenLayout`                                                                         | 2     | `navigation/stackRoutes.render.test.tsx` renders all 6 stacks. It checks `Navigator.screenLayout === renderScreenWithErrorBoundary` and checks the stack list against `*Stack.tsx` on disk.                                                          | `screenLayout` removed (MoreStack) or nulled (AuthStack) |
| `screens/more/readingActivityCalendar.test.ts`: screen draws its own grid                                                                                | 2     | New `screens/more/ReadingActivityScreen.render.test.tsx` (8 tests) covers Monday-first headers, day buttons named by date, selection, the canonical summary, the card opening the reader, the month buttons and legend, and the absence of raw keys. | 11 screen mutations                                      |
| `screens/bible/bibleReaderTranslatorReviewSource.test.ts` (summary and review parts)                                                                     | 2     | New `components/feedback/ChapterFeedbackSummary.render.test.tsx` (3 tests) and `screens/bible/ChapterFeedbackReviewScreen.render.test.tsx` (7 tests). The 3 reader-side assertions stay (see below).                                                 | 9 component mutations                                    |
| `services/startup/startupBootSurface.test.ts`: "LoadingScreen fails closed until privacy initialization completes" and "App wraps … in error boundaries" | 2     | New `src/AppBoot.render.test.tsx` (11 tests) renders the real App, the startup coordinator, ErrorBoundary and usePrivacyLock.                                                                                                                        | 11 App.tsx mutations                                     |

### Bug fixed (test-first, separate commit `fix(a11y)`)

The ReadingActivityScreen render test found two accessibility bugs. It recorded
them as `todo` first, and both tests failed before the fix.

- Calendar cells gave a screen reader only the date and whether the day was
  selected. Read, today and idle days differed only by fill colour, which fails
  WCAG 1.4.1. Each cell now reports its state as `accessibilityValue`, using the
  legend words Read and Today, which are already translated.
- The selected-day card's label was the date alone, and that label replaces the
  card's children, so users never heard the chapter summary. The label now joins
  the date, the summary and the session window.

### Weakness noted, not changed

`AppBoot.render.test.tsx` found that the privacy-lock boundary's `onError`
(`lockAfterPrivacyLockFailure`) can act only on the lock hook's first mount. On
a cold start that mount comes before privacy has loaded, so a throw there sees a
standard install and does nothing. The lock screen still shows at launch. But
the boundary then renders `null` for the rest of the session, so going to the
background will not re-lock a discreet install. This only matters if
`usePrivacyLock` throws. It is worth an owner decision (for example, retry the
host or lock on any failure once privacy is initialized).

## Still source-text, class 2 (UI), owned elsewhere

These should become render tests. Leave them to the owning conversion.

- **Reader-chrome conversion (BibleReaderScreen):**
  - `screens/bible/bibleReaderChromeSource.test.ts`
  - `bibleReaderAudioReturnSource.test.ts`
  - `bibleReaderAudioShareSource.test.ts`
  - `bibleReaderAuthSource.test.ts`
  - `bibleReaderFeedbackSource.test.ts`
  - `bibleReaderPlanFlowSource.test.ts`
  - `bibleReaderPlanSessionSource.test.ts`
  - `bibleReaderSelectionSource.test.ts`
  - `bibleReaderVerseImageShareSource.test.ts`
  - `bibleReaderTranslatorReviewSource.test.ts`: only 3 reader assertions are left
  - `bibleReaderSwipeModel.test.ts`: the last test, the haptic on swipe commit
  - `components/audio/playbackControlsSource.test.ts`
  - `services/audio/audioPlaybackTransitionSource.test.ts`

  Note for that conversion: the first test in `bibleReaderPlanSessionSource.test.ts`,
  "PlanDetailScreen launches plan chapters with explicit plan-session params", is
  already covered by `PlanDetailScreen.render.test.tsx`. Setting
  `returnToPlanOnComplete` to false fails that suite, and so does changing
  `planDayNumber`. Delete the test rather than port it. It was left in place to
  avoid a conflict inside a file the reader conversion owns.

- **BibleBrowser/TranslationPicker/TabNavigator/LocaleSetupFlow conversion:**
  - `screens/bible/bibleBrowserSource.test.ts`
  - `screens/bible/translationPickerListSource.test.ts`
  - `navigation/tabNavigatorSource.test.ts`
  - `screens/onboarding/localeSetupFlowSource.test.ts`

## Still source-text, class 2, not converted (low value or no harness)

- `apps/site/lib/operator-launcher.test.ts`: the last test ("RootLayout renders
  the operator launcher"). It is a Next.js server layout, and the suite has no
  web render harness. The other 5 tests are behavioural.
- `services/startup/homeStartupTiming.test.ts`: one line pins
  `onLayout={homeReadyReporter.onLayout}` on Home's ScrollView. The reporter
  itself is unit-tested, and the only effect is a dev timing log. Its barrel
  checks are class 1.

## Class 1: keep

**Startup import-graph guards.** A runtime test cannot tell a lazy `require()`
from a static import.

- `hooks/useAudioPlayerSource.test.ts`
- `hooks/usePrivacyLockSource.test.ts`
- `i18n/i18nStartupLoadingSource.test.ts`
- `screens/bible/chapterSelectorChromeSource.test.ts`
- `screens/home/HomeScreen.shareSource.test.ts`
- `services/analytics/usageQueueSource.test.ts`
- `services/sync/syncServiceSource.test.ts`
- `stores/authStoreSource.test.ts`
- `stores/progressStoreSource.test.ts`
- `stores/migrateFromAsyncStorage.test.ts`: 1 test; the rest are behavioural
- `services/startup/startupBootSurface.test.ts`: import closures, module-scope
  ordering, `stores/index.ts` not a barrel, and lazy stack screens. The two UI
  tests moved to `AppBoot.render.test.tsx`.
- `services/startup/homeStartupTiming.test.ts`: the barrel part

**Codebase-wide static lints.** These walk every file under `src/`, which no
render test can do.

- `expoFileSystemImports.test.ts`
- `androidKeyboardAvoidingSource.test.ts`
- `modalTranslucencySource.test.ts`
- `design/textScalingAccessibility.test.ts`
- `design/touchableAccessibility.test.ts`
- `i18n/interfaceCoverage.test.ts`
- `design/displayFontWiring.test.ts`: the surface list
- `design/designSystemSource.test.ts`: the surface list; its token values already
  come from the real module
- `constants/bookIconVectors.test.ts`: the placement lint

**Non-TypeScript artefacts, config, SQL and dependency contracts:**

- **iOS/Android native and Expo config:** `config/iosAlternateIconBuildSetting`,
  `config/iosReleaseAtsLockdown`, `services/startup/androidNativeConfig`,
  `iosBundleContract`, `iosNativeConfig`, `releaseMetadata`, `runtimeConfig`
- **Swift, asset catalog and icon script:** `services/audio/audioNowPlayingSource`
- **Python scripts:** `services/audio/timestampGenerationSource`,
  `constants/bundledTranslations`, `services/bible/bundledBibleDatabaseAsset`
- **Supabase SQL, row types and runbook:**
  `services/bible/bibleVerseFormattingBackendSource`,
  `services/supabase/schemaHealthSource`,
  `services/feedback/chapterFeedbackBackendSource`,
  `services/translations/translationCatalogAccessMigrationSource`,
  `services/sync/syncMerge` (1 contract test)
- **`supabase/config.toml`:** `services/analytics/analyticsFunctionSource`,
  `services/diagnostics/crashReportFunctionConfig`,
  `services/feedback/chapterFeedbackFunctionSource`,
  `services/feedback/chapterFeedbackReviewService`
- **Installed-package contracts:** `navigation/readerTabBarMotion`
  (BottomTabBar logical edges), `services/audio/audioDownloadStorage.behavior`
  (downloader export surface)

## Not source-text: grep false positives

These use `readFileSync` on fixtures, generated data or temp files, not on
source code.

- `services/elMedia/*`: 8 files that read signed-envelope fixtures
- `services/bible/bibleDatabase.test.ts`: temp SQLite files
- `services/bible/cloudTranslationService.behavior.test.ts` and
  `cloudTranslationService.plainDownload.test.ts`: downloaded pack bytes
- `apps/admin/lib/language-atlas/snapshot.test.ts`,
  `apps/site/lib/language-pages.test.ts`,
  `apps/site/lib/public-atlas-transport.test.ts`: built atlas data

## Verification

- `npm run typecheck`: clean.
- `npm run test:release`: 994 of 994 pass. `ChapterFeedbackSummary.render.test.tsx` and
  `ChapterFeedbackReviewScreen.render.test.tsx` were added to it, so the review behaviour
  that used to run through `bibleReaderTranslatorReviewSource.test.ts` is still covered
  there.
- `npm test`: 6492 of 6494 pass. The 2 failures are in
  `screens/learn/LessonDetailScreen.render.test.tsx` ("play starts the chapter…" and
  "the application prompts offer…"). They fail the same way on the unmodified
  integration commit `183ee1af`, so this pass did not cause them.
