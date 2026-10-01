import { EVERYBIBLE_SITE_URL } from './site-links';

/**
 * Which homepages exist and how search engines and link unfurlers name them.
 * Kept free of the translated copy so the root layout and the sitemap don't
 * bundle all 20 translations just to list them.
 */
export const HOME_LOCALE_CODES = [
  'zh',
  'hi',
  'es',
  'ar',
  'fr',
  'bn',
  'pt',
  'ru',
  'ur',
  'id',
  'de',
  'ja',
  'pa',
  'mr',
  'te',
  'tr',
  'ta',
  'vi',
  'ko',
  'ne',
] as const;

export type HomeLocaleCode = (typeof HOME_LOCALE_CODES)[number];
export type HomeLocaleCodeOrEn = HomeLocaleCode | 'en';

export function isHomeLocaleCode(code: string): code is HomeLocaleCode {
  return (HOME_LOCALE_CODES as readonly string[]).includes(code);
}

/**
 * Translated homepages that are live. A language joins this list once a
 * native speaker has checked its translation; until then its page is a 404
 * and it is left out of the switcher, hreflang and the sitemap.
 */
export const PUBLISHED_HOME_LOCALE_CODES: readonly HomeLocaleCode[] = [];

export function isPublishedHomeLocale(code: string): code is HomeLocaleCode {
  return (PUBLISHED_HOME_LOCALE_CODES as readonly string[]).includes(code);
}

/* Native names are copied from src/constants/languages.ts: importing that file
   would pull the React Native app's types into the site build. Order follows
   the app's interface-language list, with English first. */
export const HOME_LOCALE_NATIVE_NAMES: Record<HomeLocaleCodeOrEn, string> = {
  en: 'English',
  zh: '简体中文',
  hi: 'हिन्दी',
  es: 'Español',
  ar: 'العربية',
  fr: 'Français',
  bn: 'বাংলা',
  pt: 'Português',
  ru: 'Русский',
  ur: 'اردو',
  id: 'Bahasa Indonesia',
  de: 'Deutsch',
  ja: '日本語',
  pa: 'ਪੰਜਾਬੀ',
  mr: 'मराठी',
  te: 'తెలుగు',
  tr: 'Türkçe',
  ta: 'தமிழ்',
  vi: 'Tiếng Việt',
  ko: '한국어',
  ne: 'नेपाली',
};

/** The homepage path: `/` for English, `/<code>` otherwise. */
export function homePathFor(code: string): `/${string}` {
  return code === 'en' ? '/' : `/${code}`;
}

/** BCP 47 tag for hreflang; Simplified Chinese is the app's only script-qualified language. */
export function hreflangFor(code: HomeLocaleCodeOrEn): string {
  return code === 'zh' ? 'zh-Hans' : code;
}

const OPEN_GRAPH_LOCALES: Record<HomeLocaleCodeOrEn, string> = {
  en: 'en_US',
  zh: 'zh_CN',
  hi: 'hi_IN',
  es: 'es_ES',
  ar: 'ar_AR',
  fr: 'fr_FR',
  bn: 'bn_IN',
  pt: 'pt_BR',
  ru: 'ru_RU',
  ur: 'ur_PK',
  id: 'id_ID',
  de: 'de_DE',
  ja: 'ja_JP',
  pa: 'pa_IN',
  mr: 'mr_IN',
  te: 'te_IN',
  tr: 'tr_TR',
  ta: 'ta_IN',
  vi: 'vi_VN',
  ko: 'ko_KR',
  ne: 'ne_NP',
};

export function openGraphLocaleFor(code: HomeLocaleCodeOrEn): string {
  return OPEN_GRAPH_LOCALES[code];
}

const PUBLISHED_CODES: readonly HomeLocaleCodeOrEn[] = ['en', ...PUBLISHED_HOME_LOCALE_CODES];

/** hreflang to path for every published homepage plus `x-default` (English). */
export function homeAlternateLanguages(
  codes: readonly HomeLocaleCodeOrEn[] = PUBLISHED_CODES
): Record<string, string> {
  return {
    ...Object.fromEntries(codes.map((code) => [hreflangFor(code), homePathFor(code)])),
    'x-default': '/',
  };
}

/** The same, as absolute URLs, for the sitemap. */
export function homeAlternateUrls(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(homeAlternateLanguages()).map(([tag, path]) => [
      tag,
      new URL(path, EVERYBIBLE_SITE_URL).toString(),
    ])
  );
}
