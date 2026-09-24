import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  mockModule,
  mockReactNative,
  mockSecureStore,
  sourcePath,
} from '../../testing/mockModules';

// Contract with the installed @supabase/supabase-js: the offline restore reads
// the session auth-js persisted through the client's own `storage` and
// `storageKey`, which are not public API. This runs the real client module and
// the real supabase-js over an in-memory keychain, so an upgrade that renames
// either field fails here instead of silently bringing back the 4 s offline hold.

const PROJECT_REF = 'abcdefghijklmnop';
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

const keychain = mockSecureStore(mock);
mockReactNative(mock, { os: 'ios' });
mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: {
    EXPO_PUBLIC_SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  },
});

const netInfoFake: Record<string, unknown> = {
  fetch: async () => ({ isConnected: false, isInternetReachable: false }),
};
netInfoFake.default = netInfoFake;
mockModule(mock, '@react-native-community/netinfo', netInfoFake);

// Offline: a request never answers. (A throwing fetch would start auth-js's
// timed retry backoff, which would keep this file running for about 30 s.)
const requests: string[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL) => {
  requests.push(String(input));
  return new Promise<Response>(() => {});
}) as typeof fetch;

let authSession: typeof import('./authSession');
let client: typeof import('../supabase/client');

const nowInSeconds = () => Math.floor(Date.now() / 1000);
const storedSession = (expiresAt: number) =>
  JSON.stringify({
    access_token: `token-${expiresAt}`,
    refresh_token: 'refresh-token',
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: {
      id: 'user-a',
      aud: 'authenticated',
      email: 'reader@example.com',
      app_metadata: {},
      user_metadata: { full_name: 'Ruth' },
      created_at: '2026-01-01T00:00:00.000Z',
    },
  });

before(async () => {
  client = await import('../supabase/client');
  authSession = await import('./authSession');
});

after(() => {
  client.supabase.auth.stopAutoRefresh();
  globalThis.fetch = originalFetch;
});

test('supabase-js reads its session from the key the offline restore reads', async () => {
  // A token that is still valid needs no network, so getSession answers.
  keychain.store.set(STORAGE_KEY, storedSession(nowInSeconds() + 3600));

  const { data } = await client.supabase.auth.getSession();

  assert.equal(data.session?.user.id, 'user-a');
});

test('an offline launch with an expired token restores the stored session from supabase-js storage', async () => {
  const expiredAt = nowInSeconds() - 3600;
  keychain.store.set(STORAGE_KEY, storedSession(expiredAt));

  const restored = await authSession.getCurrentSession();

  assert.equal(restored.awaitingTokenRefresh, true);
  assert.equal(restored.session?.access_token, `token-${expiredAt}`);
  assert.equal(restored.user?.uid, 'user-a');
  assert.equal(restored.user?.displayName, 'Ruth');
  assert.deepEqual(requests, []);
});
