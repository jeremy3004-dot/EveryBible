# Testing Guide

EveryBible's automated tests run under Node's built-in test runner. No Jest, no
Metro, no simulator. Tests live next to the code they cover and are discovered
by `scripts/run-workspace-tests.ts`.

## Running

```bash
npm test                                   # whole workspace (~10s)
node --test --experimental-test-module-mocks --import tsx src/path/to/file.test.ts
npm run typecheck                          # tests are type-checked too
npx eslint src/path/to/file.test.ts && npx prettier --check src/path/to/file.test.ts

# Offline text-pack lifecycle checks
node --test --experimental-test-module-mocks --import tsx \
  src/services/bible/cloudTranslationService.behavior.test.ts \
  src/services/bible/textPackInstallJournalModel.test.ts \
  src/stores/bibleStore.downloads.test.ts
```

Any `*.test.ts` or `*.test.tsx` under `src/`, `scripts/`, `apps/`, `packages/`, or
`supabase/functions` is picked up automatically. No registration needed.

## What a good test here looks like

- Imports the real module and exercises real behaviour. Assert on outputs,
  state transitions, and recorded side effects.
- One behaviour per `test()`, named as a sentence about behaviour, not about
  the implementation (`'signOut clears per-user stores even when Supabase is unreachable'`).
- Uses `node:assert/strict`. Prefer `assert.deepEqual` on whole objects over
  a pile of `assert.equal` calls.
- Deterministic: no wall-clock sleeps, no network, no randomness without a seed.
  Use `mock.timers` from `node:test` for time-dependent code.
- A lazy `import()` may cross Node 22's loader thread; draining promises or a fixed
  number of `setImmediate` callbacks does not prove it finished. Await an observable
  fixture event (a manifest request, native read, or discarded invalid download)
  before asserting or advancing the next fake timer. Create rejected promises when
  the mocked operation is called, rather than before a lazy caller can handle them.

Do not write source-text tests (`readFileSync` + regex on the code shape) for
behaviour; they break on harmless refactors. Do not use the `ts.transpileModule` +
`runInNewContext` trick either; it bypasses the loader and coverage. Logic that
lives inside a screen or `App.tsx` gets extracted into a module or hook the
component calls (see `readerChapterLoader.ts`, `useAppSessionAnalytics.ts`), and
the test loads that. The source-text checks that remain say what they are in
their first line: startup import-graph guards, codebase-wide static lints,
dependency-contract guards (a read of `node_modules`), checks of non-TypeScript
artefacts (config, SQL, native projects, docs), and older UI-only checks of
component render code. Those last ones are being replaced by render tests (see
"Rendering components" below); do not add new ones — render the component.

Edge functions load through `supabase/functions/_testing/edgeFunctionHarness.ts`
(real module loader; `esm.sh` supabase-js and `Deno` are provided per harness).
Admin server modules load through `apps/admin/lib/testing/adminTestHarness.ts`.

## Making native-backed modules loadable

Most modules import something Node cannot load (`react-native`, `expo-*`,
`react-native-mmkv`, the Supabase client). Use `mock.module` from `node:test`
with the helpers in `src/testing/`:

```ts
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  mockSupabaseModule,
} from '../../testing/mockModules';
import { createSupabaseFake, makeFakeSession } from '../../testing/supabaseFake';

// 1. Install mocks at module scope, before any import of the code under test.
const mmkv = mockMmkvStorage(mock);
const rn = mockReactNative(mock, { os: 'ios' });
const supabase = createSupabaseFake();
mockSupabaseModule(mock, supabase);
mockModule(mock, 'expo-haptics', {
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Light: 'light' },
});

// 2. Load the module under test with a dynamic import (static imports hoist above the mocks).
test('...', async () => {
  const { useAuthStore } = await import('./authStore');
  supabase.auth.setSession(makeFakeSession());
  ...
});
```

Rules that follow from how the loader works:

- **One mock configuration per test file.** ESM caches modules, so re-mocking
  mid-file does nothing for modules already loaded. Drive scenarios through the
  fakes' mutable state (`supabase.auth.setSession(null)`,
  `rn.AppState.emit('background')`, `supabase.respondTo('profiles', ...)`).
  If a module computes values at import time from a mock (like `utils/platform.ts`),
  use separate test files for separate platforms.
