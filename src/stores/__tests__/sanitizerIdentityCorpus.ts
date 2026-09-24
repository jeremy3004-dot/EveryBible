/**
 * Representative and corrupt persisted blobs for every hydration sanitizer.
 * `sanitizerIdentity.expected.ts` holds the outputs the pre-split `persistedStateSanitizers.ts`
 * produced for this corpus (encoded by sanitizerIdentityEncoding.ts); the identity test re-runs
 * the corpus and asserts deep equality, so any drift in a sanitizer's output fails.
 */
import type * as SanitizerModule from '../persistedStateSanitizers';

export type SanitizerApi = typeof SanitizerModule;

export interface SanitizerIdentityCase {
  name: string;
  run: (api: SanitizerApi) => unknown;
}

/** Library playlists fall back to Date.now(); the corpus pins it to this instant. */
export const SANITIZER_IDENTITY_NOW = 1_758_672_000_000;

import {
  CORRUPT_ROOTS,
  audioCatalogs,
  deltaRow,
  elRow,
  legacyElRow,
  runtimeRow,
  snapshotEntry,
  textCatalog,
} from './sanitizerIdentityRows';

const bibleStates: readonly [string, unknown][] = [
  ...CORRUPT_ROOTS,
  ['malformed translations', { currentBook: 'INVALID', currentChapter: -4, translations: {} }],
  [
    'valid reader position',
    {
      currentBook: 'JUD',
      currentChapter: 1,
      preferredChapterLaunchMode: 'read',
      preferredTranslationLanguage: '  Spanish ',
      currentTranslation: ' WEB ',
      currentTranslationChosenAt: '2026-09-01T00:00:00.000Z',
    },
  ],
  ['chapter past book end', { currentBook: 'JUD', currentChapter: 2, currentTranslation: 'kjv' }],
  ['chapter without book', { currentChapter: 3, currentTranslationChosenAt: 'nope' }],
  ['fractional chapter', { currentBook: 'GEN', currentChapter: 1.5 }],
  ['retired translation', { currentTranslation: 'retired', translations: [] }],
  [
    'seeded overrides',
    {
      currentTranslation: 'hincv',
      translations: [
        {
          id: 'bsb',
          isDownloaded: false,
          downloadedBooks: ['GEN', 'XXX'],
          installState: 'remote-only',
          name: 'Renamed',
          catalog: runtimeRow.catalog,
          activeDownloadJob: { ...runtimeRow.activeDownloadJob, state: 'paused' },
        },
        {
          id: 'hincv',
          name: 'Hindi Renamed',
          abbreviation: ' HIN ',
          totalBooks: 27,
          sizeInMB: -1,
          hasText: true,
          hasAudio: 'yes',
          audioGranularity: 'verse',
          audioProvider: 'bible-is',
          installState: 'installed',
          isDownloaded: true,
        },
        {
          id: 'npiulb',
          textPackLocalPath: 'file:///packs/npiulb.sqlite',
          installState: 'bogus',
          totalBooks: 0,
          sizeInMB: 12,
        },
        { id: 7 },
        null,
      ],
    },
  ],
  [
    'runtime inline rows',
    {
      currentTranslation: 'niv',
      translations: [
        runtimeRow,
        { ...runtimeRow, id: 'kjv' },
        { ...runtimeRow, id: 'x2', hasText: true, catalog: { ...runtimeRow.catalog, text: null } },
        { ...runtimeRow, id: 'x3', totalBooks: 0 },
        { ...runtimeRow, id: 'x4', sizeInMB: -1 },
        { ...runtimeRow, id: 'x5', installState: 'installed', textPackLocalPath: '' },
        { ...runtimeRow, id: 'x6', description: '   ' },
        { ...runtimeRow, id: 'x7', catalog: { ...runtimeRow.catalog, updatedAt: 'invalid' } },
        ...audioCatalogs.map((audio, index) => ({
          ...runtimeRow,
          id: `audio-${index}`,
          hasText: false,
          catalog: { ...runtimeRow.catalog, text: undefined, audio },
        })),
      ],
    },
  ],
  ['el audio-only current', { currentTranslation: 'el-persistence', translations: [elRow] }],
  [
    'legacy el blank timestamp',
    { currentTranslation: 'el-persistence', translations: [legacyElRow] },
  ],
  [
    'legacy el lookalikes',
    {
      translations: [
        { ...legacyElRow, id: 'unrelated' },
        { ...legacyElRow, id: 'lqabc', totalBooks: 66 },
        { ...legacyElRow, id: 'lqdef', catalog: { ...legacyElRow.catalog, version: 'other' } },
        { ...elRow, id: 'el-bad', totalBooks: 0.5 },
        { ...elRow, id: 'el-text', hasText: true },
      ],
    },
  ],
  [
    'text pack verse counts',
    {
      translations: [
        { id: 'bsb', catalog: { ...runtimeRow.catalog, text: { ...textCatalog, verseCount: 0 } } },
        { id: 'web', catalog: { ...runtimeRow.catalog, text: { ...textCatalog, format: 'zip' } } },
        {
          id: 'kjv',
          catalog: { ...runtimeRow.catalog, text: { ...textCatalog, verseCount: 1.5 } },
        },
      ],
    },
  ],
  [
    'download job variants',
    {
      translations: ['bsb', 'web', 'kjv', 'asv', 'bbe'].map((id, index) => ({
        id,
        activeDownloadJob: [
          { ...runtimeRow.activeDownloadJob, state: 'queued', progress: -5 },
          { ...runtimeRow.activeDownloadJob, state: 'reattaching', kind: 'audio-book' },
          { ...runtimeRow.activeDownloadJob, state: 'cancelled', kind: 'nope' },
          { ...runtimeRow.activeDownloadJob, id: ' ', state: 'completed' },
          { ...runtimeRow.activeDownloadJob, startedAt: Number.NaN, state: 'failed' },
        ][index],
      })),
    },
  ],
  ['delta rows without snapshot', { translations: [deltaRow, { ...deltaRow, id: 'bare' }] }],
  [
    'delta rows keeping local content',
    {
      currentTranslation: 'local',
      translations: [
        {
          id: 'local',
          source: 'runtime',
          textPackLocalPath: 'file:///x.sqlite',
          isDownloaded: true,
        },
        { id: 'audio-local', source: 'runtime', downloadedAudioBooks: ['PSA'], installState: 'x' },
        { id: 'ghost', source: 'runtime', installState: 'installed' },
        { id: 'bsb', source: 'runtime', textPackLocalPath: 'file:///bsb.sqlite' },
      ],
    },
  ],
];

