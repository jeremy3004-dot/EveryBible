# Re-render audit — September 24, 2026

Goal: find wasted re-renders on the hottest paths and fix the worst ones
without changing behaviour. The paths were: the Bible reader during audio
playback, verse selection and scrolling; Home while stores hydrate and sync;
Plans home when plan progress syncs; the tab bar during reader scroll; and the
translation picker during a download.

No device profiling was done. All numbers come from the render-test harness
(react-test-renderer under `node --test`). They count React renders, not
frame times.

## How renders were counted

`src/testing/render.tsx` now has `harness.renders`. Every fake primitive
(`View`, `Text`, `Pressable`, `TouchableOpacity`, `FlatList`, ...) logs each
time React calls it. A primitive only renders again when the component that
owns it re-renders. That makes a memoised subtree that bailed out visible as
zero entries.

```ts
const mark = harness.renders.mark();
await setAudio({ currentPosition: 36_000 });
harness.renders.count(mark, 'Text', (props) => renderedText(props.children).includes('Nicodemus'));
```

The reader fixture's existing `renders.count` (one per `BibleReaderScreen`
render) is still used for whole-screen counts.

## Findings and fixes

"Before" and "after" are renders per interaction, measured with the tests
listed in the last column.

| Path                                                                       | Cause                                                                                                                                                    | Before                                        | After                          | Test                                         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------ | -------------------------------------------- |
| Reader: tap a verse (3-paragraph chapter)                                  | `selectedVerses` was part of the render signature every paragraph compared                                                                               | 3 of 3 paragraphs redrawn                     | 1 (the tapped one)             | `BibleReaderScreen.rerender.render.test.tsx` |
| Reader: another translation's row changes (download tick, catalog refresh) | `useBibleStore(useShallow(s => s.translations))`: any replaced row re-rendered the 8,000-line screen                                                     | 1 screen render (~57 primitives)              | 0                              | same                                         |
| Bible store: an audio job starts/ends/fails                                | `updateTranslationAudioJobState` spread every translation, so every row got a new identity                                                               | 9 of 9 rows replaced                          | 1 (the job's translation)      | `bibleStore.audio.test.ts`                   |
| Home: current translation's row rebuilt but unchanged                      | `loadVerseOfDay` depended on the row object, so the effect reloaded the verse (DB read, spinner) whenever the row was rebuilt                            | 1 extra DB read and spinner flash per rebuild | 0                              | `HomeScreen.render.test.tsx`                 |
| Home: another translation's row changes                                    | Home subscribed to the whole `translations` array                                                                                                        | 1 screen render (87 primitives)               | 0                              | same                                         |
| Picker: text-pack progress chunk, same percent                             | Row selected the whole `downloadProgress` object, which is new on every byte update                                                                      | 1 row render (13 primitives) per chunk        | 0; redraws when % changes      | `TranslationPickerList.render.test.tsx`      |
| Plans home: one plan's progress changes                                    | Cards were inline render functions, so every card redrew on any store change                                                                             | 3 of 3 cards (79 primitives)                  | 1 card                         | `PlansHomeScreen.render.test.tsx`            |
| Plans home, Find tab: sync restamps `synced_at`                            | The catalog section took the whole progress list                                                                                                         | 230 primitives, both rhythm cards             | 0                              | same                                         |
| Plans home: every focus                                                    | `listReadingPlans()` sorted a fresh copy of the bundled catalog each call, so `setAllPlans` always changed state and the Find tab rebuilt its Fuse index | whole screen + index rebuild per focus        | no render when nothing changed | `readingPlanService.behavior.test.ts`        |

### Guarded, already fine

These were measured and needed no change. Tests now pin them:

- Reader: a playback position tick inside a verse redraws no verse and does
  not re-render the list or the screen. A tick that moves the follow-along
  verse redraws exactly the two paragraphs it leaves and enters.
- Reader scroll: steps under 48pt stay on the UI thread (existing dock test).
  The reader never calls the root tab navigator's `setOptions` or `setParams`
  while scrolling, so the tab bar does not re-render either.
- Tab bar: `ReaderAwareTabBar` crosses to JS only at the hide/show boundary
  (`useAnimatedReaction`). The descriptors, `screenOptions` and `tabBar`
  renderer are memoised.
- Picker: an audio job tick replaces only its own row, and only that row
  redraws.
- `ThemeProvider`'s value is memoised on theme, palette and colours, so
  preference syncs do not reach `useTheme()` consumers.

## Behaviour notes

- Selection still reaches the `FlatList`: the selected verses are now in
  `extraData`, so the list offers new props to its cells and each cell's
  comparator keeps the ones whose verses did not change.
- Home's verse load reads four fields (`id`, `hasText`, `hasAudio`,
  `audioGranularity`). The load is now keyed on those fields plus the text
  pack (`isDownloaded`, `textPackLocalPath`). Switching translation and
  installing the current translation's text pack still reload the verse. Both
  are tested.
