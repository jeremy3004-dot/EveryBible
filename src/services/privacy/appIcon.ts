import { NativeModules } from 'react-native';
import type { PrivacyAppIconMode } from '../../types';

interface EveryBiblePrivacyModule {
  getCurrentAppIcon: () => Promise<PrivacyAppIconMode>;
  setAppIcon: (mode: PrivacyAppIconMode) => Promise<boolean>;
}

const nativePrivacyModule = NativeModules.EveryBiblePrivacyModule as
  | EveryBiblePrivacyModule
  | undefined;

export const supportsDynamicAppIcon = (): boolean => {
  return Boolean(nativePrivacyModule?.setAppIcon);
};

export const setPrivacyAppIcon = async (mode: PrivacyAppIconMode): Promise<boolean> => {
  if (!nativePrivacyModule?.setAppIcon) {
    return false;
  }

  try {
    return await nativePrivacyModule.setAppIcon(mode);
  } catch (error) {
    console.error('Failed to update app icon:', error);
    return false;
  }
};

export const getCurrentPrivacyAppIcon = async (): Promise<PrivacyAppIconMode | null> => {
  if (!nativePrivacyModule?.getCurrentAppIcon) {
    return null;
  }

  try {
    return await nativePrivacyModule.getCurrentAppIcon();
  } catch (error) {
    console.error('Failed to read app icon state:', error);
    return null;
  }
};
