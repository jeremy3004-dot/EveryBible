# Crash-proofing audit — 2026-09-24

Scope: `App.tsx`, `src/` (tests excluded). RN 0.81.5, Hermes
`hermes-2025-07-07-RNv0.81.0`, old architecture, zustand v5 persist over MMKV v2.

## What actually kills a release build

| Failure                                                                           | Release behaviour              | Why                                                                                                                                                              |
| --------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synchronous throw out of a native→JS callback (listener, timer, `onPress`)        | **Fatal** (RCTFatal / SIGABRT) | `MessageQueue.__guard` → `ErrorUtils.reportFatalError`. `installGlobalErrorHandlers` logs it, then chains to the original handler.                               |
| Render or effect error with no `ErrorBoundary` above it                           | **Fatal**                      | Same path.                                                                                                                                                       |
| Render or effect error inside a boundary                                          | Fallback UI                    | Before this pass it was not logged anywhere.                                                                                                                     |
| Unhandled promise rejection                                                       | Not fatal                      | RN only tracks rejections in dev; `globalErrorHandler` records them through `HermesInternal.enablePromiseRejectionTracker`.                                      |
| Exception during zustand hydration (bad JSON, a `migrate` or `merge` that throws) | Not fatal                      | persist's `toThenable` chain catches it; the store stays at its initial state. **But the next write then replaces the stored blob, so the user's data is lost.** |
| Wrong-shaped JSON that parses fine                                                | Crash later                    | The default `merge` spreads it into the store; `.includes` or `.findIndex` throws in a render selector or tap handler.                                           |

This rules out several items the brief listed as crash risks. **Async errors in
`useEffect`s, store actions, and listeners are not crashes on this stack.** At worst
they cause a UX bug and a crash-log entry. Almost all of the real risk is in
synchronous code: render, effects, tap handlers, and native callbacks.

## Findings, ranked by likelihood × impact

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                 | Likelihood                                                 | Impact                                  | Status                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **A single `ErrorBoundary` wrapped the whole navigator.** One screen's render error replaced the entire app, tab bar included, and "Try again" remounted the navigator from scratch. A deterministic error on Home (the initial route) left the app stuck on the fallback.                                                                                                                              | Medium: any future render bug, or any data-shape bug below | High                                    | **Fixed.** Every stack now uses `screenLayout={renderScreenWithErrorBoundary}` (`src/navigation/screenErrorLayout.ts`): each screen gets its own boundary, the tab bar stays usable, and a pushed screen offers Back.  |
| 2   | **Caught render errors left no trace.** `componentDidCatch` only called `console.error`. The Diagnostics screen and support exports never saw them.                                                                                                                                                                                                                                                     | Certain, whenever #1 fires                                 | Medium (blind to real crashes)          | **Fixed.** Boundaries record a non-fatal crash-log entry tagged `[screen:<Route>]` / `[app]` / `[root]`, with React's component stack.                                                                                 |
| 3   | **Nothing above the providers or `AppContent`.** A throw in `ThemeProvider` or in `AppContent`'s hooks and effects (deep links, push registration, session analytics) was fatal. `AppRuntimeEffectsHost` (sync, privacy lock, auth deep link) also sat outside every boundary.                                                                                                                          | Low to medium                                              | Fatal, and at launch for most of these  | **Fixed.** A root boundary now wraps the provider tree (its fallback needs neither provider). The runtime-effects host is wrapped with `fallback={null}`, and `ErrorBoundary` now honours an explicit `null` fallback. |
| 4   | **`readingPlansStore` merge threw on a `null` progress or rhythm entry.** The store then stayed empty, and the next write erased every plan's real progress. It also let `enrolledPlanIds`, `savedPlanIds`, `completedPlanIds`, `pendingUnenrollPlanIds`, `rhythmOrder`, `planDayResumeByKey` and `groupPlansByGroupId` through unchecked, and enroll/save taps call `.includes` and `.filter` on them. | Low                                                        | High (silent data loss, or a fatal tap) | **Fixed.** Merge coerces each field and drops only the malformed entries.                                                                                                                                              |
| 5   | **`fourFieldsStore` only sanitized inside `migrate`.** zustand skips `migrate` for a current-version (v1) blob. A group without `members` survived hydration, and the join tap threw a TypeError, which is fatal from `onPress`. An existing test pinned this as "QUESTION for review".                                                                                                                 | Low                                                        | Fatal tap                               | **Fixed.** A `merge` coerces every field, including groups, members and group progress, on every hydrate.                                                                                                              |
| 6   | **`translationPreferenceStore`, `annotationStore` and `gatherStore` had no sanitizer.** `pinnedIds.includes` runs in the translation picker's render selector, `annotations.findIndex` in the highlight/note tap, and `completedLessons[...]` in lesson reads. Existing tests pinned the throwing behaviour.                                                                                            | Low                                                        | Sticky screen crash or fatal tap        | **Fixed.** Shared, dependency-free `mergeSanitizedState` (`src/stores/persistedShapeGuards.ts`).                                                                                                                       |
| 7   | **`getCrashLogs` only checked `Array.isArray`.** A malformed row crashed the Diagnostics screen, the one screen meant for reading crash reports. That screen renders every row, and its export calls `toISOString`, which throws RangeError on an out-of-range timestamp.                                                                                                                               | Very low                                                   | Medium                                  | **Fixed.** Rows are validated on read.                                                                                                                                                                                 |
| 8   | Notification-tap listener (`App.tsx`, `response.notification.request.content.data`) and keyboard listener (`useKeyboardBottomInset`, `event.endCoordinates.height`) read native payloads without optional chaining.                                                                                                                                                                                     | Very low: expo-notifications and RN always populate these  | Fatal                                   | Open. Harden when the "navigate from `data.screen`" TODO lands, because that code will read deeper fields.                                                                                                             |
| 9   | Audio `setInterval` bodies in `useAudioPlayer` (interpolation, sleep timer) run outside `trackPlayer.emit()`'s try/catch.                                                                                                                                                                                                                                                                               | Very low: arithmetic and `getState()` with `??` fallbacks  | Fatal                                   | Open (safe today). Keep new property access in these timers defensive.                                                                                                                                                 |
| 10  | Adoption merges in `privateDataAdoption.ts` (`Object.entries(guest.completedLessons)`, `account.groups.map`) assume shapes.                                                                                                                                                                                                                                                                             | Very low now                                               | Sign-in adoption half-applied           | Mitigated. The stores they read are now coerced at hydrate.                                                                                                                                                            |

