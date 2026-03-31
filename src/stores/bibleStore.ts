import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as FileSystem from 'expo-file-system/legacy';
import { zustandStorage } from './mmkvStorage';
import { bibleBooks, config, getBookById } from '../constants';
import type {
  Verse,
  BibleTranslation,
  TranslationDownloadJob,
  TranslationDownloadProgress,
} from '../types';
import {
  AUDIO_DOWNLOAD_ROOT_URI,
  createAudioDownloadJobStore,
  createBackgroundAudioDownloadTransport,
  downloadAudioBook,
  downloadAudioTranslation,
  expoAudioFileSystemAdapter,
  fetchRemoteChapterAudio,
  getAudioAvailability,
  isRemoteAudioAvailable,
  syncRemoteAudioMetadataResolverWithTranslations,
  type AudioDownloadJobRecord,
} from '../services/audio';
import {
  invalidateInstalledBibleDatabaseAtPath,
  setBibleDatabaseSourceResolver,
} from '../services/bible/bibleDatabase';
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
  mergeRuntimeCatalogTranslations,
  reconcileMissingRuntimeTranslationPacks,
} from './bibleStoreModel';

interface BibleState {
  currentBook: string;
  currentChapter: number;
  preferredChapterLaunchMode: 'listen' | 'read';
  verses: Verse[];
  isLoading: boolean;
  error: string | null;

  // Translation state
  currentTranslation: string;
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
  setCurrentTranslation: (translationId: string) => void;
  applyRuntimeCatalog: (runtimeTranslations: BibleTranslation[]) => void;
  reconcileTranslationPacks: () => Promise<void>;
  reattachAudioDownloads: () => Promise<void>;
  stageTranslationPack: (
    translationId: string,
    candidate: { version: string; localPath: string }
  ) => void;
  activateTranslationPack: (translationId: string) => void;
  failTranslationPack: (translationId: string, error: string) => void;
  rollbackTranslationPackInstall: (translationId: string) => void;
  getAvailableTranslations: () => BibleTranslation[];
  getCurrentTranslationInfo: () => BibleTranslation | undefined;
  downloadTranslation: (translationId: string, bookId?: string) => Promise<void>;
  downloadAllBooks: (translationId: string) => Promise<void>;
  downloadAudioForBook: (translationId: string, bookId: string) => Promise<void>;
  downloadAudioForBooks: (translationId: string, bookIds: string[]) => Promise<void>;
  downloadAudioForTranslation: (translationId: string) => Promise<void>;
  cancelDownload: () => void;
  deleteTranslation: (translationId: string) => void;
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
    bookId: job.bookId,
    progress: job.status === 'completed' ? 100 : 0,
    status:
      job.status === 'completed'
        ? 'completed'
        : job.status === 'failed'
          ? 'error'
          : 'downloading',
    error: job.error,
  };
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

