import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTranslationPickerSections,
  buildTranslationLanguageFilters,
  filterTranslationsBySearchQuery,
  getTranslationAudioCollectionActions,
  getVisibleTranslationsForPicker,
  getTranslationLanguageDisplayLabel,
  resolvePreferredTranslationLanguage,
  getTranslationSelectionState,
  isTranslationReadableLocally,
} from './bibleTranslationModel';

test('downloaded translations are selectable', () => {
  const state = getTranslationSelectionState({
    isDownloaded: true,
    hasText: true,
    hasAudio: false,
    canPlayAudio: false,
  });

  assert.deepEqual(state, {
    isSelectable: true,
    reason: null,
  });
});

test('text translations remain selectable even when audio downloads are separate', () => {
  const state = getTranslationSelectionState({
    isDownloaded: false,
    hasText: true,
    hasAudio: false,
    canPlayAudio: false,
  });

  assert.deepEqual(state, {
    isSelectable: true,
    reason: null,
  });
});

test('runtime text translations require an installed local pack before they are treated as readable', () => {
  assert.equal(
    isTranslationReadableLocally({
      isDownloaded: false,
      hasText: true,
      source: 'runtime',
      textPackLocalPath: null,
    }),
    false
  );

  assert.equal(
    isTranslationReadableLocally({
      isDownloaded: false,
      hasText: true,
      source: 'runtime',
      textPackLocalPath: 'file:///translations/niv.db',
    }),
    true
  );
});

test('bundled text translations remain readable without a runtime pack path', () => {
  assert.equal(
    isTranslationReadableLocally({
      isDownloaded: false,
      hasText: true,
      source: 'bundled',
      textPackLocalPath: null,
    }),
    true
  );
});

test('audio-only translations are blocked when no audio source is available', () => {
  const state = getTranslationSelectionState({
    isDownloaded: false,
    hasText: false,
    hasAudio: true,
    canPlayAudio: false,
  });

  assert.deepEqual(state, {
    isSelectable: false,
    reason: 'audio-unavailable',
  });
});

test('runtime text translations without an installed local pack require download instead of looking unavailable', () => {
  const state = getTranslationSelectionState({
    isDownloaded: false,
    hasText: true,
    hasAudio: false,
    canPlayAudio: false,
    hasDownloadableTextPack: true,
    source: 'runtime',
    textPackLocalPath: null,
  });

  assert.deepEqual(state, {
    isSelectable: false,
    reason: 'download-required',
  });
});

test('runtime translations with downloadable text should still prompt text install when audio is unavailable', () => {
  const state = getTranslationSelectionState({
    isDownloaded: false,
    hasText: true,
    hasAudio: true,
    canPlayAudio: false,
    hasDownloadableTextPack: true,
    source: 'runtime',
    textPackLocalPath: null,
  });

  assert.deepEqual(state, {
    isSelectable: false,
    reason: 'download-required',
  });
});

test('runtime text translations become selectable once the local pack exists', () => {
  const state = getTranslationSelectionState({
    isDownloaded: false,
    hasText: true,
    hasAudio: false,
    canPlayAudio: false,
    hasDownloadableTextPack: true,
    source: 'runtime',
    textPackLocalPath: 'file:///translations/niv.db',
  });

  assert.deepEqual(state, {
    isSelectable: true,
    reason: null,
  });
});

test('runtime text translations without an R2 text pack stay marked as coming soon', () => {
  const state = getTranslationSelectionState({
    isDownloaded: false,
    hasText: true,
    hasAudio: false,
    canPlayAudio: false,
    hasDownloadableTextPack: false,
    source: 'runtime',
    textPackLocalPath: null,
  });

  assert.deepEqual(state, {
    isSelectable: false,
    reason: 'coming-soon',
  });
});

test('known full-audio translations expose full Bible and New Testament collection actions', () => {
  assert.deepEqual(
    getTranslationAudioCollectionActions({
      id: 'bsb',
      catalog: {
        version: '2026.03.26',
        updatedAt: '2026-03-26T00:00:00.000Z',
        audio: {
          strategy: 'stream-template',
          coverage: 'full-bible',
        },
      },
    }),
    ['full-bible', 'new-testament']
  );
});

test('NT-only audio catalogs expose a New Testament collection action', () => {
  assert.deepEqual(
    getTranslationAudioCollectionActions({
      id: 'npiulb',
      catalog: {
        version: '2026.04.04-open-bible-nt-media-v1',
        updatedAt: '2026-04-04T00:00:00.000Z',
        audio: {
          strategy: 'stream-template',
        },
      },
    }),
    ['new-testament']
  );
});

test('translations without collection coverage fall back to by-book audio only', () => {
  assert.deepEqual(
    getTranslationAudioCollectionActions({
      id: 'mystery-audio',
      catalog: {
        version: '2026.04.04',
        updatedAt: '2026-04-04T00:00:00.000Z',
        audio: {
          strategy: 'stream-template',
        },
      },
    }),
    []
  );
});