- **Mock by the specifier the importer uses.** Bare packages: the package name.
  Repo files: the absolute path (`sourcePath('stores/mmkvStorage.ts')`); this
  intercepts every importer of that file, including transitive ones.
- **Use `mockModule(mock, id, exports)` from `src/testing/mockModules`** for
  any package not covered by a dedicated helper. It wraps Node 26's
  `mock.module(id, { exports })` (the installed `@types/node` only types the
  deprecated `namedExports` form). Put a `default` key inside `exports` for
  default-import consumers such as `NetInfo`.
- CI runs Node 22, which mocks `import()` differently from Node 26. With tsx's
  in-thread loader hooks, an `import()` of a mocked repo file would load the real
  file behind the mock (the symptom is `__DEV__ is not defined` or a Flow parse
  error from a package the mock should have replaced); `mockModules.ts` answers
  those loads with the mock's exports. Install mocks through these helpers, not
  bare `mock.module`, and run a new test on Node 22 as well
  (`PATH=/opt/homebrew/opt/node@22/bin:$PATH`) before relying on CI.
- `t.mock.module(...)` inside a test is restored when that test ends; top-level
  `mock.module(...)` lasts for the file. Either is fine given the one-config rule.

Every `expo-*` package must be mocked, never loaded: they import
`expo-modules-core`, which reads `__DEV__` at import time and throws under Node.

`__DEV__` is not defined under Node. Production code on a path a test executes
must guard it as `typeof __DEV__ !== 'undefined' && __DEV__`.

Prefer an existing dependency-injection seam over a module mock when one exists
(`AudioFileSystemAdapter`, `setRemoteAudioMetadataResolver`, store
`persist` storage options). Adding a small injection seam to production code is
acceptable when it removes the need to mock a whole package; keep it minimal and
default to the production implementation.

## Fakes in `src/testing/`

