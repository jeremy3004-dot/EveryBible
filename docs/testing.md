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
```

Any `*.test.ts` under `src/`, `scripts/`, `apps/`, `packages/`, or
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

Do not write source-text tests (`readFileSync` + regex on the code shape) for
behaviour. They exist in this repo for startup-import-graph guards only and
break on harmless refactors. Do not use the `ts.transpileModule` +
`runInNewContext` trick either; it bypasses the loader and coverage.

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

### Gotchas the first wave hit

- **`mock.timers.tick(ms)` advances the clock by the whole span before running
  any due callback.** An interval polling every second, ticked by 300 s, fires
  300 times all seeing the post-expiry time. Step the clock in interval-sized
  increments (a `tickSeconds(n)` helper) when the callback reads the time.
- **Hooks that own intervals must be unmounted, or the file never exits.**
  Track every mounted harness instance and unmount in `afterEach`; wrap
  `setInterval`/`clearInterval` at module scope and assert nothing leaked.
  `useAudioPlayer.test.ts` is the reference implementation.
- **Calendar logic needs a pinned zone.** Set `process.env.TZ` at the top of a
  dedicated test file (each file is its own process). `progressStore.timezone.test.ts`
  covers day boundaries and DST that way.
- **Import-time constants need one file per scenario** (`utils/platform.*.test.ts`,
  `supabase/client.*.behavior.test.ts`).
- **Hook harnesses trip `react-hooks/rules-of-hooks`.** Put
  `/* eslint-disable react-hooks/rules-of-hooks -- harness invokes the hook outside React by design */`
  at the top of that test file.
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

React hooks: there is no renderer installed. Test the logic hooks delegate to
(models, coordinators, stores). Where a hook must be exercised, mock `react`
with a small deterministic runtime: per-render state slots for `useState`,
stable `useRef`, dependency-comparing `useMemo` / `useCallback`, and a
`useEffect` queue that runs (with the previous cleanup) when the test calls a
`flushEffects()` / `commit()` helper that also drains microtasks. See
`useSync.behavior.test.ts` and `useAudioPlayer.test.ts`.

## Bug fixes

Bugs found while writing tests are fixed test-first: write the failing test that
reproduces the bug, watch it fail, fix, watch it pass. Keep the fix minimal and
in the same commit as its test.
