export interface LocaleSummaryInput {
  countryCode: string | null;
  countryName: string | null;
  contentLanguageNativeName: string | null;
  currentLanguage: string;
  resolveCountryDisplayName: (countryCode: string, languageCode: string) => string;
  fallbackLabel: string;
}

/**
 * Resolves the human-readable locale summary shown in the Settings
 * "Nation & Language" row. This mirrors the inline `localeSummary` IIFE in
 * SettingsScreen but is expressed as a pure, testable function.
 */
export function resolveLocaleSummary({
  countryCode,
  countryName,
  contentLanguageNativeName,
  currentLanguage,
  resolveCountryDisplayName,
  fallbackLabel,
}: LocaleSummaryInput): string {
  const localizedCountryName = countryCode
    ? resolveCountryDisplayName(countryCode, currentLanguage)
    : countryName;

  if (localizedCountryName && contentLanguageNativeName) {
    return `${localizedCountryName} • ${contentLanguageNativeName}`;
  }

  return localizedCountryName || contentLanguageNativeName || fallbackLabel;
}