| Helper                                                                              | Gives you                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createSupabaseFake()`                                                              | Recording client: `from().select()...` thenable chains, `rpc`, `functions.invoke`, `auth` (session state, `onAuthStateChange`, overridable handlers), `storage`. Script results with `respondTo(table, fn)`, `respondToRpc`, `respondToFunction`. Inspect `calls`, `authCalls`, `storageCalls`. |
| `mockSupabaseModule(mock, fake, { configured })`                                    | Points `../supabase` and `../supabase/client` at the fake.                                                                                                                                                                                                                                      |
| `mockMmkvStorage(mock, seed?)`                                                      | In-memory MMKV so persisted Zustand stores hydrate. Returns the backing `Map` for seeding/inspection.                                                                                                                                                                                           |
| `mockReactNative(mock, { os, version, width, height })` / `createReactNativeStub()` | `Platform`, `AppState.emit()`, `Keyboard.emit()`, `Linking`, `Alert`, `I18nManager`, `NativeEventEmitter`, `NativeModules`; recorded side effects under `__recorded`. Add fields to the stub before mocking if a module needs more.                                                             |
| `installRenderHarness(mock, options)` (`render.tsx`)                                | Component rendering: renderable RN and native-UI fakes, real ThemeProvider and `en` i18n, Testing-Library-style queries, `press`. See "Rendering components".                                                                                                                                   |
| `mockBarrel(mock, 'stores/index.ts', { provide, real })`                            | Replaces a barrel without loading what it re-exports; unprovided exports throw a descriptive error when used.                                                                                                                                                                                   |
| `mockPackage(mock, specifier, exports)`                                             | `mockModule` for a third-party package: covers both its import and require resolutions and keeps its real source out of the loader.                                                                                                                                                             |
| `createReactHookRuntime()`                                                          | A `react` replacement (`runtime.react`) plus `mount(hook, ...args)` → `{ result, renderCount, cleanupCount, rerender, flushEffects, commit, unmount }`, `mountedInstances` / `unmountAll()` for `afterEach`, `setContextValue()`, and `installIntervalLeakGuard()`.                             |

### Gotchas the first wave hit

- **`mock.timers.tick(ms)` advances the clock by the whole span before running
  any due callback.** An interval polling every second, ticked by 300 s, fires
  300 times all seeing the post-expiry time. Step the clock in interval-sized
  increments (a `tickSeconds(n)` helper) when the callback reads the time.
- **Hooks that own intervals must be unmounted, or the file never exits.**
  `runtime.unmountAll()` in `afterEach`, followed by
  `installIntervalLeakGuard().assertNoLeaks()`. `useAudioPlayer.test.ts` is the
  reference implementation.
- **Calendar logic needs a pinned zone.** Set `process.env.TZ` at the top of a
  dedicated test file (each file is its own process). `progressStore.timezone.test.ts`
  covers day boundaries and DST that way.
- **Import-time constants need one file per scenario** (`utils/platform.*.test.ts`,
  `supabase/client.*.behavior.test.ts`).
- **Hook harnesses trip `react-hooks/rules-of-hooks`.** Going through
  `runtime.mount(useThing)` avoids it, because the hook is passed as a value
  rather than called. A file that still calls a hook by name needs
  `/* eslint-disable react-hooks/rules-of-hooks -- harness invokes the hook outside React by design */`
  at the top.
- **`@supabase/supabase-js` is a dual package.** Under tsx the importer may
  `require` it, so mock both the bare specifier and
  `createRequire(import.meta.url).resolve('@supabase/supabase-js')`.
- **A `require()` of JSON data is intercepted by path**, not by stubbing
  `globalThis.require`: `mockModule(mock, fileURLToPath(new URL('../../../data/x.json', import.meta.url).href), { default: fixture })`.
- **Coverage line lists are approximate.** Node maps V8 ranges through tsx's
  source maps and often reports blank lines, comments, and signatures as
  uncovered. Trust the percentages and verify a named gap by reading the source.

Zustand stores: after loading, reset between tests with
`useStore.setState(useStore.getInitialState(), true)` or the store's own reset
action, and clear the MMKV map.

SQLite: `bibleDatabase.ts` talks to `expo-sqlite`. Node 26 ships `node:sqlite`;
an adapter that maps `execAsync` / `getAllAsync` / `getFirstAsync` / `runAsync`
onto a `DatabaseSync` gives real SQL execution in tests.

React hooks: prefer testing the logic hooks delegate to (models, coordinators,
stores). A hook that drives a component is best exercised by rendering that
component (next section). Where a hook itself must be exercised in isolation,
use `createReactHookRuntime()` from `src/testing/reactHookRuntime.ts` instead of
writing another harness:

```ts
const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
afterEach(() => runtime.unmountAll());

const view = runtime.mount(useThing, 'bsb');
await view.commit(); // run queued effects, then drain microtasks
view.result.play(); // `result` is a getter: always the latest render
view.rerender(); // re-render with the previous arguments
view.unmount(); // run every live cleanup
```

Two things it is easy to get wrong on your own:

- **Effects only run at commit.** `mount()` and `rerender()` queue them.
  `flushEffects()` runs them synchronously; `commit()` runs them and then
  drains microtasks, which is what a hook needs when it reaches a collaborator
  through a lazy `import()` — the call is made a tick after the effect body.
  `useTranslationContentSummary.test.ts` depends on that.
- **A hook that owns an interval must be unmounted, or the file never exits.**
  `runtime.installIntervalLeakGuard()` wraps `setInterval` / `clearInterval`;
  call `assertNoLeaks()` in `afterEach` (after `unmountAll()`) to turn a hang
  into an ordinary failure naming the test that leaked, and `restore()` in
  `after()`. `useAudioPlayer.test.ts` is the reference use.

`setState` writes its slot — functional updaters see the newest value — but does
not schedule a render; rendering is explicit. That is the one deliberate
divergence from React. See `useSync.behavior.test.ts` for the re-render and
subscription lifecycle, and `reactHookRuntime.test.ts` for the exact contract.

## Rendering components

`src/testing/render.tsx` renders real components with `react-test-renderer`
(React's own non-DOM renderer, pinned to the installed React version; React 19
deprecates it but it is the only renderer that runs without a DOM or Jest). Test
files that render use the `.test.tsx` extension. Assert what a user or a screen
reader gets: text shown, roles, labels and states, what a press does, what
renders under which state. `components/ui/primitives.render.test.tsx` and
`TabSwitch.render.test.tsx` are the reference files.

```tsx
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installRenderHarness, within } from '../../testing/render';

