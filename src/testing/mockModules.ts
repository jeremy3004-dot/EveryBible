/**
 * Helpers that install `mock.module` replacements for the native-backed
 * modules this app cannot load under node --test.
 *
 * All helpers take the MockTracker to use: pass the top-level `mock` from
 * `node:test` (lives for the whole file) or `t.mock` inside a test (restored
 * when that test ends). Module mocks MUST be installed before the module under
 * test is imported, and the module under test must then be loaded with a
 * dynamic `await import(...)` — static imports are hoisted above the mock call.
 *
 * Because ESM caches modules, one test file should use one mock configuration.
 * Drive different scenarios through the fakes' mutable state (e.g.
 * `fake.auth.setSession(...)`, `rn.AppState.emit('background')`), not by
 * re-mocking.
 */
import type { MockTracker } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createReactNativeStub, type ReactNativeStubOptions } from './reactNativeStub';
import type { SupabaseFake } from './supabaseFake';

type ModuleMockOptions = Parameters<MockTracker['module']>[1];

/**
 * `mock.module(specifier, { exports })` with the Node 26 option shape. The
 * installed `@types/node` only knows the deprecated `namedExports` form, so
 * this wrapper carries the one cast every test would otherwise repeat.
 * `exports` may include a `default` key for default-import consumers.
 */
export function mockModule(
  mocker: MockTracker,
  specifier: string,
  exports: Record<string, unknown>
): ReturnType<MockTracker['module']> {
  return mocker.module(specifier, { exports } as unknown as ModuleMockOptions);
}

/** Absolute path of a repo source file, for `mock.module` keys. */
export const sourcePath = (relativeToSrc: string): string =>
  fileURLToPath(new URL(`../${relativeToSrc}`, import.meta.url).href);

/**
 * Replace `src/stores/mmkvStorage.ts` with an in-memory Map so persisted
 * Zustand stores can load and hydrate without react-native-mmkv.
 * Returns the backing map so tests can seed or inspect persisted JSON.
 */
export function mockMmkvStorage(mocker: MockTracker, seed?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  const mmkvInstance = {
    getString: (key: string) => store.get(key),
    set: (key: string, value: string | number | boolean) => {
      store.set(key, String(value));
    },
    delete: (key: string) => {
      store.delete(key);
    },
    contains: (key: string) => store.has(key),
    getAllKeys: () => Array.from(store.keys()),
    clearAll: () => {
      store.clear();
    },
  };
  const zustandStorage = {
    setItem: (name: string, value: string) => {
      store.set(name, value);
    },
    getItem: (name: string) => store.get(name) ?? null,
    removeItem: (name: string) => {
      store.delete(name);
    },
  };
  mockModule(mocker, sourcePath('stores/mmkvStorage.ts'), { mmkvInstance, zustandStorage });
  return { store, mmkvInstance, zustandStorage };
}

export interface MockSupabaseOptions {
  /**
   * What `isSupabaseConfigured()` reports. Default true. Pass a getter to flip
   * the backend on and off between tests without re-mocking.
   */
  configured?: boolean | (() => boolean);
  /**
   * What `getCurrentUserId()` resolves to. Default: the fake's current auth
   * user id (or null when unconfigured / signed out).
   */
  currentUserId?: () => Promise<string | null>;
}

/**
 * Replace both `src/services/supabase/index.ts` and `client.ts` with the fake,
 * so any import path (`'../supabase'` or `'../supabase/client'`) gets it.
 */
export function mockSupabaseModule(
  mocker: MockTracker,
  fake: SupabaseFake,
  options: MockSupabaseOptions = {}
) {
  const configuredOption = options.configured ?? true;
  const isConfigured = () =>
    typeof configuredOption === 'function' ? configuredOption() : configuredOption;
  const getCurrentUserId =
    options.currentUserId ??
    (async () => {
      if (!isConfigured()) {
        return null;
      }
      const { data } = await fake.client.auth.getUser();
      return data.user?.id ?? null;
    });
  const exports = {
    supabase: fake.client,
    isSupabaseConfigured: isConfigured,
    getCurrentUserId,
  };
  mockModule(mocker, sourcePath('services/supabase/index.ts'), exports);
  mockModule(mocker, sourcePath('services/supabase/client.ts'), exports);
  return exports;
}

/** Replace `react-native` with the recording stub. Returns the stub for assertions. */
export function mockReactNative(mocker: MockTracker, options: ReactNativeStubOptions = {}) {
  const stub = createReactNativeStub(options);
  mockModule(mocker, 'react-native', stub);
  return stub;
}
