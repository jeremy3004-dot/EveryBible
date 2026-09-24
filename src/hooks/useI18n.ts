import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { changeLanguage, getCurrentLanguage } from '../i18n';
import { LANGUAGES, type LanguageCode } from '../constants/languages';
import { syncPreferences } from '../services/sync';

export function useI18n() {
  const { t, i18n } = useTranslation();
  // Only the language: almost every screen calls this hook, so subscribing to the
  // whole preferences object re-rendered all of them on any preference write.
  const language = useAuthStore((state) => state.preferences.language);
  const setPreferences = useAuthStore((state) => state.setPreferences);

  // Sync i18n language with the stored preference on mount and when it changes
  useEffect(() => {
    const currentLang = getCurrentLanguage();
    if (language && language !== currentLang) {
      void changeLanguage(language);
    }
  }, [language]);

  const setLanguage = useCallback(
    async (language: LanguageCode) => {
      await changeLanguage(language);
      setPreferences({ language });
      syncPreferences().catch(() => {});
    },
    [setPreferences]
  );

  const currentLanguage = language || 'en';
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
