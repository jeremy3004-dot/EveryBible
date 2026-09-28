import { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  mockExpoCrypto,
  mockMmkvStorage,
  mockModule,
  mockReactNative,
  mockSecureStore,
  sourcePath,
} from '../testing/mockModules';
import { createSupabaseFake, makeFakeSession, makeFakeUser } from '../testing/supabaseFake';
import { BUILD_448_BLOB } from './readingPlansStore.persistenceFixture';

// Each wrapper gets a fresh module cache: critical auth startup can be the first
// consumer of the plans store, before the navigator has loaded any plan screens.
const mmkv = mockMmkvStorage(mock);

const supabaseFake = createSupabaseFake();
const supabaseExports = {
  supabase: supabaseFake.client,
  isSupabaseConfigured: () => true,
  getCurrentUserId: async () => supabaseFake.auth.user?.id ?? null,
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);
mockReactNative(mock, { os: 'ios' });
mockModule(mock, sourcePath('services/startup/publicRuntimeConfig.ts'), {
  publicRuntimeConfig: {},
});
mockModule(mock, 'expo-apple-authentication', {
  AppleAuthenticationScope: { FULL_NAME: 'FULL_NAME', EMAIL: 'EMAIL' },
  signInAsync: async () => ({ identityToken: null }),
});
mockModule(mock, '@react-native-google-signin/google-signin', {
  GoogleSignin: {
    configure: () => {},
    hasPlayServices: async () => true,
    signIn: async () => ({ type: 'cancelled', data: null }),
  },
  isErrorWithCode: () => false,
  statusCodes: {},
});
mockExpoCrypto(mock);
mockSecureStore(mock);
mockModule(mock, sourcePath('stores/bibleStore.ts'), {
  useBibleStore: { getState: () => ({ resetForSignOut: () => {} }) },
});
mockModule(mock, sourcePath('services/notifications/index.ts'), {
  deactivatePushToken: async () => {},
});

export async function verifyPlansColdStartup(
  scenario: 'guest' | 'signout' | 'no-auth' | 'prehydrated'
): Promise<void> {
  mmkv.store.set('reading-plans-storage', BUILD_448_BLOB);
  mmkv.store.set(
    'auth-storage',
    JSON.stringify({
      state: {
        preferences: { onboardingCompleted: true, language: 'en' },
        lastSyncedUserId: scenario === 'signout' ? 'prior-account' : null,
      },
      version: 3,
    })
  );
  const { useAuthStore } = await import('./authStore');
  if (scenario === 'prehydrated') {
    const { readingPlansStore } = await import('./readingPlansStore');
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(
      readingPlansStore.getState().progressByPlanId,
      JSON.parse(BUILD_448_BLOB).state.progressByPlanId
    );
  }
  if (scenario !== 'no-auth') {
    supabaseFake.auth.setSession(
      scenario === 'signout'
        ? null
        : makeFakeSession({ user: makeFakeUser({ id: 'first-account' }) })
    );
    const { createStartupCoordinator } = await import('../services/startup/startupService');
    await createStartupCoordinator({
      initializeAuth: useAuthStore.getState().initialize,
      initializePrivacy: async () => {},
      isPrivacyInitialized: () => true,
      preloadBibleData: async () => {},
    }).initializeCritical();
    assert.equal(
      useAuthStore.getState().user?.uid ?? null,
      scenario === 'signout' ? null : 'first-account'
    );
  }
  const { readingPlansStore } = await import('./readingPlansStore');
  // Drain the real default storage adapter; no artificial deferred MMKV/native calls.
  await new Promise<void>((resolve) => setImmediate(resolve));
  const saved = JSON.parse(mmkv.store.get('reading-plans-storage')!);
  const old = JSON.parse(BUILD_448_BLOB).state;
  const current = readingPlansStore.getState();
  for (const field of [
    'progressByPlanId',
    'enrolledPlanIds',
    'savedPlanIds',
    'completedPlanIds',
    'rhythmsById',
    'rhythmOrder',
    'planDayResumeByKey',
    'groupPlansByGroupId',
  ] as const) {
    const expected = scenario === 'signout' ? (Array.isArray(old[field]) ? [] : {}) : old[field];
    assert.deepEqual(saved.state[field], expected, `${field} persisted correctly`);
    assert.deepEqual(current[field], expected, `${field} not undone by late hydration`);
  }
  if (scenario !== 'no-auth') {
    assert.deepEqual(saved.state.pendingUnenrollPlanIds, []);
    assert.deepEqual(current.pendingUnenrollPlanIds, []);
    assert.deepEqual(saved.state.pendingUnenrollAtByPlanId, {});
    assert.deepEqual(current.pendingUnenrollAtByPlanId, {});
  }
}
