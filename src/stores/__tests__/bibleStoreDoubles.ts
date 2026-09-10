/**
 * Recording doubles for every native-backed collaborator `bibleStore.ts` reaches.
 *
 * The store itself is loaded through the real loader; only the modules that touch
 * SQLite, the file system, the network or native audio are replaced. Each double
 * records what the store asked for and exposes mutable script points so a single
 * mock configuration can drive every scenario in a file (ESM caches modules, so
 * one configuration per test file is the rule — see docs/testing.md).
 *
 * Not a test file: `scripts/run-workspace-tests.ts` only picks up `*.test.ts`.
 */
import type { MockTracker } from 'node:test';
import { mockModule, sourcePath } from '../../testing/mockModules';
import type { BibleTranslation } from '../../types';
import type {
  AudioDownloadBookProgress,
  AudioDownloadCollectionProgress,
  AudioDownloadJobRecord,
} from '../../services/audio/audioDownloadService';

/** Thrown by scripted audio downloads to exercise the cancellation branches. */
export class FakeAudioCancellation extends Error {
  constructor(message = 'cancelled by test') {
    super(message);
    this.name = 'FakeAudioCancellation';
  }
}

export interface FileInfo {
  exists: boolean;
  size: number;
}

export interface AudioDownloadHooks {
  onStart?: (job: AudioDownloadJobRecord) => void;
  onReattach?: (job: AudioDownloadJobRecord) => void;
  onFailure?: (job: AudioDownloadJobRecord) => void;
  onComplete?: (job: AudioDownloadJobRecord) => void;
  onProgress?: (progress: AudioDownloadBookProgress) => void;
  onBookComplete?: (progress: AudioDownloadCollectionProgress) => void;
}

export interface RecordedBookDownload {
  rootUri: string;
  translationId: string;
  book: { id: string; chapters: number };
  hooks: AudioDownloadHooks;
  fileSystem: unknown;
  jobStore: unknown;
  transport: unknown;
}

export interface RecordedTranslationDownload {
  rootUri: string;
  translationId: string;
  books: Array<{ id: string; chapters: number }>;
  hooks: AudioDownloadHooks;
  fileSystem: unknown;
  jobStore: unknown;
  transport: unknown;
}

export interface RecordedTextPackDownload {
  translationId: string;
  downloadUrl: string;
  expectedSha256?: string;
  onProgress?: (progress: {
    error?: string;
    phase: 'fetching' | 'writing' | 'indexing' | 'complete' | 'error';
    totalVerses: number;
    versesDownloaded: number;
  }) => void;
}

export const AUDIO_ROOT_URI = 'file:///audio/';

export interface BibleStoreDoubles {
  database: {
    invalidatedPaths: string[];
    invalidateError: Error | null;
    resolverRegistrations: number;
    resolver: ((translationId: string) => unknown) | null;
  };
  translations: {
    preferenceCalls: Array<Record<string, unknown>>;
    preferenceError: Error | null;
  };
  remote: {
    /** Translation ids `isRemoteAudioAvailable` reports as playable. */
    availableAudioIds: Set<string>;
    syncedTranslationIds: string[][];
  };
  timestamps: {
    syncedTranslationIds: string[][];
  };
  analytics: {
    events: Array<{ name: string; properties: Record<string, unknown> }>;
  };
  cloud: {
    calls: RecordedTextPackDownload[];
    /** Resolve with the installed pack path, or throw to fail the install. */
    run: (call: RecordedTextPackDownload) => Promise<string>;
  };
  fileSystem: {
    deleted: Array<{ path: string; options: unknown }>;
    deleteError: Error | null;
    infoError: Error | null;
    defaultInfo: FileInfo;
    files: Map<string, FileInfo>;
    infoRequests: string[];
    setFile: (path: string, info: FileInfo) => void;
  };
  audio: {
    jobs: AudioDownloadJobRecord[];
    jobStoreOptions: unknown[];
    listJobsCalls: number;
    removedJobIds: string[];
    removeJobError: Error | null;
    transportCreations: number;
    transportError: Error | null;
    supportsReattach: boolean;
    supportsCancel: boolean;
    reattachedJobIds: string[];
    reattachError: Error | null;
    cancelledJobIds: string[];
    cancelJobError: Error | null;
    cancellationRequests: string[];
    ensureRunningCalls: number;
    bookDownloads: RecordedBookDownload[];
    translationDownloads: RecordedTranslationDownload[];
    runBookDownload: (call: RecordedBookDownload) => Promise<void>;
    runTranslationDownload: (
      call: RecordedTranslationDownload
    ) => Promise<{ downloadedBookIds: string[] }>;
  };
  /** Clear every recording and restore the default scripts. */
  reset: () => void;
}

