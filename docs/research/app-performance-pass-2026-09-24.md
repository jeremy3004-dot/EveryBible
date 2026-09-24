# App performance pass — September 24, 2026

Goal: faster cold start and smoother scrolling without changing behaviour.
Baseline: `origin/main` at `7376d690`. No native builds, device runs or deploys were
part of this pass. All numbers come from Metro exports of the JavaScript bundle and
Hermes runs on a Mac. They show how much work was removed. They are not
on-device timings.

## Result

| Measurement (iOS export)                                                  |                  Before |         After |       Change |
| ------------------------------------------------------------------------- | ----------------------: | ------------: | -----------: |
| Modules evaluated before Home can paint                                   |                   3,172 |         1,327 |         −58% |
| Unminified JS evaluated before Home                                       |                10.56 MB |       6.69 MB |         −37% |
| Boot graph (App.tsx static closure, before first render)                  |   951 modules / 4.67 MB | 897 / 4.12 MB |  −54 modules |
| RootNavigator chunk (loaded after privacy/auth, before Home)              | 2,110 modules / 4.49 MB | 312 / 1.16 MB | −85% modules |
| Modules in the whole bundle                                               |                   6,330 |         4,535 |         −28% |
| Hermes bytecode, iOS production export                                    |            19,501,245 B |  17,212,920 B |       −11.7% |
| Hermes bytecode, Android production export                                |            19,712,040 B |  17,419,548 B |       −11.6% |
| Exported assets (fonts/images shipped in the binary)                      |                 63.3 MB |       59.6 MB |      −3.6 MB |
| Hermes module-eval of the Lucide icon graph (Mac, bytecode, median of 15) |                    9 ms |     0 ms (<1) |            — |
| Hermes module-eval of the @expo/vector-icons graph (same)                 |                    1 ms |     0 ms (<1) |            — |

“Before Home” is the sequence the app actually runs on a returning launch: the
App.tsx boot graph, the lazy `services/supabase` and `services/auth` requires in
`authStore.initialize()`, the async `RootNavigator` import, then `HomeScreen`'s
`getComponent` require. Each step only counts modules not already loaded.

Hermes on a Mac is much faster than on a phone. A mid-range Android phone is
usually several times slower, so expect the Lucide saving on device to be tens of
milliseconds, not 9 ms. This is an estimate and needs checking on a device (see
below).

## What changed

1. **Lucide icons are imported per file** (`plugins/babel-icon-deep-imports.js`).
   `TabNavigator` imported the `lucide-react-native` root, which re-exports about
   1,800 icon modules. Each one calls `createLucideIcon` when it is evaluated. With
   `inlineRequires` off (iOS release and every dev build), all of them were evaluated
   before Home rendered, although the app draws 51. A Babel plugin now rewrites
   `import { Check } from 'lucide-react-native'` to
   `import Check from 'lucide-react-native/icons/check'`. It reads the name-to-file
   map from the package's own root entry, so aliases such as `CheckCircle2` →
   `circle-check` load the same module the root export returns. Source files and
   their existing tests are unchanged.
2. **The same plugin handles `@expo/vector-icons`.** `ErrorBoundary`, which is on
   App.tsx's static graph, imported `{ Ionicons }` from the package root. That root
   builds all 15 icon sets and their glyph maps (~0.5 MB of JSON) and bundles all 15
   fonts. The app only uses Ionicons. The rewrite also removes the 14 unused font
   files from the release assets.
3. **bibleStore loads the translations service on first use.** Its only use of the
   `services/translations` barrel is a fire-and-forget preference save. Importing it
   statically also evaluated the runtime catalog bootstrap and the Fuse-backed locale
   search engine in the RootNavigator chunk. It now uses `require()` on first use, the
   same pattern as `authStore` with Supabase. The call is still synchronous, so the
   existing tests that check the saved preference pass unchanged.

### Regression guards

- `scripts/babelIconDeepImports.test.ts` runs the app's real Babel config (Expo
  preset included) over every source file. It fails if any module still requires
  either icon package root, or if a rewritten file does not exist in the installed
  package. It also covers aliases, type-only imports and non-icon exports.
- `src/services/startup/startupBootSurface.test.ts` has a new import-graph guard.
  It fails if RootNavigator's static closure reaches `services/translations/index.ts`
  or `services/onboarding/localeSelection.ts`. The guard was confirmed to fail
  against the pre-change `bibleStore.ts`.

