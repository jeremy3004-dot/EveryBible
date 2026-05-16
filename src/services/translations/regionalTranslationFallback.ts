import type { BibleTranslation } from '../../types';
import { localeSearchEngine } from '../onboarding/localeSelection';

export const REGIONAL_FALLBACK_TRANSLATION_IDS = {
  IN: 'hincv',
  NP: 'npiulb',
} as const;

const KNOWN_INDIA_LANGUAGE_NAMES = new Set([
  'awadhi',
  'bengali',
  'bhojpuri',
  'gujarati',
  'hindi',
  'kannada',
  'malayalam',
  'marathi',
  'odia',
  'punjabi',
  'tamil',
  'telugu',
  'urdu',
]);

const KNOWN_NEPAL_LANGUAGE_NAMES = new Set(['bhujel', 'maithili', 'nepali', 'newari', 'tamang']);

function isReadableTranslation(translation: BibleTranslation): boolean {
  if (translation.isDownloaded) {
    return true;
  }

  if (!translation.hasText) {
    return false;
  }

  return translation.source !== 'runtime' || Boolean(translation.textPackLocalPath);
}

export function resolveRegionalFallbackTranslation(
  translations: BibleTranslation[],
  preferredTranslation: BibleTranslation,
  deviceCountryCode?: string | null
): BibleTranslation | null {
  const translationLanguage =
    localeSearchEngine.searchLanguages(preferredTranslation.language ?? '', null, 1).global[0] ??
    null;
  const normalizedLanguageName = preferredTranslation.language?.trim().toLowerCase() ?? '';
  const countryCodes = translationLanguage?.countryCodes ?? [];
  const normalizedDeviceCountryCode = deviceCountryCode?.toUpperCase() ?? null;
  const fallbackId =
    countryCodes.includes('NP') ||
    KNOWN_NEPAL_LANGUAGE_NAMES.has(normalizedLanguageName) ||
    normalizedDeviceCountryCode === 'NP'
      ? REGIONAL_FALLBACK_TRANSLATION_IDS.NP
      : countryCodes.includes('IN') ||
          KNOWN_INDIA_LANGUAGE_NAMES.has(normalizedLanguageName) ||
          normalizedDeviceCountryCode === 'IN'
        ? REGIONAL_FALLBACK_TRANSLATION_IDS.IN
        : null;

  if (!fallbackId || fallbackId === preferredTranslation.id) {
    return null;
  }

  const fallbackTranslation = translations.find((candidate) => candidate.id === fallbackId);

  return fallbackTranslation && isReadableTranslation(fallbackTranslation)
    ? fallbackTranslation
    : null;
}