// Module scope, before the component is imported.
const harness = installRenderHarness(mock, {
  os: 'ios',
  hooks: { useFontSize: () => fakeFontSize },
});

test('a disabled row is announced as disabled and ignores presses', async () => {
  const { ListRow } = await import('./ListRow'); // dynamic, after the mocks
  let pressed = 0;
  const view = await harness.render(
    <ListRow title="Download" disabled onPress={() => pressed++} />
  );

  const row = view.getByRole('button', { name: 'Download', disabled: true });
  await view.press(row);
  assert.equal(pressed, 0);
});
```

What `installRenderHarness(mock, options)` installs:

- **`react-native`** as `createReactNativeStub()` plus renderable primitives.
  `View`, `Text`, `Pressable`, `TouchableOpacity`, `TextInput`, `Switch`,
  `Image`, `ScrollView`, `Modal`, `KeyboardAvoidingView`, ... each render a host
  element of the same name carrying the component's props. `FlatList` and
  `SectionList` render every item plus their header/empty/footer slots. `Modal`
  renders nothing while `visible={false}`. `Share`, `AccessibilityInfo`
  announcements and `ActionSheetIOS` are recorded under `harness.rn.__recorded`;
  `harness.rn.BackHandler.press()` delivers a hardware back press.
- **Native UI packages**: reanimated (shared values are refs, `withTiming` /
  `withSpring` land at once and are recorded in `harness.animations`,
  `useReducedMotion` follows `harness.setReduceMotion()`, `Animated.FlatList`
  renders every item like the `FlatList` fake, and `useAnimatedScrollHandler`
  returns a handler that runs its `onScroll` worklet, so
  `view.fire(list, 'onScroll', { nativeEvent: { contentOffset, layoutMeasurement, contentSize } })`
  drives scroll-linked motion), safe-area-context
  (`harness.insets`), react-native-svg (`Svg`, `Svg.Path`, ...), `@expo/vector-icons`
  (host `Icon` with `family` and `name`), lucide (host `LucideIcon` with `name`),
  `expo-linear-gradient`, `expo-blur`, `expo-haptics` (`harness.haptics`),
  gesture-handler, and `@react-navigation/native` (`useNavigation()` records into
  `harness.navigation.calls`; set `harness.navigation.route.params`;
  `useFocusEffect` runs like an effect).
- **`stores/authStore`** as a real Zustand store (`harness.authStore`) holding
  `preferences` and whatever the test sets. The real `ThemeProvider` reads it, so
  `harness.authStore.getState().setPreferences({ theme: 'dark' })` before a render
  renders the dark scope.
- **The `hooks` barrel** through `mockBarrel`: `useDisplayFont`,
  `useTabBarHeight` and `useKeyboardBottomInset` stay real; anything else a
  component takes from `../../hooks` is passed in `options.hooks`. (`useLargeText` is also real.)

Every render is wrapped in `I18nextProvider` (a private i18next instance with the
real `en` locale, `harness.i18n`) and the real `ThemeProvider`. Pass
`{ wrapper }` to `render` for more providers. Everything rendered is unmounted,
and the recorders are cleared, after each test.

`render()` resolves to queries plus actions:

| Query / action                                                           | Behaviour                                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getByText` / `queryByText` / `getAllByText`                             | Host `Text` whose full text content matches (string = exact, or RegExp). Nested `Text` returns the innermost match.                                                                                              |
| `getByRole(role, { name, selected, checked, disabled, expanded, busy })` | `accessibilityRole` (or `role`); `name` matches the accessibility label, else the text content. States read `accessibilityState`, and `disabled` also reads the `disabled` prop, as RN's touchables announce it. |
| `getByLabelText`, `getByTestId`, `queryAllByType('Switch')`              | By `accessibilityLabel`, `testID`, or host type.                                                                                                                                                                 |
| `press(node)` / `longPress(node)`                                        | Finds the nearest `onPress` at or above `node`, fires `onPressIn`, `onPress`, `onPressOut` inside `act`. A touchable with `disabled` (or, lacking it, `accessibilityState.disabled`) gets nothing, as on device. |
| `changeText(node, text)`, `fire(node, 'onValueChange', true)`            | Call the nearest handler prop inside `act`.                                                                                                                                                                      |
| `rerender(el)`, `unmount()`, `flush()`, `debug()`                        | `flush` settles effects and microtasks; `debug` prints the host tree (also printed when a `getBy*` fails).                                                                                                       |

