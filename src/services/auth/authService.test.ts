import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mockExpoCrypto, mockModule, mockReactNative, sourcePath } from '../../testing/mockModules';
import { createSupabaseFake, makeFakeSession, makeFakeUser } from '../../testing/supabaseFake';

// ---------------------------------------------------------------------------
// One mock configuration for the file. Every scenario is driven by mutating the
// fakes below (`supabaseConfigured`, `runtimeEnv`, `apple`, `google`,
// `rn.Platform.OS`) rather than by re-mocking, because ESM caches modules.
// ---------------------------------------------------------------------------

const supabaseFake = createSupabaseFake();
const defaultAuthHandlers = { ...supabaseFake.auth.handlers };
/** Loosely typed view of the fake's auth handlers so a scenario can return an error shape. */
const authHandlers = supabaseFake.auth.handlers as unknown as Record<
  string,
  (...args: unknown[]) => unknown
>;

// The shared `mockSupabaseModule` helper freezes `isSupabaseConfigured` at
// install time; authService has an unconfigured branch in every exported
// function, so this file installs an equivalent mock with a mutable flag.
let supabaseConfigured = true;
const supabaseExports = {
  supabase: supabaseFake.client,
  isSupabaseConfigured: () => supabaseConfigured,
  getCurrentUserId: async () => supabaseFake.auth.user?.id ?? null,
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

// `createGoogleSignInInitializer` keeps a reference to this object and re-reads
// it on every call, so mutating it between tests changes availability.
const runtimeEnv: Record<string, string | undefined> = {};
mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: runtimeEnv,
});

const rn = mockReactNative(mock, { os: 'ios' });

interface AppleFullName {
  givenName?: string | null;
  familyName?: string | null;
}
interface AppleCredential {
  identityToken?: string | null;
  fullName?: AppleFullName | null;
}

const apple: {
  requests: unknown[];
  credential: AppleCredential;
  error: unknown;
} = {
  requests: [],
  credential: { identityToken: 'apple-identity-token' },
  error: null,
};

mockModule(mock, 'expo-apple-authentication', {
  AppleAuthenticationScope: { FULL_NAME: 'FULL_NAME', EMAIL: 'EMAIL' },
  signInAsync: async (options: unknown) => {
    apple.requests.push(options);
    if (apple.error) {
      throw apple.error;
    }
    return apple.credential;
  },
});

// Sentinel values, deliberately different from the code names, so a test only
// passes when production compares against `statusCodes.*` and not a literal.
const GOOGLE_STATUS_CODES = {
  SIGN_IN_CANCELLED: 'google-status-12501',
  IN_PROGRESS: 'google-status-in-progress',
  PLAY_SERVICES_NOT_AVAILABLE: 'google-status-no-play-services',
  SIGN_IN_REQUIRED: 'google-status-sign-in-required',
};

interface GoogleSignInResponse {
  type?: string;
  data?: { idToken?: string | null } | null;
}

const google: {
  configureCalls: unknown[];
  playServicesCalls: number;
  signInCalls: number;
  response: GoogleSignInResponse;
  signInError: unknown;
  playServicesError: unknown;
} = {
  configureCalls: [],
  playServicesCalls: 0,
  signInCalls: 0,
  response: { type: 'success', data: { idToken: 'google-id-token' } },
  signInError: null,
  playServicesError: null,
};

mockModule(mock, '@react-native-google-signin/google-signin', {
  GoogleSignin: {
    configure: (config: unknown) => {
      google.configureCalls.push(config);
    },
    hasPlayServices: async () => {
      google.playServicesCalls += 1;
      if (google.playServicesError) {
        throw google.playServicesError;
      }
      return true;
    },
    signIn: async () => {
      google.signInCalls += 1;
      if (google.signInError) {
        throw google.signInError;
      }
      return google.response;
    },
  },
  isErrorWithCode: (error: unknown): boolean =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string',
  statusCodes: GOOGLE_STATUS_CODES,
});

// --- deterministic expo-crypto seam ----------------------------------------
// generateNoncePair() uses expo-crypto (Hermes has no globalThis.crypto, so the
// old WebCrypto implementation produced no nonce at all on device). The shared
// double hands out a reproducible byte counter and computes a real SHA-256, and
// can be told to fail either half so the mandatory-nonce path is exercised.
const expoCrypto = mockExpoCrypto(mock).state;

