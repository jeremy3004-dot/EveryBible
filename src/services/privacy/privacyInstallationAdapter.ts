import {
  LEGACY_AUTH_STORAGE_KEY,
  PRIVACY_INSTALLATION_MARKER_KEY,
  createSingleFlightAsyncTask,
  reconcilePrivacyInstallation,
  resetPrivacyIfInstallationIsFresh,
  resolvePrivacyInstallationEvidence,
} from './privacyInstallation';

export interface PrivacyInstallationBootstrapDependencies {
  migrateStorage: () => Promise<void>;
  reconcileInstallation: () => Promise<void>;
}

/**
 * Keeps migration and privacy classification in one retryable single-flight.
 * A timed-out caller may return to the retry UI, but a later retry joins the
 * still-pending migration instead of starting reconciliation concurrently.
 */
export const createPrivacyInstallationBootstrap = ({
  migrateStorage,
  reconcileInstallation,
}: PrivacyInstallationBootstrapDependencies) =>
  createSingleFlightAsyncTask(async () => {
    await migrateStorage();
    await reconcileInstallation();
  });

/**
 * Production bridge for the app-container marker and native privacy reset.
 * Native modules stay behind dynamic imports so the policy remains runnable in
 * the Node test runner and does not expand the static startup import path.
 */
const reconcilePrivacyInstallationAttempt = async (): Promise<void> => {
  const { mmkvInstance } =
    require('../../stores/mmkvStorage') as typeof import('../../stores/mmkvStorage');

  const getInstallationMarker = () => mmkvInstance.getString(PRIVACY_INSTALLATION_MARKER_KEY);
  const getMmkvAuthState = () => mmkvInstance.getString(LEGACY_AUTH_STORAGE_KEY);
  const evidence = await resolvePrivacyInstallationEvidence({
    getInstallationMarker,
    getMmkvAuthState,
    // This callback is invoked only when both MMKV keys are absent. Keep the
    // native module import inside it so retained MMKV installs never load it.
    getAsyncStorageAuthState: async () => {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      return AsyncStorage.getItem(LEGACY_AUTH_STORAGE_KEY);
    },
  });

  await reconcilePrivacyInstallation({
    // Use live reads after evidence capture so a marker/auth key written by a
    // newer attempt wins before reset or marker seeding can happen.
    getInstallationMarker,
    getLegacyAuthState: () => getMmkvAuthState() ?? evidence.legacyAuthState,
    resetPrivacy: async () => {
      await resetPrivacyIfInstallationIsFresh({
        getInstallationMarker,
        getLegacyAuthState: getMmkvAuthState,
        loadResetPrivacy: async () => {
          const { clearPrivacySettings } = await import('./privacyService');
          return clearPrivacySettings;
        },
      });
    },
    seedInstallationMarker: () => {
      if (getInstallationMarker() === undefined) {
        mmkvInstance.set(PRIVACY_INSTALLATION_MARKER_KEY, '1');
      }
    },
  });
};

// SecureStore deletion/icon changes are side effects. A timed-out privacy
// initializer may retry while its original promise is still pending, so all
// callers must join one active attempt instead of starting a second reset.
export const reconcilePrivacyInstallationOnStartup = createSingleFlightAsyncTask(
  reconcilePrivacyInstallationAttempt
);

export const initializePrivacyInstallationOnStartup = createPrivacyInstallationBootstrap({
  migrateStorage: async () => {
    const { migrateFromAsyncStorage } = await import('../../stores/migrateFromAsyncStorage');
    await migrateFromAsyncStorage();
  },
  reconcileInstallation: reconcilePrivacyInstallationOnStartup,
});
