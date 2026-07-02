import { I18nManager } from 'react-native';

/**
 * Stopgap until the app has real RTL-aware layouts. Arabic and Urdu are
 * marked `direction: 'rtl'` in constants/languages.ts (used for that language's
 * own script/label rendering), but no screen has been built with mirrored
 * flex directions, flipped icons, etc. Letting native RTL layout kick in on
 * an RTL device locale would break UI rather than fix it, so layout direction
 * stays pinned to LTR regardless of device locale or in-app language choice.
 */
export function enforceLtrLayoutPolicy(): void {
  if (I18nManager.isRTL) {
    I18nManager.forceRTL(false);
  }
  I18nManager.allowRTL(false);
}