/** 32 counter bytes (0x00..0x1f) rendered as hex — the first nonce of each test. */
const FIRST_NONCE_RAW = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

let authService: typeof import('./authService');

before(async () => {
  authService = await import('./authService');
});

beforeEach(() => {
  supabaseConfigured = true;
  supabaseFake.reset();
  Object.assign(supabaseFake.auth.handlers, defaultAuthHandlers);
  supabaseFake.auth.setSession(null);
  rn.Platform.OS = 'ios';
  apple.requests = [];
  apple.credential = { identityToken: 'apple-identity-token' };
  apple.error = null;
  google.configureCalls = [];
  google.playServicesCalls = 0;
  google.signInCalls = 0;
  google.response = { type: 'success', data: { idToken: 'google-id-token' } };
  google.signInError = null;
  google.playServicesError = null;
  expoCrypto.randomFailure = null;
  expoCrypto.digestFailure = null;
  expoCrypto.randomLengths.length = 0;
  expoCrypto.digestAlgorithms.length = 0;
  expoCrypto.cursor = 0;
});

const signedInUser = (overrides: Record<string, unknown> = {}) =>
  makeFakeUser({
    id: 'user-42',
    email: 'reader@example.com',
    created_at: '2026-02-03T04:05:06.000Z',
    ...overrides,
  } as never);

// ---------------------------------------------------------------------------
// signUpWithEmail
// ---------------------------------------------------------------------------

test('signUpWithEmail refuses to touch Supabase when the backend is not configured', async () => {
  supabaseConfigured = false;

  const result = await authService.signUpWithEmail('reader@example.com', 'hunter2');

  assert.deepEqual(result, {
    success: false,
    code: 'configuration',
    error: 'EveryBible backend is not configured for this build yet.',
  });
  assert.deepEqual(supabaseFake.authCalls, []);
});

test('signUpWithEmail forwards the display name as user metadata', async () => {
  supabaseFake.auth.setSession(makeFakeSession({ user: signedInUser() }));

  await authService.signUpWithEmail('reader@example.com', 'hunter2', 'Ada');

  assert.deepEqual(supabaseFake.authCalls, [
    {
      method: 'signUp',
      args: [
        {
          email: 'reader@example.com',
          password: 'hunter2',
          options: { data: { display_name: 'Ada' } },
        },
      ],
    },
  ]);
});

test('signUpWithEmail returns the created account mapped onto the app User shape', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  supabaseFake.auth.setSession(
    makeFakeSession({
      user: signedInUser({
        user_metadata: { display_name: 'Ada Lovelace', avatar_url: 'https://cdn/a.png' },
      }),
    })
  );

  const result = await authService.signUpWithEmail('reader@example.com', 'hunter2');

  assert.deepEqual(result, {
    success: true,
    user: {
      uid: 'user-42',
      email: 'reader@example.com',
      displayName: 'Ada Lovelace',
      photoURL: 'https://cdn/a.png',
      createdAt: Date.parse('2026-02-03T04:05:06.000Z'),
      lastActive: 1_800_000_000_000,
    },
  });
});

test('signUpWithEmail maps a 400 from Supabase to an invalid-credentials failure', async () => {
  authHandlers.signUp = async () => ({
    data: { user: null, session: null },
    error: { message: 'User already registered', status: 400 },
  });

  const result = await authService.signUpWithEmail('taken@example.com', 'hunter2');

  assert.deepEqual(result, {
    success: false,
    code: 'invalid_credentials',
    error: 'User already registered',
  });
});

test('signUpWithEmail reports an unknown failure when Supabase returns neither user nor error', async () => {
  authHandlers.signUp = async () => ({ data: { user: null, session: null }, error: null });

  const result = await authService.signUpWithEmail('reader@example.com', 'hunter2');

  assert.deepEqual(result, { success: false, code: 'unknown', error: 'Sign up failed' });
});

test('signUpWithEmail turns a thrown transport error into an unknown failure', async () => {
  authHandlers.signUp = async () => {
    throw new Error('socket hang up');
  };

  const result = await authService.signUpWithEmail('reader@example.com', 'hunter2');

  assert.deepEqual(result, { success: false, code: 'unknown', error: 'socket hang up' });
});

