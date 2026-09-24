import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../../data/localeCatalog.json';
import seed from '../../data/onboardingSeedLanguages.generated.json';
import { bibleTranslations } from '../../constants/translations';
import { LANGUAGES, type LanguageCode } from '../../constants/languages';
import { normalizeDeviceLanguageCode } from '../../i18n/deviceLanguage';
import {
  createLocaleSearchEngine,
  type LocaleCatalog,
  type LocaleLanguage,
} from '../../services/onboarding/localeSelection';
import { normalizeTranslationLanguage } from '../bible/bibleTranslationModel';
import { generateOnboardingSeedLanguages } from '../../../scripts/generate-onboarding-seed-languages';
import {
  buildInitialOnboardingLanguageOptions,
  type InitialOnboardingLanguageOption,
} from './localeSetupModel';
import {
  pickRecommendedOnboardingOption,
  rankRecommendedOnboardingOptions,
  resolveSeedRecommendationLanguage,
  type RecommendationContext,
} from './onboardingRecommendation';

const engine = createLocaleSearchEngine(catalog as LocaleCatalog);
const resolveWithEngine = (name: string) => engine.getLanguageByName(name);

interface TestTranslation {
  id: string;
  name: string;
  abbreviation?: string | null;
  language: string;
  isDownloaded?: boolean;
  hasText?: boolean;
  hasAudio?: boolean;
}
type Option = InitialOnboardingLanguageOption<TestTranslation>;

const bundled: TestTranslation[] = bibleTranslations.map((translation) => ({
  id: translation.id,
  name: translation.name,
  abbreviation: translation.abbreviation,
  language: translation.language,
  isDownloaded: translation.isDownloaded,
  hasText: translation.hasText,
  hasAudio: translation.hasAudio,
}));

// A hydrated runtime catalog: languages both inside and outside the interface set,
// named the way the catalog names them (and a few free-text names it does not).
const runtime: TestTranslation[] = [
  ['spnblm', 'Spanish'],
  ['porbr', 'Portuguese'],
  ['arbvd', 'Arabic'],
  ['cmnunv', 'Chinese'],
  ['frals', 'French'],
  ['indtb', 'Indonesian'],
  ['swhulb', 'Swahili'],
  ['hincv', 'Hindi'],
  ['npiulb', 'Nepali'],
  ['kikbible', 'Kikuyu'],
  ['quzbible', 'Quechua'],
  ['bhojpuri', 'Bhojpuri'],
  ['mysterylang', 'Unlisted Dialect'],
].map(([id, language]) => ({
  id,
  name: `${language} Bible`,
  abbreviation: id.toUpperCase(),
  language,
  isDownloaded: false,
  hasText: true,
  hasAudio: id === 'swhulb' || id === 'arbvd',
}));

const DEVICE_LOCALES = [
  'en-US',
  'es-MX',
  'pt-BR',
  'hi-IN',
  'ne-NP',
  'ar-EG',
  'zh-Hans-CN',
  'fr-FR',
  'id-ID',
  'sw-KE',
] as const;

function contextFor(tag: string): RecommendationContext {
  const parts = tag.split('-');
  const deviceLanguageCode = normalizeDeviceLanguageCode({ languageTag: tag });
  const interfaceLanguageCode = (
    deviceLanguageCode && deviceLanguageCode in LANGUAGES ? deviceLanguageCode : 'en'
  ) as LanguageCode;
  return {
    deviceLanguageCode,
    deviceCountryCode: parts[parts.length - 1],
    interfaceLanguageCode,
  };
}

// The ranking LocaleSetupFlow computed inline before the first-paint change, kept
// verbatim as the oracle the final ranking must still match.
function legacyRanking(options: Option[], context: RecommendationContext): Option[] {
  const normalizedDeviceCountryCode = context.deviceCountryCode?.toUpperCase() ?? null;
  const scoreOption = (option: Option) => {
    const translation = option.primaryTranslation;
    const translationLanguage: LocaleLanguage | null = engine.getLanguageByName(
      translation.language
    );
    const normalizedTranslationLanguage = normalizeTranslationLanguage(
      translation.language
    ).toLowerCase();
    let score = 0;
    if (translationLanguage?.iso6391 === context.deviceLanguageCode) score -= 500;
    if (translationLanguage?.iso6391 === context.interfaceLanguageCode) score -= 300;
    if (
      normalizedDeviceCountryCode &&
      translationLanguage?.countryCodes.includes(normalizedDeviceCountryCode)
    ) {
      score -= 250;
    }
    if (normalizedTranslationLanguage === 'english' && translation.id.toLowerCase() === 'bsb') {
      score -= 100;
    }
    if (translation.isDownloaded) score -= 60;
    if (translation.hasText) score -= 40;
    if (translation.hasAudio) score -= 20;
    return score;
  };
  const scoreByKey = new Map(options.map((option) => [option.key, scoreOption(option)]));
  return [...options]
    .sort((left, right) => {
      const delta = (scoreByKey.get(left.key) ?? 0) - (scoreByKey.get(right.key) ?? 0);
      if (delta !== 0) return delta;
      if (left.label < right.label) return -1;
      if (left.label > right.label) return 1;
      return 0;
    })
    .slice(0, 5);
}