export const SANITIZER_IDENTITY_CASES: readonly SanitizerIdentityCase[] = [
  ...bibleStates.map(([name, value]) => ({
    name: `bible: ${name}`,
    run: (api: SanitizerApi) => api.sanitizePersistedBibleState(value),
  })),
  ...bibleStates.slice(-2).map(([name, value]) => ({
    name: `bible with snapshot: ${name}`,
    run: (api: SanitizerApi) => {
      const entries = api.sanitizeRuntimeCatalogSnapshotEntries([
        snapshotEntry,
        { ...snapshotEntry, id: 'local', hasAudio: false, catalog: undefined },
      ]);
      return api.sanitizePersistedBibleState(value, new Map(entries.map((e) => [e.id, e])));
    },
  })),
  { name: 'bible: defaults', run: (api) => api.getDefaultBibleTranslations() },
  ...[
    ...CORRUPT_ROOTS,
    [
      'mixed entries',
      [
        snapshotEntry,
        { ...snapshotEntry, name: 'Duplicate' },
        { ...snapshotEntry, id: 'bsb' },
        { ...snapshotEntry, id: 'neg', totalBooks: -1 },
        { ...snapshotEntry, id: 'frac', totalBooks: 1.5 },
        { ...snapshotEntry, id: 'gran', audioGranularity: 'word' },
        { ...snapshotEntry, id: 'nocat', catalog: { version: 'x' }, audioProvider: 'bogus' },
        null,
      ],
    ] as const,
  ].map(([name, value]) => ({
    name: `snapshot entries: ${name}`,
    run: (api: SanitizerApi) => api.sanitizeRuntimeCatalogSnapshotEntries(value),
  })),
  {
    name: 'snapshot guard verdicts',
    run: (api) =>
      [
        snapshotEntry,
        { ...snapshotEntry, description: 'd', copyright: 'c' },
        { ...snapshotEntry, description: 'd', copyright: 'c', catalog: undefined },
        { ...snapshotEntry, description: 'd', copyright: 'c', catalog: { version: 3 } },
        { ...snapshotEntry, description: 'd', copyright: 'c', id: '' },
        [],
        null,
      ].map((value) => api.isRuntimeCatalogSnapshotEntry(value)),
  },
  ...[
    ...CORRUPT_ROOTS,
    ['rows', [runtimeRow, legacyElRow, { ...runtimeRow, source: 'bundled' }, deltaRow]] as const,
  ].map(([name, value]) => ({
    name: `legacy runtime rows: ${name}`,
    run: (api: SanitizerApi) => api.sanitizeLegacyPersistedRuntimeTranslations(value),
  })),
  ...[
    ...CORRUPT_ROOTS,
    [
      'normalizes preferences',
      {
        preferences: {
          fontSize: 'huge',
          theme: 'midnight',
          appearancePalette: 'el-blue-brand',
          language: 'xx',
          countryCode: 'np',
          countryName: '',
          contentLanguageCode: 'npi',
          contentLanguageName: 'Nepali',
          contentLanguageNativeName: 7,
          chapterFeedbackName: '  Ram  ',
          chapterFeedbackRole: ' ',
          onboardingCompleted: 'true',
          chapterFeedbackEnabled: true,
          hidePlayButtonFromReadingTab: true,
          notificationsEnabled: true,
          reminderTime: '7:30',
        },
        preferencesUpdatedAt: '',
        preferencesSyncBase: { language: 'es', fontSize: 'large', reminderTime: '07:30' },
        preferenceFieldStamps: {
          language: '2026-09-01T00:00:00.000Z',
          fontSize: 'yesterday',
          unknownField: '2026-09-01T00:00:00.000Z',
          theme: 12,
        },
        user: { id: 'u1' },
        isAuthenticated: true,
      },
    ] as const,
    [
      'keeps valid preferences',
      {
        preferences: {
          fontSize: 'small',
          theme: 'dark',
          appearancePalette: 'nope',
          language: 'ne',
          countryCode: 'USA',
          reminderTime: '21:05',
        },
        preferencesUpdatedAt: '2026-09-02T00:00:00.000Z',
        preferencesSyncBase: 'bad',
        preferenceFieldStamps: [],
      },
    ] as const,
  ].map(([name, value]) => ({
    name: `auth: ${name}`,
    run: (api: SanitizerApi) => api.sanitizePersistedAuthState(value),
  })),
  { name: 'auth: defaults', run: (api) => api.defaultAuthPreferences },
  {
    name: 'auth: user preferences and stamps directly',
    run: (api) => [
      api.sanitizeUserPreferences(null),
      api.sanitizeUserPreferences({ theme: 'low-light', language: 'zh' }),
      api.sanitizePreferenceFieldStamps({ reminderTime: '2026-09-01', language: 'Tue' }),
      api.sanitizePreferenceFieldStamps('x'),
    ],
  },
  ...[
    ...CORRUPT_ROOTS,
    [
      'mixed ledger',
      {
        chaptersRead: {
          GEN_1: 10,
          GEN_0: 10,
          NOPE_1: 5,
          '1CO_2': 3,
          _3: 1,
          JHN_3: -1,
          PSA_23: Number.POSITIVE_INFINITY,
          REV_1x: 4,
        },
        chaptersListened: [1, 2],
        listeningMsByDate: { '2026-09-01': 1000, '2026-9-1': 5, '2026-09-02': 0, junk: 3 },
        streakDays: 4.8,
        lastReadDate: '2026-09-01',
      },
    ] as const,
    ['bad scalars', { streakDays: -1, lastReadDate: '', chaptersRead: 'x' }] as const,
  ].map(([name, value]) => ({
    name: `progress: ${name}`,
    run: (api: SanitizerApi) => api.sanitizePersistedProgressState(value),
  })),
  ...[
    ...CORRUPT_ROOTS,
    [
      'mixed queue',
      {
        playbackRate: 1.25,
        autoAdvanceChapter: false,
        repeatMode: 'chapter',
        sleepTimerMinutes: 15,
        backgroundMusicChoice: 'bogus',
        queue: [
          { translationId: ' BSB ', bookId: 'JHN', chapter: 3, addedAt: 1 },
          { translationId: 'niv', bookId: 'JHN', chapter: 3, addedAt: 1 },
          { translationId: 'web', bookId: 'XXX', chapter: 3, addedAt: 1 },
          { translationId: 'web', bookId: 'MAT', chapter: 0, addedAt: 1 },
          { translationId: 'web', bookId: 'MAT', chapter: 5, addedAt: Number.NaN },
          'junk',
        ],
        queueIndex: 1,
        lastPlayedTranslationId: 'KJV',
        lastPlayedBookId: 'PSA',
        lastPlayedChapter: 23,
        lastPosition: 12.5,
      },
    ] as const,
    [
      'out of range scalars',
      {
        playbackRate: 3,
        autoAdvanceChapter: 'yes',
        repeatMode: 'forever',
        sleepTimerMinutes: 7,
        queue: 'x',
        queueIndex: 0,
        lastPlayedChapter: 1.5,
        lastPosition: -3,
      },
    ] as const,
    ['index past empty queue', { queue: [], queueIndex: 1, sleepTimerMinutes: null }] as const,
  ].map(([name, value]) => ({
    name: `audio: ${name}`,
    run: (api: SanitizerApi) => api.sanitizePersistedAudioState(value),
  })),
  ...[
    ...CORRUPT_ROOTS,
    [
      'mixed library',
      {
        favorites: [
          { id: 'f1', bookId: 'JHN', chapter: 3, addedAt: 1 },
          { id: 'f2', bookId: 'XXX', chapter: 3, addedAt: 1 },
          { id: 'f3', bookId: 'JHN', chapter: 0, addedAt: 1 },
          { id: 4, bookId: 'JHN', chapter: 3, addedAt: 1 },
          null,
        ],
        playlists: [
          {
            id: 'p1',
            title: 'Morning',
            createdAt: 5,
            updatedAt: 6,
            entries: [
              { id: 'e1', bookId: 'PSA', chapter: 23, addedAt: 1 },
              { id: 'e2', bookId: 'PSA', chapter: 23, addedAt: 'x' },
            ],
          },
          { title: '  ', createdAt: Number.NaN, entries: 'x' },
          'junk',
        ],
        history: [
          { id: 'h1', bookId: 'GEN', chapter: 1, listenedAt: 9, progress: 0.5 },
          { id: 'h2', bookId: 'GEN', chapter: 1, listenedAt: 9 },
        ],
      },
    ] as const,
  ].map(([name, value]) => ({
    name: `library: ${name}`,
    run: (api: SanitizerApi) => api.sanitizePersistedLibraryState(value),
  })),
];