// ---------------------------------------------------------------------------
// signInWithEmail
// ---------------------------------------------------------------------------

test('signInWithEmail refuses to touch Supabase when the backend is not configured', async () => {
  supabaseConfigured = false;

  const result = await authService.signInWithEmail('reader@example.com', 'hunter2');

  assert.equal(result.code, 'configuration');
  assert.deepEqual(supabaseFake.authCalls, []);
});

test('signInWithEmail falls back to full_name and a null avatar when display_name is absent', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  supabaseFake.auth.setSession(
    makeFakeSession({ user: signedInUser({ user_metadata: { full_name: 'Grace Hopper' } }) })
  );

  const result = await authService.signInWithEmail('reader@example.com', 'hunter2');

  assert.deepEqual(result.user, {
    uid: 'user-42',
    email: 'reader@example.com',
    displayName: 'Grace Hopper',
    photoURL: null,
    createdAt: Date.parse('2026-02-03T04:05:06.000Z'),
    lastActive: 1_800_000_000_000,
  });
  assert.deepEqual(supabaseFake.authCalls[0], {
    method: 'signInWithPassword',
    args: [{ email: 'reader@example.com', password: 'hunter2' }],
  });
});

test('signInWithEmail dates an account with no created_at from the current clock', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  supabaseFake.auth.setSession(
    makeFakeSession({ user: signedInUser({ created_at: undefined }) as never })
  );

  const result = await authService.signInWithEmail('reader@example.com', 'hunter2');

  assert.equal(result.user?.createdAt, 1_800_000_000_000);
});

test('signInWithEmail turns a network failure into a service-unavailable failure', async () => {
  authHandlers.signInWithPassword = async () => ({
    data: { user: null, session: null },
    error: { message: 'Network request failed' },
  });

  const result = await authService.signInWithEmail('reader@example.com', 'hunter2');

  assert.deepEqual(result, {
    success: false,
    code: 'service_unavailable',
    error: 'EveryBible could not reach the backend right now. Please try again in a moment.',
  });
});

test('signInWithEmail reports an unknown failure when Supabase returns neither user nor error', async () => {
  authHandlers.signInWithPassword = async () => ({
    data: { user: null, session: null },
    error: null,
  });

  const result = await authService.signInWithEmail('reader@example.com', 'hunter2');

  assert.deepEqual(result, { success: false, code: 'unknown', error: 'Sign in failed' });
});

test('signInWithEmail turns a thrown transport error into an unknown failure', async () => {
  authHandlers.signInWithPassword = async () => {
    throw new Error('fetch failed');
  };

  const result = await authService.signInWithEmail('reader@example.com', 'hunter2');

  assert.deepEqual(result, { success: false, code: 'unknown', error: 'fetch failed' });
});

// ---------------------------------------------------------------------------
// signInWithApple
// ---------------------------------------------------------------------------

test('signInWithApple refuses to touch Supabase when the backend is not configured', async () => {
  supabaseConfigured = false;

  const result = await authService.signInWithApple();

  assert.equal(result.code, 'configuration');
  assert.deepEqual(apple.requests, []);
});

test('signInWithApple is unavailable off iOS and never opens the native sheet', async () => {
  rn.Platform.OS = 'android';

  const result = await authService.signInWithApple();

  assert.deepEqual(result, {
    success: false,
    code: 'provider_unavailable',
    error: 'Apple Sign-In is only available on iOS',
  });
  assert.deepEqual(apple.requests, []);
});

test('signInWithApple hands Apple the hashed nonce and Supabase the raw one', async () => {
  supabaseFake.auth.setSession(makeFakeSession({ user: signedInUser() }));

  await authService.signInWithApple();

  assert.deepEqual(apple.requests, [
    {
      requestedScopes: ['FULL_NAME', 'EMAIL'],
      nonce: createHash('sha256').update(FIRST_NONCE_RAW).digest('hex'),
    },
  ]);
  assert.deepEqual(supabaseFake.authCalls[0], {
    method: 'signInWithIdToken',
    args: [{ provider: 'apple', token: 'apple-identity-token', nonce: FIRST_NONCE_RAW }],
  });
});

