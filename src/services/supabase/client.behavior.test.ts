import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mockModule, mockReactNative, sourcePath } from '../../testing/mockModules';

// This file deliberately does NOT use `mockSupabaseModule`: it tests the real
// client module, so `@supabase/supabase-js`, `expo-secure-store`, `react-native`
// and the runtime config it reads at import time are the things being faked.
// Platform and the env are import-time constants, so the web branch and the
// unconfigured branch live in their own files (client.web.behavior.test.ts,
// client.unconfigured.behavior.test.ts).

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
      autoRefreshToken?: boolean;
      persistSession?: boolean;
      detectSessionInUrl?: boolean;
    };
  };
}

const createClientCalls: CreateClientCall[] = [];
let currentUser: { id: string } | null = null;

const recordingClient = {
  name: 'recording-supabase-client',
  auth: {
    getUser: async () => ({ data: { user: currentUser }, error: null }),
  },
  /** Reads `this` so the test can prove the Proxy binds methods to the client. */
  describeSelf(): string {
    return this.name;
  },
};

const supabaseJsExports = {
  createClient: (url: string, key: string, options: CreateClientCall['options']) => {
    createClientCalls.push({ url, key, options });
    return recordingClient;
  },
  SupabaseClient: class {},
};
// @supabase/supabase-js is a dual package: the ESM entry answers `import` and
// the CJS entry answers `require`. tsx compiles this repo's TS to CJS, so the
// bare-specifier mock alone (which resolves to dist/index.mjs) never reaches
// client.ts — the resolved CJS entry has to be mocked as well.
mockModule(mock, '@supabase/supabase-js', supabaseJsExports);
mockModule(
  mock,
  createRequire(import.meta.url).resolve('@supabase/supabase-js'),
  supabaseJsExports
);

const secureStore: { store: Map<string, string>; calls: Array<[string, string]> } = {
  store: new Map(),
  calls: [],
};

mockModule(mock, 'expo-secure-store', {
  getItemAsync: async (key: string) => {
    secureStore.calls.push(['getItemAsync', key]);
    return secureStore.store.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
    secureStore.calls.push(['setItemAsync', key]);
    secureStore.store.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    secureStore.calls.push(['deleteItemAsync', key]);
    secureStore.store.delete(key);
  },
});

mockReactNative(mock, { os: 'ios' });

mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: {
    EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_key',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'legacy_anon_key',
  },
});

let client: typeof import('./client');

before(async () => {
  client = await import('./client');
});

beforeEach(() => {
  currentUser = null;
  secureStore.calls = [];
  secureStore.store.clear();
});

const storageAdapter = () => {
  const adapter = createClientCalls[0]?.options.auth?.storage;
  assert.ok(adapter, 'createClient must receive an auth storage adapter');
  return adapter;
};

// Must stay first: it asserts that nothing has touched the lazy proxy yet.
test('importing the module does not build a Supabase client', () => {
  assert.deepEqual(createClientCalls, []);
});

test('a build with a Supabase URL and key reports itself as configured', () => {
  assert.equal(client.isSupabaseConfigured(), true);
  assert.deepEqual(createClientCalls, []);
});

test('the first property read on the client builds it', () => {
  assert.equal((client.supabase as unknown as { name: string }).name, 'recording-supabase-client');
  assert.equal(createClientCalls.length, 1);
});

test('the client is built once and reused for every later access', () => {
  void client.supabase.auth;
  void client.supabase.auth;

  assert.equal(createClientCalls.length, 1);
});

test('the client is created with the publishable key in preference to the legacy anon key', () => {
  assert.equal(createClientCalls[0].url, 'https://project.supabase.co');
  assert.equal(createClientCalls[0].key, 'sb_publishable_key');
});

test('the client keeps sessions alive itself and ignores URL-borne sessions', () => {
  const authOptions = createClientCalls[0].options.auth;

  assert.equal(authOptions?.autoRefreshToken, true);
  assert.equal(authOptions?.persistSession, true);
  assert.equal(authOptions?.detectSessionInUrl, false);
});

test('methods reached through the proxy stay bound to the real client', () => {
  const { describeSelf } = client.supabase as unknown as { describeSelf: () => string };

  assert.equal(describeSelf(), 'recording-supabase-client');
});

test('non-function properties are handed through the proxy untouched', () => {
  assert.equal(client.supabase.auth, recordingClient.auth);
});

test('the auth storage adapter keeps session tokens in the iOS keychain', async () => {
  await storageAdapter().setItem('sb-access-token', 'token-1');

  assert.equal(await storageAdapter().getItem('sb-access-token'), 'token-1');
  assert.deepEqual(secureStore.calls, [
    ['setItemAsync', 'sb-access-token'],
    ['getItemAsync', 'sb-access-token'],
  ]);
});

test('the auth storage adapter reports a missing key as null', async () => {
  assert.equal(await storageAdapter().getItem('sb-never-written'), null);
});

test('the auth storage adapter deletes the keychain entry on removeItem', async () => {
  await storageAdapter().setItem('sb-access-token', 'token-1');
  await storageAdapter().removeItem('sb-access-token');

  assert.equal(secureStore.store.has('sb-access-token'), false);
  assert.deepEqual(secureStore.calls.at(-1), ['deleteItemAsync', 'sb-access-token']);
});

test('getCurrentUserId returns the id of the signed-in user', async () => {
  currentUser = { id: 'user-77' };

  assert.equal(await client.getCurrentUserId(), 'user-77');
});

test('getCurrentUserId returns null while nobody is signed in', async () => {
  assert.equal(await client.getCurrentUserId(), null);
});
