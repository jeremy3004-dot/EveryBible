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

const iconChangeListeners = new Set<() => void>();

/**
 * Called after every icon change the system accepted. On Android the change switches the
 * launcher alias and so the activity window, which the screen capture protection must
 * cover again.
 */
export const onPrivacyAppIconChanged = (listener: () => void): (() => void) => {
  iconChangeListeners.add(listener);
  return () => {
    iconChangeListeners.delete(listener);
  };
};

const notifyIconChanged = (): void => {
  iconChangeListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('App icon change listener failed:', error);
    }
  });
};

export const setPrivacyAppIcon = async (mode: PrivacyAppIconMode): Promise<boolean> => {
  if (!nativePrivacyModule?.setAppIcon) {
    return false;
  }

  try {
    const changed = await nativePrivacyModule.setAppIcon(mode);
    if (changed) {
      notifyIconChanged();
    }
    return changed;
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
