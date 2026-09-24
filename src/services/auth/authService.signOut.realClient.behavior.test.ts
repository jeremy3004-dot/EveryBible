import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  mockExpoCrypto,
  mockModule,
  mockReactNative,
  mockSecureStore,
  sourcePath,
} from '../../testing/mockModules';

// Sign-out against the real client module and the installed supabase-js, over an
// in-memory keychain and a network the test answers by hand. It pins what sign-out
// relies on: auth.admin.signOut is a bare logout request, and a token refresh already
// under way when the reader signs out can never save their session again or sign them
// back in, even if the server answers it later.

const PROJECT_REF = 'abcdefghijklmnop';
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

// Fake clock from the start: auth-js retries a failed refresh with sleeps for up to
// 30 s (Date-based), which the test fast-forwards instead of waiting out.
mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.now() });

const keychain = mockSecureStore(mock);
mockReactNative(mock, { os: 'ios' });
mockExpoCrypto(mock);
mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: {
    EXPO_PUBLIC_SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
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
// NetInfo reports a connection: the dead-connection case, where sign-out used to hang.
const netInfoFake: Record<string, unknown> = {
  fetch: async () => ({ isConnected: true, isInternetReachable: null }),
};
netInfoFake.default = netInfoFake;
mockModule(mock, '@react-native-community/netinfo', netInfoFake);

interface NetworkRequest {
  url: string;
  init?: RequestInit;
  answer: (response: Response) => void;
}
const requests: NetworkRequest[] = [];
const originalFetch = globalThis.fetch;
// A request answers only when the test says so, like a connection that is up but dead.
// An aborted request fails, as React Native's fetch does.
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((resolve, reject) => {
    requests.push({ url: String(input), init, answer: resolve });
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('Aborted', 'AbortError'))
    );
  })) as typeof fetch;

let client: typeof import('../supabase/client');
let authService: typeof import('./authService');

const nowInSeconds = () => Math.floor(Date.now() / 1000);
const user = {
  id: 'user-a',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'reader@example.com',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};
const storedSession = (expiresAt: number, refreshToken: string) =>
  JSON.stringify({
    access_token: `access-${refreshToken}`,
    refresh_token: refreshToken,
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user,
  });
const refreshAnswer = (refreshToken: string) =>
  new Response(
    JSON.stringify({
      access_token: `access-after-${refreshToken}`,
      refresh_token: `${refreshToken}-rotated`,
      expires_in: 3600,
      expires_at: nowInSeconds() + 3600,
      token_type: 'bearer',
      user,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

const settle = async (rounds = 5) => {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
};
const until = async (condition: () => boolean) => {
  for (let i = 0; i < 200 && !condition(); i += 1) await settle(1);
  assert.ok(condition());
};
const refreshRequests = () => requests.filter((r) => r.url.includes('grant_type=refresh_token'));
const logoutRequests = () => requests.filter((r) => r.url.includes('/logout'));

const events: string[] = [];

before(async () => {
  client = await import('../supabase/client');
  authService = await import('./authService');
  client.supabase.auth.onAuthStateChange((event) => {
    events.push(event);
  });
});

after(() => {
  void client.supabase.auth.stopAutoRefresh();
  mock.timers.reset();
  globalThis.fetch = originalFetch;
});

test('a refresh under way when the reader signs out cannot save the session or sign them back in', async () => {
  keychain.store.set(STORAGE_KEY, storedSession(nowInSeconds() - 3600, 'refresh-a'));
  // Something asks for the session (a request, the auto-refresh): auth-js refreshes the
  // expired token inside its lock, and the dead connection never answers.
  const gettingSession = client.supabase.auth.getSession();
  await until(() => refreshRequests().length === 1);

  const signingOut = authService.signOut();
  await until(() => !keychain.store.has(STORAGE_KEY));
  assert.deepEqual(await signingOut, { success: true }, 'sign-out does not wait for the lock');

  // The server answers the old refresh after all, then auth-js keeps retrying for 30 s.
  refreshRequests()[0]?.answer(refreshAnswer('refresh-a'));
  events.length = 0;
  for (let second = 0; second < 35; second += 1) {
    mock.timers.tick(1_000);
    await settle();
  }
  const { data } = await gettingSession;

  assert.equal(data.session, null);
  assert.equal(keychain.store.has(STORAGE_KEY), false, 'the old session is never saved again');
  assert.equal(events.includes('TOKEN_REFRESHED'), false);
  assert.equal(events.includes('SIGNED_IN'), false);
  assert.equal(refreshRequests().length, 1, 'retries of the signed-out token never go out');
});

test('a sign-out the server never answers ends on this device within the time limit', async () => {
  keychain.store.set(STORAGE_KEY, storedSession(nowInSeconds() + 3600, 'refresh-b'));
  const logoutsBefore = logoutRequests().length;

  let result: unknown = null;
  const signingOut = authService.signOut().then((value) => {
    result = value;
  });
  await until(() => logoutRequests().length === logoutsBefore + 1);
  const logout = logoutRequests()[logoutsBefore];
  assert.equal(keychain.store.has(STORAGE_KEY), false, 'signed out on this device already');
  assert.ok(logout?.url.endsWith('/auth/v1/logout?scope=global'));
  assert.equal(
    (logout?.init?.headers as Record<string, string> | undefined)?.Authorization,
    'Bearer access-refresh-b'
  );

  mock.timers.tick(authService.AUTH_SIGN_OUT_TIMEOUT_MS);
  await signingOut;
  assert.equal((result as { success: boolean }).success, false);

  // The abandoned logout finishing later changes nothing on this device.
  logout?.answer(new Response(null, { status: 204 }));
  await settle();
  assert.equal(keychain.store.has(STORAGE_KEY), false);
});