test('signInWithApple draws its nonce from 32 bytes of native randomness', async () => {
  supabaseFake.auth.setSession(makeFakeSession({ user: signedInUser() }));

  await authService.signInWithApple();

  assert.deepEqual(expoCrypto.randomLengths, [32]);
  assert.deepEqual(expoCrypto.digestAlgorithms, ['SHA-256']);
  const raw = (supabaseFake.authCalls[0].args[0] as { nonce?: string }).nonce;
  assert.match(raw ?? '', /^[0-9a-f]{64}$/);
});

test('signInWithApple aborts before opening the native sheet when randomness is unavailable', async () => {
  expoCrypto.randomFailure = new Error('native crypto unavailable');
  supabaseFake.auth.setSession(makeFakeSession({ user: signedInUser() }));

  const result = await authService.signInWithApple();

  assert.deepEqual(result, {
    success: false,
    code: 'service_unavailable',
    error: 'native crypto unavailable',
  });
  // The point of the mandatory nonce: no unhardened identity token is ever minted.
  assert.deepEqual(apple.requests, []);
  assert.deepEqual(supabaseFake.authCalls, []);
});

test('signInWithApple aborts when the nonce cannot be hashed, never falling back to a nonce-less request', async () => {
  expoCrypto.digestFailure = new Error('digest unavailable');
  supabaseFake.auth.setSession(makeFakeSession({ user: signedInUser() }));

  const result = await authService.signInWithApple();

  assert.equal(result.success, false);
  assert.equal(result.code, 'service_unavailable');
  assert.deepEqual(apple.requests, []);
  assert.deepEqual(supabaseFake.authCalls, []);
});

test('signInWithApple reports provider-unavailable when Apple returns no identity token', async () => {
  apple.credential = { identityToken: null };

  const result = await authService.signInWithApple();

  assert.deepEqual(result, {
    success: false,
    code: 'provider_unavailable',
    error: 'No identity token received',
  });
  assert.deepEqual(supabaseFake.authCalls, []);
});

test('signInWithApple writes the display name Apple supplied on first consent', async () => {
  supabaseFake.auth.setSession(makeFakeSession({ user: signedInUser() }));
  apple.credential = {
    identityToken: 'apple-identity-token',
    fullName: { givenName: 'Ada', familyName: 'Lovelace' },
  };

  const result = await authService.signInWithApple();

  assert.equal(result.success, true);
  assert.deepEqual(supabaseFake.authCalls[1], {
    method: 'updateUser',
    args: [{ data: { display_name: 'Ada Lovelace' } }],
  });
});

test('signInWithApple uses only the given name when Apple omits the family name', async () => {
  supabaseFake.auth.setSession(makeFakeSession({ user: signedInUser() }));
  apple.credential = {
    identityToken: 'apple-identity-token',
    fullName: { givenName: 'Ada', familyName: null },
  };

  await authService.signInWithApple();

  assert.deepEqual(supabaseFake.authCalls[1].args, [{ data: { display_name: 'Ada' } }]);
});

test('signInWithApple leaves the profile alone on repeat sign-ins that carry no name', async () => {
  supabaseFake.auth.setSession(makeFakeSession({ user: signedInUser() }));
  apple.credential = { identityToken: 'apple-identity-token', fullName: null };

  await authService.signInWithApple();

  assert.deepEqual(
    supabaseFake.authCalls.map((call) => call.method),
    ['signInWithIdToken']
  );
});

test('signInWithApple survives a display-name write that throws, because the user is already signed in', async () => {
  supabaseFake.auth.setSession(makeFakeSession({ user: signedInUser() }));
  apple.credential = {
    identityToken: 'apple-identity-token',
    fullName: { givenName: 'Ada', familyName: 'Lovelace' },
  };
  authHandlers.updateUser = async () => {
    throw new Error('Network request failed');
  };

  const result = await authService.signInWithApple();

  assert.equal(result.success, true);
  assert.equal(result.user?.uid, 'user-42');
});

test('signInWithApple ignores a display-name write Supabase rejects', async () => {
  supabaseFake.auth.setSession(makeFakeSession({ user: signedInUser() }));
  apple.credential = {
    identityToken: 'apple-identity-token',
    fullName: { givenName: 'Ada', familyName: 'Lovelace' },
  };
  authHandlers.updateUser = async () => ({
    data: { user: null },
    error: { message: 'Database error updating user' },
  });

  const result = await authService.signInWithApple();

  assert.equal(result.success, true);
  assert.equal(result.user?.uid, 'user-42');
});

