import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { changeLanguage, getCurrentLanguage } from '../i18n';
import { LANGUAGES, type LanguageCode } from '../constants/languages';
import { syncPreferences } from '../services/sync';

export function useI18n() {
  const { t, i18n } = useTranslation();
  const preferences = useAuthStore((state) => state.preferences);
  const setPreferences = useAuthStore((state) => state.setPreferences);

  // Sync i18n language with preferences on mount and when preferences change
  useEffect(() => {
    const currentLang = getCurrentLanguage();
    if (preferences.language && preferences.language !== currentLang) {
      void changeLanguage(preferences.language);
    }
  }, [preferences.language]);

  const setLanguage = useCallback(
    async (language: LanguageCode) => {
      await changeLanguage(language);
      setPreferences({ language });
      syncPreferences().catch(() => {});
    },
    [setPreferences]
  );

  const currentLanguage = preferences.language || 'en';
  const languageInfo = LANGUAGES[currentLanguage];

  return {
    t,
    i18n,
    currentLanguage,
    languageInfo,
    setLanguage,
    availableLanguages: LANGUAGES,
  };
}
