import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomFillSync } from 'node:crypto';
import {
  mockModule,
  mockReactNative,
  mockSecureStore,
  sourcePath,
} from '../../testing/mockModules';

// Contract with the installed @supabase/supabase-js for the password-reset
// PKCE flow, on a Hermes-shaped runtime (no globalThis.crypto). Runs the real
// client module, the real supabase-js, the real auth service and deep-link
// handler over an in-memory keychain and a scripted fetch, so an auth-js
// upgrade that changes where the verifier lives, how it is tagged, or how the
// code is exchanged fails here.

const PROJECT_REF = 'abcdefghijklmnop';
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;
const VERIFIER_KEY = `${STORAGE_KEY}-code-verifier`;
const CODE = '6f1c7a0e-2b7d-4a55-9d7e-3f0b8f2c1a90';

// Hermes has no WebCrypto at all. Hide Node's before the client is built so the
// app has to install its own CSPRNG-backed getRandomValues.
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
Object.defineProperty(globalThis, 'crypto', {
  value: undefined,
  configurable: true,
  writable: true,
});

let nativeRandomCalls = 0;
const expoCryptoExports = {
  getRandomValues: <T extends Uint32Array>(array: T): T => {
    nativeRandomCalls += 1;
    randomFillSync(array);
    return array;
  },
};
mockModule(mock, 'expo-crypto', expoCryptoExports);
// authService's native sign-in dependencies; not exercised by the reset flow.
mockModule(mock, 'expo-apple-authentication', {});
mockModule(mock, '@react-native-google-signin/google-signin', {
  GoogleSignin: {},
  isErrorWithCode: () => false,
  statusCodes: {},
});

const keychain = mockSecureStore(mock);
mockReactNative(mock, { os: 'ios' });
mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: {
    EXPO_PUBLIC_SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  },
});
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: { isReady: () => true, navigate: () => {} },
  openAuthFlow: () => {},
});

interface RecordedRequest {
  url: string;
  body: Record<string, unknown>;
}
const requests: RecordedRequest[] = [];
const nowInSeconds = () => Math.floor(Date.now() / 1000);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  requests.push({ url, body });

  if (url.includes('/auth/v1/recover')) {
    return json({});
  }
  if (url.includes('/auth/v1/token?grant_type=pkce')) {
    return json({
      access_token: 'recovery-access',
      refresh_token: 'recovery-refresh',
      expires_in: 3600,
      expires_at: nowInSeconds() + 3600,
      token_type: 'bearer',
      user: {
        id: 'user-a',
        aud: 'authenticated',
        email: 'reader@example.com',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01T00:00:00.000Z',
      },
    });
  }
  return json({ message: 'unexpected request' }, 500);
}) as typeof fetch;

let client: typeof import('../supabase/client');
let authService: typeof import('./authService');
let authDeepLink: typeof import('./authDeepLink');

before(async () => {
  client = await import('../supabase/client');
  authService = await import('./authService');
  authDeepLink = await import('./authDeepLink');
});

after(async () => {
  await client.supabase.auth.stopAutoRefresh();
  globalThis.fetch = originalFetch;
  if (cryptoDescriptor) {
    Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
  }
});

let sentChallenge = '';

test('requesting a reset stores a recovery-tagged verifier from the native CSPRNG', async () => {
  assert.deepEqual(await authService.resetPassword('reader@example.com'), { success: true });

  const recover = requests.find((request) => request.url.includes('/auth/v1/recover'));
  assert.ok(recover, 'the recover request was sent');
  assert.match(recover.url, /redirect_to=com\.everybible\.app%3A%2F%2Freset-password/);
  // No crypto.subtle on Hermes, so auth-js sends the verifier as a plain
  // challenge — only inside this HTTPS request, never in the emailed link.
  assert.equal(recover.body.code_challenge_method, 'plain');
  sentChallenge = String(recover.body.code_challenge);
  assert.match(sentChallenge, /^[0-9a-f]{112}$/);
  assert.ok(nativeRandomCalls > 0, 'the verifier came from expo-crypto, not Math.random');

  const stored = JSON.parse(keychain.store.get(VERIFIER_KEY) ?? 'null');
  assert.equal(stored, `${sentChallenge}/PASSWORD_RECOVERY`);
});

test('the emailed code is exchanged with the stored verifier for a recovery session', async () => {
  assert.equal(
    await authDeepLink.handleAuthDeepLinkUrl(`com.everybible.app://reset-password?code=${CODE}`),
    true
  );
  assert.equal(
    requests.filter((request) => request.url.includes('grant_type=pkce')).length,
    0,
    'nothing is exchanged until the user continues'
  );

  assert.deepEqual(await authDeepLink.activatePendingPasswordRecovery(), { status: 'activated' });

  const exchange = requests.find((request) => request.url.includes('grant_type=pkce'));
  assert.deepEqual(exchange?.body, { auth_code: CODE, code_verifier: sentChallenge });
  assert.equal(keychain.store.has(VERIFIER_KEY), false, 'the verifier is single-use');
  const { data } = await client.supabase.auth.getSession();
  assert.equal(data.session?.user.id, 'user-a');
});

test('a link opened where no verifier is stored fails as wrong-device without a request', async () => {
  const before = requests.length;
  await authDeepLink.handleAuthDeepLinkUrl(`com.everybible.app://reset-password?code=${CODE}`);

  assert.deepEqual(await authDeepLink.activatePendingPasswordRecovery(), {
    status: 'failed',
    problem: 'wrong-device',
  });
  assert.equal(requests.length, before);
});

test('the installed getRandomValues is the only crypto the app adds', () => {
  const installed = (globalThis as unknown as { crypto?: Record<string, unknown> }).crypto;
  assert.deepEqual(Object.keys(installed ?? {}), ['getRandomValues']);
});