test('signInWithApple mints a fresh nonce for every attempt', async () => {
  supabaseFake.auth.setSession(makeFakeSession({ user: signedInUser() }));

  await authService.signInWithApple();
  await authService.signInWithApple();

  const noncesSentToSupabase = supabaseFake.authCalls
    .filter((call) => call.method === 'signInWithIdToken')
    .map((call) => (call.args[0] as { nonce: string }).nonce);
  const noncesSentToApple = apple.requests.map((request) => (request as { nonce: string }).nonce);

  assert.equal(noncesSentToSupabase.length, 2);
  assert.notEqual(noncesSentToSupabase[0], noncesSentToSupabase[1]);
  assert.notEqual(noncesSentToApple[0], noncesSentToApple[1]);
});

test('signInWithApple explains that Apple sign-in is not enabled on the backend', async () => {
  authHandlers.signInWithIdToken = async () => ({
    data: { user: null, session: null },
    error: { message: 'Provider is not enabled', status: 400 },
  });

  const result = await authService.signInWithApple();

  assert.deepEqual(result, {
    success: false,
    code: 'provider_unavailable',
    error: 'Apple sign in is not enabled on the EveryBible backend yet.',
  });
});

test('signInWithApple treats a cancelled native sheet as a silent cancellation', async () => {
  apple.error = Object.assign(new Error('The user canceled the authorization attempt'), {
    code: 'ERR_REQUEST_CANCELED',
  });

  const result = await authService.signInWithApple();

  assert.deepEqual(result, {
    success: false,
    code: 'cancelled',
    error: 'The user canceled the authorization attempt',
  });
});

test('signInWithApple reports an unknown failure when Supabase returns no user', async () => {
  authHandlers.signInWithIdToken = async () => ({
    data: { user: null, session: null },
    error: null,
  });

  const result = await authService.signInWithApple();

  assert.deepEqual(result, { success: false, code: 'unknown', error: 'Apple sign in failed' });
});

// ---------------------------------------------------------------------------
// signInWithGoogle
//
// Order matters here: createGoogleSignInInitializer latches after its first
// successful configure(), so the "not available" cases run before the env gets
// client IDs and the configure-once case runs immediately after.
// ---------------------------------------------------------------------------

test('signInWithGoogle refuses to touch Google when the backend is not configured', async () => {
  supabaseConfigured = false;

  const result = await authService.signInWithGoogle();

  assert.equal(result.code, 'configuration');
  assert.equal(google.signInCalls, 0);
});

test('signInWithGoogle is unavailable on a build with no Google client IDs', async () => {
  const result = await authService.signInWithGoogle();

  assert.deepEqual(result, {
    success: false,
    code: 'provider_unavailable',
    error: 'Google sign in is not available on this build yet.',
  });
  assert.deepEqual(google.configureCalls, []);
  assert.equal(google.signInCalls, 0);
});

test('signInWithGoogle names the missing web client ID on an Android-only build', async () => {
  runtimeEnv.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = 'android-client-id';

  const result = await authService.signInWithGoogle();

  assert.deepEqual(result, {
    success: false,
    code: 'provider_unavailable',
    error: 'Google sign in requires the web client ID for this build.',
  });
  assert.equal(google.signInCalls, 0);

  delete runtimeEnv.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
});

test('signInWithGoogle configures the native SDK once and reuses it afterwards', async () => {
  runtimeEnv.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'ios-client-id';
  runtimeEnv.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client-id';
  supabaseFake.auth.setSession(makeFakeSession({ user: signedInUser() }));

  await authService.signInWithGoogle();
  await authService.signInWithGoogle();

  assert.deepEqual(google.configureCalls, [
    { iosClientId: 'ios-client-id', webClientId: 'web-client-id' },
  ]);
  assert.equal(google.signInCalls, 2);
});

test('signInWithGoogle checks Play Services only on Android', async () => {
  supabaseFake.auth.setSession(makeFakeSession({ user: signedInUser() }));

  await authService.signInWithGoogle();
  assert.equal(google.playServicesCalls, 0);

  rn.Platform.OS = 'android';
  await authService.signInWithGoogle();
  assert.equal(google.playServicesCalls, 1);
});