Metro caches transforms. After pulling this change, run `npx expo start -c` once so
the dev server uses the rewrite. EAS and CI builds start from an empty cache.

## Scrolling review

The heavy lists were already tuned in earlier passes (2026-09-05 and 09-08). This
review found no change that would help without device profiling:

- **Bible reader**: the premium reader uses a virtualised `Animated.FlatList` with
  stable `keyExtractor`, `removeClippedSubviews`, `windowSize=7` and batched
  rendering. Cells are `memo`'d, and a custom comparator re-renders only paragraphs
  touched by an active-verse change. Paragraph grouping is memoised on `verses`, and
  the render signature is memoised. Chapter switches keep the old content visible;
  the skeleton only shows on first load.
- **Book browser, chapter grid, translation picker, plan ledger, onboarding
  locale list**: FlashList with `estimatedItemSize`, `getItemType` where rows vary,
  and memoised row components (the picker rows subscribe to their own download
  progress).
- **Zustand selectors**: no selector returns a new object or array per call. The
  reader's `chaptersRead` and `history` selectors return stable store references,
  so `useShallow` would not change anything. The 2026-06 note that listed them as
  needing it is out of date.
- **Scroll handlers**: the reader's handler runs on the UI thread through
  Reanimated. LessonDetail's handler only calls `setState` when the section
  changes.

Low-value leftovers, not changed: the translation picker's language mode maps its
rows in a `ScrollView`, which is fine while the catalog has few languages.
`ChapterSelectorScreen` and `BibleBrowserScreen` pass a new `extraData` object on
each render, which only matters when their parent re-renders.

## Needs on-device profiling

- **Cold start on a physical low-end Android phone and on iOS release.** Use
  `npm run perf:android:startup` (reports `homeInteractionReadyMs`) against a
  release build of `7376d690` and of this branch. Android release already has
  `inlineRequires` on, so its module-eval saving may be smaller than on iOS. The
  11.6% smaller bytecode applies on both platforms.
- **Remaining boot-graph weight that could not be deferred safely without a
  device** (round 2 below took the notifications, react-query and SQLite items
  off the path to Home; Reanimated stays):
  - `react-native-reanimated` (~1.3 MB unminified, including every default layout
    animation). `react-native-gesture-handler`'s Reanimated wrapper loads it at
    module scope.
  - `expo-notifications` together with `assert`/`util`, pulled in by
    `@ide/backoff` (~0.2 MB). App.tsx needs it at module scope to install the
    foreground handler and catch cold-start notification taps.
  - `@tanstack/query-core` (~0.19 MB) at the root provider.
- **bibleStore's static `bibleDatabase`/`expo-sqlite` import.** bibleStore
  registers its database resolvers at import time, and tests depend on that
  timing. Deferring it changes initialisation order and needs a device check.
  Done in round 2 without changing the registration timing: the resolvers
  moved to a registry module that has no SQLite dependency. A device smoke test
  of installing and deleting a text pack is still worth doing.
- **Scrolling frame times.** Use the React Native perf monitor or a Hermes
  sampling profile while flinging the reader in a long chapter (Psalm 119) with
  follow-along audio playing, and while scrolling the book browser and the
  translation picker. This pass did not measure frame rates.

## How the numbers were taken

- `npx expo export --platform ios --no-minify --no-bytecode --dump-sourcemap --clear`
  for the graph analysis. A throwaway script parsed every `__d(...)` factory with
  acorn and classified each dependency as eager (a top-level `require` in the
  factory), lazy (inside a function) or async (`import()`). It attributed modules
  to source files through the source map and walked the eager closure in the order
  listed above. Byte counts are unminified factory text, so they indicate relative
  size, not shipped size.
- `npx expo export --platform android --platform ios --clear` for the Hermes bytecode
  sizes. The baseline was exported from the same tree with `babel.config.js` and
  `src/stores/bibleStore.ts` checked out at `7376d690`.
- Module-eval timing: the real Metro runtime plus the real module factories for the
  icon graphs, with React, React Native and SVG replaced by trivial stubs. This was
  compiled with `hermesc -O` and run with the Hermes CLI from
  `react-native/sdks/hermesc`, one fresh process per sample, 15 samples. It measures
  only JavaScript evaluation of those modules, not rendering.

## Round 2: the deferred items