export function installBibleStoreDoubles(mocker: MockTracker): BibleStoreDoubles {
  const doubles: BibleStoreDoubles = {
    database: {
      invalidatedPaths: [],
      invalidateError: null,
      resolverRegistrations: 0,
      resolver: null,
    },
    translations: { preferenceCalls: [], preferenceError: null },
    remote: { availableAudioIds: new Set<string>(), syncedTranslationIds: [] },
    timestamps: { syncedTranslationIds: [] },
    analytics: { events: [] },
    cloud: {
      calls: [],
      run: async (call) => `file:///packs/${call.translationId}.db`,
    },
    fileSystem: {
      deleted: [],
      deleteError: null,
      infoError: null,
      defaultInfo: { exists: true, size: 4096 },
      files: new Map<string, FileInfo>(),
      infoRequests: [],
      setFile: (path, info) => {
        doubles.fileSystem.files.set(path, info);
      },
    },
    audio: {
      jobs: [],
      jobStoreOptions: [],
      listJobsCalls: 0,
      removedJobIds: [],
      removeJobError: null,
      transportCreations: 0,
      transportError: null,
      supportsReattach: true,
      supportsCancel: true,
      reattachedJobIds: [],
      reattachError: null,
      cancelledJobIds: [],
      cancelJobError: null,
      cancellationRequests: [],
      ensureRunningCalls: 0,
      bookDownloads: [],
      translationDownloads: [],
      runBookDownload: async () => {},
      runTranslationDownload: async (call) => ({
        downloadedBookIds: call.books.map((book) => book.id),
      }),
    },
    reset: () => {
      doubles.database.invalidatedPaths.length = 0;
      doubles.database.invalidateError = null;
      doubles.translations.preferenceCalls.length = 0;
      doubles.translations.preferenceError = null;
      doubles.remote.availableAudioIds.clear();
      doubles.remote.syncedTranslationIds.length = 0;
      doubles.timestamps.syncedTranslationIds.length = 0;
      doubles.analytics.events.length = 0;
      doubles.cloud.calls.length = 0;
      doubles.cloud.run = async (call) => `file:///packs/${call.translationId}.db`;
      doubles.fileSystem.deleted.length = 0;
      doubles.fileSystem.deleteError = null;
      doubles.fileSystem.infoError = null;
      doubles.fileSystem.defaultInfo = { exists: true, size: 4096 };
      doubles.fileSystem.files.clear();
      doubles.fileSystem.infoRequests.length = 0;
      doubles.audio.jobs.length = 0;
      doubles.audio.jobStoreOptions.length = 0;
      doubles.audio.listJobsCalls = 0;
      doubles.audio.removedJobIds.length = 0;
      doubles.audio.removeJobError = null;
      doubles.audio.transportCreations = 0;
      doubles.audio.transportError = null;
      doubles.audio.supportsReattach = true;
      doubles.audio.supportsCancel = true;
      doubles.audio.reattachedJobIds.length = 0;
      doubles.audio.reattachError = null;
      doubles.audio.cancelledJobIds.length = 0;
      doubles.audio.cancelJobError = null;
      doubles.audio.cancellationRequests.length = 0;
      doubles.audio.ensureRunningCalls = 0;
      doubles.audio.bookDownloads.length = 0;
      doubles.audio.translationDownloads.length = 0;
      doubles.audio.runBookDownload = async () => {};
      doubles.audio.runTranslationDownload = async (call) => ({
        downloadedBookIds: call.books.map((book) => book.id),
      });
    },
  };

  mockModule(mocker, sourcePath('services/bible/bibleDatabase.ts'), {
    DEFAULT_MINIMUM_READY_VERSE_COUNT: 120000,
    invalidateInstalledBibleDatabaseAtPath: async (localPath: string) => {
      doubles.database.invalidatedPaths.push(localPath);
      if (doubles.database.invalidateError) {
        throw doubles.database.invalidateError;
      }
    },
    setBibleDatabaseSourceResolver: (resolver: ((id: string) => unknown) | null) => {
      doubles.database.resolverRegistrations += 1;
      doubles.database.resolver = resolver;
    },
  });

  mockModule(mocker, sourcePath('services/translations/index.ts'), {
    setUserTranslationPreferences: async (preferences: Record<string, unknown>) => {
      doubles.translations.preferenceCalls.push(preferences);
      if (doubles.translations.preferenceError) {
        throw doubles.translations.preferenceError;
      }
    },
  });

  mockModule(mocker, sourcePath('services/audio/audioRemote.ts'), {
    isRemoteAudioAvailable: (translationId: string) =>
      doubles.remote.availableAudioIds.has(translationId),
    syncRemoteAudioMetadataResolverWithTranslations: (translations: BibleTranslation[]) => {
      doubles.remote.syncedTranslationIds.push(translations.map((translation) => translation.id));
    },
    fetchRemoteChapterAudio: async () => null,
  });

  mockModule(mocker, sourcePath('services/bible/verseTimestamps.ts'), {
    syncVerseTimestampMetadataResolverWithTranslations: (translations: BibleTranslation[]) => {
      doubles.timestamps.syncedTranslationIds.push(
        translations.map((translation) => translation.id)
      );
    },
  });

  mockModule(mocker, sourcePath('services/analytics/anonymousUsageAnalytics.ts'), {
    trackAnonymousUsageEvent: (name: string, properties: Record<string, unknown>) => {
      doubles.analytics.events.push({ name, properties });
    },
  });

  mockModule(mocker, sourcePath('services/bible/cloudTranslationService.ts'), {
    downloadCatalogTextPack: async (call: RecordedTextPackDownload) => {
      doubles.cloud.calls.push(call);
      return doubles.cloud.run(call);
    },
  });

  mockModule(mocker, 'expo-file-system/legacy', {
    deleteAsync: async (path: string, options: unknown) => {
      doubles.fileSystem.deleted.push({ path, options });
      if (doubles.fileSystem.deleteError) {
        throw doubles.fileSystem.deleteError;
      }
    },
    getInfoAsync: async (path: string) => {
      doubles.fileSystem.infoRequests.push(path);
      if (doubles.fileSystem.infoError) {
        throw doubles.fileSystem.infoError;
      }
      return doubles.fileSystem.files.get(path) ?? doubles.fileSystem.defaultInfo;
    },
  });

  const jobStore = {
    listJobs: async () => {
      doubles.audio.listJobsCalls += 1;
      return doubles.audio.jobs.slice();
    },
    removeJob: async (jobId: string) => {
      doubles.audio.removedJobIds.push(jobId);
      if (doubles.audio.removeJobError) {
        throw doubles.audio.removeJobError;
      }
    },
  };

  const fileSystemAdapter = { __adapter: 'audio-file-system' };

  mockModule(mocker, sourcePath('services/audio/audioDownloadService.ts'), {
    createAudioDownloadJobStore: async (options: unknown) => {
      doubles.audio.jobStoreOptions.push(options);
      return jobStore;
    },
    downloadAudioBook: async (call: RecordedBookDownload) => {
      doubles.audio.bookDownloads.push(call);
      return doubles.audio.runBookDownload(call);
    },
    downloadAudioTranslation: async (call: RecordedTranslationDownload) => {
      doubles.audio.translationDownloads.push(call);
      return doubles.audio.runTranslationDownload(call);
    },
    isAudioDownloadCancellation: (error: unknown) => error instanceof FakeAudioCancellation,
    requestAudioDownloadCancellation: (jobId: string) => {
      doubles.audio.cancellationRequests.push(jobId);
    },
  });

  mockModule(mocker, sourcePath('services/audio/audioDownloadStorage.ts'), {
    AUDIO_DOWNLOAD_ROOT_URI: AUDIO_ROOT_URI,
    expoAudioFileSystemAdapter: fileSystemAdapter,
    createBackgroundAudioDownloadTransport: async () => {
      doubles.audio.transportCreations += 1;
      if (doubles.audio.transportError) {
        throw doubles.audio.transportError;
      }
      return {
        reattachJob: doubles.audio.supportsReattach
          ? async (jobId: string) => {
              doubles.audio.reattachedJobIds.push(jobId);
              if (doubles.audio.reattachError) {
                throw doubles.audio.reattachError;
              }
            }
          : undefined,
        cancelJob: doubles.audio.supportsCancel
          ? async (jobId: string) => {
              doubles.audio.cancelledJobIds.push(jobId);
              if (doubles.audio.cancelJobError) {
                throw doubles.audio.cancelJobError;
              }
            }
          : undefined,
      };
    },
    ensureBackgroundAudioDownloadsRunning: async () => {
      doubles.audio.ensureRunningCalls += 1;
    },
  });

  return doubles;
}