test('signInWithGoogle returns the signed-in user for a successful native flow', async () => {
  supabaseFake.auth.setSession(
    makeFakeSession({ user: signedInUser({ user_metadata: { display_name: 'Ada' } }) })
  );

  const result = await authService.signInWithGoogle();

  assert.equal(result.success, true);
  assert.equal(result.user?.uid, 'user-42');
  assert.deepEqual(supabaseFake.authCalls[0], {
    method: 'signInWithIdToken',
    args: [{ provider: 'google', token: 'google-id-token' }],
  });
});

test('signInWithGoogle treats a resolved cancelled response as a silent cancellation', async () => {
  google.response = { type: 'cancelled', data: null };

  const result = await authService.signInWithGoogle();

  assert.deepEqual(result, {
    success: false,
    code: 'cancelled',
    error: 'Google sign in cancelled',
  });
  assert.deepEqual(supabaseFake.authCalls, []);
});

test('signInWithGoogle reports provider-unavailable when Google returns no ID token', async () => {
  google.response = { type: 'success', data: { idToken: null } };

  const result = await authService.signInWithGoogle();

  assert.deepEqual(result, {
    success: false,
    code: 'provider_unavailable',
    error: 'No ID token received from Google',
  });
});

test('signInWithGoogle explains a client ID mismatch reported by Supabase', async () => {
  authHandlers.signInWithIdToken = async () => ({
    data: { user: null, session: null },
    error: { message: 'Unacceptable audience in id_token', status: 400 },
  });

  const result = await authService.signInWithGoogle();

  assert.deepEqual(result, {
    success: false,
    code: 'provider_unavailable',
    error: 'Google sign in is using the wrong client ID for this build.',
  });
});

test('signInWithGoogle reports an unknown failure when Supabase returns no user', async () => {
  authHandlers.signInWithIdToken = async () => ({
    data: { user: null, session: null },
    error: null,
  });

  const result = await authService.signInWithGoogle();

  assert.deepEqual(result, { success: false, code: 'unknown', error: 'Google sign in failed' });
});

test('signInWithGoogle maps a thrown SIGN_IN_CANCELLED status code to a cancellation', async () => {
  google.signInError = { code: GOOGLE_STATUS_CODES.SIGN_IN_CANCELLED, message: 'user cancelled' };

  const result = await authService.signInWithGoogle();

  assert.deepEqual(result, { success: false, code: 'cancelled', error: 'user cancelled' });
});

test('signInWithGoogle maps a thrown IN_PROGRESS status code to an in-progress failure', async () => {
  google.signInError = { code: GOOGLE_STATUS_CODES.IN_PROGRESS, message: 'already running' };

  const result = await authService.signInWithGoogle();

  assert.deepEqual(result, { success: false, code: 'in_progress', error: 'already running' });
});

test('signInWithGoogle maps missing Play Services to a provider-unavailable failure', async () => {
  rn.Platform.OS = 'android';
  google.playServicesError = {
    code: GOOGLE_STATUS_CODES.PLAY_SERVICES_NOT_AVAILABLE,
    message: 'Play services not installed',
  };

  const result = await authService.signInWithGoogle();

  assert.deepEqual(result, {
    success: false,
    code: 'provider_unavailable',
    error: 'Play services not installed',
  });
  assert.equal(google.signInCalls, 0);
});

test('signInWithGoogle names an Android DEVELOPER_ERROR instead of a bare unknown failure', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  rn.Platform.OS = 'android';
  // The native module rejects with the raw CommonStatusCodes number as a string;
  // `statusCodes` has no entry for it, so production matches the literal '10'.
  google.signInError = { code: '10' };

  const result = await authService.signInWithGoogle();

  assert.deepEqual(result, {
    success: false,
    code: 'provider_unavailable',
    error: 'Google sign in is not configured for this Android build (DEVELOPER_ERROR).',
  });
  // It is invisible in the UI, so it has to be named in logcat.
  assert.equal(logged.mock.callCount(), 1);
  assert.match(String(logged.mock.calls[0].arguments[0]), /DEVELOPER_ERROR/);
  assert.deepEqual(supabaseFake.authCalls, []);
});

