import { create } from 'zustand';
import type { PrivacyAppIconMode } from '../types';
import {
  applyPrivacyAppIcon,
  clearPrivacySettings,
  loadPrivacySettings,
  updatePrivacyMode,
  validatePrivacyPin,
  verifyPrivacyPin,
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
  initialize: () => Promise<void>;
  retryInitialize: () => Promise<void>;
  saveConfiguration: (
    input: SavePrivacyConfigurationInput
  ) => Promise<SavePrivacyConfigurationResult>;
  lock: () => void;
  unlock: (pinInput: string) => Promise<boolean>;
  disablePrivacy: () => Promise<void>;
}

let initializationGeneration = 0;

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
      const hasPin = Boolean(result.settings.pin);
      const shouldStartLocked = result.settings.mode === 'discreet' && hasPin;

      set({
        isInitialized: true,
        isLoading: false,
        initializationError: null,
        mode: result.settings.mode,
        hasPin,
        isLocked: shouldStartLocked,
      });
      return;
    }

    if (result.status === 'unavailable') {
      console.error('Failed to initialize privacy mode:', result.error);
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

  return {
    isInitialized: false,
    isLoading: false,
    initializationError: null,
    mode: 'standard',
    hasPin: false,
    isLocked: true,

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

        await updatePrivacyMode('discreet', validation.normalized);
        set({
          isInitialized: true,
          initializationError: null,
          mode: 'discreet',
          hasPin: true,
          isLocked: false,
        });

        // Defer icon change until after navigation and re-renders complete to
        // prevent the concurrent Zustand + AppState cascade that OOMs Hermes GC.
        setTimeout(() => {
          void applyPrivacyAppIcon('discreet');
        }, 400);

        return {
          success: true,
          errorKey: null,
        };
      }

      await updatePrivacyMode('standard', null);
      set({
        isInitialized: true,
        initializationError: null,
        mode: 'standard',
        hasPin: false,
        isLocked: false,
      });

      // Defer icon change until after navigation and re-renders complete.
      setTimeout(() => {
        void applyPrivacyAppIcon('standard');
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

    unlock: async (pinInput) => {
      if (!get().isInitialized) {
        return false;
      }

      const validation = validatePrivacyPin(pinInput);

      if (!validation.isValid) {
        return false;
      }

      const matches = await verifyPrivacyPin(validation.normalized);

      if (matches) {
        set({ isLocked: false });
      }

      return matches;
    },

    disablePrivacy: async () => {
      await clearPrivacySettings();
      set({
        isInitialized: true,
        initializationError: null,
        mode: 'standard',
        hasPin: false,
        isLocked: false,
      });
    },
  };
});