/**
 * Let the store's fire-and-forget dynamic imports (`void import(...).then(...)`)
 * and any chained promises settle. Macrotask ticks, never wall-clock sleeps.
 */
export async function flushAsyncWork(ticks = 4): Promise<void> {
  for (let index = 0; index < ticks; index += 1) {
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
}

let runtimeTranslationCounter = 0;

/** A catalog-complete runtime (cloud) translation, downloadable by default. */
export function makeRuntimeTranslation(
  overrides: Partial<BibleTranslation> = {}
): BibleTranslation {
  runtimeTranslationCounter += 1;
  const id = overrides.id ?? `rt${runtimeTranslationCounter}`;

  return {
    id,
    name: `Runtime Translation ${id}`,
    abbreviation: id.toUpperCase(),
    language: 'Spanish',
    description: 'A cloud translation',
    copyright: 'Public Domain',
    isDownloaded: false,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    totalBooks: 66,
    sizeInMB: 4.5,
    hasText: true,
    hasAudio: false,
    audioGranularity: 'none',
    source: 'runtime',
    installState: 'remote-only',
    activeTextPackVersion: null,
    pendingTextPackVersion: null,
    pendingTextPackLocalPath: null,
    textPackLocalPath: null,
    rollbackTextPackVersion: null,
    rollbackTextPackLocalPath: null,
    lastInstallError: null,
    activeDownloadJob: null,
    catalog: {
      version: '3',
      updatedAt: '2026-01-01T00:00:00.000Z',
      text: {
        format: 'sqlite',
        version: '3',
        downloadUrl: `https://media.example/${id}.db`,
        sha256: 'a'.repeat(64),
      },
    },
    ...overrides,
  };
}

export function makeAudioJob(
  overrides: Partial<AudioDownloadJobRecord> = {}
): AudioDownloadJobRecord {
  return {
    id: 'job-1',
    translationId: 'bsb',
    scope: 'book',
    bookId: 'GEN',
    status: 'downloading',
    createdAt: 1_000,
    updatedAt: 2_000,
    attemptCount: 1,
    ...overrides,
  };
}