test('signInWithGoogle falls through to an unknown failure for an unrecognised status code', async () => {
  google.signInError = { code: GOOGLE_STATUS_CODES.SIGN_IN_REQUIRED, message: 'sign in required' };

  const result = await authService.signInWithGoogle();

  assert.deepEqual(result, { success: false, code: 'unknown', error: 'sign in required' });
});

test('signInWithGoogle reports an unknown failure for a plain thrown error', async () => {
  google.signInError = new Error('native module crashed');

  const result = await authService.signInWithGoogle();

  assert.deepEqual(result, { success: false, code: 'unknown', error: 'native module crashed' });
});

// ---------------------------------------------------------------------------
// signOut / resetPassword
// ---------------------------------------------------------------------------

test('signOut succeeds without a backend because there is no session to end', async () => {
  supabaseConfigured = false;

  assert.deepEqual(await authService.signOut(), { success: true });
  assert.deepEqual(supabaseFake.authCalls, []);
});

test('signOut ends the Supabase session', async () => {
  supabaseFake.auth.setSession(makeFakeSession({ user: signedInUser() }));

  assert.deepEqual(await authService.signOut(), { success: true });
  assert.equal(supabaseFake.authCalls[0].method, 'signOut');
  assert.equal(supabaseFake.auth.session, null);
});

test('signOut surfaces the Supabase error message', async () => {
  authHandlers.signOut = async () => ({ error: { message: 'session already revoked' } });

  assert.deepEqual(await authService.signOut(), {
    success: false,
    error: 'session already revoked',
  });
});

test('signOut surfaces a thrown transport error', async () => {
  authHandlers.signOut = async () => {
    throw new Error('offline');
  };

  assert.deepEqual(await authService.signOut(), { success: false, error: 'offline' });
});

test('signOut reports a generic message when something non-Error is thrown', async () => {
  authHandlers.signOut = async () => {
    throw 'boom';
  };

  assert.deepEqual(await authService.signOut(), { success: false, error: 'Unknown error' });
});

test('resetPassword refuses to send mail when the backend is not configured', async () => {
  supabaseConfigured = false;

  assert.deepEqual(await authService.resetPassword('reader@example.com'), {
    success: false,
    error: 'EveryBible backend is not configured for this build yet.',
  });
  assert.deepEqual(supabaseFake.authCalls, []);
});

test('resetPassword sends the recovery mail back to the app deep link', async () => {
  assert.deepEqual(await authService.resetPassword('reader@example.com'), { success: true });
  assert.deepEqual(supabaseFake.authCalls, [
    {
      method: 'resetPasswordForEmail',
      args: ['reader@example.com', { redirectTo: 'com.everybible.app://reset-password' }],
    },
  ]);
});

test('resetPassword surfaces the Supabase error message', async () => {
  authHandlers.resetPasswordForEmail = async () => ({
    data: {},
    error: { message: 'rate limit exceeded' },
  });

  assert.deepEqual(await authService.resetPassword('reader@example.com'), {
    success: false,
    error: 'rate limit exceeded',
  });
});

test('resetPassword surfaces a thrown transport error', async () => {
  authHandlers.resetPasswordForEmail = async () => {
    throw new Error('offline');
  };

  assert.deepEqual(await authService.resetPassword('reader@example.com'), {
    success: false,
    error: 'offline',
  });
});

test('resetPassword reports a generic message when something non-Error is thrown', async () => {
  authHandlers.resetPasswordForEmail = async () => {
    throw { status: 500 };
  };

  assert.deepEqual(await authService.resetPassword('reader@example.com'), {
    success: false,
    error: 'Unknown error',
  });
});

// ---------------------------------------------------------------------------
// updatePassword / updateUserProfile
// ---------------------------------------------------------------------------

test('updatePassword refuses to run when the backend is not configured', async () => {
  supabaseConfigured = false;

  assert.equal((await authService.updatePassword('new-password')).code, 'configuration');
  assert.deepEqual(supabaseFake.authCalls, []);
});

test('updatePassword sends only the new password to Supabase', async () => {
  supabaseFake.auth.setSession(makeFakeSession({ user: signedInUser() }));

  const result = await authService.updatePassword('new-password');

  assert.equal(result.success, true);
  assert.deepEqual(supabaseFake.authCalls, [
    { method: 'updateUser', args: [{ password: 'new-password' }] },
  ]);
});

