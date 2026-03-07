import * as SecureStore from 'expo-secure-store';
import type { PrivacyAppIconMode, StoredPrivacySettings } from '../../types';
import { setPrivacyAppIcon } from './appIcon';

const privacySettingsKey = 'everybible.privacy.settings';

const defaultPrivacySettings: StoredPrivacySettings = {
  mode: 'standard',
  pin: null,
};

const isPrivacyAppIconMode = (value: unknown): value is PrivacyAppIconMode => {
  return value === 'standard' || value === 'discreet';
};

const sanitizeStoredPrivacySettings = (rawValue: string | null): StoredPrivacySettings => {
  if (!rawValue) {
    return defaultPrivacySettings;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<StoredPrivacySettings>;

    return {
      mode: isPrivacyAppIconMode(parsed.mode) ? parsed.mode : 'standard',
      pin: typeof parsed.pin === 'string' ? parsed.pin : null,
    };
  } catch (error) {
    console.error('Failed to parse privacy settings:', error);
    return defaultPrivacySettings;
  }
};

export const loadPrivacySettings = async (): Promise<StoredPrivacySettings> => {
  const storedValue = await SecureStore.getItemAsync(privacySettingsKey);
  return sanitizeStoredPrivacySettings(storedValue);
};

export const savePrivacySettings = async (settings: StoredPrivacySettings): Promise<void> => {
  await SecureStore.setItemAsync(privacySettingsKey, JSON.stringify(settings));
  await setPrivacyAppIcon(settings.mode);
};

export const clearPrivacySettings = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(privacySettingsKey);
  await setPrivacyAppIcon('standard');
};

export const verifyPrivacyPin = async (pin: string): Promise<boolean> => {
  const storedSettings = await loadPrivacySettings();
  return storedSettings.pin === pin;
};

export const updatePrivacyMode = async (
  mode: PrivacyAppIconMode,
  pin: string | null
): Promise<StoredPrivacySettings> => {
  const nextSettings: StoredPrivacySettings = {
    mode,
    pin: mode === 'discreet' ? pin : null,
  };

  await savePrivacySettings(nextSettings);
  return nextSettings;
};
