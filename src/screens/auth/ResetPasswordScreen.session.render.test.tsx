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
let signedOut: () => void = () => {};
let signOutGate: Promise<void> | null = null;
let endSignOut: () => void = () => {};
let exchanges = 0;
let recoverySignOuts = 0;
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
    signOut: async () => {
      signedOut();
      if (signOutGate) await signOutGate;
      else recoverySignOuts += 1;
    },
    updatePassword: async () => ({ success: true }),
    getCurrentSession: async () => ({ session: recoverySession }),
    resetPassword: async () => ({ success: true }),
  },
});
mockBarrel(mock, 'services/sync/index.ts', { provide: { pullFromCloud: async () => {} } });
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
      storageKey: 'test-auth',
      storage: {
        getItem: async () => 'saved-verifier/PASSWORD_RECOVERY',
        setItem: async () => {},
      },
      exchangeCodeForSession: async () => {
        exchanges += 1;
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
  signedOut = () => useAuthStore.getState().setSession(null);
});
beforeEach(async () => {
  authDeepLink.clearPendingPasswordRecovery();
  exchanges = 0;
  recoverySignOuts = 0;
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