export const useBibleStore = create<BibleState>()(
  persist(
    (set, get) => ({
      currentBook: 'GEN',
      currentChapter: 1,
      preferredChapterLaunchMode: 'read',
      verses: [],
      isLoading: false,
      error: null,
      currentTranslation: 'bsb',
      translations: getDefaultBibleTranslations(),
      downloadProgress: null,

      setCurrentBook: (bookId) => set({ currentBook: bookId }),
      setCurrentChapter: (chapter) => set({ currentChapter: chapter }),
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
        });
      },
      setVerses: (verses) => set({ verses }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),

      setCurrentTranslation: (translationId) => {
        const translation = get().translations.find((t) => t.id === translationId);
        if (!translation) {
          return;
        }

        const hasInstalledTextPack = Boolean(translation.textPackLocalPath);
        const hasReadableText = translation.hasText && (translation.source !== 'runtime' || hasInstalledTextPack);

        if (translation.isDownloaded || hasReadableText) {
          set({ currentTranslation: translationId, error: null });
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
            set({ currentTranslation: translationId, error: null });
          }
        }
      },

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
                    : existing?.downloadedBooks ?? [],
                downloadedAudioBooks:
                  translation.downloadedAudioBooks.length > 0
                    ? translation.downloadedAudioBooks
                    : existing?.downloadedAudioBooks ?? [],
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
          const nextTranslationIds = new Set(
            nextTranslations.map((translation) => translation.id)
          );

          return {
            translations: nextTranslations,
            currentTranslation: nextTranslationIds.has(state.currentTranslation)
              ? state.currentTranslation
              : 'bsb',
          };
        });

        syncRemoteAudioMetadataResolverWithTranslations(nextTranslationsSnapshot);
      },

      reconcileTranslationPacks: async () => {
        const runtimeTranslations = get().translations.filter(
          (translation) => translation.source === 'runtime' && Boolean(translation.textPackLocalPath)
        );

        if (runtimeTranslations.length === 0) {
          return;
        }

        const missingTranslationIds = new Set<string>();

        await Promise.all(
          runtimeTranslations.map(async (translation) => {
            try {
              const fileInfo = await FileSystem.getInfoAsync(translation.textPackLocalPath ?? '');

              if (!fileInfo.exists) {
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

      reattachAudioDownloads: async () => {
        const jobStore = await createAudioDownloadJobStore({
          fileSystem: expoAudioFileSystemAdapter,
          rootUri: AUDIO_DOWNLOAD_ROOT_URI,
        });
        const transport = await createBackgroundAudioDownloadTransport();
        const jobs = await jobStore.listJobs();
        const latestJobsByTranslation = getLatestPersistedAudioJobByTranslation(
          jobs.filter((job) => job.status !== 'completed')
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
            translation.id === translationId ? failTranslationPackCandidate(translation, error) : translation
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
          return;
        }

        // Already downloaded and installed — no-op
        if (translation?.isDownloaded && translation?.textPackLocalPath) {
          return;
        }

        // Cloud download from Supabase bible_verses table
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

          const { downloadCloudTranslation } = await import('../services/bible/cloudTranslationService');

          const localPath = await downloadCloudTranslation(translationId, (progress) => {
            const pct =
              progress.totalVerses > 0
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
              },
            });
          });

          await invalidateInstalledBibleDatabaseAtPath(localPath);

          // Activate the installed pack — sets textPackLocalPath, isDownloaded, installState
          set((state) => ({
            currentTranslation: state.currentTranslation === translationId ? translationId : state.currentTranslation,
            downloadProgress: null,
            error: null,
            translations: state.translations.map((t) =>
              t.id === translationId
                ? {
                    ...t,
                    isDownloaded: true,
                    hasText: true,
                    installState: 'installed' as const,
                    textPackLocalPath: localPath,
                    activeTextPackVersion: '1',
                  }
                : t
            ),
          }));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Download failed';
          set((state) => ({
            error: message,
            downloadProgress: null,
            translations: state.translations.map((t) =>
              t.id === translationId
                ? { ...t, installState: 'failed' as const, lastInstallError: message }
                : t
            ),
          }));
          throw err instanceof Error ? err : new Error(message);
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

        const jobStore = await createAudioDownloadJobStore({
          fileSystem: expoAudioFileSystemAdapter,
          rootUri: AUDIO_DOWNLOAD_ROOT_URI,
        });
        const transport = await createBackgroundAudioDownloadTransport();
        const handleAudioJobUpdate = (job: AudioDownloadJobRecord) => {
          set((state) => ({
            translations: state.translations.map((item) =>
              updateTranslationAudioJobState(item, job)
            ),
            downloadProgress: mapAudioDownloadProgress(job),
          }));
        };

        await downloadAudioBook({
          rootUri: AUDIO_DOWNLOAD_ROOT_URI,
          translationId,
          book,
          fileSystem: expoAudioFileSystemAdapter,
          resolveRemoteAudio: fetchRemoteChapterAudio,
          jobStore,
          transport,
          hooks: {
            onStart: handleAudioJobUpdate,
            onReattach: handleAudioJobUpdate,
            onFailure: (job) => handleAudioJobUpdate(job),
            onComplete: handleAudioJobUpdate,
          },
        });

        set((state) => ({
          translations: state.translations.map((item) =>
            item.id === translationId
              ? {
                  ...item,
                  activeDownloadJob: null,
                  downloadedAudioBooks: Array.from(
                    new Set([...item.downloadedAudioBooks, bookId])
                  ),
                }
              : item
          ),
          downloadProgress: null,
        }));
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

        const jobStore = await createAudioDownloadJobStore({
          fileSystem: expoAudioFileSystemAdapter,
          rootUri: AUDIO_DOWNLOAD_ROOT_URI,
        });
        const transport = await createBackgroundAudioDownloadTransport();
        const handleAudioJobUpdate = (job: AudioDownloadJobRecord) => {
          set((state) => ({
            translations: state.translations.map((item) =>
              updateTranslationAudioJobState(item, job)
            ),
            downloadProgress: mapAudioDownloadProgress(job),
          }));
        };

        const result = await downloadAudioTranslation({
          rootUri: AUDIO_DOWNLOAD_ROOT_URI,
          translationId,
          books: selectedBooks,
          fileSystem: expoAudioFileSystemAdapter,
          resolveRemoteAudio: fetchRemoteChapterAudio,
          jobStore,
          transport,
          hooks: {
            onStart: handleAudioJobUpdate,
            onReattach: handleAudioJobUpdate,
            onFailure: (job) => handleAudioJobUpdate(job),
            onComplete: handleAudioJobUpdate,
          },
        });

        set((state) => ({
          translations: state.translations.map((item) =>
            item.id === translationId
              ? {
                  ...item,
                  activeDownloadJob: null,
                  downloadedAudioBooks: Array.from(
                    new Set([...item.downloadedAudioBooks, ...result.downloadedBookIds])
                  ),
                }
              : item
          ),
          downloadProgress: null,
        }));
      },

      downloadAudioForTranslation: async (translationId: string) => {
        await get().downloadAudioForBooks(
          translationId,
          bibleBooks.map((book) => book.id)
        );
      },

      cancelDownload: () => {
        const progress = get().downloadProgress;
        if (progress) {
          // Attempt to cancel the background download transport
          createBackgroundAudioDownloadTransport()
            .then((transport) => {
              if (transport.cancelJob && progress.translationId) {
                const jobId = `${progress.translationId}:${progress.bookId ?? 'all'}`;
                transport.cancelJob(jobId).catch(() => {});
              }
            })
            .catch(() => {});
        }
        set({ downloadProgress: null });
      },

      deleteTranslation: (translationId) => {
        if (translationId === 'bsb') {
          return; // Can't delete the default translation
        }

        set((state) => ({
          translations: state.translations.map((t) => {
            if (t.id === translationId) {
              return {
                ...t,
                isDownloaded: false,
                downloadedBooks: [],
                downloadedAudioBooks: [],
                activeTextPackVersion: null,
                pendingTextPackVersion: null,
                pendingTextPackLocalPath: null,
                textPackLocalPath: null,
                rollbackTextPackVersion: null,
                rollbackTextPackLocalPath: null,
                lastInstallError: null,
                installState: t.source === 'runtime' ? 'remote-only' : t.installState,
              };
            }
            return t;
          }),
          currentTranslation:
            state.currentTranslation === translationId ? 'bsb' : state.currentTranslation,
        }));
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
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        currentBook: state.currentBook,
        currentChapter: state.currentChapter,
        preferredChapterLaunchMode: state.preferredChapterLaunchMode,
        currentTranslation: state.currentTranslation,
        translations: state.translations,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePersistedBibleState(persistedState),
      }),
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

  return buildInstalledBibleDatabaseSource(translation.id, translation.textPackLocalPath);
});

syncRemoteAudioMetadataResolverWithTranslations(useBibleStore.getState().translations);