- Plans home kept a date bug hidden behind the fresh catalog array. Daily
  rhythms (for example Proverbs 31) take their day from the calendar, and a
  new day only showed because each focus happened to re-render everything.
  The audit branch fixed this with a `calendarDay` string re-read on focus.
  `main` has since fixed it independently with `useLocalToday()` (refreshed on
  focus, on return to the foreground and at local midnight), so only the
  memoisation still needs porting. When it is, the cards take `today` as a
  prop, and the Find plans comparator must compare each enrolled plan's day
  number computed against `today` rather than `today` itself, or every focus
  (which creates a new `Date`) redraws the catalog.
- The shared catalog array from `getSortedPlans()` is read-only. Every caller
  was checked, and none mutates it.

## Left alone

- An annotation or highlight change still redraws every paragraph. It is part
  of the shared signature. Highlighting is a deliberate tap and less frequent
  than selection, so it was not worth another per-paragraph comparison.
- The reader still re-renders while its own translation downloads audio,
  because that row's `activeDownloadJob.progress` changes. Fixing it needs a
  selector that ignores download fields, and the reader reads the row in 19
  places.
- Every sync still restamps `synced_at` on each plan it merges, so each
  enrolled plan's card redraws once per sync on My Plans. A card-level
  comparator that ignored `synced_at` would silently miss any field added
  later.
- `ChapterSelectorScreen` and `BibleBrowserScreen` still pass a new `extraData`
  object on every render. This was already noted in the performance pass and
  only matters when their parent re-renders.

## Where the fixes landed

The audit branch (`worktree-agent-aa1d02579c7243938`) no longer applied to
`main` after the same files were refactored on September 24. The fixes were
re-applied on current `main` as follows:

| Fix                                                    | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render counter (`harness.renders`, `renderedText`)     | Landed unchanged (`src/testing/render.tsx`, `src/testing/reactNativeHost.tsx`, `docs/testing.md`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Home: current-row selector, verse load keyed on fields | Landed. `main` now passes `audioAvailable` (the day's chapter audio is playable) instead of `remoteAudioAvailable`, so the load keys on that boolean plus the six translation fields. `main` also looked up the borrowed-Scripture translation in the whole array; Home now selects that one row too.                                                                                                                                                                                                                                                                                         |
| Picker: rows select the percentage                     | Landed unchanged (`TranslationPickerList.tsx`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Plan catalog sorted once                               | Landed. The cache is filled from the lazily required catalog, so importing the service still loads no plan data (`readingPlanService.lazyCatalog.test.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Bible store: audio job keeps untouched rows            | Not landed here. The session that owns `bibleStore.ts` is porting it: `updateTranslationAudioJobState` should return an untouched row as-is when its `activeDownloadJob` is already defined.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Plans home: memoised cards, Find plans comparator      | Not landed here. Plans home was split into `src/screens/plans/plansHome/` by another session. To port: extract the active plan card into a `memo` component taking `progress`, `plan`, `chaptersRead`, `listeningHistory`, the two handlers, `colors` and `today`; wrap the Find plans section in `memo` with a comparator on `allPlans`, `onPlanPress`, `colors` and a `plan_id:dayNumber` key built with `getActivePlanDayNumber(plan, progress, today)`. The render-count tests on the audit branch (`PlansHomeScreen.render.test.tsx`, "Re-render reach when progress syncs") carry over. |
| Reader: selection per paragraph, current-row selector  | Not landed here. It lives in `BibleReaderScreen.tsx` and the reader render model, which another session owns; see commit `924dcbc2` on the audit branch.                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Needs a device

Render counts show wasted work was removed, not how many milliseconds it cost.
On a low-end Android phone, use the React DevTools profiler or a Hermes
sampling profile to confirm the verse-tap and download-progress gains in a
long chapter (Psalm 119) and with a large translation catalog.
