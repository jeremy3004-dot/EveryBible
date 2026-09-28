import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react-test-renderer';
import { create } from 'zustand';
import { installRenderHarness } from '../../testing/render';
import { mockBarrel, mockMmkvStorage, mockModule, sourcePath } from '../../testing/mockModules';
import { makeFakeSession, makeFakeUser } from '../../testing/supabaseFake';

// Keep the real auth store and recovery activation: the ordinary screen fixture
// mocks activation and cannot observe onboarding unmounting it during sign-out.
const harness = installRenderHarness(mock, { skip: ['authStore'] });
mockMmkvStorage(mock);
const { Text } = harness.rn;
const t = (key: string) => harness.i18n.t(key);
const currentSession = makeFakeSession({ user: makeFakeUser({ id: 'current-user' }) });
const recoverySession = makeFakeSession({ user: makeFakeUser({ id: 'recovery-user' }) });
const passwordOwners: string[] = [];
const passwordTokens: string[] = [];
let refreshOnSessionRead = false;
let sessionReadGate: Promise<void> | null = null;
let sessionReadStarted: () => void = () => {};
let pullGate: Promise<void> | null = null;
let pullStarted: () => void = () => {};
let passwordGate: Promise<void> | null = null;
let passwordStarted: () => void = () => {};
const pulls: string[] = [];
let signedOut: () => void = () => {};
let signOutGate: Promise<void> | null = null;
let endSignOut: () => void = () => {};
let exchanges = 0;
let recoverySignOuts = 0;
let removalNotAdmitted = false;
let cleanupGate: Promise<void> | null = null;
let cleanupStarted: () => void = () => {};
let exchangeGate: Promise<void> | null = null;
const authListeners = new Set<(event: AuthChangeEvent, session: Session | null) => void>();
const emitAuth = (event: AuthChangeEvent, session: Session | null) => {
  for (const listener of authListeners) listener(event, session);
};
let afterRecoverySession: (() => void) | null = null;
const resets: string[] = [];
const owners: Array<string | null> = [];
const recoveryNavigation = create(() => ({ revision: 0 }));
const RECOVERY_URL =
  'com.everybible.app://reset-password?code=6f1c7a0e-2b7d-4a55-9d7e-3f0b8f2c1a90';
const OTHER_RECOVERY_URL =
  'com.everybible.app://reset-password?code=6f1c7a0e-2b7d-4a55-9d7e-3f0b8f2c1a91';

for (const [path, name] of [
  ['progressStore', 'useProgressStore'],
  ['bibleStore', 'useBibleStore'],
  ['readingPlansStore', 'readingPlansStore'],
  ['translatorReviewStore', 'useTranslatorReviewStore'],
]) {
  mockModule(mock, sourcePath(`stores/${path}.ts`), {
    [name]: { getState: () => ({ resetForSignOut: () => resets.push(path) }) },
  });
}
mockModule(mock, sourcePath('stores/privateDataScope.ts'), {
  switchPrivateDataOwner: (owner: string | null) => owners.push(owner),
});
mockModule(mock, sourcePath('services/notifications/index.ts'), {
  deactivatePushToken: async () => {},
});
mockBarrel(mock, 'services/auth/index.ts', {
  provide: {
    signOut: async (isCurrent?: () => boolean) => {
      if (removalNotAdmitted) return { success: false, localRemovalFailed: true };
      if (isCurrent && !isCurrent()) return { success: false };
      if (signOutGate) {
        signedOut();
        await signOutGate;
      } else {
        recoverySignOuts += 1;
        cleanupStarted();
        if (cleanupGate) await cleanupGate;
        if (isCurrent && !isCurrent()) return { success: false };
        signedOut();
      }
      return { success: true };
    },
    updatePassword: async (
      _password: string,
      owner: { session: Session; isCurrent: () => boolean }
    ) => {
      passwordTokens.push(owner.session.access_token);
      passwordOwners.push(useAuthStore.getState().user?.uid ?? 'none');
      passwordStarted();
      if (passwordGate) await passwordGate;
      return { success: true };
    },
    getCurrentSession: async () => {
      sessionReadStarted();
      if (sessionReadGate) await sessionReadGate;
      if (refreshOnSessionRead) {
        refreshOnSessionRead = false;
        sessionReadGate = null;
        sessionReadStarted = () => {};
        pullGate = null;
        pullStarted = () => {};
        const next = {
          ...recoverySession,
          access_token: 'refreshed-access',
          refresh_token: 'refreshed-refresh',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        };
        useAuthStore.getState().setSession(next);
        emitAuth('TOKEN_REFRESHED', next);
        return { session: next };
      }
      return { session: useAuthStore.getState().session };
    },
    resetPassword: async () => ({ success: true }),
  },
});
mockBarrel(mock, 'services/sync/index.ts', {
  provide: {
    pullFromCloud: async (uid: string) => {
      pulls.push(uid);
      pullStarted();
      if (pullGate) await pullGate;
    },
  },
});
mockModule(mock, sourcePath('navigation/rootNavigation.ts'), {
  rootNavigationRef: {
    isReady: () => true,
    resetRoot: () => recoveryNavigation.setState(({ revision }) => ({ revision: revision + 1 })),
  },
});
mockModule(mock, sourcePath('services/supabase/index.ts'), {
  isSupabaseConfigured: () => true,
  supabase: {
    auth: {
      onAuthStateChange: (listener: (event: AuthChangeEvent, session: Session | null) => void) => {
        authListeners.add(listener);
        return { data: { subscription: { unsubscribe: () => authListeners.delete(listener) } } };
      },
      storageKey: 'test-auth',
      storage: {
        getItem: async () => JSON.stringify('saved-verifier/PASSWORD_RECOVERY'),
        setItem: async () => {},
      },
      exchangeCodeForSession: async () => {
        exchanges += 1;
        if (exchangeGate) await exchangeGate;
        useAuthStore.getState().setSession(recoverySession);
        emitAuth('SIGNED_IN', recoverySession);
        afterRecoverySession?.();
        return {
          data: { session: recoverySession, redirectType: 'PASSWORD_RECOVERY' },
          error: null,
        };
      },
    },
  },
});

