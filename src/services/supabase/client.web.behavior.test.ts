import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mockModule, mockReactNative, sourcePath } from '../../testing/mockModules';

// Companion to client.behavior.test.ts. `Platform.OS` and the env are read at
// import time / from a module-level const, so the web branch of the auth
// storage adapter and the legacy-anon-key fallback need their own file.

interface CreateClientCall {
  url: string;
  key: string;
  options: {
    auth?: {
      storage?: {
        getItem: (key: string) => Promise<string | null>;
        setItem: (key: string, value: string) => Promise<void>;
        removeItem: (key: string) => Promise<void>;
      };
    };
  };
}

const createClientCalls: CreateClientCall[] = [];
const recordingClient = {
  auth: { getUser: async () => ({ data: { user: null }, error: null }) },
};

const supabaseJsExports = {
  createClient: (url: string, key: string, options: CreateClientCall['options']) => {
    createClientCalls.push({ url, key, options });
    return recordingClient;
  },
  SupabaseClient: class {},
};
// Dual package: mock the ESM specifier and the resolved CJS entry that tsx's
// CommonJS output actually requires.
mockModule(mock, '@supabase/supabase-js', supabaseJsExports);
mockModule(
  mock,
  createRequire(import.meta.url).resolve('@supabase/supabase-js'),
  supabaseJsExports
);

const secureStoreCalls: string[] = [];
mockModule(mock, 'expo-secure-store', {
  getItemAsync: async (key: string) => {
    secureStoreCalls.push(`getItemAsync:${key}`);
    return null;
  },
  setItemAsync: async (key: string) => {
    secureStoreCalls.push(`setItemAsync:${key}`);
  },
  deleteItemAsync: async (key: string) => {
    secureStoreCalls.push(`deleteItemAsync:${key}`);
  },
});

mockReactNative(mock, { os: 'web' });

mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: {
    EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'legacy_anon_key',
  },
});

// Node only provides a real localStorage with --localstorage-file, so the web
// branch gets an in-memory one.
const webStorage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
    getItem: (key: string) => webStorage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      webStorage.set(key, value);
    },
    removeItem: (key: string) => {
      webStorage.delete(key);
    },
  },
});

let client: typeof import('./client');

before(async () => {
  client = await import('./client');
  // Touch the proxy once so createClient runs and exposes the storage adapter.
  void client.supabase.auth;
});

beforeEach(() => {
  webStorage.clear();
  secureStoreCalls.length = 0;
});

const storageAdapter = () => {
  const adapter = createClientCalls[0]?.options.auth?.storage;
  assert.ok(adapter, 'createClient must receive an auth storage adapter');
  return adapter;
};

test('a build with only the legacy anon key still counts as configured', () => {
  assert.equal(client.isSupabaseConfigured(), true);
});

test('the legacy anon key is used when no publishable key is present', () => {
  assert.equal(createClientCalls[0].key, 'legacy_anon_key');
});

test('the auth storage adapter round-trips session tokens through localStorage on web', async () => {
  await storageAdapter().setItem('sb-access-token', 'token-1');

  assert.equal(await storageAdapter().getItem('sb-access-token'), 'token-1');
  assert.equal(webStorage.get('sb-access-token'), 'token-1');
});

test('the auth storage adapter reports a missing localStorage key as null', async () => {
  assert.equal(await storageAdapter().getItem('sb-never-written'), null);
});

test('the auth storage adapter clears the localStorage entry on removeItem', async () => {
  await storageAdapter().setItem('sb-access-token', 'token-1');

  await storageAdapter().removeItem('sb-access-token');

  assert.equal(webStorage.has('sb-access-token'), false);
});

test('the web build never reaches for the native keychain', async () => {
  await storageAdapter().setItem('sb-access-token', 'token-1');
  await storageAdapter().getItem('sb-access-token');
  await storageAdapter().removeItem('sb-access-token');

  assert.deepEqual(secureStoreCalls, []);
});
