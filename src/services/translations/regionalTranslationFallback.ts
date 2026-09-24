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

type FallbackRegion = keyof typeof REGIONAL_FALLBACK_TRANSLATION_IDS;

// English is an official language of India, so the locale catalog lists IN among its
// countries, but an English reader is not a Hindi reader. A lingua franca never makes
// its speaker a speaker of the region's language.
const NON_REGIONAL_LANGUAGE_CODES = new Set(['en']);

function normalizeLanguageName(language: string | null | undefined): string {
  return language?.trim().toLowerCase() ?? '';
}

/**
 * The regions whose language this is, Nepal first: a language spoken on both sides
 * of the border (Maithili, Bhojpuri) reads Nepali before Hindi.
 *
 * A language the locale catalog cannot place at all is most likely a local minority
 * language, so it is assumed to belong to the device's region. A language the catalog
 * does place (English, Spanish) never takes the device region.
 */
function resolveLanguageRegions(
  languageName: string,
  deviceCountryCode: string | null
): FallbackRegion[] {
  const catalogLanguage = localeSearchEngine.getLanguageByName(languageName);
  const isNonRegional = Boolean(
    catalogLanguage?.iso6391 && NON_REGIONAL_LANGUAGE_CODES.has(catalogLanguage.iso6391)
  );
  if (isNonRegional) {
    return [];
  }

  const countryCodes = catalogLanguage?.countryCodes ?? [];
  const isKnownNepalLanguage = KNOWN_NEPAL_LANGUAGE_NAMES.has(languageName);
  const isKnownIndiaLanguage = KNOWN_INDIA_LANGUAGE_NAMES.has(languageName);
  const isUnplaced = countryCodes.length === 0 && !isKnownNepalLanguage && !isKnownIndiaLanguage;
  const belongsTo = (region: FallbackRegion, isKnown: boolean) =>
    isKnown || countryCodes.includes(region) || (isUnplaced && deviceCountryCode === region);

  return (['NP', 'IN'] as const).filter((region) =>
    belongsTo(region, region === 'NP' ? isKnownNepalLanguage : isKnownIndiaLanguage)
  );
}

/**
 * The Bible to open instead of `preferredTranslation` when it cannot be installed.
 * A readable Bible in the same language comes first (bundled before downloaded); only
 * then the region's bundled default, and only for a language of that region — an
 * English download that fails on a phone in India must never open a Hindi Bible.
 */
export function resolveRegionalFallbackTranslation(
  translations: BibleTranslation[],
  preferredTranslation: BibleTranslation,
  deviceCountryCode?: string | null
): BibleTranslation | null {
  const languageName = normalizeLanguageName(preferredTranslation.language);
  const sameLanguage = translations.filter(
    (candidate) =>
      candidate.id !== preferredTranslation.id &&
      languageName !== '' &&
      normalizeLanguageName(candidate.language) === languageName &&
      isReadableTranslation(candidate)
  );
  const sameLanguageFallback =
    sameLanguage.find((candidate) => candidate.source === 'bundled') ?? sameLanguage[0];
  if (sameLanguageFallback) {
    return sameLanguageFallback;
  }

  const regions = resolveLanguageRegions(languageName, deviceCountryCode?.toUpperCase() ?? null);
  for (const region of regions) {
    const fallbackId = REGIONAL_FALLBACK_TRANSLATION_IDS[region];
    if (fallbackId === preferredTranslation.id) {
      continue;
    }
    const fallbackTranslation = translations.find((candidate) => candidate.id === fallbackId);
    if (fallbackTranslation && isReadableTranslation(fallbackTranslation)) {
      return fallbackTranslation;
    }
  }

  return null;
}