Baseline: `origin/main` at `fe99d292`, re-measured with the same method (the
numbers differ slightly from round 1's "after" because `main` moved). Still no
native builds or device runs.

### Result

| Measurement (iOS export)                   |                Before |         After |           Change |
| ------------------------------------------ | --------------------: | ------------: | ---------------: |
| Modules evaluated before Home can paint    |                 1,329 |         1,127 |      −202 (−15%) |
| Unminified JS evaluated before Home        |               6.67 MB |       5.95 MB |  −0.73 MB (−11%) |
| Boot graph (App.tsx static closure)        | 898 modules / 4.11 MB | 730 / 3.55 MB |     −168 modules |
| `authStore.initialize()` lazy requires     |  64 modules / 1.10 MB |  44 / 1.03 MB |      −20 modules |
| RootNavigator chunk                        | 312 modules / 1.15 MB | 298 / 1.04 MB |      −14 modules |
| HomeScreen                                 |  55 modules / 0.32 MB |  55 / 0.32 MB |                — |
| Modules in the whole bundle                |                 4,537 |         4,490 |              −47 |
| Hermes bytecode, iOS production export     |          17,227,085 B |  17,061,863 B | −165,222 B (−1%) |
| Hermes bytecode, Android production export |          17,434,198 B |  17,264,106 B | −170,092 B (−1%) |

Where the 202 modules went (net of the two small modules added):

| Change                                  | Modules | Unminified |
| --------------------------------------- | ------: | ---------: |
| expo-notifications root → deep imports  |    −122 |   −0.32 MB |
| React Query off the startup path        |     −47 |   −0.23 MB |
| Sign-in SDKs out of session restore     |     −20 |   −0.07 MB |
| bibleStore stops importing SQLite       |     −10 |   −0.10 MB |
| Asset/JSON registrations with no source |      −3 |          — |

The notifications, React Query and SQLite modules were all used at module scope,
so Android release builds (which have `inlineRequires` on) evaluated them at
startup too.

### What changed

1. **expo-notifications is deep-imported at boot.** `App.tsx` needs three
   things before render: the foreground handler, the tap listener and the
   push-token listener. It took them from the package root, which re-exports
   the whole API and imports `DevicePushTokenAutoRegistration.fx` for its side
   effect. That module pulls in `@ide/backoff`, the Node `assert`/`util`
   polyfills, the `es-*` shims, `abort-controller` and `expo-application`.
   `notificationBootstrap.ts` now imports `build/NotificationsHandler`,
   `build/NotificationsEmitter` and `build/TokenEmitter` directly, and
   `App.tsx` gets all three from it. These are the same files the root
   re-exports, so the handler is the one `notificationService` sees later.
   **Timing is unchanged:** `setupNotificationHandler()` still runs at module
   scope before anything renders, so no foreground notification can arrive
   before the handler is registered. The auto-registration module still runs
   when `services/notifications` loads, which happens after interactions on
   every launch (Android channel setup). The app turns Expo server
   registration off anyway and registers tokens with its own backend.
2. **React Query is no longer mounted at the root.** No screen uses it: the
   provider was added in phase 29 as groundwork and never adopted. The root
   `QueryClientProvider` still evaluated `@tanstack/query-core` and built the
   client before the first frame. `services/queryClient.ts` now exports
   `getQueryClient()`, which creates the one shared client on first use and
   wires the focus/online managers at that moment. A screen or stack that
   adopts React Query wraps itself in
   `<QueryClientProvider client={getQueryClient()}>`. `AppRuntimeEffects` no
   longer installs the listeners, so React Query is not loaded at all today.
   The package stays in `package.json`.
3. **bibleStore no longer imports `bibleDatabase`/`expo-sqlite`.** The store
   registered its source and readiness resolvers on `bibleDatabase` at import
   time, so importing the store loaded SQLite. The resolvers now live in
   `services/bible/bibleDatabaseSources.ts`, which only depends on the chapter
   cache. The store still registers them at import time, and `bibleDatabase`
   reads from the same registry and re-exports the setters, so its API is
   unchanged. The store's `invalidateInstalledBibleDatabaseAtPath` calls
   (text-pack install, repair and delete) `require()` the database module at
   the call. The database's first read is still the deferred
   `initBibleData()` warmup or the reader, and the readiness resolver is in
   place before either can run.
4. **Session restore skips the sign-in SDKs.** `authStore.initialize()` is
   critical startup. It required the `services/auth` barrel for
   `getCurrentSession()`, which also loaded Google Sign-In and Apple
   Authentication (both call into native modules at import). The function and
   `mapSupabaseUser` moved to `services/auth/authSession.ts`, which only needs
   the Supabase client. `authService` re-exports them, so existing callers are
   unchanged.

### Not deferred, and why

- **Reanimated (~1.3 MB, 185 modules).** Not deferrable. `HomeScreen` uses
  `entering` layout animations (`FadeIn`/`FadeInDown`) on its first render,
  and `TabNavigator`, `TabBarSelection`, `TabSwitch` and `PressableScale`
  use shared values and animated styles. Reanimated has to be initialized
  before any of these mount, and the worklets its Babel plugin compiles need
  its runtime already in place. `react-native-gesture-handler` also
  `require()`s it at module scope to hook gestures up. Moving it out of the boot
  graph would only shift the same work into the RootNavigator chunk, which is
  still before Home.
- **Supabase (~1.0 MB) in session restore.** `authStore.initialize()` blocks
  `isReady` so Home renders the right account and never shows a stale user.
  Restoring the session after first paint would change that contract. It
  needs a product decision and a device check, not just a code move.
- **Other large modules still before Home, all used by the first frame:**
  `react-native-svg` (0.34 MB, 109 modules, including `buffer`) for every
  Lucide icon in the tab bar; `@react-navigation/*` (the `color` package comes
  from the elements `Badge`); `i18next` plus the English strings; the
  persisted-state sanitizers used during store hydration; and Home's reading
  plan catalog and store. Trimming `react-native-svg` would need a patch to
  Lucide or the SVG package's root, not an app change.

### Regression guards (round 2)

- `startupBootSurface.test.ts`: the import walker now records bare package
  specifiers too. A new guard walks the `App.tsx`, `RootNavigator` and
  `HomeScreen` static closures. It fails if any of them imports
  `@tanstack/react-query`, the `expo-notifications` root or `expo-sqlite`, or
  reaches `services/queryClient.ts` or `services/bible/bibleDatabase.ts`.
  Another guard fails if `authSession.ts` reaches `authService` or either
  sign-in SDK. Both were confirmed to fail against `fe99d292`.
- `notificationBootstrap.test.ts` mocks the three deep modules and the root
  separately. It proves the handler is registered through the deep module,
  that nothing goes through the root, and that the listeners `App.tsx` uses
  are the ones the root re-exports. It fails if the bootstrap goes back to
  the root import.
- `queryClient.test.ts` proves that importing touches neither AppState nor
  NetInfo, that first use creates the client and installs each listener
  once, and that later calls return the same client.
- `bibleDatabase.test.ts` has a new test: resolvers registered through
  `bibleDatabaseSources` before the database is used drive the first read,
  and readiness runs before the database is opened. The bibleStore doubles
  now record the resolver registration on the registry, so the existing
  import-time registration tests still cover it.

### How the numbers were taken (round 2)

Same method as round 1. The export commands were
`npx expo export --platform ios --no-minify --no-bytecode --source-maps --clear`
for the graph and `npx expo export --platform android --platform ios --clear` for
bytecode. The baseline came from a `git archive` of `fe99d292`. Exports ran
with `CI=1 EXPO_OFFLINE=1 EXPO_NO_DEPENDENCY_VALIDATION=1`, and output went
to a temp directory, so nothing could install packages. The analyzer parses each
`__d()` factory with `@babel/parser`. It classifies each dependency as eager
(`require`/`_$$_IMPORT_*` at factory top level, including top-level IIFEs),
lazy (inside a function) or async (`asyncRequire`), and maps modules to
source files through the source map. It then walks the four steps in launch
order. In the "after" tree, step 2 counts `services/auth/authSession` instead
of the auth barrel, because that is what `initialize()` now requires.

## Round 3: what is in the 17 MB bundle

Baseline: `claude/integrate-2026-09-24e` at `a021c7a3`. Still no native builds or
device runs.

### Result

| Measurement                                                      |       Before |        After |              Change |
| ---------------------------------------------------------------- | -----------: | -----------: | ------------------: |
| Hermes bytecode, iOS production export                           | 17,400,442 B | 13,150,287 B | −4,250,155 B (−24%) |
| Hermes bytecode, Android production export                       | 17,610,393 B | 13,361,806 B | −4,248,587 B (−24%) |
| Minified JS, iOS (`--no-bytecode`)                               | 14,144,616 B | 10,435,184 B |      −3.7 MB (−26%) |
| Modules in the bundle                                            |        4,545 |        2,207 |              −2,338 |
| Load bytecode and register every module (Mac, median of 40 runs) |      12.5 ms |      11.2 ms |                   — |
| Gather artwork evaluated when Home draws its card                |       747 KB |        ~2 KB |                   — |

Both exports ran with `--clear` and without `--source-maps`. Passing
`--source-maps` makes hermesc write a smaller file (14.38 MB → 10.32 MB for
iOS), so only compare numbers taken the same way.

### Top 30 contributors before (minified iOS JS)

Per-file bytes come from the source map. JSON modules have no mappings, so
they were measured by their `__d()` factories.

| #   | Module                                             |  KB |
| --- | -------------------------------------------------- | --: |
| 1   | `bible-passage-reference-parser/esm/lang/en.js`    | 917 |
| 2   | `bible-passage-reference-parser/esm/lang/es.js`    | 863 |
| 3   | `bible-passage-reference-parser/esm/lang/ne.js`    | 816 |
| 4   | `bible-passage-reference-parser/esm/lang/hi.js`    | 799 |
| 5   | `src/data/gatherArtwork.ts`                        | 729 |
| 6   | `assets/timestamps/**/*.json` (2,378 modules)      | 658 |
| 7   | `src/i18n/locales/ta.ts`                           | 319 |
| 8   | `src/constants/bookIconVectors.generated.json`     | 291 |
| 9   | `src/i18n/locales/te.ts`                           | 277 |
| 10  | `src/i18n/locales/ru.ts`                           | 265 |
| 11  | `src/i18n/locales/ne.ts`                           | 261 |
| 12  | `src/i18n/locales/mr.ts`                           | 254 |
| 13  | `src/i18n/locales/bn.ts`                           | 254 |
| 14  | `src/i18n/locales/hi.ts`                           | 249 |
| 15  | `src/i18n/locales/pa.ts`                           | 245 |
| 16  | `src/i18n/locales/ur.ts`                           | 236 |
| 17  | `src/i18n/locales/ar.ts`                           | 222 |
| 18  | `src/data/countryDisplayNames.generated.json`      | 212 |
| 19  | `src/i18n/locales/ja.ts`                           | 143 |
| 20  | `src/i18n/locales/ko.ts`                           | 129 |
| 21  | `src/i18n/locales/vi.ts`                           | 122 |
| 22  | `src/screens/bible/BibleReaderScreen.tsx`          | 120 |
| 23  | `react-native/…/ReactNativeRenderer-prod.js`       | 118 |
| 24  | `react-native/…/ReactFabric-prod.js`               | 115 |
| 25  | `src/i18n/locales/zh.ts`                           | 106 |
| 26  | `bible-passage-reference-parser/esm/bcv_parser.js` | 102 |
| 27  | `src/i18n/locales/tr.ts`                           |  91 |
| 28  | `src/i18n/locales/fr.ts`                           |  87 |
| 29  | `src/i18n/locales/es.ts`                           |  81 |
| 30  | `src/data/localeCatalog.json`                      |  81 |

By group: app source 5.96 MB (the 21 interface locales are 3.9 MB of it),
the reference parser 3.58 MB, React Native 0.75 MB, Reanimated 0.59 MB.

### What changed

1. **u-flag regexes stay native on Hermes** (`plugins/babel-hermes-native-unicode-regex.js`).
   `@react-native/babel-preset` 0.81 always runs
   `@babel/plugin-transform-unicode-regex`, even for Hermes. It expands every
   `\p{L}`-style escape into explicit ranges and surrogate pairs. The reference
   parser's grammars are made of those escapes, so each 50–70 KB language file
   became ~0.9 MB. Hermes for RN 0.81 supports u-flag patterns and property
   escapes natively (`hermes -version` lists "Unicode RegExp Property
   Escapes"). The plugin clears the u-flag bit in Babel's shared regexp-feature
   mask when the caller engine is Hermes. Named-group lowering still runs, and
   non-Hermes targets still lower. Eight source files change in the bundle:
   the parser, `bibleDataModel.ts`, `referenceParser.ts` and
   `HighlightedVerseText.tsx`. On the RN 0.81.5 Hermes CLI, 12,864 reference
   queries in en/es/hi/ne/fr gave the same results with lowered and native
   regexes. The app's own u-flag regexes gave the same matches as V8 on Latin,
   Devanagari, Tamil, Gurmukhi, Arabic, Cyrillic, CJK (including astral
   ideographs), Korean and emoji text. Saves about 3.6 MB of bytecode.
2. **Verse timings are one table per translation.** `verseTimestamps.ts`
   required each of the 2,378 per-chapter JSON files. Metro made each one a
   module, so every launch registered them, and importing the service (which
   bibleStore does at launch) built a map of 2,378 closures.
   `npm run codegen-timestamps` now packs `assets/timestamps/<ID>/*.json` into
   `src/data/verseTimestamps.<id>.generated.json`. Each chapter becomes a
   comma-separated list of verse start times, with an empty slot for a verse
   that has no timing. A table is required when a chapter of its translation
   is first looked up. The per-chapter files are still the generator's output.
   Saves about 0.45 MB of bytecode and 2,376 modules. The source file went
   from 197 KB to 10 KB.
3. **Gather artwork loads one SVG at a time.** Home's Gather card draws one
   ~2 KB foundation mark, which synchronously required the whole ~750 KB table
   inside Home's render. App.tsx also pre-warmed the whole table after
   interactions on every launch. The generator
   (`scripts/generate_gather_artwork_svgs.py`) now writes
   `src/data/gatherArtworkSvg/<key>.json` and a registry that requires each
   artwork when it is first drawn. The pre-warm is gone. The markup is
   byte-identical. Bundle size is unchanged; this is a startup change only.

Everything stays in the binary, so offline use is unchanged.

### Checked and left alone

- **Interface locales (3.9 MB of JS).** `localeLoaders.ts` already loads
  only the active one. Hermes memory-maps bytecode, so modules that never run
  cost download size, not startup time. Moving them to file assets would make
  loading a language asynchronous on the first frame. That is a product
  change and needs device testing.
- **`bookIconVectors.generated.json` (291 KB), `countryDisplayNames` (212 KB),
  `localeCatalog` (81 KB).** They are only reached from the Bible browser and
  the locale search, and they are already off the path to Home. The new guard
  below keeps them there.
- **Hermes eval of a large string table is cheap.** Evaluating the old
  750 KB artwork object took 1–2 ms the first time in the Mac Hermes CLI, and
  about 0.02 ms after that. Big string modules cost memory and bundle size
  more than CPU. Deferring them is still worth doing, but expect gains of
  milliseconds, not tens of milliseconds.

### Regression guards (round 3)

- `scripts/babelHermesUnicodeRegex.test.ts` runs the real app Babel config.
  Hermes callers must keep `\p{…}` and the `u` flag, non-Hermes callers must
  still lower them, named groups must still be lowered, and the parser's
  `en.js` must stay under 1.5× its source size. This fails if a Babel upgrade
  renames the shared feature key.
- `verseTimestamps.test.ts` now requires every chapter lookup to equal its
  source JSON exactly, not just to be non-null.
  `verseTimestamps.lazyTables.test.ts` proves importing the service loads no
  table and a lookup loads only its own translation's table.
- `gatherArtwork.lazy.test.ts` proves importing the registry loads no
  artwork and drawing one loads only that file.
- `startupBootSurface.test.ts` fails if the App, RootNavigator or HomeScreen
  closures, the timestamp service or the artwork registry statically import
  an artwork SVG, a timing table, `localeCatalog`, `countryDisplayNames`,
  `bookIconVectors`, `referenceParser.ts` or the parser package. Confirmed to
  fail when an artwork is imported statically.

### How the numbers were taken (round 3)

`CI=1 EXPO_OFFLINE=1 EXPO_NO_DEPENDENCY_VALIDATION=1 npx expo export --platform android --platform ios --clear`
for bytecode sizes. The baseline was a `git archive` of `a021c7a3`. Per-file
attribution came from `--no-bytecode --source-maps` exports: a script walked
every source-map segment and added its generated bytes to the segment's source
file. The load benchmark removed the trailing `__r()` calls from the minified
bundles, compiled them with `hermesc -O` and timed 40 runs of each with the
Hermes CLI. This measures loading the file and registering modules, not
running the app.
