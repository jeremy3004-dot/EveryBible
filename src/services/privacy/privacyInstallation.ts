export const PRIVACY_INSTALLATION_MARKER_KEY = 'everybible.privacy.installation.v1';
export const LEGACY_AUTH_STORAGE_KEY = 'auth-storage';

export type PrivacyInstallationReconciliationResult =
  | { status: 'preserved'; reason: 'marker' | 'legacy' }
  | { status: 'reset' };

export interface PrivacyInstallationReconciliationDependencies {
  getInstallationMarker: () => string | undefined;
  getLegacyAuthState: () => string | undefined;
  resetPrivacy: () => Promise<void>;
  seedInstallationMarker: () => void;
}

export interface PrivacyInstallationEvidenceDependencies {
  getInstallationMarker: () => string | undefined;
  getMmkvAuthState: () => string | undefined;
  getAsyncStorageAuthState: () => Promise<string | null>;
}

export interface PrivacyInstallationEvidence {
  installationMarker: string | undefined;
  legacyAuthState: string | undefined;
}

export interface FreshInstallationResetDependencies {
  getInstallationMarker: () => string | undefined;
  getLegacyAuthState: () => string | undefined;
  loadResetPrivacy: () => Promise<() => Promise<void>>;
}

/**
 * Reads the legacy auth marker without paying the AsyncStorage cost when the
 * MMKV container already has the persisted store. The value is an existence
 * signal, so an empty string is still considered present; only null/undefined
 * means the legacy key is absent.
 */
export async function resolveLegacyAuthState(
  getMmkvAuthState: () => string | undefined,
  getAsyncStorageAuthState: () => Promise<string | null>
): Promise<string | undefined> {
  const mmkvAuthState = getMmkvAuthState();
  if (mmkvAuthState !== undefined) {
    return mmkvAuthState;
  }

  return (await getAsyncStorageAuthState()) ?? undefined;
}

/**
 * Captures legacy evidence while re-reading the app-container keys after any
 * awaited AsyncStorage read. A later marker or migrated MMKV auth key therefore
 * wins over the stale pre-await snapshot.
 */
export async function resolvePrivacyInstallationEvidence(
  dependencies: PrivacyInstallationEvidenceDependencies
): Promise<PrivacyInstallationEvidence> {
  const initialMarker = dependencies.getInstallationMarker();
  const initialMmkvAuthState = dependencies.getMmkvAuthState();
  let asyncStorageAuthState: string | undefined;

  if (initialMarker === undefined && initialMmkvAuthState === undefined) {
    asyncStorageAuthState = await resolveLegacyAuthState(
      dependencies.getMmkvAuthState,
      dependencies.getAsyncStorageAuthState
    );
  }

  const currentMmkvAuthState = dependencies.getMmkvAuthState();
  return {
    installationMarker: dependencies.getInstallationMarker(),
    legacyAuthState: currentMmkvAuthState ?? asyncStorageAuthState,
  };
}

/**
 * Loads and runs the destructive reset only while the app container still
 * looks fresh. The second read closes the await boundary around the native
 * module load, where migration or another startup attempt may write evidence.
 */
export async function resetPrivacyIfInstallationIsFresh(
  dependencies: FreshInstallationResetDependencies
): Promise<boolean> {
  const isFresh = () =>
    dependencies.getInstallationMarker() === undefined &&
    dependencies.getLegacyAuthState() === undefined;

  if (!isFresh()) {
    return false;
  }

  const resetPrivacy = await dependencies.loadResetPrivacy();
  if (!isFresh()) {
    return false;
  }

  await resetPrivacy();
  return true;
}

/**
 * Serializes side-effecting startup work. Calls made while an attempt is
 * pending join it; a settled failure clears the slot so a later retry starts a
 * fresh attempt.
 */
export function createSingleFlightAsyncTask<T>(task: () => Promise<T>): () => Promise<T> {
  let active: Promise<T> | null = null;

  return () => {
    if (active) {
      return active;
    }

    let attempt: Promise<T>;
    try {
      attempt = Promise.resolve(task());
    } catch (error) {
      attempt = Promise.reject(error);
    }
    let serialized: Promise<T>;
    serialized = attempt.finally(() => {
      if (active === serialized) {
        active = null;
      }
    });
    active = serialized;
    return serialized;
  };
}

/**
 * Classifies the app container before privacy settings are hydrated.
 *
 * The marker is deliberately only an existence marker. A missing marker on an
 * existing app is recognized by the persisted auth state left by the previous
 * release; a genuinely empty app container is treated as a reinstall and its
 * SecureStore privacy state is cleared before the marker is written.
 */
export async function reconcilePrivacyInstallation(
  dependencies: PrivacyInstallationReconciliationDependencies
): Promise<PrivacyInstallationReconciliationResult> {
  if (dependencies.getInstallationMarker() !== undefined) {
    return { status: 'preserved', reason: 'marker' };
  }

  if (dependencies.getLegacyAuthState() !== undefined) {
    dependencies.seedInstallationMarker();
    return { status: 'preserved', reason: 'legacy' };
  }

  // Do not move this marker write before resetPrivacy. If the reset fails, the
  // missing marker intentionally makes the next launch retry in a locked state.
  await dependencies.resetPrivacy();
  dependencies.seedInstallationMarker();
  return { status: 'reset' };
}