test('updatePassword maps an expired recovery session to an invalid-credentials failure', async () => {
  authHandlers.updateUser = async () => ({
    data: { user: null },
    error: { message: 'Auth session missing!', status: 401 },
  });

  assert.deepEqual(await authService.updatePassword('new-password'), {
    success: false,
    code: 'invalid_credentials',
    error: 'Auth session missing!',
  });
});

test('updatePassword reports an unknown failure when Supabase returns no user', async () => {
  authHandlers.updateUser = async () => ({ data: { user: null }, error: null });

  assert.deepEqual(await authService.updatePassword('new-password'), {
    success: false,
    code: 'unknown',
    error: 'Failed to update password',
  });
});

test('updatePassword turns a thrown transport error into an unknown failure', async () => {
  authHandlers.updateUser = async () => {
    throw new Error('offline');
  };

  assert.deepEqual(await authService.updatePassword('new-password'), {
    success: false,
    code: 'unknown',
    error: 'offline',
  });
});

test('updateUserProfile refuses to run when the backend is not configured', async () => {
  supabaseConfigured = false;

  assert.equal(
    (await authService.updateUserProfile({ data: { avatar_url: 'https://cdn/a.png' } })).code,
    'configuration'
  );
  assert.deepEqual(supabaseFake.authCalls, []);
});

test('updateUserProfile forwards the attributes verbatim and returns the updated user', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  supabaseFake.auth.setSession(
    makeFakeSession({
      user: signedInUser({ user_metadata: { avatar_url: 'https://cdn/new.png' } }),
    })
  );

  const result = await authService.updateUserProfile({
    email: 'new@example.com',
    data: { avatar_url: 'https://cdn/new.png' },
  });

  assert.equal(result.user?.photoURL, 'https://cdn/new.png');
  assert.deepEqual(supabaseFake.authCalls, [
    {
      method: 'updateUser',
      args: [{ email: 'new@example.com', data: { avatar_url: 'https://cdn/new.png' } }],
    },
  ]);
});

test('updateUserProfile maps a Supabase error instead of leaking the raw message shape', async () => {
  authHandlers.updateUser = async () => ({
    data: { user: null },
    error: { message: 'Network error while updating', status: 500 },
  });

  assert.deepEqual(await authService.updateUserProfile({ data: {} }), {
    success: false,
    code: 'service_unavailable',
    error: 'EveryBible could not reach the backend right now. Please try again in a moment.',
  });
});

test('updateUserProfile reports an unknown failure when Supabase returns no user', async () => {
  authHandlers.updateUser = async () => ({ data: { user: null }, error: null });

  assert.deepEqual(await authService.updateUserProfile({ data: {} }), {
    success: false,
    code: 'unknown',
    error: 'Failed to update profile',
  });
});

test('updateUserProfile turns a thrown transport error into an unknown failure', async () => {
  authHandlers.updateUser = async () => {
    throw new Error('offline');
  };

  assert.equal((await authService.updateUserProfile({ data: {} })).code, 'unknown');
});

// ---------------------------------------------------------------------------
// getCurrentSession
// ---------------------------------------------------------------------------

test('getCurrentSession reports a signed-out app when the backend is not configured', async () => {
  supabaseConfigured = false;

  assert.deepEqual(await authService.getCurrentSession(), { session: null, user: null });
  assert.deepEqual(supabaseFake.authCalls, []);
});

test('getCurrentSession returns the live session with its user mapped', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  const session = makeFakeSession({ user: signedInUser() });
  supabaseFake.auth.setSession(session);

  const restored = await authService.getCurrentSession();

  assert.equal(restored.session, session);
  assert.equal(restored.user?.uid, 'user-42');
});

test('getCurrentSession returns nulls when there is no stored session', async () => {
  assert.deepEqual(await authService.getCurrentSession(), { session: null, user: null });
  assert.equal(supabaseFake.authCalls[0].method, 'getSession');
});

test('getCurrentSession swallows a SecureStore failure and reports a signed-out app', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  authHandlers.getSession = async () => {
    throw new Error('SecureStore unavailable');
  };

  assert.deepEqual(await authService.getCurrentSession(), { session: null, user: null });
  assert.equal(logged.mock.callCount(), 1);
});