let useAuthStore: typeof import('../../stores/authStore').useAuthStore;
let authDeepLink: typeof import('../../services/auth/authDeepLink');
let ResetPasswordScreen: typeof import('./ResetPasswordScreen').ResetPasswordScreen;
let defaults: typeof import('../../stores/sanitizers/authState').defaultAuthPreferences;
before(async () => {
  ({ useAuthStore } = await import('../../stores/authStore'));
  authDeepLink = await import('../../services/auth/authDeepLink');
  ({ ResetPasswordScreen } = await import('./ResetPasswordScreen'));
  ({ defaultAuthPreferences: defaults } = await import('../../stores/sanitizers/authState'));
  signedOut = () => {
    useAuthStore.getState().setSession(null);
    emitAuth('SIGNED_OUT', null);
  };
});
beforeEach(async () => {
  authDeepLink.clearPendingPasswordRecovery();
  passwordTokens.length = 0;
  refreshOnSessionRead = false;
  sessionReadGate = null;
  sessionReadStarted = () => {};
  pullGate = null;
  pullStarted = () => {};
  passwordOwners.length = 0;
  passwordGate = null;
  passwordStarted = () => {};
  pulls.length = 0;
  exchanges = 0;
  recoverySignOuts = 0;
  removalNotAdmitted = false;
  cleanupGate = null;
  cleanupStarted = () => {};
  exchangeGate = null;
  afterRecoverySession = null;
  resets.length = 0;
  owners.length = 0;
  signOutGate = new Promise<void>((resolve) => (endSignOut = resolve));
  useAuthStore.setState({
    session: currentSession,
    user: { uid: 'current-user' } as ReturnType<typeof useAuthStore.getState>['user'],
    isAuthenticated: true,
    lastSyncedUserId: 'current-user',
    preferences: { ...defaults, onboardingCompleted: true, language: 'es', fontSize: 'large' },
  });
  await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);
});

function OnboardingGate() {
  const completed = useAuthStore((state) => state.preferences.onboardingCompleted);
  const revision = recoveryNavigation((state) => state.revision);
  return completed ? <ResetPasswordScreen key={revision} /> : <Text>ONBOARDING</Text>;
}

test('duplicate reset links do not remount the screen or clear its pending code', async () => {
  const view = await harness.render(<OnboardingGate />);
  const revision = recoveryNavigation.getState().revision;
  await act(async () => {
    await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);
  });
  assert.equal(recoveryNavigation.getState().revision, revision);
  assert.equal(authDeepLink.getPendingPasswordRecovery()?.kind, 'code');
  await view.unmount();
});

test('replacing an unactivated link remounts the screen without old cleanup clearing the new code', async () => {
  const view = await harness.render(<OnboardingGate />);
  const revision = recoveryNavigation.getState().revision;
  await act(async () => {
    await authDeepLink.handleAuthDeepLinkUrl(OTHER_RECOVERY_URL);
  });
  assert.equal(recoveryNavigation.getState().revision, revision + 1);
  assert.deepEqual(authDeepLink.getPendingPasswordRecovery(), {
    kind: 'code',
    code: '6f1c7a0e-2b7d-4a55-9d7e-3f0b8f2c1a91',
  });
  await view.unmount();
  assert.equal(authDeepLink.getPendingPasswordRecovery(), null);
});

