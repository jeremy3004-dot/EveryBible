import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  mockExpoCrypto,
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  sourcePath,
} from '../../testing/mockModules';
import { makeFakeSession, makeFakeUser } from '../../testing/supabaseFake';

const ref = 'accountswapabcdefghij';
const storageKey = `sb-${ref}-auth-token`;
const original = makeFakeSession({ user: makeFakeUser({ id: 'user-a' }) });
const next = makeFakeSession({ user: makeFakeUser({ id: 'user-b' }), access_token: 'next-token' });
const values = new Map<string, string>([[storageKey, JSON.stringify(original)]]);
let failNativeDelete = false;
const mmkv = mockMmkvStorage(mock);
mockModule(mock, 'expo-secure-store', {
  AFTER_FIRST_UNLOCK: 'after-first-unlock',
  getItemAsync: async (key: string) => values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    values.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (failNativeDelete) throw new Error('native keychain deletion failed');
    values.delete(key);
  },
});
mockReactNative(mock, { os: 'ios' });
mockExpoCrypto(mock);
mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: {
    EXPO_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fake-public-key',
  },
});
mockModule(mock, 'expo-apple-authentication', {
  AppleAuthenticationScope: { FULL_NAME: 'FULL_NAME', EMAIL: 'EMAIL' },
  signInAsync: async () => ({ identityToken: null }),
});
mockModule(mock, '@react-native-google-signin/google-signin', {
  GoogleSignin: {
    configure: () => {},
    hasPlayServices: async () => true,
    signIn: async () => ({}),
  },
  isErrorWithCode: () => false,
  statusCodes: {},
});
const connectivity: Record<string, unknown> = {
  fetch: async () => ({ isConnected: true, isInternetReachable: true }),
};
connectivity.default = connectivity;
mockModule(mock, '@react-native-community/netinfo', connectivity);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  if (String(input).includes('/token?grant_type=password')) {
    return new Response(JSON.stringify(next), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (String(input).includes('/token?grant_type=refresh_token')) {
    return new Response(JSON.stringify(original), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (String(input).includes('/logout')) return new Response(null, { status: 204 });
  throw new Error('Unexpected local test request');
};
let client: typeof import('../supabase/client');
after(async () => {
  await client?.supabase.auth.stopAutoRefresh();
  globalThis.fetch = originalFetch;
});

for (const guarded of [false, true]) {
  test(`durable intent admission failure cannot report ${guarded ? 'guarded' : 'unguarded'} local sign-out success`, async (t) => {
    client = await import('../supabase/client');
    const { signOut } = await import('./authService');
    const events: string[] = [];
    const {
      data: { subscription },
    } = client.supabase.auth.onAuthStateChange((event) => {
      events.push(event);
    });
    await client.supabase.auth.getSession();
    t.mock.method(mmkv.mmkvInstance, 'set', () => {
      throw new Error('intent persistence unavailable');
    });
    const result = await signOut(guarded ? () => true : undefined);
    assert.equal(result.success, false);
    assert.equal(result.localRemovalFailed, true);
    assert.equal(events.includes('SIGNED_OUT'), false);
    assert.equal((await client.supabase.auth.getSession()).data.session?.user.id, 'user-a');
    assert.ok(values.get(storageKey));
    const refreshed = await client.supabase.auth.refreshSession();
    assert.equal(refreshed.error, null, 'failed admission must permit the next refresh');
    assert.equal(refreshed.data.session?.user.id, 'user-a');
    subscription.unsubscribe();
  });
}

test('two concurrent failed local admissions leave the installed client able to refresh', async (t) => {
  client = await import('../supabase/client');
  const { signOut } = await import('./authService');
  t.mock.method(mmkv.mmkvInstance, 'set', () => {
    throw new Error('intent persistence unavailable');
  });
  const results = await Promise.all([signOut(() => true), signOut(() => true)]);
  assert.equal(
    results.every((result) => result.localRemovalFailed),
    true
  );
  const refreshed = await client.supabase.auth.refreshSession();
  assert.equal(refreshed.error, null);
  assert.equal(refreshed.data.session?.user.id, 'user-a');
});

test('auxiliary intent failure after primary masking cannot retain the old authenticated session', async (t) => {
  client = await import('../supabase/client');
  const { signOut } = await import('./authService');
  const events: string[] = [];
  const {
    data: { subscription },
  } = client.supabase.auth.onAuthStateChange((event) => {
    events.push(event);
  });
  const mark = mmkv.mmkvInstance.set;
  t.mock.method(mmkv.mmkvInstance, 'set', (key: string, value: string | number | boolean) => {
    if (key.includes('-code-verifier') || key.endsWith('-user'))
      throw new Error('auxiliary intent unavailable');
    mark(key, value);
  });
  connectivity.fetch = async () => ({ isConnected: false, isInternetReachable: false });
  assert.deepEqual(await signOut(() => true), { success: true });
  assert.equal((await client.supabase.auth.getSession()).data.session, null);
  assert.equal(events.includes('SIGNED_OUT'), true);
  subscription.unsubscribe();
  // A fresh legitimate session is supplied through the installed client's adapter.
  const auth = client.supabase.auth as unknown as {
    storage: { setItem: (key: string, value: string) => Promise<void> };
  };
  await auth.storage.setItem(storageKey, JSON.stringify(original));
});

test('offline sign-out with a failed native deletion must remain signed out on cold start', async () => {
  client = await import('../supabase/client');
  const { signOut } = await import('./authService');
  const { createAuthSessionStorage } = await import('../supabase/authSessionStorage');
  const { createClient } = await import('@supabase/supabase-js');
  await client.supabase.auth.getSession();
  connectivity.fetch = async () => ({ isConnected: false, isInternetReachable: false });
  failNativeDelete = true;
  assert.deepEqual(await signOut(() => true), { success: true });
  assert.equal(
    (await client.supabase.auth.getSession()).data.session,
    null,
    'memory hides the refused deletion in this process'
  );
  assert.ok(values.get(storageKey), 'native persisted old session remains');
  // A new process loses both adapter pending deletes and refresh-token fences.
  // The installed client reads the exact retained native data with a fresh adapter.
  failNativeDelete = false;
  const coldStorage = createAuthSessionStorage(
    {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => {
        values.set(key, value);
      },
      deleteItemAsync: async (key) => {
        values.delete(key);
      },
    },
    () => {},
    {},
    {
      has: (key) => mmkv.store.has(`auth-session-removal-intent:${key}`),
      mark: (key) => {
        mmkv.store.set(`auth-session-removal-intent:${key}`, '1');
      },
      clear: (key) => {
        mmkv.store.delete(`auth-session-removal-intent:${key}`);
      },
    }
  );
  const coldClient = createClient(`https://${ref}.supabase.co`, 'fake-public-key', {
    auth: {
      storage: coldStorage,
      storageKey,
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: {
      fetch: async () => {
        throw new Error('offline local test');
      },
    },
  });
  try {
    const restored = await coldClient.auth.getSession();
    assert.equal(restored.data.session, null, 'a successful sign-out cannot resurrect accountA');
  } finally {
    await coldClient.auth.stopAutoRefresh();
  }
});
