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
let delayRemoval = false;
let delayedSession = false;
let releaseSession!: () => void;
let sessionRemoving!: () => void;
const sessionRemovalStarted = new Promise<void>((resolve) => {
  sessionRemoving = resolve;
});
mockModule(mock, 'expo-secure-store', {
  AFTER_FIRST_UNLOCK: 'after-first-unlock',
  getItemAsync: async (key: string) => values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    values.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (delayRemoval && key === storageKey && !delayedSession) {
      delayedSession = true;
      sessionRemoving();
      await new Promise<void>((resolve) => {
        releaseSession = resolve;
      });
    }
    values.delete(key);
  },
});
mockReactNative(mock, { os: 'ios' });
const mmkv = mockMmkvStorage(mock);
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
  if (String(input).includes('/logout')) return new Response(null, { status: 204 });
  throw new Error('Unexpected local test request');
};
let client: typeof import('../supabase/client');
after(async () => {
  await client?.supabase.auth.stopAutoRefresh();
  globalThis.fetch = originalFetch;
});

test('guarded sign-out preserves a new login during deferred native session removal with the installed client', async (t) => {
  client = await import('../supabase/client');
  const { signOut } = await import('./authService');
  let owner: string | null = 'user-a';
  const events: { event: string; uid: string | null }[] = [];
  client.supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;
    owner = session?.user.id ?? null;
    events.push({ event, uid: owner });
  });
  await client.supabase.auth.getSession();
  const privateAuth = client.supabase.auth as unknown as {
    suppressGetSessionWarning: boolean;
    storage: { setItem: (key: string, value: string) => Promise<void> };
  };
  let writeQueued!: () => void;
  const nextWriteQueued = new Promise<void>((resolve) => {
    writeQueued = resolve;
  });
  const setItem = privateAuth.storage.setItem;
  t.mock.method(privateAuth.storage, 'setItem', (key: string, value: string) => {
    const writing = setItem(key, value);
    if (key === storageKey && JSON.parse(value)?.user.id === 'user-b') writeQueued();
    return writing;
  });
  privateAuth.suppressGetSessionWarning = true;
  delayRemoval = true;
  const signingOut = signOut(() => owner === 'user-a');
  await sessionRemovalStarted;
  assert.equal(mmkv.store.get(`auth-session-removal-intent:${storageKey}`), '1');
  assert.equal(privateAuth.suppressGetSessionWarning, false, 'matches installed local removal');
  const signingIn = client.supabase.auth.signInWithPassword({
    email: 'next@example.test',
    password: 'local-test',
  });
  await nextWriteQueued;
  releaseSession();
  const signedIn = await signingIn;
  assert.equal(signedIn.error, null);
  assert.equal(mmkv.store.has(`auth-session-removal-intent:${storageKey}`), false);
  assert.equal(owner, 'user-b');
  await signingOut;
  const { data } = await client.supabase.auth.getSession();
  assert.equal(data.session?.user.id, 'user-b');
  assert.equal(JSON.parse(values.get(storageKey) ?? 'null')?.user.id, 'user-b');
  const signedInAt = events.findIndex(
    (entry) => entry.event === 'SIGNED_IN' && entry.uid === 'user-b'
  );
  assert.ok(signedInAt >= 0);
  assert.equal(
    events.slice(signedInAt + 1).some((entry) => entry.event === 'SIGNED_OUT'),
    false
  );
});