Role and label queries skip elements a screen reader cannot reach
(`importantForAccessibility="no-hide-descendants"`, `accessibilityElementsHidden`,
`aria-hidden` on the element or an ancestor); pass `{ includeHidden: true }` to
see them, and use `isHiddenFromAccessibility(node)` to assert decorative content.
`within(node)` scopes the queries to one subtree. `flattenStyle(node.props.style)`
merges a style array for layout and colour assertions. `hostAncestors(node)` lists
the enclosing host elements nearest first; use it instead of counting `.parent`
hops, which alternate between host elements and the components that rendered them.
Assets a component `require()`s (`.png`, fonts, audio) load as `{ testUri: path }`.

Things that trip people up:

- **Get RN primitives for test-side JSX from `harness.rn`** (`const { Text } = harness.rn`).
  A test file's own `import('react-native')` is not routed to the fake.
- **Barrels are heavy.** A component importing `../../stores` or
  `../../services/audio` pulls in most of the app. Replace the barrel with
  `mockBarrel(mock, 'stores/index.ts', { provide: { useBibleStore }, real: [...] })`
  from `src/testing/mockModules`: every export still exists, provided ones are
  your fakes, `real` ones load from their defining file, and anything else throws
  a message naming what to provide as soon as it is used. Fake Zustand stores are
  real `create()` stores holding just the fields the component selects.
- **Mock third-party packages with `mockPackage(mock, 'pkg', exports)`**, not
  `mockModule`. It mocks both the import and the require resolution (dual packages
  such as lucide resolve differently for each), and it keeps the real file from
  ever reaching tsx: Node's mock still asks the loader for the original source,
  and a package that ships untranspiled Flow (react-native-view-shot) fails to
  compile there, which surfaces as a swallowed error inside whatever `try` did the
  import. The harness uses it for its own fakes.
- **Stores are imported by path** (`stores/index.ts` is not a barrel of stores):
  `mockModule(mock, sourcePath('stores/bibleStore.ts'), { useBibleStore })`.
- **Layout is not computed.** A component that waits for `onLayout` needs
  `view.fire(node, 'onLayout', { nativeEvent: { layout: { width, height } } })`.
- **Imperative ref calls are recorded.** `scrollToOffset`, `scrollToIndex`,
  `scrollTo`, `focus`, ... made through a host element's ref land in
  `harness.refCalls` as `{ type, method, args, props }` (cleared after each test), so
  assert what a component asked the native view to do.
- **A large screen gets a shared fixture.** `BibleReaderScreen` reaches most of
  the app; `screens/bible/BibleReaderScreen.renderFixture.tsx` installs its fakes
  once and is shared by the `BibleReaderScreen.*.render.test.tsx` files. Its
  `useAudioPlayer` reads the fake audio store, so a test changes playback with
  `setAudio({...})`, and it counts screen renders to prove position ticks stay in
  the leaves.
- **Reanimated worklets run at render time**, so an animated style reflects the
  shared value as of the last render, not a later `.value =` write.
- **Mutation-check new render tests**: break the behaviour in the component once
  (drop the label, flip the condition), watch the test fail, restore it.

## Bug fixes

Bugs found while writing tests are fixed test-first: write the failing test that
reproduces the bug, watch it fail, fix, watch it pass. Keep the fix minimal and
in the same commit as its test.