test('signed-in recovery keeps the reset screen mounted while clearing the previous account', async () => {
  const view = await harness.render(<OnboardingGate />);
  await view.press(view.getByRole('button', { name: t('common.continue') }));
  const revision = recoveryNavigation.getState().revision;
  // The sign-out service has emitted SIGNED_OUT and is still awaiting its network
  // completion. Allow React to apply App's onboarding gate before exchange starts.
  for (let i = 0; i < 200 && useAuthStore.getState().user !== null; i++) {
    await act(async () => new Promise<void>((resolve) => setImmediate(resolve)));
  }
  assert.equal(useAuthStore.getState().user, null, 'the current account signed out');
  assert.equal(view.queryByText('ONBOARDING'), null);
  assert.equal(useAuthStore.getState().preferences.language, defaults.language);
  assert.equal(useAuthStore.getState().preferences.fontSize, defaults.fontSize);
  assert.ok(resets.includes('progressStore'));
  assert.ok(owners.includes(null));
  await act(async () => {
    await authDeepLink.handleAuthDeepLinkUrl(OTHER_RECOVERY_URL);
  });
  assert.equal(recoveryNavigation.getState().revision, revision, 'activation is not interrupted');

  await act(async () => endSignOut());
  for (let i = 0; i < 200 && exchanges === 0; i++) {
    await act(async () => new Promise<void>((resolve) => setImmediate(resolve)));
  }
  await view.flush();
  assert.equal(exchanges, 1);
  assert.equal(recoverySignOuts, 0);
  assert.ok(view.getByLabelText(t('auth.newPassword')));
  await act(async () => {
    await authDeepLink.handleAuthDeepLinkUrl(RECOVERY_URL);
  });
  await act(async () => {
    await authDeepLink.handleAuthDeepLinkUrl(OTHER_RECOVERY_URL);
  });
  assert.equal(recoveryNavigation.getState().revision, revision, 'the active form is not replaced');
  assert.equal(recoverySignOuts, 0);
  signOutGate = null;
  await view.unmount();
  assert.equal(recoverySignOuts, 1, 'leaving the unsaved form still ends recovery');
  await authDeepLink.handleAuthDeepLinkUrl(OTHER_RECOVERY_URL);
  assert.equal(
    recoveryNavigation.getState().revision,
    revision + 1,
    'a closed flow can open a new link'
  );
});

test('recovery refuses code exchange when durable local sign-out is not admitted', async () => {
  removalNotAdmitted = true;
  const view = await harness.render(<OnboardingGate />);
  await view.press(view.getByRole('button', { name: t('common.continue') }));
  for (let turn = 0; turn < 20 && !view.queryByText(t('auth.serviceUnavailable')); turn += 1) {
    await act(async () => new Promise<void>((resolve) => setImmediate(resolve)));
  }
  await view.flush();
  assert.equal(exchanges, 0);
  assert.equal(useAuthStore.getState().user?.uid, 'current-user');
  assert.equal(useAuthStore.getState().isAuthenticated, true);
  assert.equal(useAuthStore.getState().preferences.language, 'es');
  assert.equal(useAuthStore.getState().preferences.fontSize, 'large');
  assert.deepEqual(resets, []);
  assert.deepEqual(owners, []);
  assert.ok(view.getByText(t('auth.serviceUnavailable')));
  assert.equal(view.queryByLabelText(t('auth.newPassword')), null);
  await view.unmount();
  assert.equal(recoverySignOuts, 0, 'no recovery session was activated to clean up');
});

async function activateForm(view: Awaited<ReturnType<typeof harness.render>>) {
  await view.press(view.getByRole('button', { name: t('common.continue') }));
  await act(async () => {
    endSignOut();
  });
  for (let turn = 0; turn < 30 && !view.queryByLabelText(t('auth.newPassword')); turn += 1) {
    await act(async () => new Promise<void>((resolve) => setImmediate(resolve)));
  }
  assert.ok(view.getByLabelText(t('auth.newPassword')));
  signOutGate = null;
}

