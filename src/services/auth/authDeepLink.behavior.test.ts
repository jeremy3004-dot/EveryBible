import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { createSupabaseFake } from '../../testing/supabaseFake';

/**
 * Link arrival must NEVER establish a session. The PKCE code is parked and only
 * `activatePendingPasswordRecovery()` — called from ResetPasswordScreen after
 * the user taps Continue — exchanges it. Old implicit-flow links, which carry a
 * live session over a scheme any app can claim, are refused.
 */
const CODE = '6f1c7a0e-2b7d-4a55-9d7e-3f0b8f2c1a90';
const RECOVERY_URL = `com.everybible.app://reset-password?code=${CODE}`;
const LEGACY_URL =
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
  supabaseFake.auth.setSession(null);
  Object.assign(supabaseFake.auth.handlers, defaultAuthHandlers);
  navigator.ready = true;
  navigator.navigations = [];
  authDeepLink.clearPendingPasswordRecovery();
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

test('a link that is not the reset link is left for React Navigation to handle', async () => {
  const handled = await authDeepLink.handleAuthDeepLinkUrl('com.everybible.app://bible/JHN/3');

  assert.equal(handled, false);
  assert.deepEqual(supabaseFake.authCalls, []);
  assert.deepEqual(navigator.navigations, []);
});

test('a recovery link is ignored on a build with no backend configured', async () => {
  supabaseConfigured = false;

  const handled = await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  assert.equal(handled, false);
  assert.deepEqual(supabaseFake.authCalls, []);
  assert.deepEqual(navigator.navigations, []);
});

test('a recovery link parks its code without establishing a session', async () => {
  const handled = await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  assert.equal(handled, true);
  assert.deepEqual(supabaseFake.authCalls, []);
  assert.equal(supabaseFake.auth.session, null);
  assert.deepEqual(authDeepLink.getPendingPasswordRecovery(), { kind: 'code', code: CODE });
});

test('an old implicit-flow link opens the reset screen as unusable and its tokens are never used', async () => {
  const handled = await authDeepLink.handleAuthDeepLinkUrl(LEGACY_URL);

  assert.equal(handled, true, 'the screen explains the link and offers a new one');
  assert.deepEqual(authDeepLink.getPendingPasswordRecovery(), {
    kind: 'unusable',
    reason: 'legacy-token',
  });
  assert.deepEqual(navigator.navigations, [[...RESET_PASSWORD_ROUTE]]);
  assert.deepEqual(await authDeepLink.activatePendingPasswordRecovery(), { status: 'missing' });
  assert.deepEqual(supabaseFake.authCalls, []);
  assert.equal(supabaseFake.auth.session, null);
});

test('an expired-link error redirect opens the reset screen as unusable', async () => {
  await authDeepLink.handleAuthDeepLinkUrl(
    'com.everybible.app://reset-password?error=access_denied&error_code=otp_expired'
  );

  assert.deepEqual(authDeepLink.getPendingPasswordRecovery(), {
    kind: 'unusable',
    reason: 'link-error',
  });
  assert.deepEqual(navigator.navigations, [[...RESET_PASSWORD_ROUTE]]);
});

test('a link from a lookalike host is rejected outright', async () => {
  const handled = await authDeepLink.handleAuthDeepLinkUrl(
    `com.everybible.app://reset-password.attacker.example?code=${CODE}`
  );

  assert.equal(handled, false);
  assert.equal(authDeepLink.getPendingPasswordRecovery(), null);
  assert.deepEqual(navigator.navigations, []);
});

test('activation exchanges the parked code for a recovery session, and only once', async () => {
  await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  assert.deepEqual(await authDeepLink.activatePendingPasswordRecovery(), { status: 'activated' });

  assert.deepEqual(supabaseFake.authCalls, [{ method: 'exchangeCodeForSession', args: [CODE] }]);
  assert.ok(supabaseFake.auth.session);
  assert.equal(authDeepLink.getPendingPasswordRecovery(), null);
  assert.deepEqual(await authDeepLink.activatePendingPasswordRecovery(), { status: 'missing' });
  assert.equal(supabaseFake.authCalls.length, 1);
});

