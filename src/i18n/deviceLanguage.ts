import { LANGUAGES, type LanguageCode } from '../constants/languages';

/** The fields of an expo-localization `Locale` this module reads. */
export interface DeviceLocaleLike {
  languageCode?: string | null;
  languageTag?: string | null;
}

// Android reports languageCode from java.util.Locale#getLanguage(), which has always
// returned the withdrawn ISO 639 codes for these three languages. languageTag (from
// toLanguageTag()) uses the current ones, but it can be absent, so map both.
const LEGACY_LANGUAGE_CODES: Record<string, string> = {
  in: 'id',
  iw: 'he',
  ji: 'yi',
};

/**
 * The device language as a current, lower-case ISO 639 code, whether or not the app has an
 * interface in it. Plain string work only: this runs on the startup path.
 */
export function normalizeDeviceLanguageCode(
  locale: DeviceLocaleLike | null | undefined
): string | null {
  const rawCode = locale?.languageCode || locale?.languageTag?.split(/[-_]/)[0] || '';
  const code = rawCode.trim().toLowerCase();
  if (!code) {
    return null;
  }

  return LEGACY_LANGUAGE_CODES[code] ?? code;
}

/**
 * The first of the device's preferred languages that the app has an interface for, or null.
 * Regional and script variants (pt-BR, es-419, zh-Hant) resolve to their base language; the
 * app ships one locale per language.
 */
export function resolveDeviceInterfaceLanguage(
  locales: readonly DeviceLocaleLike[]
): LanguageCode | null {
  for (const locale of locales) {
    const code = normalizeDeviceLanguageCode(locale);
    if (code && Object.prototype.hasOwnProperty.call(LANGUAGES, code)) {
      return code as LanguageCode;
    }
  }

  return null;
}
