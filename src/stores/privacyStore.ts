import { create } from 'zustand';
import type { PrivacyAppIconMode } from '../types';
import {
  clearPrivacySettings,
  loadPrivacySettings,
  updatePrivacyMode,
  validatePrivacyPin,
  verifyPrivacyPin,
} from '../services/privacy';

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
  mode: PrivacyAppIconMode;
  hasPin: boolean;
  isLocked: boolean;
  initialize: () => Promise<void>;
  saveConfiguration: (input: SavePrivacyConfigurationInput) => Promise<SavePrivacyConfigurationResult>;
  lock: () => void;
  unlock: (pinInput: string) => Promise<boolean>;
  disablePrivacy: () => Promise<void>;
}

export const usePrivacyStore = create<PrivacyState>()((set, get) => ({
  isInitialized: false,
  isLoading: false,
  mode: 'standard',
  hasPin: false,
  isLocked: false,

  initialize: async () => {
    if (get().isInitialized || get().isLoading) {
      return;
    }

    set({ isLoading: true });

    try {
      const storedSettings = await loadPrivacySettings();
      const hasPin = Boolean(storedSettings.pin);
      const shouldStartLocked = storedSettings.mode === 'discreet' && hasPin;

      set({
        isInitialized: true,
        isLoading: false,
        mode: storedSettings.mode,
        hasPin,
        isLocked: shouldStartLocked,
      });
    } catch (error) {
      console.error('Failed to initialize privacy mode:', error);
      set({
        isInitialized: true,
        isLoading: false,
        mode: 'standard',
        hasPin: false,
        isLocked: false,
      });
    }
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
        mode: 'discreet',
        hasPin: true,
        isLocked: false,
      });

      return {
        success: true,
        errorKey: null,
      };
    }

    await updatePrivacyMode('standard', null);
    set({
      mode: 'standard',
      hasPin: false,
      isLocked: false,
    });

    return {
      success: true,
      errorKey: null,
    };
  },

  lock: () =>
    set((state) => ({
      isLocked: state.mode === 'discreet' && state.hasPin,
    })),

  unlock: async (pinInput) => {
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
      mode: 'standard',
      hasPin: false,
      isLocked: false,
    });
  },
}));
