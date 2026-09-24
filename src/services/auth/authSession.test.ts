import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, mockSupabaseModule } from '../../testing/mockModules';
import { createSupabaseFake, makeFakeSession, makeFakeUser } from '../../testing/supabaseFake';

// Session restore at launch. auth-js refreshes an expired access token inside
// getSession(), and without a network it retries that refresh for about 50 s.
// An offline launch must not wait for it: the stored session is restored at
// once, marked as waiting for a token refresh.

const supabase = createSupabaseFake();
mockSupabaseModule(mock, supabase);

const connectivity: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  error: Error | null;
} = { isConnected: true, isInternetReachable: true, error: null };
// authSession reaches NetInfo through a lazy CommonJS `require(...).default`, so
// the fake carries a self-reference: it answers whether the loader hands back
// the namespace or the interop default.
const netInfoFake: Record<string, unknown> = {
  fetch: async () => {
    if (connectivity.error) {
      throw connectivity.error;
    }
    return {
      isConnected: connectivity.isConnected,
      isInternetReachable: connectivity.isInternetReachable,
    };
  },
};
netInfoFake.default = netInfoFake;
mockModule(mock, '@react-native-community/netinfo', netInfoFake);

let authSession: typeof import('./authSession');

before(async () => {
  authSession = await import('./authSession');
});

beforeEach(() => {
  supabase.reset();
  supabase.auth.setSession(null);
  Object.assign(connectivity, { isConnected: true, isInternetReachable: true, error: null });
});

const nowInSeconds = () => Math.floor(Date.now() / 1000);
const expiredSession = () =>
  makeFakeSession({
    access_token: 'expired-access-token',
    expires_at: nowInSeconds() - 3600,
    user: makeFakeUser({ id: 'user-a', user_metadata: { full_name: 'Ruth' } }),
  });
const getSessionCalls = () =>
  supabase.authCalls.filter((call) => call.method === 'getSession').length;
const neverSettles = () => new Promise<never>(() => {});
// Every dependency here is an in-memory fake, so a restore that does not wait on
// Supabase settles within a few turns. One that waits never settles at all.
const restoreSettlingPromptly = async () => {
  const restoring = authSession.getCurrentSession();
  const stillPending = Symbol('still pending');
  const afterTurns = (async () => {
    for (let turn = 0; turn < 20; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    return stillPending;
  })();
  const outcome = await Promise.race([restoring, afterTurns]);
  assert.notEqual(outcome, stillPending, 'the restore waited on the token refresh');
  return outcome as Awaited<typeof restoring>;
};
const retryableFailure = {
  data: { session: null },
  error: { name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 },
};

test('an offline launch with an expired token restores the stored session without waiting for its refresh', async () => {
  connectivity.isConnected = false;
  supabase.auth.setSession(expiredSession());
  supabase.auth.handlers.getSession = neverSettles;

  const restored = await restoreSettlingPromptly();

  assert.equal(restored.awaitingTokenRefresh, true);
  assert.equal(restored.restoreFailed, undefined);
  assert.equal(restored.session?.access_token, 'expired-access-token');
  assert.equal(restored.user?.uid, 'user-a');
  assert.equal(restored.user?.displayName, 'Ruth');
  assert.equal(getSessionCalls(), 0);
});

test('a network with no internet counts as offline', async () => {
  connectivity.isInternetReachable = false;
  supabase.auth.setSession(expiredSession());
  supabase.auth.handlers.getSession = neverSettles;

  const restored = await restoreSettlingPromptly();

  assert.equal(restored.awaitingTokenRefresh, true);
});

test('an offline launch with a token that is still valid restores it through Supabase as usual', async () => {
  connectivity.isConnected = false;
  supabase.auth.setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-a' }) }));

  const restored = await authSession.getCurrentSession();

  assert.equal(restored.awaitingTokenRefresh, undefined);
  assert.equal(restored.user?.uid, 'user-a');
  assert.equal(getSessionCalls(), 1);
});

test('an offline launch with nothing stored is a signed-out launch', async () => {
  connectivity.isConnected = false;

  const restored = await authSession.getCurrentSession();

  assert.deepEqual(restored, { session: null, user: null });
});

test('an online launch with an expired token still waits for the refresh', async () => {
  const refreshed = makeFakeSession({
    access_token: 'refreshed-access-token',
    user: makeFakeUser({ id: 'user-a' }),
  });
  supabase.auth.setSession(expiredSession());
  supabase.auth.handlers.getSession = async () => ({ data: { session: refreshed }, error: null });

  const restored = await authSession.getCurrentSession();

  assert.equal(restored.session?.access_token, 'refreshed-access-token');
  assert.equal(restored.awaitingTokenRefresh, undefined);
  assert.equal(getSessionCalls(), 1);
});

test('a launch whose connectivity cannot be read restores through Supabase', async () => {
  connectivity.error = new Error('NetInfo native module missing');
  supabase.auth.setSession(makeFakeSession({ user: makeFakeUser({ id: 'user-a' }) }));

  const restored = await authSession.getCurrentSession();

  assert.equal(restored.user?.uid, 'user-a');
  assert.equal(getSessionCalls(), 1);
});

test('a refresh that failed for lack of network keeps the stored session, waiting for a refresh', async () => {
  supabase.auth.setSession(expiredSession());
  supabase.auth.handlers.getSession = async () => retryableFailure;

  const restored = await authSession.getCurrentSession();

  assert.equal(restored.awaitingTokenRefresh, true);
  assert.equal(restored.user?.uid, 'user-a');
});

test('a refresh that failed for lack of network with no stored session cannot be checked', async () => {
  supabase.auth.handlers.getSession = async () => retryableFailure;

  const restored = await authSession.getCurrentSession();

  assert.deepEqual(restored, { session: null, user: null, restoreFailed: true });
});

test('a rejected refresh token restores no session', async () => {
  supabase.auth.handlers.getSession = async () => ({
    data: { session: null },
    error: { name: 'AuthApiError', message: 'Invalid Refresh Token', status: 400 },
  });

  const restored = await authSession.getCurrentSession();

  assert.deepEqual(restored, { session: null, user: null });
});

test('a malformed stored session is not restored offline', async () => {
  connectivity.isConnected = false;
  supabase.auth.setSession({ ...expiredSession(), refresh_token: '' });
  supabase.auth.handlers.getSession = async () => retryableFailure;

  const restored = await authSession.getCurrentSession();

  assert.deepEqual(restored, { session: null, user: null, restoreFailed: true });
});
