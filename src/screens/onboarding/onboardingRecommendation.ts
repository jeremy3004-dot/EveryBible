// Ranks the Bible language onboarding pins above its list.
//
// WHY the two resolvers: ranking needs each Bible language's ISO code and the
// countries it is spoken in. The full answer lives in the locale search engine,
// whose first use parses a 129 KB catalog and runs two ICU sorts — too much for
// the first frame on Hermes. The first frame instead asks a ~6 KB seed of the
// interface languages (onboardingSeedLanguages.generated.json), and only pins a
// Bible when the seed can prove it is the one the engine will pick. Otherwise the
// pin waits (a placeholder) until the engine is warm, so the pinned Bible never
// changes under the user's finger.
import seed from '../../data/onboardingSeedLanguages.generated.json';
import { normalizeTranslationLanguage } from '../bible/bibleTranslationModel';

export interface RecommendationLanguageFacts {
  iso6391: string | null;
  countryCodes: readonly string[];
}

/**
 * Looks a Bible's language up by name. `null` means the name resolves to no
 * language; `undefined` means this resolver cannot tell (the seed, for any name
 * outside the interface languages).
 */
export type RecommendationLanguageResolver = (
  name: string
) => RecommendationLanguageFacts | null | undefined;

export interface RecommendationContext {
  deviceLanguageCode: string | null;
  deviceCountryCode: string | null;
  interfaceLanguageCode: string;
}

interface RecommendableOption {
  key: string;
  label: string;
  primaryTranslation: {
    id: string;
    language: string | null | undefined;
    isDownloaded?: boolean;
    hasText?: boolean;
    hasAudio?: boolean;
  };
}

export type OnboardingRecommendation<T> =
  | { status: 'ready'; option: T | null }
  | { status: 'pending' };

const DEVICE_LANGUAGE_BONUS = 500;
const INTERFACE_LANGUAGE_BONUS = 300;
const DEVICE_COUNTRY_BONUS = 250;

let seedIndex: Map<string, RecommendationLanguageFacts> | null = null;
let seedIsoCodes: Set<string> | null = null;
const getSeedIndex = (): Map<string, RecommendationLanguageFacts> => {
  if (!seedIndex) {
    seedIndex = new Map();
    seedIsoCodes = new Set();
    for (const language of seed.languages) {
      const facts = { iso6391: language.iso6391, countryCodes: language.countryCodes };
      seedIsoCodes.add(language.iso6391);
      for (const name of language.names) {
        seedIndex.set(name, facts);
      }
    }
  }
  return seedIndex;
};

/** Same key normalization as the engine's getLanguageByName. */
export function resolveSeedRecommendationLanguage(
  name: string
): RecommendationLanguageFacts | undefined {
  return getSeedIndex().get(name.trim().toLowerCase());
}

// Everything the score takes from the Bible itself rather than its language.
const scoreTranslation = (translation: RecommendableOption['primaryTranslation']): number => {
  let score = 0;
  if (
    normalizeTranslationLanguage(translation.language).toLowerCase() === 'english' &&
    translation.id.toLowerCase() === 'bsb'
  ) {
    score -= 100;
  }
  if (translation.isDownloaded) {
    score -= 60;
  }
  if (translation.hasText) {
    score -= 40;
  }
  if (translation.hasAudio) {
    score -= 20;
  }
  return score;
};

const scoreLanguage = (
  language: RecommendationLanguageFacts | null,
  context: RecommendationContext,
  deviceCountryCode: string | null
): number => {
  let score = 0;
  if (language?.iso6391 === context.deviceLanguageCode) {
    score -= DEVICE_LANGUAGE_BONUS;
  }
  if (language?.iso6391 === context.interfaceLanguageCode) {
    score -= INTERFACE_LANGUAGE_BONUS;
  }
  if (deviceCountryCode && language?.countryCodes.includes(deviceCountryCode)) {
    score -= DEVICE_COUNTRY_BONUS;
  }
  return score;
};

