import test from 'node:test';
import assert from 'node:assert/strict';
import { bibleTranslations } from '../../constants/translations';
import {
  getTranslationSelectionState,
  getVisibleTranslationsForPicker,
} from '../bible/bibleTranslationModel';
import {
  buildInitialOnboardingLanguageOptions,
  filterInitialOnboardingLanguageOptions,
  getInitialBibleLanguageListState,
  getInitialInterfaceLanguageCode,
  getInterfaceLanguageSelectionResult,
  getLocaleSetupSteps,
  getRuntimeCatalogHydrationPolicy,
  hydrateRuntimeCatalogWithRetry,
  waitForRuntimeCatalogHydration,
  type RuntimeCatalogHydrationPolicy,
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

// ─── First-launch catalog hydration policy ───────────────────────────────────
// A fresh install's first catalog request shares the launch with the bundled Bible import and a
// cold network stack; 7 s was not enough and showed "Can't reach the Bible library" on a first
// launch that a relaunch then served fine.

test('the first catalog load waits at least 15 s and retries once automatically before giving up', () => {
  const policy = getRuntimeCatalogHydrationPolicy(0);

  assert.ok(policy.timeoutMs >= 15_000, `first-load timeout is ${policy.timeoutMs} ms`);
  assert.ok(policy.timeoutMs <= 20_000, 'never waits so long the retry card feels hung');
  assert.equal(policy.automaticRetries, 1);
  assert.ok(policy.retryDelayMs > 0, 'the automatic retry backs off first');
});

test('a Retry tap makes one attempt with the same patient timeout and no automatic retry', () => {
  const firstLoad = getRuntimeCatalogHydrationPolicy(0);

  for (const attempt of [1, 2, 5]) {
    assert.deepEqual(getRuntimeCatalogHydrationPolicy(attempt), {
      ...firstLoad,
      automaticRetries: 0,
    });
  }
});

const quickPolicy = (automaticRetries: number): RuntimeCatalogHydrationPolicy => ({
  timeoutMs: 20,
  automaticRetries,
  retryDelayMs: 1_500,
});

function recordWaits() {
  const waits: number[] = [];
  return {
    waits,
    wait: async (ms: number) => {
      waits.push(ms);
    },
  };
}

test('a first catalog attempt that times out is retried after the backoff and can still load', async () => {
  const { waits, wait } = recordWaits();
  let loads = 0;

  const result = await hydrateRuntimeCatalogWithRetry(
    () => {
      loads += 1;
      return loads === 1 ? new Promise<void>(() => {}) : Promise.resolve();
    },
    quickPolicy(1),
    { wait }
  );

  assert.equal(result, 'loaded');
  assert.equal(loads, 2);
  assert.deepEqual(waits, [1_500]);
});

test('a catalog that fails every attempt reports the failure only after the automatic retry', async () => {
  const { waits, wait } = recordWaits();
  let loads = 0;

  const result = await hydrateRuntimeCatalogWithRetry(
    async () => {
      loads += 1;
      throw new Error('offline');
    },
    quickPolicy(1),
    { wait }
  );

  assert.equal(result, 'failed');
  assert.equal(loads, 2);
  assert.deepEqual(waits, [1_500]);
});

test('a catalog that loads first time is not retried', async () => {
  const { waits, wait } = recordWaits();
  let loads = 0;

  const result = await hydrateRuntimeCatalogWithRetry(
    async () => {
      loads += 1;
    },
    quickPolicy(1),
    { wait }
  );

  assert.equal(result, 'loaded');
  assert.equal(loads, 1);
  assert.deepEqual(waits, []);
});

test('a policy without automatic retries reports the first failure straight away', async () => {
  const { waits, wait } = recordWaits();
  let loads = 0;

  const result = await hydrateRuntimeCatalogWithRetry(
    async () => {
      loads += 1;
      throw new Error('offline');
    },
    quickPolicy(0),
    { wait }
  );

  assert.equal(result, 'failed');
  assert.equal(loads, 1);
  assert.deepEqual(waits, []);
});

test('the automatic retry is skipped once the caller has gone away during the backoff', async () => {
  let active = true;
  let loads = 0;

  const result = await hydrateRuntimeCatalogWithRetry(
    async () => {
      loads += 1;
      throw new Error('offline');
    },
    quickPolicy(1),
    {
      wait: async () => {
        active = false;
      },
      shouldContinue: () => active,
    }
  );

  assert.equal(result, 'failed');
  assert.equal(loads, 1, 'no request after the onboarding screen unmounted');
});

test('when the Bible catalog cannot be reached, the Bibles shipped in the app stay listed and selectable', () => {
  // Offline first run: hydration fails (or times out), so onboarding lists what the binary
  // ships. Each of these must still finish onboarding without a download.
  const visible = getVisibleTranslationsForPicker(bibleTranslations, {
    isHydratingRuntimeCatalog: false,
    hasHydratedRuntimeCatalog: false,
  });
  const listed = buildInitialOnboardingLanguageOptions(visible).flatMap((option) =>
    option.translations.map((translation) => translation.id)
  );

  // WEB also ships in the app but is hidden from every picker by translationCatalogVisibility.
  for (const id of ['bsb', 'asv', 'npiulb']) {
    const translation = visible.find((candidate) => candidate.id === id);
    assert.ok(translation, `${id} should be listed`);
    assert.ok(listed.includes(id), `${id} should appear in the Bible language list`);
    assert.deepEqual(
      getTranslationSelectionState({
        isDownloaded: translation.isDownloaded,
        hasText: translation.hasText,
        hasAudio: translation.hasAudio,
        canPlayAudio: false,
        hasDownloadableTextPack: Boolean(translation.catalog?.text?.downloadUrl),
        source: translation.source,
        textPackLocalPath: translation.textPackLocalPath,
      }),
      { isSelectable: true, reason: null },
      `${id} should be selectable offline`
    );
  }
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
