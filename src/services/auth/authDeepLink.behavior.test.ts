import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { createSupabaseFake } from '../../testing/supabaseFake';

const RECOVERY_URL =
  'com.everybible.app://reset-password#access_token=access-1&refresh_token=refresh-1&type=recovery';

const supabaseFake = createSupabaseFake();

// The shared `mockSupabaseModule` helper freezes `isSupabaseConfigured` at
// install time; this module branches on it, so the flag is mutable here.
let supabaseConfigured = true;
const supabaseExports = {
  supabase: supabaseFake.client,
  isSupabaseConfigured: () => supabaseConfigured,
  getCurrentUserId: async () => supabaseFake.auth.user?.id ?? null,
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

// Recording stand-in for the NavigationContainer ref. `isReady` is the switch
// the module uses to decide between navigating now and deferring.
const navigator: {
  ready: boolean;
  navigations: unknown[][];
} = { ready: true, navigations: [] };

mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: {
    isReady: () => navigator.ready,
    navigate: (...args: unknown[]) => {
      navigator.navigations.push(args);
    },
    getCurrentRoute: () =>
      navigator.navigations.length > 0 ? { name: 'ResetPassword' } : undefined,
  },
  openAuthFlow: () => {},
});

const RESET_PASSWORD_ROUTE = [
  'More',
  { screen: 'Auth', params: { screen: 'ResetPassword' } },
] as const;

const defaultAuthHandlers = { ...supabaseFake.auth.handlers };
const authHandlers = supabaseFake.auth.handlers as unknown as Record<
  string,
  (...args: unknown[]) => unknown
>;

let authDeepLink: typeof import('./authDeepLink');

before(async () => {
  authDeepLink = await import('./authDeepLink');
});

beforeEach(() => {
  supabaseConfigured = true;
  supabaseFake.reset();
  Object.assign(supabaseFake.auth.handlers, defaultAuthHandlers);
  navigator.ready = true;
  navigator.navigations = [];
});

/**
 * The module keeps one process-wide "a reset link is waiting" flag. Tests that
 * deliberately leave it set drain it here so the next test starts clean.
 */
const drainPendingNavigation = (): void => {
  navigator.ready = true;
  authDeepLink.flushPendingResetPasswordNavigation();
  navigator.navigations = [];
};

test('a link with no recovery tokens is left for React Navigation to handle', async () => {
  const handled = await authDeepLink.handleAuthDeepLinkUrl('com.everybible.app://bible/JHN/3');

  assert.equal(handled, false);
  assert.deepEqual(supabaseFake.authCalls, []);
  assert.deepEqual(navigator.navigations, []);
});

test('a link whose type is not recovery is ignored', async () => {
  const handled = await authDeepLink.handleAuthDeepLinkUrl(
    'com.everybible.app://reset-password#access_token=a&refresh_token=b&type=magiclink'
  );

  assert.equal(handled, false);
  assert.deepEqual(supabaseFake.authCalls, []);
});

test('a recovery link is ignored on a build with no backend configured', async () => {
  supabaseConfigured = false;

  const handled = await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  assert.equal(handled, false);
  assert.deepEqual(supabaseFake.authCalls, []);
  assert.deepEqual(navigator.navigations, []);
});

test('a recovery link establishes the session from the fragment tokens', async () => {
  const handled = await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  assert.equal(handled, true);
  assert.deepEqual(supabaseFake.authCalls, [
    { method: 'setSession', args: [{ access_token: 'access-1', refresh_token: 'refresh-1' }] },
  ]);
  assert.equal(supabaseFake.auth.session?.access_token, 'access-1');
});

test('a recovery link navigates into ResetPassword inside the Auth stack of the More tab', async () => {
  await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  assert.deepEqual(navigator.navigations, [[...RESET_PASSWORD_ROUTE]]);
});

test('recovery tokens delivered as a query string are accepted too', async () => {
  const handled = await authDeepLink.handleAuthDeepLinkUrl(
    'com.everybible.app://reset-password?access_token=q-access&refresh_token=q-refresh&type=recovery'
  );

  assert.equal(handled, true);
  assert.deepEqual(supabaseFake.authCalls[0].args, [
    { access_token: 'q-access', refresh_token: 'q-refresh' },
  ]);
});

test('an expired link still opens ResetPassword so the screen can explain the failure', async (t) => {
  const warned = t.mock.method(console, 'warn', () => {});
  authHandlers.setSession = async () => ({
    data: { session: null, user: null },
    error: { message: 'Invalid Refresh Token' },
  });

  const handled = await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  assert.equal(handled, true);
  assert.deepEqual(navigator.navigations, [[...RESET_PASSWORD_ROUTE]]);
  assert.equal(warned.mock.callCount(), 1);
});

test('a thrown setSession still opens ResetPassword rather than dead-ending the link', async (t) => {
  const warned = t.mock.method(console, 'warn', () => {});
  authHandlers.setSession = async () => {
    throw new Error('Network request failed');
  };

  const handled = await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  assert.equal(handled, true);
  assert.deepEqual(navigator.navigations, [[...RESET_PASSWORD_ROUTE]]);
  assert.equal(warned.mock.callCount(), 1);
});

test('a link that arrives before the navigator is ready defers navigation', async () => {
  navigator.ready = false;

  const handled = await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  assert.equal(handled, true);
  assert.equal(supabaseFake.authCalls[0].method, 'setSession');
  assert.deepEqual(navigator.navigations, []);

  drainPendingNavigation();
});

test('flushing while the navigator is still not ready keeps the link pending', async () => {
  navigator.ready = false;
  await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  authDeepLink.flushPendingResetPasswordNavigation();
  assert.deepEqual(navigator.navigations, []);

  navigator.ready = true;
  authDeepLink.flushPendingResetPasswordNavigation();
  assert.deepEqual(navigator.navigations, [[...RESET_PASSWORD_ROUTE]]);
});

test('a deferred link is replayed exactly once when the navigator becomes ready', async () => {
  navigator.ready = false;
  await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);
  navigator.ready = true;

  authDeepLink.flushPendingResetPasswordNavigation();
  authDeepLink.flushPendingResetPasswordNavigation();

  assert.deepEqual(navigator.navigations, [[...RESET_PASSWORD_ROUTE]]);
});

test('flushing with nothing pending navigates nowhere', () => {
  authDeepLink.flushPendingResetPasswordNavigation();

  assert.deepEqual(navigator.navigations, []);
});

// Documents current behaviour rather than endorsing it: the pending flag is a
// single boolean, so a link handled directly while another is still deferred
// does not consume it. See the QUESTION in the domain A report.
test('a link handled while the navigator is ready leaves an earlier deferred link pending', async () => {
  navigator.ready = false;
  await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  navigator.ready = true;
  await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);
  assert.deepEqual(navigator.navigations, [[...RESET_PASSWORD_ROUTE]]);

  authDeepLink.flushPendingResetPasswordNavigation();

  assert.deepEqual(navigator.navigations, [[...RESET_PASSWORD_ROUTE], [...RESET_PASSWORD_ROUTE]]);
});
