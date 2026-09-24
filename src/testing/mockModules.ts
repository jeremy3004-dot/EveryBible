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
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { MockTracker } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createReactNativeStub, type ReactNativeStubOptions } from './reactNativeStub';
import type { SupabaseFake } from './supabaseFake';

type ModuleMockOptions = Parameters<MockTracker['module']>[1];

/**
 * Keep CI's Node 22 option shape compatible with Node 26's exports API.
 * `exports` may include a `default` key for default-import consumers.
 */
export function mockModule(
  mocker: MockTracker,
  specifier: string,
  exports: Record<string, unknown>
): ReturnType<MockTracker['module']> {
  if (Number(process.versions.node.split('.')[0]) < 26) {
    const { default: defaultExport, ...namedExports } = exports;
    return mocker.module(specifier, {
      namedExports,
      ...('default' in exports ? { defaultExport } : {}),
    });
  }
  return mocker.module(specifier, { exports } as unknown as ModuleMockOptions);
}

/**
 * Mock a package under both of its resolutions. A dual package (an `exports`
 * map with separate `import` and `require` files, like lucide-react-native or
 * supabase-js) resolves to a different file for tsx's `require()` than for the
 * bare-specifier mock, and the real package would load behind the mock.
 */
export function mockPackage(
  mocker: MockTracker,
  specifier: string,
  moduleExports: Record<string, unknown>
): void {
  // A CommonJS `require()` of a mock gets its default export with the named
  // exports assigned onto it, which Node refuses when the default is a function
  // (react-native-svg's default is the `Svg` component). Hand such packages over
  // as an ES-module-shaped object instead; tsx's import interop unwraps it.
  const exports =
    typeof moduleExports.default === 'function'
      ? { default: { __esModule: true, ...moduleExports } }
      : moduleExports;
  mockModule(mocker, specifier, exports);
  let requirePath: string | null = null;
  try {
    requirePath = createRequire(import.meta.url).resolve(specifier);
  } catch {
    // Not installed (or not resolvable with the require condition): the bare mock is enough.
  }
  if (requirePath) {
    try {
      mockModule(mocker, requirePath, exports);
    } catch (error) {
      // Single-entry packages resolve to the file the bare mock already covers.
      if ((error as { code?: string }).code !== 'ERR_INVALID_STATE') throw error;
    }
  }
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

const SOURCE_EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

function resolveSourceFile(fromFile: string, specifier: string): string {
  const base = join(dirname(fromFile), specifier);
  for (const extension of SOURCE_EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`mockBarrel: cannot resolve ${specifier} from ${fromFile}`);
}

/** Value exports of a source file: exported name -> [defining file, name there]. */
function readValueExports(file: string): Map<string, [string, string]> {
  const source = readFileSync(file, 'utf8');
  const found = new Map<string, [string, string]>();
  for (const match of source.matchAll(/export\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const target = resolveSourceFile(file, match[2]);
    for (const raw of match[1].split(',')) {
      const entry = raw.trim();
      if (!entry || entry.startsWith('type ')) continue;
      const [original, alias] = entry.split(/\s+as\s+/);
      found.set(alias ?? original, [target, original]);
    }
  }
  for (const match of source.matchAll(/export\s*\*\s*from\s*'([^']+)'/g)) {
    const target = resolveSourceFile(file, match[1]);
    for (const [name, origin] of readValueExports(target)) found.set(name, origin);
  }
  for (const match of source.matchAll(
    /export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|enum)\s+(\w+)/g
  )) {
    found.set(match[1], [file, match[1]]);
  }
  return found;
}

/**
 * An export the test did not provide. Using it (calling it, reading a property)
 * throws a message naming the missing fake, instead of an opaque
 * `undefined is not a function` deep inside a render.
 */
function notProvided(barrel: string, name: string): unknown {
  const fail = () => {
    throw new Error(
      `${name} from ${barrel} is not faked in this test: pass it to mockBarrel(..., { provide: { ${name} } })`
    );
  };
  return new Proxy(fail, {
    apply: fail,
    get: (_target, property) => {
      if (typeof property === 'symbol' || property === 'then' || property === '$$typeof') {
        return undefined;
      }
      return fail();
    },
  });
}

export interface MockBarrelOptions {
  /** Fakes for the exports the code under test uses. */
  provide?: Record<string, unknown>;
  /**
   * Exports to take from their real defining module, loaded now, so every mock
   * they depend on must already be installed. For light modules only.
   */
  real?: string[];
}

/**
 * Replace a barrel (`hooks/index.ts`, `stores/index.ts`, ...) so that importing
 * it does not load everything it re-exports. Every value export still exists:
 * `provide`d ones are the given fakes, `real` ones come from their own file, and
 * the rest throw a descriptive error when used.
 */
export function mockBarrel(
  mocker: MockTracker,
  barrelRelativeToSrc: string,
  options: MockBarrelOptions = {}
): Record<string, unknown> {
  const barrelFile = sourcePath(barrelRelativeToSrc);
  const provide = options.provide ?? {};
  const real = new Set(options.real ?? []);
  const requireSource = createRequire(import.meta.url);
  const exports: Record<string, unknown> = {};
  for (const [name, [file, original]] of readValueExports(barrelFile)) {
    if (name in provide) {
      exports[name] = provide[name];
    } else if (real.has(name)) {
      exports[name] = (requireSource(file) as Record<string, unknown>)[original];
    } else {
      exports[name] = notProvided(barrelRelativeToSrc, name);
    }
  }
  for (const name of [...Object.keys(provide), ...real]) {
    if (!(name in exports)) {
      throw new Error(`mockBarrel: ${barrelRelativeToSrc} does not export ${name}`);
    }
  }
  mockModule(mocker, barrelFile, exports);
  return exports;
}
