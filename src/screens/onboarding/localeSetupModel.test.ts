import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialOnboardingLanguageOptions,
  filterInitialOnboardingLanguageOptions,
  getInitialBibleLanguageListState,
  getInitialInterfaceLanguageCode,
  getInterfaceLanguageSelectionResult,
  getLocaleSetupSteps,
  waitForRuntimeCatalogHydration,
} from './localeSetupModel';

test('initial onboarding opens directly to the Bible language recommendation', () => {
  assert.deepEqual(getLocaleSetupSteps('initial'), ['translation']);
});

test('initial onboarding shows search and the full Bible language list immediately', () => {
  assert.deepEqual(getInitialBibleLanguageListState('initial'), {
    showsSearch: true,
    showsFullList: true,
    pinsRecommendedOption: true,
  });
});

test('settings locale flow stays focused on nation and Bible language', () => {
  assert.deepEqual(getLocaleSetupSteps('settings'), ['country', 'contentLanguage']);
});

test('initial onboarding groups Bible languages alphabetically', () => {
  const options = buildInitialOnboardingLanguageOptions([
    { id: 'npiulb', name: 'Nepali Bible', abbreviation: 'NPB', language: 'Nepali' },
    { id: 'hincv', name: 'Hindi Contemporary Version', abbreviation: 'HCV', language: 'Hindi' },
    { id: 'bsb', name: 'Berean Standard Bible', abbreviation: 'BSB', language: 'English' },
  ]);

  assert.deepEqual(
    options.map((option) => option.groupLabel),
    ['E', 'H', 'N']
  );
  assert.deepEqual(
    options.map((option) => option.label),
    ['English', 'Hindi / हिन्दी', 'Nepali / नेपाली']
  );
});

test('each letter section of the Bible language list is contiguous, so section ids never repeat', () => {
  // The list builds one section per run of equal group labels and keys each by its label.
  // Sorting by collated label while grouping by raw first character split "E" around
  // "Éwondo" (filed under "#") and scattered "#" rows, repeating "eyebrow-E"/"eyebrow-#".
  const options = buildInitialOnboardingLanguageOptions(
    ['Ewe', 'Éwondo', 'Eyak', 'Zulu', 'Ελληνικά', '!Kung', 'Ọ̀yọ́'].map((language, index) => ({
      id: `t${index}`,
      name: `Bible ${index}`,
      language,
    }))
  );

  assert.deepEqual(
    options.map((option) => `${option.groupLabel}:${option.label}`),
    ['E:Ewe', 'E:Éwondo', 'E:Eyak', 'O:Ọ̀yọ́', 'Z:Zulu', '#:!Kung', '#:Ελληνικά']
  );
});

test('initial onboarding maps English to BSB when multiple English Bibles exist', () => {
  const [englishOption] = buildInitialOnboardingLanguageOptions([
    {
      id: 'asv',
      name: 'American Standard Version',
      abbreviation: 'ASV',
      language: 'English',
      isDownloaded: true,
      hasText: true,
    },
    {
      id: 'bsb',
      name: 'Berean Standard Bible',
      abbreviation: 'BSB',
      language: 'English',
      isDownloaded: true,
      hasText: true,
      hasAudio: true,
    },
  ]);

  assert.equal(englishOption?.primaryTranslation.id, 'bsb');
});

test('runtime catalog hydration timeout still leaves bundled English BSB listable', async () => {
  const hydrationResult = await waitForRuntimeCatalogHydration(() => new Promise(() => {}), 10);
  const [englishOption] = buildInitialOnboardingLanguageOptions([
    {
      id: 'bsb',
      name: 'Berean Standard Bible',
      abbreviation: 'BSB',
      language: 'English',
      isDownloaded: true,
      hasText: true,
      hasAudio: true,
    },
  ]);

  assert.equal(hydrationResult, 'timeout');
  assert.equal(englishOption?.label, 'English');
  assert.equal(englishOption?.primaryTranslation.id, 'bsb');
  assert.equal(englishOption?.primaryTranslation.isDownloaded, true);
  assert.equal(englishOption?.primaryTranslation.hasText, true);
});

test('interface-language selection closes the picker even when language loading rejects', async () => {
  const result = await getInterfaceLanguageSelectionResult('es', async () => {
    throw new Error('locale chunk failed');
  });

  assert.equal(result.languageCode, 'es');
  assert.equal(result.shouldClosePicker, true);
  assert.equal(result.nextStep, 'translation');
  assert.equal(result.changeLanguageSucceeded, false);
  assert.ok(result.changeLanguageError instanceof Error);
});

