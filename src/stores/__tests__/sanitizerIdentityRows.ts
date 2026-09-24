/** Persisted rows the sanitizer identity corpus is built from (see sanitizerIdentityCorpus.ts). */

export const CORRUPT_ROOTS: readonly [string, unknown][] = [
  ['undefined', undefined],
  ['null', null],
  ['string', 'corrupt'],
  ['number', 42],
  ['NaN', Number.NaN],
  ['array', [1, 'two', null]],
  ['empty object', {}],
];

export const textCatalog = {
  format: 'sqlite',
  version: '2026.03.21',
  downloadUrl: 'https://cdn.example.com/niv.sqlite',
  sha256: 'sha256-text',
  verseCount: 31102,
  signature: 'sig-text',
};

export const runtimeRow = {
  id: 'NIV',
  name: 'New International Version',
  abbreviation: 'NIV',
  language: 'English',
  description: 'Runtime translation from backend catalog',
  copyright: 'Example License',
  isDownloaded: true,
  downloadedBooks: ['GEN', 'NOPE', 7],
  downloadedAudioBooks: ['MAT', 'INVALID'],
  totalBooks: 66,
  sizeInMB: 5.2,
  hasText: true,
  hasAudio: true,
  audioGranularity: 'chapter',
  source: 'runtime',
  installState: 'installed',
  textPackLocalPath: 'file:///packs/niv.sqlite',
  activeTextPackVersion: '',
  pendingTextPackVersion: '2026.04.01',
  lastInstallError: 'disk full',
  activeDownloadJob: {
    id: 'job-1',
    kind: 'text-pack',
    state: 'running',
    progress: 140,
    startedAt: 1,
    updatedAt: 2,
    bytesDownloaded: 10,
    bytesTotal: Number.POSITIVE_INFINITY,
    error: '',
  },
  catalog: {
    version: '2026.03.21',
    updatedAt: '2026-03-21T10:00:00.000Z',
    minimumAppVersion: '1.0.8',
    text: textCatalog,
    audio: {
      strategy: 'stream-template',
      baseUrl: 'http://cdn.example.com/audio/niv',
      chapterPathTemplate: '{bookId}/{chapter}.mp3',
      fileExtension: 'mp3',
    },
    timing: {
      strategy: 'stream-template',
      baseUrl: 'https://cdn.example.com/timestamps/niv',
      chapterPathTemplate: '{bookId}/{chapter}.json',
      fileExtension: 'json',
      mimeType: 'application/json',
    },
  },
};

export const elRow = {
  id: 'el-persistence',
  name: 'Persistence Audio',
  abbreviation: 'PA',
  language: 'English',
  description: 'Every Language audio-only entry',
  copyright: 'CC0-1.0',
  isDownloaded: false,
  downloadedBooks: [],
  downloadedAudioBooks: ['GEN', 'JHN'],
  totalBooks: 0,
  sizeInMB: 0,
  hasText: false,
  hasAudio: true,
  audioGranularity: 'chapter',
  source: 'runtime',
  installState: 'remote-only',
  catalog: {
    version: 'v1',
    updatedAt: '2026-09-05T00:00:00.000Z',
    audio: {
      strategy: 'el-manifest',
      manifestUrl: '/manifest.json',
      audioVersion: 'v1',
      catalogBaseUrl: 'http://media.example.com',
      fileExtension: 'mp3',
    },
  },
};

export const legacyElRow = { ...elRow, catalog: { ...elRow.catalog, updatedAt: '' } };

export const audioCatalogs: readonly unknown[] = [
  { strategy: 'provider', provider: 'bible-is', fileExtension: 'mp3', mimeType: 'audio/mpeg' },
  { strategy: 'provider', provider: 'unknown' },
  { strategy: 'stream-template', baseUrl: '  ', chapterPathTemplate: 'x' },
  { strategy: 'audio-pack', downloadUrl: 'packs/niv-audio.zip', sha256: ' abc ', signature: 's' },
  { strategy: 'audio-pack', downloadUrl: 'https://cdn.example.com/a.zip' },
  { ...elRow.catalog.audio, catalogBaseUrl: 'ftp://invalid' },
  { ...elRow.catalog.audio, manifestUrl: '' },
  { strategy: 'bogus' },
  'not-an-object',
];

export const snapshotEntry = {
  id: 'NIV',
  name: 'New International Version',
  abbreviation: 'NIV',
  language: 'English',
  description: '',
  copyright: 7,
  totalBooks: 66,
  sizeInMB: 5.2,
  hasText: true,
  hasAudio: true,
  audioGranularity: 'chapter',
  audioProvider: 'ebible-webbe',
  audioFilesetId: 'NIVDA',
  catalog: runtimeRow.catalog,
};

export const deltaRow = {
  id: 'niv',
  source: 'runtime',
  isDownloaded: true,
  downloadedBooks: ['GEN'],
  downloadedAudioBooks: ['JHN'],
  installState: 'installed',
  activeTextPackVersion: '2026.03.20',
};