for (const sameUid of [false, true]) {
  test(`actual reset hook unmount preserves ${sameUid ? 'a newer generation of the recovery account' : 'a newer account'}`, async () => {
    const view = await harness.render(<OnboardingGate />);
    await activateForm(view);
    const next = makeFakeSession({
      user: makeFakeUser({ id: sameUid ? 'recovery-user' : 'next-user' }),
      access_token: 'next-token',
    });
    useAuthStore.getState().setSession(null);
    useAuthStore.getState().setSession(next);
    emitAuth('SIGNED_IN', next);
    await view.unmount();
    assert.equal(useAuthStore.getState().user?.uid, next.user.id);
    assert.equal(recoverySignOuts, 0, 'obsolete hook must not admit native cleanup');
  });
}

test('actual reset hook native cleanup cannot sign out a login made while deletion is pending', async () => {
  const view = await harness.render(<OnboardingGate />);
  await activateForm(view);
  let release!: () => void;
  cleanupGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    cleanupStarted = resolve;
  });
  await view.unmount();
  await started;
  const next = makeFakeSession({ user: makeFakeUser({ id: 'next-user' }) });
  useAuthStore.getState().setSession(next);
  emitAuth('SIGNED_IN', next);
  await act(async () => {
    release();
    await cleanupGate;
  });
  assert.equal(useAuthStore.getState().user?.uid, 'next-user');
});