const keys = (options: Option[]) => options.map((option) => option.key);
const bundledOptions = buildInitialOnboardingLanguageOptions(bundled);
const hydratedOptions = buildInitialOnboardingLanguageOptions([...bundled, ...runtime]);

test('the final recommendation ranking is unchanged for every device locale', () => {
  for (const tag of DEVICE_LOCALES) {
    const context = contextFor(tag);
    for (const options of [bundledOptions, hydratedOptions]) {
      assert.deepEqual(
        keys(rankRecommendedOnboardingOptions(options, context, resolveWithEngine)),
        keys(legacyRanking(options, context)),
        tag
      );
    }
  }
});

test('a fresh install pins its final recommendation on the first frame, without the engine', () => {
  for (const tag of DEVICE_LOCALES) {
    const context = contextFor(tag);
    assert.deepEqual(
      pickRecommendedOnboardingOption(bundledOptions, context, resolveSeedRecommendationLanguage),
      { status: 'ready', option: legacyRanking(bundledOptions, context)[0] ?? null },
      tag
    );
  }
});

test('with a hydrated catalog the first frame shows the final pick or waits, never another Bible', () => {
  const firstFrames: Record<string, string> = {};
  for (const tag of DEVICE_LOCALES) {
    const context = contextFor(tag);
    const firstFrame = pickRecommendedOnboardingOption(
      hydratedOptions,
      context,
      resolveSeedRecommendationLanguage
    );
    const finalPick = legacyRanking(hydratedOptions, context)[0];
    if (firstFrame.status === 'ready') {
      assert.equal(firstFrame.option?.key, finalPick?.key, tag);
    }
    firstFrames[tag] = firstFrame.status === 'ready' ? `${firstFrame.option?.key}` : 'pending';
  }

  // Interface-language devices are provable from the seed; a Swahili device could be
  // outranked by a language only the engine knows, so it waits for the engine.
  assert.deepEqual(firstFrames, {
    'en-US': 'english',
    'es-MX': 'spanish',
    'pt-BR': 'portuguese',
    'hi-IN': 'hindi',
    'ne-NP': 'nepali',
    'ar-EG': 'arabic',
    'zh-Hans-CN': 'chinese',
    'fr-FR': 'french',
    'id-ID': 'indonesian',
    'sw-KE': 'pending',
  });
});

test('an option list with nothing the seed can resolve waits for the engine', () => {
  const options = buildInitialOnboardingLanguageOptions(
    runtime.filter(({ language }) => language === 'Swahili' || language === 'Kikuyu')
  );
  assert.deepEqual(
    pickRecommendedOnboardingOption(
      options,
      contextFor('sw-KE'),
      resolveSeedRecommendationLanguage
    ),
    { status: 'pending' }
  );
  assert.deepEqual(
    pickRecommendedOnboardingOption([], contextFor('sw-KE'), resolveSeedRecommendationLanguage),
    { status: 'ready', option: null }
  );
});

test('the engine resolver always settles the pick to the top of the final ranking', () => {
  for (const tag of DEVICE_LOCALES) {
    const context = contextFor(tag);
    assert.deepEqual(
      pickRecommendedOnboardingOption(hydratedOptions, context, resolveWithEngine),
      { status: 'ready', option: legacyRanking(hydratedOptions, context)[0] ?? null },
      tag
    );
  }
});

test('every seed name resolves exactly as the engine resolves it, and nothing else resolves', () => {
  for (const entry of seed.languages) {
    for (const name of entry.names) {
      const language = engine.getLanguageByName(name);
      assert.deepEqual(
        resolveSeedRecommendationLanguage(`  ${name.toUpperCase()} `),
        { iso6391: language?.iso6391, countryCodes: language?.countryCodes },
        name
      );
    }
  }
  assert.equal(resolveSeedRecommendationLanguage('Swahili'), undefined);
  assert.equal(resolveSeedRecommendationLanguage('constructor'), undefined);
  assert.equal(resolveSeedRecommendationLanguage(''), undefined);
});

test('the checked-in seed matches the locale catalog', () => {
  assert.deepEqual(seed, generateOnboardingSeedLanguages());
});

// expo-localization reports languageCode null when the device language is unknown. Most
// catalog languages have no ISO 639-1 code either, and null must not count as a match.
test('an unknown device language gives no language a device-language bonus', () => {
  const facts: Record<string, { iso6391: string | null; countryCodes: string[] }> = {
    english: { iso6391: 'en', countryCodes: ['US'] },
    achinese: { iso6391: null, countryCodes: ['ID'] },
  };
  const resolve = (name: string) => facts[name.trim().toLowerCase()] ?? null;
  const option = (id: string, language: string) => ({
    key: id,
    label: `${language} Bible`,
    primaryTranslation: { id, language, hasText: true },
  });
  const options = [option('ace', 'Achinese'), option('web', 'English')];
  const context: RecommendationContext = {
    deviceLanguageCode: null,
    deviceCountryCode: null,
    interfaceLanguageCode: 'en',
  };

  assert.deepEqual(
    rankRecommendedOnboardingOptions(options, context, resolve).map((entry) => entry.key),
    ['web', 'ace']
  );
  const pick = pickRecommendedOnboardingOption(options, context, resolve);
  assert.equal(pick.status === 'ready' ? pick.option?.key : pick.status, 'web');
});
