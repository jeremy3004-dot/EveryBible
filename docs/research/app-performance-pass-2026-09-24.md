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
  device**:
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
