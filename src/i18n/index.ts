import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import * as locales from './locales';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type LanguageCode } from '../constants/languages';

const resources = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((language) => [
    language.code,
    {
      translation: locales[language.code],
    },
  ])
) as Record<LanguageCode, { translation: (typeof locales)[LanguageCode] }>;

const supportedLanguages = SUPPORTED_LANGUAGES.map((language) => language.code);

// Get initial language from device locale
const getInitialLanguage = (): LanguageCode => {
  const deviceLocale = Localization.getLocales()[0]?.languageCode;
  if (deviceLocale && supportedLanguages.includes(deviceLocale as LanguageCode)) {
    return deviceLocale as LanguageCode;
  }
  return DEFAULT_LANGUAGE;
};

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    escapeValue: false, // React already escapes values
  },
  react: {
    useSuspense: false,
  },
});

export const changeLanguage = (lang: LanguageCode) => i18n.changeLanguage(lang);

export const getCurrentLanguage = (): LanguageCode => {
  const currentLanguage = i18n.language as LanguageCode;
  return supportedLanguages.includes(currentLanguage) ? currentLanguage : DEFAULT_LANGUAGE;
};

export default i18n;