// A Bible with no language name resolves to nothing, whichever resolver asks.
const resolveNamed = <R>(
  name: string | null | undefined,
  resolveLanguage: (name: string) => R
): R | null => (name?.trim() ? resolveLanguage(name) : null);

// Lower score first; ties fall back to a code-point label compare (never ICU
// localeCompare, which is slow on Hermes) and then to input order.
const ranksBefore = (
  left: { score: number; label: string },
  right: { score: number; label: string }
): boolean => left.score < right.score || (left.score === right.score && left.label < right.label);

/** The full ranking, top `limit`. Needs a resolver that knows every language. */
export function rankRecommendedOnboardingOptions<T extends RecommendableOption>(
  options: readonly T[],
  context: RecommendationContext,
  resolveLanguage: (name: string) => RecommendationLanguageFacts | null,
  limit = 5
): T[] {
  const deviceCountryCode = context.deviceCountryCode?.toUpperCase() ?? null;
  const scoreByKey = new Map<string, number>();
  for (const option of options) {
    const translation = option.primaryTranslation;
    scoreByKey.set(
      option.key,
      scoreLanguage(
        resolveNamed(translation.language, resolveLanguage),
        context,
        deviceCountryCode
      ) + scoreTranslation(translation)
    );
  }

  return [...options]
    .sort((left, right) => {
      const scoreDelta = (scoreByKey.get(left.key) ?? 0) - (scoreByKey.get(right.key) ?? 0);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      if (left.label < right.label) {
        return -1;
      }
      if (left.label > right.label) {
        return 1;
      }
      return 0;
    })
    .slice(0, limit);
}

/**
 * The pinned recommendation, or `pending` when the resolver leaves it open. With a
 * resolver that knows every language this is always the top of
 * rankRecommendedOnboardingOptions. With the seed it is either that same option or
 * `pending`: an option the seed cannot resolve is given the best language score it
 * could still earn, and the pick is made only if no such option could beat it.
 */
export function pickRecommendedOnboardingOption<T extends RecommendableOption>(
  options: readonly T[],
  context: RecommendationContext,
  resolveLanguage: RecommendationLanguageResolver
): OnboardingRecommendation<T> {
  const deviceCountryCode = context.deviceCountryCode?.toUpperCase() ?? null;
  // A name outside the seed resolves (if at all) to a language whose ISO code is
  // not a seed code, so it can only match a device or interface language outside
  // that set. Every interface language is a seed code, so in practice only the
  // device language and country bonuses stay open.
  getSeedIndex();
  const couldMatch = (code: string | null) => !(code && seedIsoCodes?.has(code));
  const unresolvedBestLanguageScore =
    -(couldMatch(context.deviceLanguageCode) ? DEVICE_LANGUAGE_BONUS : 0) -
    (couldMatch(context.interfaceLanguageCode) ? INTERFACE_LANGUAGE_BONUS : 0) -
    (deviceCountryCode ? DEVICE_COUNTRY_BONUS : 0);

  let best: { option: T; score: number; label: string } | null = null;
  const unresolved: Array<{ score: number; label: string }> = [];

  for (const option of options) {
    const translation = option.primaryTranslation;
    const language = resolveNamed(translation.language, resolveLanguage);
    const translationScore = scoreTranslation(translation);

    if (language === undefined) {
      unresolved.push({
        score: unresolvedBestLanguageScore + translationScore,
        label: option.label,
      });
      continue;
    }

    const candidate = {
      option,
      score: scoreLanguage(language, context, deviceCountryCode) + translationScore,
      label: option.label,
    };
    if (!best || ranksBefore(candidate, best)) {
      best = candidate;
    }
  }

  if (unresolved.length === 0) {
    return { status: 'ready', option: best?.option ?? null };
  }

  const pick = best;
  if (!pick || unresolved.some((candidate) => !ranksBefore(pick, candidate))) {
    return { status: 'pending' };
  }

  return { status: 'ready', option: pick.option };
}