## Checked and judged safe

- **Hermes Web API gaps:** there is no `crypto.randomUUID`, `structuredClone`,
  `AbortSignal.timeout` or `.any`, `Object.groupBy` or `Promise.withResolvers` in the app.
  - `usageQueue.generateUUID` feature-detects `crypto`.
  - `Intl.PluralRules` is polyfilled before i18next's first plural (`src/i18n/pluralRulesPolyfill.ts`).
  - `Intl.DisplayNames` is feature-detected (`localeSelection.ts`).
  - EL verification gates on `TextEncoder`/`TextDecoder` (`elRuntimeSupport.ts`) and uses pure-JS crypto.
  - `Array.prototype.at` / `findLast` / `toSorted` exist in this Hermes build.
  - RN 0.81's built-in `URL` implements `hostname` / `pathname` / `searchParams`, so supabase-js is fine.
- **`toISOString` on stored data:** the only call site is Diagnostics (finding 7).
- **`toLocaleDateString` on an invalid date:** returns `"Invalid Date"` and does not
  throw, so the audit's date-render candidates (Annotations, Plans, Group detail,
  feedback screens) are cosmetic, not crashes.
- **`Intl.DateTimeFormat(...).format(x)`:** does throw on an invalid date. Home's
  `firstActivityAt` comes only from finite, positive timestamps (`getChapterCoverageTimes`).
- **Every `JSON.parse` on MMKV, AsyncStorage or network data** (`elCatalogService`,
  `audioDownloadJobStore`, `usageQueue`, `geoContext`, `bibleTranslationPersistence`,
  `privateDataScope`, `mmkvStorage`) sits in a local try/catch.
- **Listeners:** the AppState and NetInfo listeners (`useSync`, `usePrivacyLock`,
  `useAppSessionAnalytics`, `useAudioDownloadRecovery`, `queryClient`,
  `reportingPolicy`, `BibleReaderScreen`) and the BackHandler listeners do
  string/boolean work or hand off to async code.
  - The remote-command listener in `useAudioPlayer` is `async`, so its throws become rejections.
  - The Android media-session listener is fully type-guarded.
  - Track-player listeners run inside `emit()`'s try/catch.
- **Persisted stores that already sanitize:** `authStore` (v4 migrate plus a sanitizer),
  `bibleStore` (versioned migrate plus a sanitizer), `audioStore`, `libraryStore`,
  `progressStore`, and `translatorReviewStore` (small surface).
  - A blob with a newer version (a downgrade or TestFlight rollback) either goes
    through a migrate that returns it as-is (auth, bible) or, with no migrate, is
    ignored with a console error. That means data loss for that session, not a crash.

## Deferred

- **Remote crash reporting.** Done in a follow-up without touching analytics: a
  dedicated anonymous path (`src/services/diagnostics/crashReportQueue.ts` →
  `supabase/functions/report-app-errors` → `app_error_reports`, migration
  `20260924043614_app_error_reports.sql`) and the admin "App errors" page. Native
  crashes (outside JS) still need a crash SDK (Sentry or Crashlytics) and external
  account setup.
- **Findings 8 and 9** (listed above).
- **Device QA:** force a render error on a pushed screen (Back plus the tab bar
  should still work) and on Home (the other tabs should still work). Confirm that
  the Diagnostics screen shows `[screen:…]` entries.
