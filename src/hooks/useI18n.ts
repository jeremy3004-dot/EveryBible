import { useCallback, useEffect, useRef } from 'react';
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
  const mountedRef = useRef(false);
  const languageRequestRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      languageRequestRef.current += 1;
    };
  }, []);

  // Sync i18n language with the stored preference on mount and when it changes
  useEffect(() => {
    const currentLang = getCurrentLanguage();
    if (language && language !== currentLang) {
      // The saved preference belongs to the store, not this screen. Another
      // account or a surviving screen can still need the same pending locale.
      void changeLanguage(
        language,
        () => useAuthStore.getState().preferences.language === language
      ).catch(() => {});
    }
  }, [language]);

  const setLanguage = useCallback(
    async (language: LanguageCode) => {
      const request = ++languageRequestRef.current;
      const owner = useAuthStore.getState();
      const userId = owner.user?.uid;
      const generation = owner.authGeneration;
      const isCurrent = () => {
        const auth = useAuthStore.getState();
        return (
          mountedRef.current &&
          request === languageRequestRef.current &&
          auth.user?.uid === userId &&
          auth.authGeneration === generation
        );
      };
      const applied = await changeLanguage(language, isCurrent);
      if (applied === false || !isCurrent()) return;
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