test('picker hides unreadable runtime placeholders while the runtime catalog is still hydrating', () => {
  const visible = getVisibleTranslationsForPicker(
    [
      {
        id: 'bsb',
        isDownloaded: true,
        hasText: true,
        source: 'bundled' as const,
        textPackLocalPath: null,
      },
      {
        id: 'hincv',
        isDownloaded: false,
        hasText: false,
        source: 'runtime' as const,
        textPackLocalPath: null,
      },
      {
        id: 'npiulb',
        isDownloaded: false,
        hasText: true,
        source: 'runtime' as const,
        textPackLocalPath: null,
      },
    ],
    {
      isHydratingRuntimeCatalog: true,
      hasHydratedRuntimeCatalog: false,
    }
  );

  assert.deepEqual(
    visible.map((translation) => translation.id),
    ['bsb']
  );
});

test('preferred translation language falls back to the current translation language when persisted preference is missing', () => {
  const preferredLanguage = resolvePreferredTranslationLanguage(
    [
      {
        id: 'bsb',
        language: 'English',
      },
      {
        id: 'nnrv',
        language: 'Nepali',
      },
    ],
    null,
    'nnrv'
  );

  assert.equal(preferredLanguage, 'Nepali');
});

test('preferred translation language keeps a persisted valid language selection', () => {
  const preferredLanguage = resolvePreferredTranslationLanguage(
    [
      {
        id: 'bsb',
        language: 'English',
      },
      {
        id: 'nnrv',
        language: 'Nepali',
      },
    ],
    'English',
    'nnrv'
  );

  assert.equal(preferredLanguage, 'English');
});

test('translation language display labels include native scripts when available', () => {
  assert.equal(getTranslationLanguageDisplayLabel('Hindi'), 'Hindi / हिन्दी');
  assert.equal(getTranslationLanguageDisplayLabel('Nepali'), 'Nepali / नेपाली');
  assert.equal(getTranslationLanguageDisplayLabel('Spanish'), 'Spanish / Español');
  assert.equal(getTranslationLanguageDisplayLabel('English'), 'English');
});

test('translation language filters expose bilingual labels while preserving canonical values', () => {
  const filters = buildTranslationLanguageFilters([
    { language: 'Nepali' },
    { language: 'Hindi' },
  ]);

  assert.deepEqual(filters, [
    { value: 'Hindi', label: 'Hindi / हिन्दी' },
    { value: 'Nepali', label: 'Nepali / नेपाली' },
  ]);
});

test('translation picker sections split local translations from the preferred language catalog without duplicates', () => {
  const sections = buildTranslationPickerSections(
    [
      {
        id: 'bsb',
        language: 'English',
        isDownloaded: true,
        hasText: true,
        source: 'bundled' as const,
        textPackLocalPath: null,
      },
      {
        id: 'niv',
        language: 'English',
        isDownloaded: false,
        hasText: true,
        source: 'runtime' as const,
        textPackLocalPath: null,
      },
      {
        id: 'nnrv',
        language: 'Nepali',
        isDownloaded: true,
        hasText: true,
        source: 'runtime' as const,
        textPackLocalPath: 'file:///translations/nnrv.db',
      },
    ],
    'English'
  );

  assert.deepEqual(
    sections.myTranslations.map((translation) => translation.id),
    ['bsb', 'nnrv']
  );
  assert.deepEqual(
    sections.availableTranslations.map((translation) => translation.id),
    ['niv']
  );
});

test('translation search matches name, abbreviation, description, and language label fuzzily', () => {
  const translations = [
    {
      id: 'kjvcpb',
      name: 'KJV Cambridge Paragraph',
      abbreviation: 'KJVCPB',
      description: 'Classic English paragraph edition',
      language: 'English',
    },
    {
      id: 'nnrv',
      name: 'Nepali New Revised Version',
      abbreviation: 'NNRV',
      description: 'Modern Nepali Bible translation',
      language: 'Nepali',
    },
  ];

  assert.deepEqual(
    filterTranslationsBySearchQuery(translations, 'cambrdg').map((translation) => translation.id),
    ['kjvcpb']
  );

  assert.deepEqual(
    filterTranslationsBySearchQuery(translations, 'nnrv').map((translation) => translation.id),
    ['nnrv']
  );

  assert.deepEqual(
    filterTranslationsBySearchQuery(translations, 'modern nepali').map(
      (translation) => translation.id
    ),
    ['nnrv']
  );

  assert.deepEqual(
    filterTranslationsBySearchQuery(translations, 'नेपाली').map((translation) => translation.id),
    ['nnrv']
  );

  assert.deepEqual(
    filterTranslationsBySearchQuery(
      [
        {
          id: 'rst',
          name: 'Russian Synodal Bible',
          abbreviation: 'RST',
          description: 'Русский синодальный перевод',
          language: 'Russian',
        },
      ],
      'Русский'
    ).map((translation) => translation.id),
    ['rst']
  );
});
