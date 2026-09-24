import { DEFAULT_LANGUAGE, type LanguageCode } from '../../constants/languages';

// Kept free of the locale catalog and search engine (localeSelection.ts): the
// More tab names the saved country on first open and must not pay for the 130 KB
// catalog, the Fuse index or the collation sorts to do it.

/** ICU locales asked for each interface language's country names. */
export const COUNTRY_DISPLAY_LOCALES: Record<LanguageCode, string[]> = {
  en: ['en'],
  zh: ['zh-Hans', 'zh'],
  hi: ['hi'],
  es: ['es'],
  ar: ['ar'],
  fr: ['fr'],
  bn: ['bn'],
  pt: ['pt'],
  ru: ['ru'],
  ur: ['ur'],
  id: ['id'],
  de: ['de'],
  ja: ['ja'],
  pa: ['pa-Guru', 'pa'],
  mr: ['mr'],
  te: ['te'],
  tr: ['tr'],
  ta: ['ta'],
  vi: ['vi'],
  ko: ['ko'],
  ne: ['ne'],
};

type OfflineCountryNames = { names: Partial<Record<string, Record<string, string>>> };

const REGION_CODE = /^[A-Z]{2}$/;

function nativeCountryName(code: string, locales: string[]): string | null {
  // Hermes on RN 0.81 ships Intl.Collator, DateTimeFormat and NumberFormat only
  // (checked against the hermes.framework symbols), so on device this is always
  // the offline table below; engines with full ICU answer here.
  if (typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') {
    return null;
  }
  try {
    const name = new Intl.DisplayNames([...locales, DEFAULT_LANGUAGE], { type: 'region' }).of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

/**
 * One country's name in an interface language (`US` in Arabic is
 * "الولايات المتحدة"), or null when the code is not a known country. Uses
 * Intl.DisplayNames when the engine has it, otherwise the generated CLDR table,
 * which is only required on the first call. Call it after first paint.
 */
export function getLocalizedCountryName(
  countryCode: string | null | undefined,
  languageCode: string | null | undefined
): string | null {
  const code = countryCode?.trim().toUpperCase() ?? '';
  if (!REGION_CODE.test(code)) {
    return null;
  }
  const base = (languageCode ?? '').split('-')[0].toLowerCase();
  const language = (base in COUNTRY_DISPLAY_LOCALES ? base : DEFAULT_LANGUAGE) as LanguageCode;

  const native = nativeCountryName(code, COUNTRY_DISPLAY_LOCALES[language]);
  if (native) {
    return native;
  }
  const offline = (require('../../data/countryDisplayNames.generated.json') as OfflineCountryNames)
    .names[language];
  return offline?.[code] ?? null;
}
