import type { LanguageCode } from '../constants/languages';
import type { UserPreferences } from '../types';

/**
 * The stored interface language App.tsx should switch to, or null to leave i18n alone.
 *
 * Until onboarding is finished the stored language is only the app default: a fresh install
 * persists it as soon as auth initialises, and sign-out resets every preference back to it.
 * The interface meanwhile booted in the device language (see resolveDeviceInterfaceLanguage),
 * and onboarding owns the language from there — it switches on an explicit pick and stores
 * the result when it completes.
 */
export function getStoredInterfaceLanguageToApply(
  preferences: Pick<UserPreferences, 'language' | 'onboardingCompleted'>
): LanguageCode | null {
  if (!preferences.onboardingCompleted || !preferences.language) {
    return null;
  }

  return preferences.language;
}