test('a closed actual reset hook does not adopt a newer login as its exchange cleanup owner', async () => {
  let releaseExchange!: () => void;
  exchangeGate = new Promise<void>((resolve) => {
    releaseExchange = resolve;
  });
  const view = await harness.render(<OnboardingGate />);
  await view.press(view.getByRole('button', { name: t('common.continue') }));
  await act(async () => {
    endSignOut();
  });
  for (let turn = 0; turn < 30 && exchanges === 0; turn += 1) await view.flush();
  await view.unmount();
  signOutGate = null;
  afterRecoverySession = () => {
    const next = makeFakeSession({
      user: makeFakeUser({ id: 'next-user' }),
      access_token: 'next-token',
    });
    useAuthStore.getState().setSession(next);
    emitAuth('SIGNED_IN', next);
  };
  await act(async () => {
    releaseExchange();
    await exchangeGate;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(useAuthStore.getState().user?.uid, 'next-user');
  assert.equal(recoverySignOuts, 0);
});

test('same-UID fresh login invalidates recovery cleanup without requiring a generation change', async () => {
  const view = await harness.render(<OnboardingGate />);
  await activateForm(view);
  const generation = useAuthStore.getState().authGeneration;
  const next = makeFakeSession({ user: recoverySession.user, access_token: 'new-login-token' });
  useAuthStore.getState().setSession(next);
  emitAuth('SIGNED_IN', next);
  assert.equal(useAuthStore.getState().authGeneration, generation);
  await view.unmount();
  assert.equal(recoverySignOuts, 0);
  assert.equal(useAuthStore.getState().session?.access_token, 'new-login-token');
  assert.equal(authListeners.size, 0);
});

for (const refreshed of [false, true]) {
  test(`${refreshed ? 'TOKEN_REFRESHED followed by duplicate SIGNED_IN' : 'duplicate same-session SIGNED_IN'} preserves genuine recovery cleanup ownership`, async () => {
    const view = await harness.render(<OnboardingGate />);
    await activateForm(view);
    const current = refreshed
      ? makeFakeSession({
          user: recoverySession.user,
          access_token: 'rotated',
          refresh_token: 'rotated-refresh',
        })
      : recoverySession;
    useAuthStore.getState().setSession(current);
    if (refreshed) emitAuth('TOKEN_REFRESHED', current);
    emitAuth('SIGNED_IN', current);
    await view.unmount();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(recoverySignOuts, 1);
    assert.equal(useAuthStore.getState().session, null);
    assert.equal(authListeners.size, 0);
  });
}

test('a mounted recovery form cannot save a newer session for the same account', async () => {
  const view = await harness.render(<OnboardingGate />);
  await activateForm(view);
  const next = makeFakeSession({
    user: makeFakeUser({ id: 'recovery-user' }),
    access_token: 'next-token',
    refresh_token: 'next-refresh',
  });
  await act(async () => {
    useAuthStore.getState().setSession(next);
    emitAuth('SIGNED_IN', next);
  });
  await view.changeText(view.getByLabelText(t('auth.newPassword')), 'new-secret');
  await view.changeText(view.getByLabelText(t('auth.confirmNewPassword')), 'new-secret');
  await view.press(view.getByRole('button', { name: t('auth.resetPasswordSubmit') }));
  assert.deepEqual(passwordOwners, []);
  assert.deepEqual(pulls, []);
  await view.unmount();
});

test('an in-flight recovery save cannot restore a newer account or announce success', async () => {
  const view = await harness.render(<OnboardingGate />);
  await activateForm(view);
  await view.changeText(view.getByLabelText(t('auth.newPassword')), 'new-secret');
  await view.changeText(view.getByLabelText(t('auth.confirmNewPassword')), 'new-secret');
  let release!: () => void;
  passwordGate = new Promise<void>((r) => (release = r));
  const started = new Promise<void>((r) => (passwordStarted = r));
  const pending = (
    view.getByRole('button', { name: t('auth.resetPasswordSubmit') }).props
      .onPress as () => Promise<void>
  )();
  await started;
  const next = makeFakeSession({
    user: makeFakeUser({ id: 'next-user' }),
    access_token: 'next-token',
    refresh_token: 'next-refresh',
  });
  await act(async () => {
    useAuthStore.getState().setSession(next);
    emitAuth('SIGNED_IN', next);
  });
  await act(async () => {
    release();
    await pending;
  });
  assert.equal(useAuthStore.getState().session, next);
  assert.deepEqual(pulls, []);
  assert.equal(
    harness.rn.__recorded.alerts.some((alert) => alert.title === t('auth.resetPasswordSuccess')),
    false
  );
  await view.unmount();
});

test('a long-open owned recovery refreshes before dispatching its password JWT', async () => {
  const view = await harness.render(<OnboardingGate />);
  await activateForm(view);
  const expired = { ...recoverySession, expires_at: Math.floor(Date.now() / 1000) - 60 };
  await act(async () => {
    useAuthStore.getState().setSession(expired);
  });
  refreshOnSessionRead = true;
  await view.changeText(view.getByLabelText(t('auth.newPassword')), 'new-secret');
  await view.changeText(view.getByLabelText(t('auth.confirmNewPassword')), 'new-secret');
  await view.press(view.getByRole('button', { name: t('auth.resetPasswordSubmit') }));
  assert.deepEqual(passwordTokens, ['refreshed-access']);
  assert.deepEqual(pulls, ['recovery-user']);
  assert.equal(harness.rn.__recorded.alerts.at(-1)?.title, t('auth.resetPasswordSuccess'));
  await view.unmount();
  assert.equal(recoverySignOuts, 0);
});

test('an old recovery success alert cannot dismiss a newer same-account session route', async () => {
  const view = await harness.render(<OnboardingGate />);
  await activateForm(view);
  await view.changeText(view.getByLabelText(t('auth.newPassword')), 'new-secret');
  await view.changeText(view.getByLabelText(t('auth.confirmNewPassword')), 'new-secret');
  await view.press(view.getByRole('button', { name: t('auth.resetPasswordSubmit') }));
  const alert = harness.rn.__recorded.alerts.at(-1);
  assert.equal(alert?.title, t('auth.resetPasswordSuccess'));
  const next = makeFakeSession({
    user: makeFakeUser({ id: 'recovery-user' }),
    access_token: 'new-login',
    refresh_token: 'new-refresh',
  });
  await act(async () => {
    useAuthStore.getState().setSession(next);
    emitAuth('SIGNED_IN', next);
  });
  (alert?.buttons as Array<{ onPress?: () => void }> | undefined)?.[0].onPress?.();
  assert.deepEqual(harness.navigation.calls, []);
  await view.unmount();
});

for (const step of ['session', 'sync'] as const) {
  test(`a recovery save cannot announce success after a newer login during ${step}`, async () => {
    const view = await harness.render(<OnboardingGate />);
    await activateForm(view);
    await view.changeText(view.getByLabelText(t('auth.newPassword')), 'new-secret');
    await view.changeText(view.getByLabelText(t('auth.confirmNewPassword')), 'new-secret');
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const ready = new Promise<void>((r) => (started = r));
    if (step === 'session') {
      sessionReadGate = gate;
      sessionReadStarted = started;
    } else {
      pullGate = gate;
      pullStarted = started;
    }
    const pending = (
      view.getByRole('button', { name: t('auth.resetPasswordSubmit') }).props
        .onPress as () => Promise<void>
    )();
    await ready;
    const next = makeFakeSession({
      user: makeFakeUser({ id: 'next-user' }),
      access_token: 'next-session',
      refresh_token: 'next-refresh',
    });
    await act(async () => {
      useAuthStore.getState().setSession(next);
      emitAuth('SIGNED_IN', next);
    });
    await act(async () => {
      release();
      await pending;
    });
    assert.equal(useAuthStore.getState().session, next);
    assert.deepEqual(pulls, step === 'sync' ? ['recovery-user'] : []);
    assert.equal(
      harness.rn.__recorded.alerts.some((alert) => alert.title === t('auth.resetPasswordSuccess')),
      false
    );
    await view.unmount();
  });
}
