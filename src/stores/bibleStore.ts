import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './mmkvStorage';
// Direct module imports, not the '../constants' barrel: the barrel re-exports bookIcons, which
// drags a ~298KB vector JSON into the store's startup graph. (P3)
import { bibleBooks, getBookById } from '../constants/books';
import { config } from '../constants/config';
import type {
  Verse,
  BibleTranslation,
  TranslationDownloadJob,
  TranslationDownloadProgress,
} from '../types';
import { getAudioAvailability } from '../services/audio/audioAvailability';
import {
  isRemoteAudioAvailable,
  syncRemoteAudioMetadataResolverWithTranslations,
} from '../services/audio/audioRemote';
import type {
  AudioDownloadBookProgress,
  AudioDownloadCollectionProgress,
  AudioDownloadJobRecord,
} from '../services/audio/audioDownloadService';
import {
  setBibleTranslationReadinessResolver,
  setBibleDatabaseSourceResolver,
} from '../services/bible/bibleDatabaseSources';
import {
  activateTranslationPackCandidate,
  buildInstalledBibleDatabaseSource,
  failTranslationPackCandidate,
  rollbackTranslationPack,
  stageTranslationPackCandidate,
} from '../services/bible/bibleDataModel';
import {
  getDefaultBibleTranslations,
  sanitizePersistedBibleState,
} from './persistedStateSanitizers';
import {
  BIBLE_PERSISTED_STATE_VERSION,
  migrateBiblePersistedState,
  readRuntimeCatalogSnapshot,
  toPersistedTranslation,
  writeRuntimeCatalogSnapshot,
} from './bibleTranslationPersistence';
import {
  mergeRuntimeCatalogTranslations,
  mergeDownloadedAudioBook,
  reconcileMissingRuntimeTranslationPacks,
  hasTranslationDownloadData,
  resetTranslationDownloadState,
  settleInterruptedInstallState,
} from './bibleStoreModel';
import {
  readTextPackInstallJournal,
  writeTextPackInstallJournal,
} from '../services/bible/textPackInstallJournal';
import {
  removeTextPackDeletion,
  removeTextPackInstall,
  upsertTextPackDeletion,
  upsertTextPackInstall,
} from '../services/bible/textPackInstallJournalModel';
import type { TextPackInstallJournal } from '../services/bible/textPackInstallJournalModel';

// The translations service barrel also evaluates the runtime catalog
// bootstrap and the locale search engine (Fuse). bibleStore sits on the
// navigator's static graph, and its only use of the service is this
// fire-and-forget preference save, so load the barrel on first use instead of
// on every cold start (the same pattern authStore uses for Supabase).
function saveTranslationPreference(translationId: string, chosenAt: string): void {
  try {
    const { setUserTranslationPreferences } =
      require('../services/translations') as typeof import('../services/translations');
    setUserTranslationPreferences({ primary: translationId, chosenAt }).catch(() => {});
  } catch {
    // Preference sync is best-effort; a failed load must not undo the local switch.
  }
}

// bibleDatabase brings expo-sqlite and the SQLite schema code with it, and this
// store is on the path to Home. The store only needs the database when a text
// pack is installed, repaired or removed, so it is required then. The resolvers
// registered at the bottom of this file live in bibleDatabaseSources, which has
// no SQLite dependency, so they are still in place before the first read.
function invalidateInstalledBibleDatabaseAtPath(localPath: string): Promise<void> {
  const bibleDatabase =
    require('../services/bible/bibleDatabase') as typeof import('../services/bible/bibleDatabase');
  return bibleDatabase.invalidateInstalledBibleDatabaseAtPath(localPath);
}

// Packs are published without a full-text index. Build it inside the pack in the background so
// word search works offline; until it finishes, search answers with a substring scan.
function scheduleTextPackSearchIndexBuild(translationId: string): void {
  try {
    const bibleDatabase =
      require('../services/bible/bibleDatabase') as typeof import('../services/bible/bibleDatabase');
    void bibleDatabase.scheduleTextPackSearchIndexBuild(translationId);
  } catch (error) {
    console.warn('[Bible] Could not start the text pack search index build:', translationId, error);
  }
}

type AudioDownloadModules = typeof import('../services/audio/audioDownloadService') &
  typeof import('../services/audio/audioDownloadStorage') &
  typeof import('../services/audio/audioRemote');

async function loadAudioDownloadModules(): Promise<AudioDownloadModules> {
  const [downloadService, downloadStorage, audioRemote] = await Promise.all([
    import('../services/audio/audioDownloadService'),
    import('../services/audio/audioDownloadStorage'),
    import('../services/audio/audioRemote'),
  ]);

  return {
    ...downloadService,
    ...downloadStorage,
    ...audioRemote,
  };
}

async function deleteFileSystemPath(localPath: string): Promise<void> {
  const FileSystem = await import('expo-file-system/legacy');
  await FileSystem.deleteAsync(localPath, { idempotent: true });
}

let textDownloadOperationSequence = 0;
const activeTextDownloadOperationIds = new Map<string, string>();
const activeTextDownloadPromises = new Map<string, Promise<'installed' | 'cancelled'>>();
const pendingTextCancellationIds = new Set<string>();
const textPackMutationTails = new Map<string, Promise<void>>();
const textPackRecoveryReadinessBypass = new Set<string>();

async function readRegisteredTextPackRepresentative(
  translationId: string,
  localPath: string,
  representative: { bookId: string; chapter: number },
  options: { invalidate?: boolean } = {}
): Promise<void> {
  textPackRecoveryReadinessBypass.add(translationId);
  try {
    const { getChapter, invalidateInstalledBibleDatabaseAtPath } =
      await import('../services/bible/bibleDatabase');
    if (options.invalidate !== false) {
      await invalidateInstalledBibleDatabaseAtPath(localPath);
    }
    const verses = await getChapter(translationId, representative.bookId, representative.chapter);
    if (verses.length === 0) {
      throw new Error('Recovered translation returned no readable representative chapter.');
    }
  } finally {
    textPackRecoveryReadinessBypass.delete(translationId);
  }
}