test('first-run onboarding shows the language the interface is actually in, not a stored default', () => {
  // After sign-out the stored preference is reset to 'en' while the app still shows the
  // user's language; on first run the interface boots in the device language. The picker
  // must name the language on screen, or finishing onboarding silently switches it.
  assert.equal(
    getInitialInterfaceLanguageCode('initial', { currentLanguage: 'ar', preferredLanguage: 'en' }),
    'ar'
  );
});

test('the settings locale flow starts from the stored interface language', () => {
  assert.equal(
    getInitialInterfaceLanguageCode('settings', { currentLanguage: 'ar', preferredLanguage: 'fr' }),
    'fr'
  );
});

const searchFixture = [
  {
    id: 'bsb',
    name: 'Berean Standard Bible',
    language: 'English',
    isDownloaded: true,
    hasText: true,
  },
  { id: 'asv', name: 'American Standard Version', language: 'English', isDownloaded: true },
  { id: 'web', name: 'World English Bible', language: 'English', hasText: true },
  { id: 'npiulb', name: 'Nepali Bible', language: 'Nepali', hasText: true },
  { id: 'hincv', name: 'Hindi Contemporary Version', language: 'Hindi' },
  { id: 'ewo', name: 'Bible Éwondo', language: 'Éwondo' },
  { id: 'ell', name: 'Η Αγία Γραφή', language: 'Ελληνικά' },
];

function describeOptions(options: ReturnType<typeof buildInitialOnboardingLanguageOptions>) {
  return options.map((option) => ({
    key: option.key,
    label: option.label,
    groupLabel: option.groupLabel,
    primary: option.primaryTranslation.id,
    translations: option.translations.map((translation) => translation.id),
  }));
}

test('filtering the presorted Bible language list gives the same list as rebuilding it', () => {
  const allOptions = buildInitialOnboardingLanguageOptions(searchFixture);
  const subsets = [
    searchFixture,
    [],
    searchFixture.filter((translation) => translation.language !== 'English'),
    searchFixture.filter((translation) => translation.id !== 'bsb'),
    searchFixture.filter((translation) => ['web', 'ell', 'hincv'].includes(translation.id)),
  ];

  for (const subset of subsets) {
    assert.deepEqual(
      describeOptions(filterInitialOnboardingLanguageOptions(allOptions, subset)),
      describeOptions(buildInitialOnboardingLanguageOptions(subset))
    );
  }
});

test('a search that narrows a language keeps its best remaining Bible as the primary', () => {
  const allOptions = buildInitialOnboardingLanguageOptions(searchFixture);
  const [english] = filterInitialOnboardingLanguageOptions(
    allOptions,
    searchFixture.filter((translation) => translation.id === 'asv' || translation.id === 'web')
  );

  assert.equal(english?.primaryTranslation.id, 'asv');
  assert.deepEqual(
    english?.translations.map((translation) => translation.id),
    ['asv', 'web']
  );
});

test('an unchanged search result reuses the presorted options', () => {
  const allOptions = buildInitialOnboardingLanguageOptions(searchFixture);
  const filtered = filterInitialOnboardingLanguageOptions(allOptions, searchFixture);

  assert.equal(filtered.length, allOptions.length);
  filtered.forEach((option, index) => assert.equal(option, allOptions[index]));
});

test('filtering the presorted list on a keystroke never collates text', (t) => {
  const allOptions = buildInitialOnboardingLanguageOptions(searchFixture);
  const localeCompare = t.mock.method(String.prototype, 'localeCompare');
  const RealCollator = Intl.Collator;
  let collatorsBuilt = 0;
  const countingCollator = function (...args: ConstructorParameters<typeof Intl.Collator>) {
    collatorsBuilt += 1;
    return new RealCollator(...args);
  };
  Object.defineProperty(Intl, 'Collator', {
    value: countingCollator,
    configurable: true,
    writable: true,
  });
  t.after(() => {
    Object.defineProperty(Intl, 'Collator', {
      value: RealCollator,
      configurable: true,
      writable: true,
    });
  });

  filterInitialOnboardingLanguageOptions(
    allOptions,
    searchFixture.filter((translation) => translation.id !== 'bsb')
  );

  assert.equal(localeCompare.mock.callCount(), 0);
  assert.equal(collatorsBuilt, 0);
});