test('activation with nothing parked does not touch Supabase', async () => {
  assert.deepEqual(await authDeepLink.activatePendingPasswordRecovery(), { status: 'missing' });

  assert.deepEqual(supabaseFake.authCalls, []);
});

test('activation on a build with no backend reports a configuration failure', async () => {
  await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);
  supabaseConfigured = false;

  assert.deepEqual(await authDeepLink.activatePendingPasswordRecovery(), {
    status: 'failed',
    problem: 'configuration',
  });
  assert.deepEqual(supabaseFake.authCalls, []);
});

test('a link opened where the code verifier is missing reports the wrong-device problem', async () => {
  authHandlers.exchangeCodeForSession = async () => ({
    data: { session: null, user: null, redirectType: null },
    error: {
      name: 'AuthPKCECodeVerifierMissingError',
      code: 'pkce_code_verifier_not_found',
      status: 400,
      message: 'PKCE code verifier not found in storage.',
    },
  });
  await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  assert.deepEqual(await authDeepLink.activatePendingPasswordRecovery(), {
    status: 'failed',
    problem: 'wrong-device',
  });
  assert.equal(supabaseFake.auth.session, null);
  assert.equal(authDeepLink.getPendingPasswordRecovery(), null, 'the code cannot be retried');
});

test('an expired or already-used code reports the expired problem', async () => {
  authHandlers.exchangeCodeForSession = async () => ({
    data: { session: null, user: null, redirectType: null },
    error: { name: 'AuthApiError', code: 'flow_state_not_found', status: 404, message: 'x' },
  });
  await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  assert.deepEqual(await authDeepLink.activatePendingPasswordRecovery(), {
    status: 'failed',
    problem: 'expired',
  });
});

test('a thrown exchange is reported as a network failure rather than dead-ending the screen', async () => {
  authHandlers.exchangeCodeForSession = async () => {
    throw new TypeError('Network request failed');
  };
  await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  assert.deepEqual(await authDeepLink.activatePendingPasswordRecovery(), {
    status: 'failed',
    problem: 'network',
  });
});

test('a code whose verifier came from a non-recovery request is refused and its session dropped', async () => {
  authHandlers.exchangeCodeForSession = async () => {
    const next = { access_token: 'signup-session', user: { id: 'user-1' } };
    supabaseFake.auth.setSession(next as never);
    return { data: { session: next as never, user: next.user as never, redirectType: null } };
  };
  await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  assert.deepEqual(await authDeepLink.activatePendingPasswordRecovery(), {
    status: 'failed',
    problem: 'expired',
  });
  assert.deepEqual(
    supabaseFake.authCalls.map((call) => call.method),
    ['exchangeCodeForSession', 'signOut']
  );
  assert.equal(supabaseFake.auth.session, null);
});

test('clearPendingPasswordRecovery drops the parked code so a cancelled reset cannot be resumed', async () => {
  await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  authDeepLink.clearPendingPasswordRecovery();

  assert.equal(authDeepLink.getPendingPasswordRecovery(), null);
  assert.deepEqual(await authDeepLink.activatePendingPasswordRecovery(), { status: 'missing' });
});

test('a recovery link navigates into ResetPassword inside the Auth stack of the More tab', async () => {
  await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  assert.deepEqual(navigator.navigations, [[...RESET_PASSWORD_ROUTE]]);
});

test('a link that arrives before the navigator is ready defers navigation', async () => {
  navigator.ready = false;

  const handled = await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);

  assert.equal(handled, true);
  assert.deepEqual(supabaseFake.authCalls, []);
  assert.ok(authDeepLink.getPendingPasswordRecovery(), 'the code waits with the navigation');
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
