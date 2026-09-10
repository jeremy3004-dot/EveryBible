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
import { createHash } from 'node:crypto';
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

export interface SecureStoreCall {
  op: 'get' | 'set' | 'delete';
  key: string;
  options?: unknown;
}

/**
 * Replace `expo-secure-store` with an in-memory keystore. Returns the backing
 * map (seed or inspect it), the recorded calls (each carries the options object
 * the caller passed, so keychain-accessibility can be asserted) and a mutable
 * `failure` slot: set it and every operation rejects, the way a locked keychain
 * does.
 */
export function mockSecureStore(mocker: MockTracker, seed?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  const calls: SecureStoreCall[] = [];
  const state: { failure: unknown } = { failure: null };

  const guard = () => {
    if (state.failure) {
      throw state.failure;
    }
  };

  mockModule(mocker, 'expo-secure-store', {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
    getItemAsync: async (key: string, options?: unknown) => {
      calls.push({ op: 'get', key, options });
      guard();
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItemAsync: async (key: string, value: string, options?: unknown) => {
      calls.push({ op: 'set', key, options });
      guard();
      store.set(key, value);
    },
    deleteItemAsync: async (key: string, options?: unknown) => {
      calls.push({ op: 'delete', key, options });
      guard();
      store.delete(key);
    },
  });

  return { store, calls, state };
}

/**
 * Replace `expo-crypto` with a deterministic double: `getRandomBytesAsync`
 * hands out a byte counter (reproducible hex nonces/salts) and
 * `digestStringAsync` computes a real SHA-256 through `node:crypto`. Either
 * half can be made to reject through the returned `state`, which is how the
 * "the nonce is mandatory" and "the PIN cannot be hashed" paths are exercised.
 */
export function mockExpoCrypto(mocker: MockTracker) {
  const state: {
    randomFailure: unknown;
    digestFailure: unknown;
    randomLengths: number[];
    digestAlgorithms: string[];
    cursor: number;
  } = {
    randomFailure: null,
    digestFailure: null,
    randomLengths: [],
    digestAlgorithms: [],
    cursor: 0,
  };

  mockModule(mocker, 'expo-crypto', {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
    getRandomBytesAsync: async (length: number) => {
      state.randomLengths.push(length);
      if (state.randomFailure) {
        throw state.randomFailure;
      }
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) {
        bytes[index] = state.cursor & 0xff;
        state.cursor += 1;
      }
      return bytes;
    },
    digestStringAsync: async (algorithm: string, value: string) => {
      state.digestAlgorithms.push(algorithm);
      if (state.digestFailure) {
        throw state.digestFailure;
      }
      return createHash('sha256').update(value).digest('hex');
    },
  });

  const reset = () => {
    state.randomFailure = null;
    state.digestFailure = null;
    state.randomLengths = [];
    state.digestAlgorithms = [];
    state.cursor = 0;
  };

  return { state, reset };
}
