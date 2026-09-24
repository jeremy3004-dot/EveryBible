import { create } from 'zustand';
import type { PrivacyAppIconMode } from '../types';
import {
  applyPrivacyAppIcon,
  clearPrivacySettings,
  getCurrentPrivacyAppIcon,
  hasPrivacyPin,
  isKeychainError,
  loadPrivacySettings,
  readPrivacyLockHint,
  updatePrivacyMode,
  validatePrivacyPin,
  verifyPrivacyPinCandidates,
  writePrivacyLockHint,
} from '../services/privacy';
import { initializePrivacyWithTimeout } from '../services/privacy/privacyInitialization';
import { initializePrivacyInstallationOnStartup } from '../services/privacy/privacyInstallationAdapter';

interface SavePrivacyConfigurationInput {
  mode: PrivacyAppIconMode;
  pinInput?: string;
}

interface SavePrivacyConfigurationResult {
  success: boolean;
  errorKey: string | null;
}

interface PrivacyState {
  isInitialized: boolean;
  isLoading: boolean;
  initializationError: 'timeout' | 'unavailable' | null;
  mode: PrivacyAppIconMode;
  hasPin: boolean;
  isLocked: boolean;
  /** Epoch ms until which unlock attempts are refused after repeated failures. */
  pinLockedUntil: number | null;
  /**
   * Startup could not read the keychain and went on from the lock hint (or the decoy
   * icon) instead; mode and hasPin are assumed until an unlock reads the real record.
   */
  keychainUnreadable: boolean;
  initialize: () => Promise<void>;
  retryInitialize: () => Promise<void>;
  saveConfiguration: (
    input: SavePrivacyConfigurationInput
  ) => Promise<SavePrivacyConfigurationResult>;
  lock: () => void;
  unlock: (pinInput: string | string[]) => Promise<boolean>;
  disablePrivacy: () => Promise<void>;
  /**
   * Retries an icon change that did not take: when the icon on the home screen differs
   * from the saved mode, it is changed again. Called when the app returns to the
   * foreground and once privacy settings have loaded.
   */
  reconcileAppIcon: () => Promise<void>;
}

let initializationGeneration = 0;
let unlockQueue: Promise<unknown> = Promise.resolve();

// The crash queue opens MMKV and the reporting policy, which nothing else here needs, so
// it is loaded only when there is a failure to report.
const reportPrivacyFailure = (source: string, error: unknown): void => {
  void import('../services/diagnostics/crashReportQueue')
    .then(({ reportHandledError }) => reportHandledError(source, error))
    .catch(() => undefined);
};

const ICON_READ_TIMEOUT_MS = 1_000;

const reportIconChangeFailure = (error: unknown): void =>
  reportPrivacyFailure('privacy.iconChange', error);

const reportUnreadablePrivacySettings = (error: unknown): void =>
  reportPrivacyFailure(
    isKeychainError(error) ? 'privacy.keychain' : 'privacy.initialization',
    error
  );

/**
 * Whether discreet mode locks, when the keychain holding its record cannot be read.
 * Fails closed: the lock hint or the decoy icon on the home screen saying discreet keeps
 * the app locked; only a hint saying standard opens it. Null when nothing says either,
 * which leaves the retry screen.
 */
const resolveLockWithoutKeychain = async (): Promise<PrivacyAppIconMode | null> => {
  const hint = readPrivacyLockHint();
  if (hint === 'discreet') {
    return 'discreet';
  }
  // Bounded: startup waits on this, and a native call that never answers counts as unknown.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const icon = await Promise.race([
    getCurrentPrivacyAppIcon(),
    new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => resolve(null), ICON_READ_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timeoutId));
  return icon === 'discreet' ? 'discreet' : hint;
};

const lockHintFor = (locks: boolean) => (locks ? 'discreet' : 'standard');

// An icon change that fails is reported and left for reconcileAppIcon to retry; it never
// undoes the saved mode, which is what the lock screen follows.
const syncAppIcon = async (mode: PrivacyAppIconMode): Promise<void> => {
  try {
    await applyPrivacyAppIcon(mode);
  } catch (error) {
    reportIconChangeFailure(error);
  }
};

