import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { en } from './locales/en';
import { localeLoaders } from './localeLoaders';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type LanguageCode } from '../constants/languages';

type DeferredLanguageCode = Exclude<LanguageCode, 'en'>;

const resources = {
  en: {
    translation: en,
  },
};

const supportedLanguages = SUPPORTED_LANGUAGES.map((language) => language.code);
const languageResourceLoads = new Map<LanguageCode, Promise<void>>();

// Get initial language from device locale
const getInitialLanguage = (): LanguageCode => {
  const deviceLocale = Localization.getLocales()[0]?.languageCode;
  if (deviceLocale && supportedLanguages.includes(deviceLocale as LanguageCode)) {
    return deviceLocale as LanguageCode;
  }
  return DEFAULT_LANGUAGE;
};

const initialLanguage = getInitialLanguage();

async function ensureLanguageResources(lang: LanguageCode): Promise<void> {
  if (i18n.hasResourceBundle(lang, 'translation')) {
    return;
  }

  const existingLoad = languageResourceLoads.get(lang);
  if (existingLoad) {
    return existingLoad;
  }

  const load = (async () => {
    if (lang === DEFAULT_LANGUAGE) {
      i18n.addResourceBundle(DEFAULT_LANGUAGE, 'translation', en, true, true);
      return;
    }

    const translation = await localeLoaders[lang as DeferredLanguageCode]();
    i18n.addResourceBundle(lang, 'translation', translation, true, true);
  })().finally(() => {
    languageResourceLoads.delete(lang);
  });

  languageResourceLoads.set(lang, load);
  return load;
}

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    escapeValue: false, // React already escapes values
  },
  react: {
    useSuspense: false,
  },
});

if (initialLanguage !== DEFAULT_LANGUAGE) {
  void ensureLanguageResources(initialLanguage).then(() => i18n.changeLanguage(initialLanguage));
}

export const changeLanguage = async (lang: LanguageCode) => {
  await ensureLanguageResources(lang);
  return i18n.changeLanguage(lang);
};

export const getCurrentLanguage = (): LanguageCode => {
  const currentLanguage = i18n.language as LanguageCode;
  return supportedLanguages.includes(currentLanguage) ? currentLanguage : DEFAULT_LANGUAGE;
};

export default i18n;