async function acquireTextPackMutationLock(translationId: string): Promise<() => void> {
  const previous = textPackMutationTails.get(translationId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  textPackMutationTails.set(translationId, tail);
  await previous;
  return () => {
    release();
    if (textPackMutationTails.get(translationId) === tail) {
      textPackMutationTails.delete(translationId);
    }
  };
}

function nextTextDownloadOperationId(translationId: string): string {
  textDownloadOperationSequence += 1;
  return `${translationId}:${textDownloadOperationSequence}`;
}

let textPackJournalOperationSequence = 0;
let textPackJournalRecovered = false;
let textPackJournalRecoveryPromise: Promise<void> | null = null;

function nextTextPackJournalOperationId(translationId: string): string {
  textPackJournalOperationSequence += 1;
  return `${translationId}:${Date.now()}:${textPackJournalOperationSequence}`;
}

function saveTextPackJournal(journal: TextPackInstallJournal): void {
  writeTextPackInstallJournal(journal);
}

async function recoverTextPackJournal(): Promise<void> {
  if (textPackJournalRecovered) {
    return;
  }
  if (textPackJournalRecoveryPromise) {
    return textPackJournalRecoveryPromise;
  }

  textPackJournalRecoveryPromise = (async () => {
    const journal = readTextPackInstallJournal();
    const completedDeletions = new Map<
      string,
      { deletionOperationId: string; installOperationId?: string }
    >();
    const completedInstalls = new Map<string, string>();
    const {
      deleteCatalogTextPackArtifacts,
      recoverInterruptedCatalogTextPack,
      validateCatalogTextPack,
    } = await import('../services/bible/cloudTranslationService');
    const translationsBeingDeleted = new Set(Object.keys(journal.deletions));

    for (const [translationId, deletion] of Object.entries(journal.deletions)) {
      const releaseTextPackMutation = await acquireTextPackMutationLock(translationId);
      try {
        useBibleStore.setState((state) => ({
          translations: state.translations.map((translation) =>
            translation.id === translationId
              ? resetTranslationDownloadState(translation)
              : translation
          ),
        }));
        await Promise.all(deletion.paths.map((path) => deleteCatalogTextPackArtifacts(path)));
        completedDeletions.set(translationId, {
          deletionOperationId: deletion.operationId,
          installOperationId: journal.installs[translationId]?.operationId,
        });
      } catch (error) {
        console.warn('[Bible] Text pack deletion recovery is pending:', translationId, error);
      } finally {
        releaseTextPackMutation();
      }
    }

    for (const [translationId, install] of Object.entries(journal.installs)) {
      if (
        translationsBeingDeleted.has(translationId) ||
        activeTextDownloadOperationIds.has(translationId)
      ) {
        continue;
      }
      const releaseTextPackMutation = await acquireTextPackMutationLock(translationId);
      const priorTranslation = useBibleStore
        .getState()
        .translations.find((translation) => translation.id === translationId);
      try {
        const recoveryResult = await recoverInterruptedCatalogTextPack({
          finalPath: install.finalPath,
          stagingPath: install.stagingPath,
          rollbackPath: install.rollbackPath,
        });
        // Nothing reached the final or rollback path (the transfer was cancelled, failed, or the
        // app was killed before activation), so there is no pack to adopt and any previous install
        // was never touched. Retire the entry; validating the missing file would fail on every
        // launch and keep every readiness check running a full recovery pass.
        if (recoveryResult === 'none') {
          completedInstalls.set(translationId, install.operationId);
          continue;
        }
        const representative = await validateCatalogTextPack(
          install.finalPath,
          install.expectedVerseCount ?? 1,
          recoveryResult === 'current' ||
            (recoveryResult === 'current-without-rollback' && install.phase === 'activating')
            ? install.expectedSha256
            : undefined,
          translationId
        );
        const recoveredVersion =
          recoveryResult === 'previous'
            ? install.previousVersion || undefined
            : recoveryResult === 'current-without-rollback' && install.phase !== 'activating'
              ? install.previousVersion || undefined
              : install.version || undefined;
        const recoveredTranslation = useBibleStore
          .getState()
          .translations.find((translation) => translation.id === translationId);
        if (recoveredTranslation) {
          useBibleStore.setState((state) => ({
            translations: state.translations.map((translation) =>
              translation.id === translationId
                ? {
                    ...translation,
                    isDownloaded: true,
                    hasText: true,
                    installState: 'installed' as const,
                    textPackLocalPath: install.finalPath,
                    activeTextPackVersion:
                      recoveredVersion || translation.activeTextPackVersion || '1',
                  }
                : translation
            ),
          }));
          await readRegisteredTextPackRepresentative(
            translationId,
            install.finalPath,
            representative
          );
          if (recoveryResult === 'current') {
            await deleteCatalogTextPackArtifacts(install.rollbackPath);
          }
        }
        completedInstalls.set(translationId, install.operationId);
      } catch (error) {
        if (priorTranslation) {
          useBibleStore.setState((state) => ({
            translations: state.translations.map((translation) =>
              translation.id === translationId ? priorTranslation : translation
            ),
          }));
        }
        console.warn('[Bible] Text pack install recovery is pending:', translationId, error);
      } finally {
        releaseTextPackMutation();
      }
    }

    // Older releases used a stable `<translationId>.db`/`.rollback` pair without a journal.
    // Discover that known location before reconcileTranslationPacks can classify the language as
    // missing. Only adopt a file after the same schema, identity, and representative-read checks
    // used for journaled installs.
    const legacyTranslations = useBibleStore
      .getState()
      .translations.filter((translation) => translation.source === 'runtime');
    for (const translation of legacyTranslations) {
      if (
        translationsBeingDeleted.has(translation.id) ||
        activeTextDownloadOperationIds.has(translation.id)
      ) {
        continue;
      }
      const releaseTextPackMutation = await acquireTextPackMutationLock(translation.id);
      const priorTranslation = translation;
      try {
        const FileSystem = await import('expo-file-system/legacy');
        const paths = (
          await import('../services/bible/cloudTranslationService')
        ).getCatalogTextPackPaths(translation.id);
        if (!paths) continue;
        const savedPathUsable = translation.textPackLocalPath
          ? await fileSystemPathIsUsableDatabase(translation.textPackLocalPath)
          : false;
        if (savedPathUsable) continue;
        const [finalInfo, rollbackInfo] = await Promise.all([
          FileSystem.getInfoAsync(paths.finalPath),
          FileSystem.getInfoAsync(paths.rollbackPath),
        ]);
        if (!finalInfo.exists && !rollbackInfo.exists) continue;
        const recoveryResult = await recoverInterruptedCatalogTextPack(paths);
        if (recoveryResult === 'none') continue;
        const representative = await validateCatalogTextPack(
          paths.finalPath,
          translation.catalog?.text?.verseCount ?? 1,
          recoveryResult === 'current' ||
            (recoveryResult === 'current-without-rollback' && translation.catalog?.text?.sha256)
            ? translation.catalog?.text?.sha256
            : undefined,
          translation.id
        );
        const recoveredVersion =
          recoveryResult === 'previous'
            ? translation.activeTextPackVersion || '1'
            : translation.catalog?.text?.version || translation.activeTextPackVersion || '1';
        useBibleStore.setState((state) => ({
          translations: state.translations.map((item) =>
            item.id === translation.id
              ? {
                  ...item,
                  isDownloaded: true,
                  hasText: true,
                  installState: 'installed' as const,
                  textPackLocalPath: paths.finalPath,
                  activeTextPackVersion: recoveredVersion,
                }
              : item
          ),
        }));
        await readRegisteredTextPackRepresentative(translation.id, paths.finalPath, representative);
        if (recoveryResult === 'current') {
          await deleteCatalogTextPackArtifacts(paths.rollbackPath);
        }
      } catch (error) {
        useBibleStore.setState((state) => ({
          translations: state.translations.map((item) =>
            item.id === translation.id ? priorTranslation : item
          ),
        }));
        console.warn('[Bible] Legacy text pack recovery is pending:', translation.id, error);
      } finally {
        releaseTextPackMutation();
      }
    }

    // Recovery can yield for filesystem and database work. Re-read before retiring entries so a
    // concurrent download/delete cannot be lost by writing the stale snapshot captured above.
    let latestJournal = readTextPackInstallJournal();
    for (const [translationId, completion] of completedDeletions) {
      if (latestJournal.deletions[translationId]?.operationId === completion.deletionOperationId) {
        latestJournal = removeTextPackDeletion(latestJournal, translationId);
        if (
          latestJournal.installs[translationId]?.operationId === completion.installOperationId ||
          (completion.installOperationId === undefined && !latestJournal.installs[translationId])
        ) {
          latestJournal = removeTextPackInstall(latestJournal, translationId);
        }
      }
    }
    for (const [translationId, operationId] of completedInstalls) {
      if (latestJournal.installs[translationId]?.operationId === operationId) {
        latestJournal = removeTextPackInstall(latestJournal, translationId);
      }
    }
    saveTextPackJournal(latestJournal);
    textPackJournalRecovered =
      Object.keys(latestJournal.installs).length === 0 &&
      Object.keys(latestJournal.deletions).length === 0;
  })().finally(() => {
    textPackJournalRecoveryPromise = null;
  });
  return textPackJournalRecoveryPromise;
}

// A pack file can exist but be a 0-byte SQLite stub left behind when getDatabase's
// installed-source open path was interrupted or ran against a missing download; treat
// that as "missing" so reconcileTranslationPacks re-triggers a real download instead of
// permanently trusting an unusable database file.
async function fileSystemPathIsUsableDatabase(localPath: string): Promise<boolean> {
  const FileSystem = await import('expo-file-system/legacy');
  const fileInfo = await FileSystem.getInfoAsync(localPath);
  return fileInfo.exists && fileInfo.size > 0;
}

// Download-completion analytics route through the unified anonymous-usage
// pipeline (P1 S3) so they land for signed-out users and pick up server-side
// geo enrichment, rather than the authenticated-only path that 401'd + fell back
// to the geo-less RPC.
function trackBibleStoreEvent(
  eventName: 'text_translation_download_completed' | 'audio_download_completed',
  properties: Record<string, unknown>
): void {
  void import('../services/analytics/anonymousUsageAnalytics')
    .then(({ trackAnonymousUsageEvent }) => {
      trackAnonymousUsageEvent(eventName, properties);
    })
    .catch(() => {});
}

// Module-eval used to call syncRemoteAudioMetadataResolverWithTranslations synchronously, adding
// a full pass over the catalog to the startup JS thread. Deferred the same way verse-timestamp
// metadata already is. (P19)
function syncRemoteAudioMetadataDeferred(translations: BibleTranslation[]): void {
  void import('../services/audio/audioRemote')
    .then(({ syncRemoteAudioMetadataResolverWithTranslations }) => {
      syncRemoteAudioMetadataResolverWithTranslations(translations);
    })
    .catch(() => {
      // Audio metadata is a best-effort enrichment; a failure here must not block startup.
    });
}

function syncVerseTimestampMetadata(translations: BibleTranslation[]): void {
  void import('../services/bible/verseTimestamps')
    .then(({ syncVerseTimestampMetadataResolverWithTranslations }) => {
      syncVerseTimestampMetadataResolverWithTranslations(translations);
    })
    .catch(() => {});
}

interface BibleState {
  currentBook: string;
  currentChapter: number;
  hasReaderHistory: boolean;
  preferredChapterLaunchMode: 'listen' | 'read';
  verses: Verse[];
  isLoading: boolean;
  error: string | null;

  // Translation state
  currentTranslation: string;
  /**
   * When the reader chose `currentTranslation` (ISO time), or the saved account stamp it
   * was adopted with. Null until a choice is made. It makes the account preference last
   * write wins: a switch made offline outlives an older saved value at the next launch.
   */
  currentTranslationChosenAt: string | null;
  preferredTranslationLanguage: string | null;
  translations: BibleTranslation[];
  downloadProgress: TranslationDownloadProgress | null;

  // Basic actions
  setCurrentBook: (bookId: string) => void;
  setCurrentChapter: (chapter: number) => void;
  setPreferredChapterLaunchMode: (mode: 'listen' | 'read') => void;
  applySyncedReadingPosition: (readingPosition: { bookId: string; chapter: number }) => void;
  setVerses: (verses: Verse[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Translation actions
  /**
   * `adopted` applies a choice already saved to the account (from another device): it
   * keeps that choice's stamp and is not uploaded back.
   */
  setCurrentTranslation: (translationId: string, adopted?: { chosenAt: string | null }) => void;
  setPreferredTranslationLanguage: (language: string | null) => void;
  applyRuntimeCatalog: (runtimeTranslations: BibleTranslation[]) => void;
  reconcileTranslationPacks: () => Promise<void>;
  recoverMissingInstalledPack: (translationId: string) => Promise<void>;
  reattachAudioDownloads: () => Promise<void>;
  resetForSignOut: () => void;
  stageTranslationPack: (
    translationId: string,
    candidate: { version: string; localPath: string }
  ) => void;
  activateTranslationPack: (translationId: string) => void;
  failTranslationPack: (translationId: string, error: string) => void;
  rollbackTranslationPackInstall: (translationId: string) => void;
  getAvailableTranslations: () => BibleTranslation[];
  getCurrentTranslationInfo: () => BibleTranslation | undefined;
  downloadTranslation: (
    translationId: string,
    bookId?: string
  ) => Promise<'installed' | 'cancelled'>;
  downloadAllBooks: (translationId: string) => Promise<void>;
  downloadAudioForBook: (translationId: string, bookId: string) => Promise<void>;
  downloadAudioForBooks: (translationId: string, bookIds: string[]) => Promise<void>;
  downloadAudioForTranslation: (translationId: string) => Promise<void>;
  cancelDownload: () => void;
  deleteTranslation: (translationId: string) => Promise<void>;
  isBookDownloaded: (translationId: string, bookId: string) => boolean;
  isAudioBookDownloaded: (translationId: string, bookId: string) => boolean;
}

function mapAudioJobStatus(
  status: AudioDownloadJobRecord['status']
): TranslationDownloadJob['state'] {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'downloading':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'failed';
  }
}

function mapAudioJobKind(scope: AudioDownloadJobRecord['scope']): TranslationDownloadJob['kind'] {
  return scope === 'translation' ? 'translation-audio' : 'audio-book';
}

function mapAudioDownloadJob(job: AudioDownloadJobRecord): TranslationDownloadJob {
  return {
    id: job.id,
    kind: mapAudioJobKind(job.scope),
    state: mapAudioJobStatus(job.status),
    progress: job.status === 'completed' ? 100 : 0,
    startedAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error,
  };
}

function mapAudioDownloadProgress(job: AudioDownloadJobRecord): TranslationDownloadProgress {
  return {
    translationId: job.translationId,
    jobId: job.id,
    bookId: job.bookId,
    progress: job.status === 'completed' ? 100 : 0,
    status:
      job.status === 'completed' ? 'completed' : job.status === 'failed' ? 'error' : 'downloading',
    error: job.error,
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function updateTranslationAudioJobState(
  translation: BibleTranslation,
  job: AudioDownloadJobRecord | null
): BibleTranslation {
  if (!job || translation.id !== job.translationId) {
    return {
      ...translation,
      activeDownloadJob: translation.activeDownloadJob ?? null,
    };
  }

  return {
    ...translation,
    activeDownloadJob: job.status === 'completed' ? null : mapAudioDownloadJob(job),
  };
}

function updateTranslationAudioJobProgress(
  translation: BibleTranslation,
  progress: number
): BibleTranslation {
  if (!translation.activeDownloadJob) {
    return translation;
  }

  return {
    ...translation,
    activeDownloadJob: {
      ...translation.activeDownloadJob,
      progress: clampPercent(progress),
      updatedAt: Date.now(),
    },
  };
}

function getLatestPersistedAudioJobByTranslation(
  jobs: AudioDownloadJobRecord[]
): Map<string, AudioDownloadJobRecord> {
  const jobsByTranslation = new Map<string, AudioDownloadJobRecord>();

  jobs.forEach((job) => {
    const existing = jobsByTranslation.get(job.translationId);
    if (!existing || job.updatedAt > existing.updatedAt) {
      jobsByTranslation.set(job.translationId, job);
    }
  });

  return jobsByTranslation;
}

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  console.log('[EB-T] bible:pre-create', Date.now());
}
export const useBibleStore = create<BibleState>()(
  persist(
    (set, get) => ({
      currentBook: 'GEN',
      currentChapter: 1,
      hasReaderHistory: false,
      preferredChapterLaunchMode: 'listen',
      verses: [],
      isLoading: false,
      error: null,
      currentTranslation: 'bsb',
      currentTranslationChosenAt: null,
      preferredTranslationLanguage: 'English',
      translations: getDefaultBibleTranslations(),
      downloadProgress: null,

      setCurrentBook: (bookId) => set({ currentBook: bookId, hasReaderHistory: true }),
      setCurrentChapter: (chapter) => set({ currentChapter: chapter, hasReaderHistory: true }),
      setPreferredChapterLaunchMode: (preferredChapterLaunchMode) =>
        set({ preferredChapterLaunchMode }),
      applySyncedReadingPosition: ({ bookId, chapter }) => {
        const { currentBook, currentChapter } = get();

        if (currentBook === bookId && currentChapter === chapter) {
          return;
        }

        set({
          currentBook: bookId,
          currentChapter: chapter,
          hasReaderHistory: true,
        });
      },
      setVerses: (verses) => set({ verses }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),

      setCurrentTranslation: (translationId, adopted) => {
        const translation = get().translations.find((t) => t.id === translationId);
        if (!translation) {
          return;
        }

        const preferredTranslationLanguage = translation.language?.trim() || null;
        const select = () => {
          const currentTranslationChosenAt = adopted ? adopted.chosenAt : new Date().toISOString();
          set({
            currentTranslation: translationId,
            currentTranslationChosenAt,
            preferredTranslationLanguage,
            error: null,
          });
          if (!adopted && currentTranslationChosenAt) {
            saveTranslationPreference(translationId, currentTranslationChosenAt);
          }
        };

        const hasInstalledTextPack = Boolean(translation.textPackLocalPath);
        const hasReadableText =
          translation.hasText && (translation.source !== 'runtime' || hasInstalledTextPack);

        if (translation.isDownloaded || hasReadableText) {
          select();
          return;
        }

        if (!translation.hasText && translation.hasAudio) {
          const availability = getAudioAvailability({
            featureEnabled: config.features.audioEnabled,
            translationHasAudio: translation.hasAudio,
            remoteAudioAvailable: isRemoteAudioAvailable(translation.id),
            downloadedAudioBooks: translation.downloadedAudioBooks,
          });

          if (availability.canPlayAudio) {
            select();
          }
        }
      },

      setPreferredTranslationLanguage: (preferredTranslationLanguage) =>
        set({
          preferredTranslationLanguage:
            typeof preferredTranslationLanguage === 'string' &&
            preferredTranslationLanguage.trim().length > 0
              ? preferredTranslationLanguage.trim()
              : null,
        }),

      applyRuntimeCatalog: (runtimeTranslations) => {
        let nextTranslationsSnapshot: BibleTranslation[] = [];

        set((state) => {
          const existingTranslationsById = new Map(
            state.translations.map((translation) => [translation.id, translation])
          );
          const nextRuntimeTranslations = runtimeTranslations
            .filter((translation) => translation.source === 'runtime')
            .map((translation) => {
              const existing = existingTranslationsById.get(translation.id);

              return {
                ...translation,
                isDownloaded: translation.isDownloaded || existing?.isDownloaded === true,
                downloadedBooks:
                  translation.downloadedBooks.length > 0
                    ? translation.downloadedBooks
                    : (existing?.downloadedBooks ?? []),
                downloadedAudioBooks:
                  translation.downloadedAudioBooks.length > 0
                    ? translation.downloadedAudioBooks
                    : (existing?.downloadedAudioBooks ?? []),
                installState: existing?.installState ?? translation.installState,
                activeTextPackVersion:
                  existing?.activeTextPackVersion ?? translation.activeTextPackVersion,
                pendingTextPackVersion:
                  existing?.pendingTextPackVersion ?? translation.pendingTextPackVersion,
                pendingTextPackLocalPath:
                  existing?.pendingTextPackLocalPath ?? translation.pendingTextPackLocalPath,
                textPackLocalPath: existing?.textPackLocalPath ?? translation.textPackLocalPath,
                rollbackTextPackVersion:
                  existing?.rollbackTextPackVersion ?? translation.rollbackTextPackVersion,
                rollbackTextPackLocalPath:
                  existing?.rollbackTextPackLocalPath ?? translation.rollbackTextPackLocalPath,
                lastInstallError: existing?.lastInstallError ?? translation.lastInstallError,
              };
            });
          const nextTranslations = mergeRuntimeCatalogTranslations(
            state.translations,
            nextRuntimeTranslations
          );
          nextTranslationsSnapshot = nextTranslations;
          const nextTranslationIds = new Set(nextTranslations.map((translation) => translation.id));

          return {
            translations: nextTranslations,
            currentTranslation: nextTranslationIds.has(state.currentTranslation)
              ? state.currentTranslation
              : 'bsb',
          };
        });

        // The only place runtime catalog metadata enters the store, and therefore the only place
        // the offline metadata cache needs refreshing. Deliberately off the download/navigation
        // hot path, and a no-op write when the catalog has not actually changed.
        writeRuntimeCatalogSnapshot(nextTranslationsSnapshot);
        syncRemoteAudioMetadataResolverWithTranslations(nextTranslationsSnapshot);
        syncVerseTimestampMetadata(nextTranslationsSnapshot);
      },

      reconcileTranslationPacks: async () => {
        await recoverTextPackJournal();
        const runtimeTranslations = get().translations.filter(
          (translation) =>
            translation.source === 'runtime' && Boolean(translation.textPackLocalPath)
        );

        if (runtimeTranslations.length === 0) {
          return;
        }

        const missingTranslationIds = new Set<string>();

        await Promise.all(
          runtimeTranslations.map(async (translation) => {
            try {
              if (!(await fileSystemPathIsUsableDatabase(translation.textPackLocalPath ?? ''))) {
                missingTranslationIds.add(translation.id);
              }
            } catch {
              missingTranslationIds.add(translation.id);
            }
          })
        );

        if (missingTranslationIds.size === 0) {
          return;
        }

        set((state) =>
          reconcileMissingRuntimeTranslationPacks(
            state.translations,
            state.currentTranslation,
            missingTranslationIds
          )
        );
      },

      // Self-heal a corrupt or vanished installed text pack detected mid-session (e.g. a
      // MissingInstalledDatabaseError thrown from getChapter after OS storage cleanup). Unlike
      // reconcileTranslationPacks — which only runs at startup and only checks size > 0 — this
      // can be dispatched from the reader's catch block to reset the translation's install state
      // and fall back to a readable translation immediately, so the reader isn't stuck on a
      // generic error until the next launch.
      recoverMissingInstalledPack: async (translationId) => {
        const translation = get().translations.find((item) => item.id === translationId);
        if (!translation || translation.source !== 'runtime') {
          return;
        }

        const localPath = translation.textPackLocalPath;
        if (localPath) {
          let closed = false;
          try {
            await invalidateInstalledBibleDatabaseAtPath(localPath);
            closed = true;
          } catch (error) {
            console.warn(
              '[Bible] Failed to invalidate missing installed pack:',
              translationId,
              error
            );
          }
          // The reset below forgets this path, so a corrupt pack (and its -wal/-shm)
          // left here would only waste space; a reinstall writes to a new path. Only
          // once its connection is closed, and a vanished pack makes this a no-op.
          if (closed) {
            try {
              const { deleteCatalogTextPackArtifacts } =
                await import('../services/bible/cloudTranslationService');
              await deleteCatalogTextPackArtifacts(localPath);
            } catch (error) {
              console.warn('[Bible] Failed to delete damaged text pack:', translationId, error);
            }
          }
        }

        set((state) =>
          reconcileMissingRuntimeTranslationPacks(
            state.translations,
            state.currentTranslation,
            new Set([translationId])
          )
        );

        const nextTranslations = get().translations;
        syncRemoteAudioMetadataResolverWithTranslations(nextTranslations);
        syncVerseTimestampMetadata(nextTranslations);
      },

      reattachAudioDownloads: async () => {
        const audio = await loadAudioDownloadModules();
        const jobStore = await audio.createAudioDownloadJobStore({
          fileSystem: audio.expoAudioFileSystemAdapter,
          rootUri: audio.AUDIO_DOWNLOAD_ROOT_URI,
        });
        const transport = await audio.createBackgroundAudioDownloadTransport();
        const jobs = await jobStore.listJobs();
        // Only reattach jobs that are actively in-flight. Failed and completed
        // jobs do not need reattachment and must not bleed into UI state as
        // if a download were running (they would cause "Loading... 0%" to persist
        // across app restarts even when no download is actually running).
        const latestJobsByTranslation = getLatestPersistedAudioJobByTranslation(
          jobs.filter((job) => job.status === 'downloading' || job.status === 'queued')
        );

        await Promise.all(
          Array.from(latestJobsByTranslation.values()).map(async (job) => {
            try {
              await transport.reattachJob?.(job.id);
            } catch (error) {
              console.warn('[Bible] Failed to reattach audio download job:', job.id, error);
            }
          })
        );

        await audio.ensureBackgroundAudioDownloadsRunning();

        const activeJobs = Array.from(latestJobsByTranslation.values());

        set((state) => ({
          translations: state.translations.map((translation) =>
            updateTranslationAudioJobState(
              translation,
              latestJobsByTranslation.get(translation.id) ?? null
            )
          ),
          downloadProgress: activeJobs[0] ? mapAudioDownloadProgress(activeJobs[0]) : null,
        }));

        // reattachJob only revives native tasks that survived the process restart; it does not
        // re-run the JS chapter orchestration loop, so chapters that never started stay
        // undownloaded, no progress events flow, and completeAudioDownloadJob is never called —
        // the UI sticks at "Loading… 0%". Re-invoke the matching download action per in-flight
        // job; the valid-file skip inside downloadAudioBook makes this idempotent (already-saved
        // chapters are skipped) so it resumes progress and completion instead of restarting.
        const availableBookIds = new Set(bibleBooks.map((book) => book.id));
        activeJobs.forEach((job) => {
          if (job.scope === 'translation') {
            void get()
              .downloadAudioForTranslation(job.translationId)
              .catch((error) => {
                console.warn('[Bible] Failed to resume audio translation download:', job.id, error);
              });
          } else if (job.bookId && availableBookIds.has(job.bookId)) {
            void get()
              .downloadAudioForBook(job.translationId, job.bookId)
              .catch((error) => {
                console.warn('[Bible] Failed to resume audio book download:', job.id, error);
              });
          }
        });
      },

      stageTranslationPack: (translationId, candidate) => {
        set((state) => ({
          translations: state.translations.map((translation) =>
            translation.id === translationId
              ? stageTranslationPackCandidate(translation, candidate)
              : translation
          ),
        }));
      },

      activateTranslationPack: (translationId) => {
        set((state) => ({
          translations: state.translations.map((translation) =>
            translation.id === translationId
              ? activateTranslationPackCandidate(translation)
              : translation
          ),
        }));
      },

      failTranslationPack: (translationId, error) => {
        set((state) => ({
          translations: state.translations.map((translation) =>
            translation.id === translationId
              ? failTranslationPackCandidate(translation, error)
              : translation
          ),
        }));
      },

      rollbackTranslationPackInstall: (translationId) => {
        set((state) => ({
          translations: state.translations.map((translation) =>
            translation.id === translationId ? rollbackTranslationPack(translation) : translation
          ),
        }));
      },

      getAvailableTranslations: () => get().translations,

      getCurrentTranslationInfo: () => {
        return get().translations.find((t) => t.id === get().currentTranslation);
      },

      downloadTranslation: async (translationId: string, _bookId?: string) => {
        const existingDownload = activeTextDownloadPromises.get(translationId);
        if (existingDownload) {
          return existingDownload;
        }
        await recoverTextPackJournal();
        const downloadStartedDuringRecovery = activeTextDownloadPromises.get(translationId);
        if (downloadStartedDuringRecovery) {
          return downloadStartedDuringRecovery;
        }
        if (activeTextDownloadOperationIds.has(translationId)) {
          return activeTextDownloadPromises.get(translationId) ?? 'cancelled';
        }
        const releaseTextPackMutation = await acquireTextPackMutationLock(translationId);
        const downloadStartedWhileWaiting = activeTextDownloadPromises.get(translationId);
        if (downloadStartedWhileWaiting) {
          releaseTextPackMutation();
          return downloadStartedWhileWaiting;
        }
        const translation = get().translations.find((t) => t.id === translationId);
        const hasInstalledTextPack = Boolean(translation?.textPackLocalPath);
        const isBundledSeed = Boolean(
          translation?.hasText && translation?.source !== 'runtime' && !hasInstalledTextPack
        );

        // Bundled seeded translations are already present in the app's bundled database.
        // Mark them available, but do not pretend runtime/cloud translations are installed
        // unless a local pack path exists.
        if (translation && isBundledSeed) {
          set((state) => ({
            error: null,
            translations: state.translations.map((t) =>
              t.id === translationId
                ? { ...t, isDownloaded: true, installState: 'seeded' as const }
                : t
            ),
          }));
          releaseTextPackMutation();
          return 'installed';
        }

        // Already downloaded and installed — no-op
        if (translation?.isDownloaded && translation?.textPackLocalPath) {
          releaseTextPackMutation();
          return 'installed';
        }

        // Download and install the catalog text pack (a prebuilt SQLite file). The app no
        // longer reads the Supabase bible_verses table.
        let isTextPackDownloadCancelled: ((error: unknown) => boolean) | null = null;
        const operationId = nextTextDownloadOperationId(translationId);
        let resolveDownload!: (result: 'installed' | 'cancelled') => void;
        const ownedDownload = new Promise<'installed' | 'cancelled'>((resolve) => {
          resolveDownload = resolve;
        });
        activeTextDownloadPromises.set(translationId, ownedDownload);
        activeTextDownloadOperationIds.set(translationId, operationId);
        let journalOperationId: string | null = null;
        try {
          if (translation?.textPackLocalPath) {
            await invalidateInstalledBibleDatabaseAtPath(translation.textPackLocalPath);
          }

          set((state) => ({
            error: null,
            downloadProgress: {
              translationId,
              progress: 0,
              status: 'downloading' as const,
            },
            translations: state.translations.map((t) =>
              t.id === translationId ? { ...t, installState: 'downloading' as const } : t
            ),
          }));

          const textPack = translation?.catalog?.text;
          const {
            downloadCatalogTextPack,
            isTextPackDownloadCancelled: isDownloadCancelled,
            getCatalogTextPackPaths,
          } = await import('../services/bible/cloudTranslationService');
          isTextPackDownloadCancelled = isDownloadCancelled;

          const handleProgress = (progress: {
            error?: string;
            phase: 'fetching' | 'indexing' | 'complete' | 'error';
            totalVerses: number;
            versesDownloaded: number;
            bytesDownloaded?: number;
            bytesTotal?: number;
          }) => {
            const activeProgress = get().downloadProgress;
            if (
              activeTextDownloadOperationIds.get(translationId) !== operationId ||
              pendingTextCancellationIds.has(translationId) ||
              activeProgress?.translationId !== translationId ||
              activeProgress?.jobId
            ) {
              return;
            }
            const pct =
              progress.bytesTotal && progress.bytesTotal > 0
                ? Math.round(((progress.bytesDownloaded ?? 0) / progress.bytesTotal) * 100)
                : progress.totalVerses > 0
                  ? Math.round((progress.versesDownloaded / progress.totalVerses) * 100)
                  : 0;
            set({
              downloadProgress: {
                translationId,
                progress: pct,
                status:
                  progress.phase === 'error'
                    ? 'error'
                    : progress.phase === 'complete'
                      ? 'completed'
                      : progress.phase === 'indexing'
                        ? 'installing'
                        : 'downloading',
                error: progress.error,
                ...(progress.bytesDownloaded !== undefined
                  ? { bytesDownloaded: progress.bytesDownloaded }
                  : {}),
                ...(progress.bytesTotal !== undefined ? { bytesTotal: progress.bytesTotal } : {}),
                ...(progress.phase !== 'error' &&
                progress.phase !== 'complete' &&
                progress.bytesTotal === undefined &&
                progress.totalVerses === 0
                  ? { isIndeterminate: true }
                  : {}),
              },
            });
          };

          if (!textPack?.downloadUrl) {
            throw new Error('This Bible is not published to the EveryBible library yet.');
          }

          journalOperationId = nextTextPackJournalOperationId(translationId);
          const packPaths = getCatalogTextPackPaths?.(translationId, journalOperationId);
          if (packPaths) {
            saveTextPackJournal(
              upsertTextPackInstall(readTextPackInstallJournal(), {
                operationId: journalOperationId,
                translationId,
                version: textPack.version,
                expectedSha256: textPack.sha256,
                expectedVerseCount: textPack.verseCount,
                previousPath: translation?.textPackLocalPath,
                previousVersion: translation?.activeTextPackVersion,
                ...packPaths,
                phase: 'downloading',
                updatedAt: Date.now(),
              })
            );
          }

          const localPath = await downloadCatalogTextPack({
            translationId,
            downloadUrl: textPack.downloadUrl,
            expectedSha256: textPack.sha256,
            expectedVerseCount: textPack.verseCount,
            operationId: journalOperationId,
            onPhase: (phase) => {
              if (!journalOperationId) return;
              const currentJournal = readTextPackInstallJournal();
              const currentInstall = currentJournal.installs[translationId];
              if (!currentInstall || currentInstall.operationId !== journalOperationId) return;
              saveTextPackJournal(
                upsertTextPackInstall(currentJournal, {
                  ...currentInstall,
                  phase: phase === 'activating' ? 'activating' : currentInstall.phase,
                  updatedAt: Date.now(),
                })
              );
            },
            onProgress: handleProgress,
          });

          await invalidateInstalledBibleDatabaseAtPath(localPath);
          const { validateCatalogTextPack } =
            await import('../services/bible/cloudTranslationService');
          const representative = await validateCatalogTextPack(
            localPath,
            textPack.verseCount ?? 1,
            textPack.sha256,
            translationId
          );

          const activeProgress = get().downloadProgress;
          if (activeTextDownloadOperationIds.get(translationId) !== operationId) {
            return 'cancelled';
          }

          // Activate the installed pack — sets textPackLocalPath, isDownloaded, installState
          set((state) => ({
            currentTranslation:
              state.currentTranslation === translationId ? translationId : state.currentTranslation,
            downloadProgress:
              activeProgress?.translationId === translationId && !activeProgress?.jobId
                ? null
                : activeProgress,
            error: null,
            translations: state.translations.map((t) =>
              t.id === translationId
                ? {
                    ...t,
                    isDownloaded: true,
                    hasText: true,
                    installState: 'installed' as const,
                    textPackLocalPath: localPath,
                    activeTextPackVersion: textPack?.version ?? '1',
                    // A retry that succeeds supersedes the failure an earlier attempt recorded.
                    lastInstallError: null,
                  }
                : t
            ),
          }));

          try {
            await readRegisteredTextPackRepresentative(translationId, localPath, representative, {
              invalidate: false,
            });
          } catch (readbackError) {
            const { deleteCatalogTextPackArtifacts } =
              await import('../services/bible/cloudTranslationService');
            await invalidateInstalledBibleDatabaseAtPath(localPath).catch(() => {});
            await deleteCatalogTextPackArtifacts(localPath).catch(() => {});
            set((state) => ({
              translations: state.translations.map((item) =>
                item.id === translationId
                  ? translation?.textPackLocalPath
                    ? {
                        ...item,
                        isDownloaded: true,
                        hasText: true,
                        installState: 'installed' as const,
                        textPackLocalPath: translation.textPackLocalPath,
                        activeTextPackVersion: translation.activeTextPackVersion,
                      }
                    : {
                        ...item,
                        isDownloaded: false,
                        installState: 'remote-only' as const,
                        textPackLocalPath: null,
                      }
                  : item
              ),
            }));
            throw readbackError;
          }

          const previousTextPackPath = translation?.textPackLocalPath;
          if (previousTextPackPath && previousTextPackPath !== localPath) {
            try {
              const { deleteCatalogTextPackArtifacts } =
                await import('../services/bible/cloudTranslationService');
              // Close the old pack's handle and stop any search index build on it first.
              await invalidateInstalledBibleDatabaseAtPath(previousTextPackPath);
              await deleteCatalogTextPackArtifacts(previousTextPackPath);
            } catch (cleanupError) {
              // The newly registered candidate remains authoritative; retain the old copy if
              // cleanup is interrupted so recovery can remove it after the active read settles.
              console.warn(
                '[Bible] Previous text pack cleanup is pending:',
                translationId,
                cleanupError
              );
            }
          }

          scheduleTextPackSearchIndexBuild(translationId);
          trackBibleStoreEvent('text_translation_download_completed', {
            content_kind: 'text',
            download_scope: 'translation',
            download_units: 1,
            has_audio: Boolean(translation?.hasAudio),
            translation_id: translationId,
            translation_source: translation?.source ?? 'unknown',
          });
          if (journalOperationId) {
            saveTextPackJournal(removeTextPackInstall(readTextPackInstallJournal(), translationId));
          }
          resolveDownload('installed');
          return 'installed';
        } catch (err) {
          if (isTextPackDownloadCancelled?.(err)) {
            set((state) => {
              // The row belongs to this operation even when another download has since taken
              // over the progress banner; only the banner itself is guarded by ownership.
              const isCurrentOperation =
                activeTextDownloadOperationIds.get(translationId) === operationId;
              const ownsBanner =
                isCurrentOperation && state.downloadProgress?.translationId === translationId;
              return {
                error: ownsBanner ? null : state.error,
                downloadProgress: ownsBanner ? null : state.downloadProgress,
                translations: isCurrentOperation
                  ? state.translations.map((t) =>
                      t.id === translationId
                        ? {
                            ...t,
                            installState: t.textPackLocalPath
                              ? ('installed' as const)
                              : ('remote-only' as const),
                            lastInstallError: undefined,
                          }
                        : t
                    )
                  : state.translations,
              };
            });
            resolveDownload('cancelled');
            return 'cancelled';
          }
          const message = err instanceof Error ? err.message : 'Download failed';
          set((state) => {
            // Mark the row failed whenever this is still its operation; a download that took
            // over the banner meanwhile must not leave this translation "downloading" forever.
            // Only a row still in progress is marked: a failed read-back has already rolled the
            // row back to the previous pack (or remote-only), and that must not be overwritten.
            const isCurrentOperation =
              activeTextDownloadOperationIds.get(translationId) === operationId;
            const ownsBanner =
              isCurrentOperation && state.downloadProgress?.translationId === translationId;
            return {
              error: ownsBanner ? message : state.error,
              downloadProgress: ownsBanner ? null : state.downloadProgress,
              translations: isCurrentOperation
                ? state.translations.map((t) =>
                    t.id === translationId && t.installState === 'downloading'
                      ? { ...t, installState: 'failed' as const, lastInstallError: message }
                      : t
                  )
                : state.translations,
            };
          });
          if (journalOperationId) {
            saveTextPackJournal(removeTextPackInstall(readTextPackInstallJournal(), translationId));
          }
          const normalizedError = err instanceof Error ? err : new Error(message);
          resolveDownload('cancelled');
          throw normalizedError;
        } finally {
          if (activeTextDownloadOperationIds.get(translationId) === operationId) {
            activeTextDownloadOperationIds.delete(translationId);
          }
          if (activeTextDownloadPromises.get(translationId) === ownedDownload) {
            activeTextDownloadPromises.delete(translationId);
          }
          releaseTextPackMutation();
        }
      },

      downloadAllBooks: async (translationId: string) => {
        await get().downloadTranslation(translationId);
      },

      downloadAudioForBook: async (translationId: string, bookId: string) => {
        const translation = get().translations.find((item) => item.id === translationId);
        const book = getBookById(bookId);

        if (!translation?.hasAudio || !book) {
          throw new Error('Audio downloads are not available for this book.');
        }

        const audio = await loadAudioDownloadModules();
        const jobStore = await audio.createAudioDownloadJobStore({
          fileSystem: audio.expoAudioFileSystemAdapter,
          rootUri: audio.AUDIO_DOWNLOAD_ROOT_URI,
        });
        const transport = await audio.createBackgroundAudioDownloadTransport();
        const handleAudioJobUpdate = (job: AudioDownloadJobRecord) => {
          set((state) => ({
            translations: state.translations.map((item) =>
              updateTranslationAudioJobState(item, job)
            ),
            downloadProgress: mapAudioDownloadProgress(job),
          }));
        };
        const handleAudioBookProgress = ({
          bookId: activeBookId,
          progress,
          translationId: activeTranslationId,
          jobId,
        }: AudioDownloadBookProgress) => {
          set((state) => ({
            translations: state.translations.map((item) =>
              item.id === activeTranslationId
                ? updateTranslationAudioJobProgress(item, progress)
                : item
            ),
            downloadProgress: {
              translationId: activeTranslationId,
              bookId: activeBookId,
              progress: clampPercent(progress),
              status: 'downloading',
              jobId,
            },
          }));
        };

        try {
          await audio.downloadAudioBook({
            rootUri: audio.AUDIO_DOWNLOAD_ROOT_URI,
            translationId,
            book,
            fileSystem: audio.expoAudioFileSystemAdapter,
            resolveRemoteAudio: audio.fetchRemoteChapterAudio,
            jobStore,
            transport,
            hooks: {
              onStart: handleAudioJobUpdate,
              onReattach: handleAudioJobUpdate,
              onFailure: (job) => handleAudioJobUpdate(job),
              onComplete: handleAudioJobUpdate,
              onProgress: handleAudioBookProgress,
            },
          });
        } catch (error) {
          // A user cancellation is not an error — clear the in-flight job/progress and return so no
          // error alert surfaces. Genuine failures propagate to the caller. (M2)
          if (audio.isAudioDownloadCancellation(error)) {
            set((state) => ({
              translations: state.translations.map((item) =>
                item.id === translationId ? { ...item, activeDownloadJob: null } : item
              ),
              downloadProgress:
                get().downloadProgress?.translationId === translationId
                  ? null
                  : get().downloadProgress,
            }));
            return;
          }
          throw error;
        }

        set((state) => ({
          translations: state.translations.map((item) =>
            item.id === translationId
              ? mergeDownloadedAudioBook(
                  {
                    ...item,
                    activeDownloadJob: null,
                  },
                  bookId
                )
              : item
          ),
          downloadProgress: null,
        }));

        trackBibleStoreEvent('audio_download_completed', {
          book_count: 1,
          book_id: bookId,
          chapter_count: book.chapters,
          content_kind: 'audio',
          download_scope: 'book',
          download_units: 1,
          translation_id: translationId,
        });
      },

      downloadAudioForBooks: async (translationId: string, bookIds: string[]) => {
        const translation = get().translations.find((item) => item.id === translationId);
        if (!translation?.hasAudio) {
          throw new Error('Audio downloads are not available for this translation.');
        }

        const selectedBooks = bibleBooks.filter((book) => bookIds.includes(book.id));
        if (selectedBooks.length === 0) {
          throw new Error('Audio downloads are not available for the selected books.');
        }

        const audio = await loadAudioDownloadModules();
        const jobStore = await audio.createAudioDownloadJobStore({
          fileSystem: audio.expoAudioFileSystemAdapter,
          rootUri: audio.AUDIO_DOWNLOAD_ROOT_URI,
        });
        const transport = await audio.createBackgroundAudioDownloadTransport();
        const handleAudioJobUpdate = (job: AudioDownloadJobRecord) => {
          set((state) => ({
            translations: state.translations.map((item) =>
              updateTranslationAudioJobState(item, job)
            ),
            downloadProgress: mapAudioDownloadProgress(job),
          }));
        };
        // Chapter-level aggregate across every book in the collection, so a whole-Bible download
        // moves instead of sitting at 0% until a book finishes. The service already coalesces
        // these events. (N25)
        const handleAudioCollectionProgress = ({
          jobId,
          progress,
          translationId: progressTranslationId,
        }: AudioDownloadBookProgress) => {
          set((state) => ({
            translations: state.translations.map((item) =>
              item.id === progressTranslationId
                ? updateTranslationAudioJobProgress(item, progress)
                : item
            ),
            downloadProgress: {
              translationId: progressTranslationId,
              jobId,
              progress: clampPercent(progress),
              status: 'downloading',
            },
          }));
        };
        const handleAudioBookComplete = ({
          bookId: completedBookId,
          completedBooks,
          totalBooks,
          translationId: completedTranslationId,
          jobId,
        }: AudioDownloadCollectionProgress) => {
          const collectionProgress = clampPercent((completedBooks / totalBooks) * 100);
          set((state) => {
            // Never walk backwards: the chapter aggregate above is always >= this book fraction.
            const nextProgress = Math.max(
              state.downloadProgress?.translationId === completedTranslationId
                ? (state.downloadProgress.progress ?? 0)
                : 0,
              collectionProgress
            );
            return {
              translations: state.translations.map((item) =>
                item.id === completedTranslationId
                  ? updateTranslationAudioJobProgress(
                      mergeDownloadedAudioBook(item, completedBookId),
                      nextProgress
                    )
                  : item
              ),
              downloadProgress: {
                translationId: completedTranslationId,
                jobId,
                progress: nextProgress,
                status: 'downloading',
              },
            };
          });
        };

        let result: { downloadedBookIds: string[] };
        try {
          result = await audio.downloadAudioTranslation({
            rootUri: audio.AUDIO_DOWNLOAD_ROOT_URI,
            translationId,
            books: selectedBooks,
            fileSystem: audio.expoAudioFileSystemAdapter,
            resolveRemoteAudio: audio.fetchRemoteChapterAudio,
            jobStore,
            transport,
            hooks: {
              onStart: handleAudioJobUpdate,
              onReattach: handleAudioJobUpdate,
              onFailure: (job) => handleAudioJobUpdate(job),
              onComplete: handleAudioJobUpdate,
              onProgress: handleAudioCollectionProgress,
              onBookComplete: handleAudioBookComplete,
            },
          });
        } catch (error) {
          // User cancellation is terminal-but-not-a-failure — clear the in-flight job/progress and
          // return without throwing so the picker shows no error alert. (M2)
          if (audio.isAudioDownloadCancellation(error)) {
            set((state) => ({
              translations: state.translations.map((item) =>
                item.id === translationId ? { ...item, activeDownloadJob: null } : item
              ),
              downloadProgress:
                get().downloadProgress?.translationId === translationId
                  ? null
                  : get().downloadProgress,
            }));
            return;
          }
          throw error;
        }

        set((state) => ({
          translations: state.translations.map((item) =>
            item.id === translationId
              ? {
                  ...item,
                  activeDownloadJob: null,
                  downloadedAudioBooks: result.downloadedBookIds.reduce(
                    (books, completedBookId) =>
                      books.includes(completedBookId) ? books : [...books, completedBookId],
                    item.downloadedAudioBooks
                  ),
                }
              : item
          ),
          downloadProgress: null,
        }));

        trackBibleStoreEvent('audio_download_completed', {
          book_count: result.downloadedBookIds.length,
          chapter_count: selectedBooks.reduce((total, book) => total + book.chapters, 0),
          content_kind: 'audio',
          download_scope:
            result.downloadedBookIds.length === bibleBooks.length ? 'translation' : 'collection',
          download_units: result.downloadedBookIds.length,
          translation_id: translationId,
        });
      },

      downloadAudioForTranslation: async (translationId: string) => {
        await get().downloadAudioForBooks(
          translationId,
          bibleBooks.map((book) => book.id)
        );
      },

      cancelDownload: () => {
        const progress = get().downloadProgress;
        const cancelledTranslationId = progress?.translationId;
        // The authoritative id is the one on the translation's active job. downloadProgress.jobId
        // is a best-effort mirror, and during a collection download a book-scope event could once
        // leave a nested book job id there — which requestAudioDownloadCancellation could not
        // resolve, so cancel silently did nothing while chapters kept downloading. (N22)
        const activeJobId = cancelledTranslationId
          ? (get().translations.find((item) => item.id === cancelledTranslationId)
              ?.activeDownloadJob?.id ?? null)
          : null;
        // A text transfer has no audio job id. Never let a stale audio job on the same
        // translation hijack a text cancellation request.
        const resolvedJobId = progress?.jobId ? (activeJobId ?? progress.jobId) : null;
        if (resolvedJobId) {
          const jobId = resolvedJobId;
          // Stop the in-JS scheduling loop (runWithConcurrency) immediately, ask the native
          // background transport to stop any in-flight task for the same real job id, AND remove
          // the persisted registry record so the cancelled job can't resurrect as a phantom
          // "Loading… 0%" on the next launch's reattach. (M1/M2)
          loadAudioDownloadModules()
            .then(async (audio) => {
              audio.requestAudioDownloadCancellation(jobId);

              try {
                const activeTransport = await audio.createBackgroundAudioDownloadTransport();
                await activeTransport.cancelJob?.(jobId);
              } catch {
                // Native transport may be unavailable in some Expo/dev contexts.
              }

              try {
                const jobStore = await audio.createAudioDownloadJobStore({
                  fileSystem: audio.expoAudioFileSystemAdapter,
                  rootUri: audio.AUDIO_DOWNLOAD_ROOT_URI,
                });
                await jobStore.removeJob(jobId);
              } catch {
                // Best-effort registry cleanup.
              }
            })
            .catch(() => {});
        } else if (cancelledTranslationId) {
          pendingTextCancellationIds.add(cancelledTranslationId);
          import('../services/bible/cloudTranslationService')
            .then(({ cancelActiveCatalogTextPackDownload }) => {
              const accepted = cancelActiveCatalogTextPackDownload(cancelledTranslationId);
              pendingTextCancellationIds.delete(cancelledTranslationId);
              if (!accepted) return;
              set((state) => ({
                downloadProgress:
                  state.downloadProgress?.translationId === cancelledTranslationId &&
                  !state.downloadProgress.jobId
                    ? null
                    : state.downloadProgress,
                translations: state.translations.map((translation) =>
                  translation.id === cancelledTranslationId
                    ? {
                        ...translation,
                        installState: translation.textPackLocalPath ? 'installed' : 'remote-only',
                      }
                    : translation
                ),
              }));
            })
            .catch(() => {
              pendingTextCancellationIds.delete(cancelledTranslationId);
            });
          return;
        }
        set((state) => ({
          downloadProgress: null,
          translations: cancelledTranslationId
            ? state.translations.map((translation) =>
                translation.id === cancelledTranslationId
                  ? { ...translation, activeDownloadJob: null }
                  : translation
              )
            : state.translations,
        }));
      },

      deleteTranslation: async (translationId) => {
        const activeTextDownloadAtDeleteStart = activeTextDownloadPromises.get(translationId);
        if (activeTextDownloadAtDeleteStart) {
          try {
            const cloud = await import('../services/bible/cloudTranslationService');
            cloud.cancelActiveCatalogTextPackDownload(translationId);
            await cloud.waitForActiveCatalogTextPackDownload(translationId);
            await activeTextDownloadAtDeleteStart;
          } catch (error) {
            console.warn(
              '[Bible] Failed to settle text pack before deletion:',
              translationId,
              error
            );
          }
        }
        await recoverTextPackJournal();
        const releaseTextPackMutation = await acquireTextPackMutationLock(translationId);
        try {
          const state = get();
          const translation = state.translations.find((item) => item.id === translationId);

          // A translation whose first audio download is still running has no finished books yet,
          // but its partial files and running loop still need cleaning up.
          if (
            !translation ||
            (!hasTranslationDownloadData(translation) && !translation.activeDownloadJob)
          ) {
            return;
          }

          // Stop every writer before deleting anything: a download loop left running would put
          // chapters back into the deleted folder and mark their books downloaded again.
          try {
            const audio = await loadAudioDownloadModules();
            await audio.cancelAudioDownloadsForTranslation(translationId);
          } catch (error) {
            console.warn(
              '[Bible] Failed to stop translation audio downloads:',
              translationId,
              error
            );
          }

          const pendingJournalInstall = readTextPackInstallJournal().installs[translationId];
          const filePaths = Array.from(
            new Set(
              [
                translation.textPackLocalPath,
                translation.pendingTextPackLocalPath,
                translation.rollbackTextPackLocalPath,
                pendingJournalInstall?.finalPath,
                pendingJournalInstall?.stagingPath,
                pendingJournalInstall?.rollbackPath,
                pendingJournalInstall?.previousPath,
              ].filter((value): value is string => typeof value === 'string' && value.length > 0)
            )
          );

          const deletionJournalOperationId = nextTextPackJournalOperationId(translationId);
          saveTextPackJournal(
            upsertTextPackDeletion(readTextPackInstallJournal(), {
              operationId: deletionJournalOperationId,
              translationId,
              paths: filePaths,
              updatedAt: Date.now(),
            })
          );
          let textDeleteFailed = false;

          await Promise.all(
            filePaths.map(async (localPath) => {
              try {
                await invalidateInstalledBibleDatabaseAtPath(localPath);
                await deleteFileSystemPath(localPath);
              } catch (error) {
                textDeleteFailed = true;
                console.warn(
                  '[Bible] Failed to remove translation text pack:',
                  translationId,
                  localPath,
                  error
                );
              }
            })
          );

          try {
            const audio = await loadAudioDownloadModules();
            const jobStore = await audio.createAudioDownloadJobStore({
              fileSystem: audio.expoAudioFileSystemAdapter,
              rootUri: audio.AUDIO_DOWNLOAD_ROOT_URI,
            });
            const transport = await audio.createBackgroundAudioDownloadTransport();
            const jobs = await jobStore.listJobs();

            await Promise.all(
              jobs
                .filter((job) => job.translationId === translationId)
                .map(async (job) => {
                  try {
                    await transport.cancelJob?.(job.id);
                  } catch (error) {
                    console.warn(
                      '[Bible] Failed to cancel translation download job:',
                      job.id,
                      error
                    );
                  }

                  await jobStore.removeJob(job.id);
                })
            );
          } catch (error) {
            console.warn(
              '[Bible] Failed to clear translation download jobs:',
              translationId,
              error
            );
          }

          // Removes finished chapters and any partial transfer files with them.
          try {
            const audio = await loadAudioDownloadModules();
            await deleteFileSystemPath(`${audio.AUDIO_DOWNLOAD_ROOT_URI}${translationId}/`);
          } catch (error) {
            console.warn(
              '[Bible] Failed to remove translation audio downloads:',
              translationId,
              error
            );
          }

          let nextTranslationsSnapshot: BibleTranslation[] = [];

          set((currentState) => {
            const nextTranslations = currentState.translations.map((item) =>
              item.id === translationId ? resetTranslationDownloadState(item) : item
            );
            nextTranslationsSnapshot = nextTranslations;
            const nextCurrentTranslation =
              currentState.currentTranslation === translationId && translationId !== 'bsb'
                ? 'bsb'
                : currentState.currentTranslation;

            return {
              translations: nextTranslations,
              currentTranslation: nextCurrentTranslation,
              downloadProgress:
                currentState.downloadProgress?.translationId === translationId
                  ? null
                  : currentState.downloadProgress,
            };
          });

          if (!textDeleteFailed) {
            saveTextPackJournal(
              removeTextPackInstall(
                removeTextPackDeletion(readTextPackInstallJournal(), translationId),
                translationId
              )
            );
          }

          syncRemoteAudioMetadataResolverWithTranslations(nextTranslationsSnapshot);
          syncVerseTimestampMetadata(nextTranslationsSnapshot);
        } finally {
          releaseTextPackMutation();
        }
      },

      // Clear per-user reading state on sign-out so a second account signing in on the same device
      // does not inherit the previous user's reading position or in-progress download UI (H2). Keeps
      // translation availability (bundled + installed packs and current translation) intact — that is
      // device-level, not user-level, and re-downloading installed Bibles on every account switch
      // would be hostile in the offline-first, metered-data markets this app targets.
      resetForSignOut: () => {
        set({
          // The next account's saved Bible wins over a choice stamped under this one.
          currentTranslationChosenAt: null,
          currentBook: 'GEN',
          currentChapter: 1,
          hasReaderHistory: false,
          preferredChapterLaunchMode: 'listen',
          verses: [],
          isLoading: false,
          error: null,
          downloadProgress: null,
        });
      },

      isBookDownloaded: (translationId, bookId) => {
        const translation = get().translations.find((t) => t.id === translationId);
        if (!translation) return false;
        if (translation.isDownloaded) return true;
        return translation.downloadedBooks.includes(bookId);
      },

      isAudioBookDownloaded: (translationId, bookId) => {
        const translation = get().translations.find((t) => t.id === translationId);
        return translation?.downloadedAudioBooks.includes(bookId) ?? false;
      },
    }),
    {
      name: 'bible-storage',
      version: BIBLE_PERSISTED_STATE_VERSION,
      storage: createJSONStorage(() => zustandStorage),
      // Version 0 blobs inline every runtime translation's static catalog metadata. Migration
      // moves that metadata into its own MMKV key and leaves only the user-mutable delta here.
      // Zustand runs migrate BEFORE merge, and MMKV is synchronous, so the snapshot written here
      // is already readable by the time merge re-joins the two halves.
      migrate: (persistedState, version) =>
        migrateBiblePersistedState(persistedState, version) as BibleState,
      // Only the fields the store itself mutates. Everything static is re-seeded on hydration —
      // bundled translations from the `bibleTranslations` constant, runtime translations from the
      // catalog snapshot — so routine set() calls (chapter navigation, download progress ticks)
      // no longer re-serialize 200+ full catalog objects to MMKV.
      partialize: (state) => ({
        currentBook: state.currentBook,
        currentChapter: state.currentChapter,
        hasReaderHistory: state.hasReaderHistory,
        preferredChapterLaunchMode: state.preferredChapterLaunchMode,
        currentTranslation: state.currentTranslation,
        currentTranslationChosenAt: state.currentTranslationChosenAt,
        preferredTranslationLanguage: state.preferredTranslationLanguage,
        translations: state.translations.map(toPersistedTranslation),
      }),
      merge: (persistedState, currentState) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[EB-T] bible:merge-start', Date.now());
        }
        // Single read + single pass over the cached catalog; the deltas then join against it by id.
        const persisted = sanitizePersistedBibleState(persistedState, readRuntimeCatalogSnapshot());
        const result = {
          ...currentState,
          ...persisted,
          translations: persisted.translations.map(settleInterruptedInstallState),
        };
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[EB-T] bible:merge-done', Date.now());
        }
        return result;
      },
    }
  )
);

setBibleDatabaseSourceResolver((translationId) => {
  const translation = useBibleStore
    .getState()
    .translations.find((candidate) => candidate.id === translationId);

  if (!translation?.textPackLocalPath) {
    return null;
  }

  return buildInstalledBibleDatabaseSource(
    translation.id,
    translation.textPackLocalPath,
    translation.activeTextPackVersion
  );
});

setBibleTranslationReadinessResolver(async (translationId) => {
  if (textPackRecoveryReadinessBypass.has(translationId)) {
    return;
  }
  await recoverTextPackJournal();
});

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  console.log('[EB-T] bible:post-create', Date.now());
}
syncRemoteAudioMetadataDeferred(useBibleStore.getState().translations);
syncVerseTimestampMetadata(useBibleStore.getState().translations);
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  console.log('[EB-T] bible:module-done', Date.now());
}