export const usePrivacyStore = create<PrivacyState>()((set, get) => {
  const initialize = async (): Promise<void> => {
    if (get().isInitialized || get().isLoading) {
      return;
    }

    const generation = ++initializationGeneration;
    const previousInitializationError = get().initializationError;
    set({
      isLoading: true,
      initializationError: previousInitializationError,
      isLocked: true,
    });

    const result = await initializePrivacyWithTimeout(async () => {
      await initializePrivacyInstallationOnStartup();
      return loadPrivacySettings();
    });
    if (generation !== initializationGeneration) {
      return;
    }

    if (result.status === 'ready') {
      const hasPin = hasPrivacyPin(result.settings);
      const shouldStartLocked = result.settings.mode === 'discreet' && hasPin;
      writePrivacyLockHint(lockHintFor(shouldStartLocked));

      set({
        isInitialized: true,
        isLoading: false,
        initializationError: null,
        mode: result.settings.mode,
        hasPin,
        isLocked: shouldStartLocked,
        pinLockedUntil: result.settings.pinLockedUntil,
        keychainUnreadable: false,
      });
      return;
    }

    if (result.status === 'unavailable') {
      console.error('Failed to initialize privacy mode:', result.error);
      reportUnreadablePrivacySettings(result.error);
      const assumedMode = await resolveLockWithoutKeychain();
      if (generation !== initializationGeneration) {
        return;
      }
      if (assumedMode) {
        const locks = assumedMode === 'discreet';
        set({
          isInitialized: true,
          isLoading: false,
          initializationError: null,
          mode: assumedMode,
          hasPin: locks,
          isLocked: locks,
          pinLockedUntil: null,
          keychainUnreadable: true,
        });
        return;
      }
    } else {
      console.warn('Privacy mode initialization timed out; waiting for retry.');
    }

    set({
      isInitialized: false,
      isLoading: false,
      initializationError: result.status,
      isLocked: true,
    });
  };

  const attemptUnlock = async (pinInput: string | string[]): Promise<boolean> => {
    if (!get().isInitialized) {
      return false;
    }

    if (get().keychainUnreadable) {
      // Locked on an assumption; read the real record before judging the code.
      let settings: Awaited<ReturnType<typeof loadPrivacySettings>>;
      try {
        settings = await loadPrivacySettings();
      } catch (error) {
        reportUnreadablePrivacySettings(error);
        return false;
      }
      const hasPin = hasPrivacyPin(settings);
      const locks = settings.mode === 'discreet' && hasPin;
      writePrivacyLockHint(lockHintFor(locks));
      set({
        keychainUnreadable: false,
        mode: settings.mode,
        hasPin,
        pinLockedUntil: settings.pinLockedUntil,
      });
      if (!locks) {
        // Privacy is off after all: there is nothing to unlock with.
        set({ isLocked: false });
        return true;
      }
    }

    const lockedUntil = get().pinLockedUntil;
    if (lockedUntil !== null && Date.now() < lockedUntil) {
      return false;
    }

    const rawCandidates = Array.isArray(pinInput) ? pinInput : [pinInput];
    const candidates = rawCandidates
      .map((candidate) => validatePrivacyPin(candidate))
      .filter((validation) => validation.isValid)
      .map((validation) => validation.normalized);

    if (candidates.length === 0) {
      return false;
    }

    // A whole batch of candidates derived from one key sequence counts as a
    // single attempt, so the backoff tracks real guesses rather than taps.
    let result: Awaited<ReturnType<typeof verifyPrivacyPinCandidates>>;
    try {
      result = await verifyPrivacyPinCandidates(candidates);
    } catch (error) {
      // The lock screen cannot show a failure without hinting a code exists; stay locked.
      reportUnreadablePrivacySettings(error);
      return false;
    }

    set({ pinLockedUntil: result.lockedUntil });

    if (result.success) {
      set({ isLocked: false });
    }

    return result.success;
  };

  return {
    isInitialized: false,
    isLoading: false,
    initializationError: null,
    mode: 'standard',
    hasPin: false,
    isLocked: true,
    pinLockedUntil: null,
    keychainUnreadable: false,

    initialize,

    retryInitialize: async () => {
      if (get().isLoading) {
        return;
      }
      // Invalidate the previous attempt so a late SecureStore resolution cannot
      // unlock the app after the user has requested a retry.
      initializationGeneration += 1;
      set({
        isInitialized: false,
        isLoading: false,
        isLocked: true,
      });
      await initialize();
    },

    saveConfiguration: async ({ mode, pinInput }) => {
      if (mode === 'discreet') {
        const validation = validatePrivacyPin(pinInput ?? '');

        if (!validation.isValid) {
          return {
            success: false,
            errorKey: validation.errorKey,
          };
        }

        // Hint first: if the keychain write lands and anything after it fails, a later
        // launch that cannot read the keychain still keeps the app locked.
        writePrivacyLockHint('discreet');
        await updatePrivacyMode('discreet', validation.normalized);
        set({
          isInitialized: true,
          initializationError: null,
          mode: 'discreet',
          hasPin: true,
          isLocked: false,
          pinLockedUntil: null,
          keychainUnreadable: false,
        });

        // Defer icon change until after navigation and re-renders complete to
        // prevent the concurrent Zustand + AppState cascade that OOMs Hermes GC.
        setTimeout(() => {
          void syncAppIcon('discreet');
        }, 400);

        return {
          success: true,
          errorKey: null,
        };
      }

      await updatePrivacyMode('standard', null);
      writePrivacyLockHint('standard');
      set({
        isInitialized: true,
        initializationError: null,
        mode: 'standard',
        hasPin: false,
        isLocked: false,
        keychainUnreadable: false,
      });

      // Defer icon change until after navigation and re-renders complete.
      setTimeout(() => {
        void syncAppIcon('standard');
      }, 400);

      return {
        success: true,
        errorKey: null,
      };
    },

    lock: () =>
      set((state) => ({
        isLocked: !state.isInitialized || (state.mode === 'discreet' && state.hasPin),
      })),

    // One attempt at a time: each reads the failure count from the keychain and writes it
    // back, so attempts that overlapped (rapid '=' presses, an automated tapper) all read
    // the same count and the backoff only ever saw one of them.
    unlock: (pinInput) => {
      const attempt = unlockQueue.then(() => attemptUnlock(pinInput));
      unlockQueue = attempt.catch(() => undefined);
      return attempt;
    },

    reconcileAppIcon: async () => {
      if (!get().isInitialized) {
        return;
      }
      await syncAppIcon(get().mode);
    },

    disablePrivacy: async () => {
      await clearPrivacySettings();
      writePrivacyLockHint('standard');
      set({
        isInitialized: true,
        initializationError: null,
        mode: 'standard',
        hasPin: false,
        isLocked: false,
        pinLockedUntil: null,
        keychainUnreadable: false,
      });
    },
  };
});

/**
 * Whether app-generated notifications must stay neutral (no app name, Bible or group
 * text). Settings that have not loaded yet count as discreet: a discreet device must not
 * leak during launch, and a standard one only sees neutral text for that moment.
 */
export function isDiscreetModeActive(
  state: Pick<PrivacyState, 'isInitialized' | 'mode'> = usePrivacyStore.getState()
): boolean {
  return !state.isInitialized || state.mode === 'discreet';
}
