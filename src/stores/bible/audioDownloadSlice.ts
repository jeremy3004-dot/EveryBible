// Direct module import, not the '../../constants' barrel: the barrel re-exports bookIcons, which
// drags a ~298KB vector JSON into the store's startup graph. (P3)
import { bibleBooks, getBookById } from '../../constants/books';
import type {
  AudioDownloadBookProgress,
  AudioDownloadCollectionProgress,
  AudioDownloadJobRecord,
  AudioDownloadJobStore,
} from '../../services/audio/audioDownloadService';
import { mergeDownloadedAudioBook } from '../bibleStoreModel';
import {
  AUDIO_DOWNLOAD_JOB_ID_PREFIX,
  isAudioDownloadBookOwnedByCollection,
  hasPendingAudioDownloadCancellationCleanup,
  registerAudioDownloadAbortController,
  releaseAudioDownloadAbortController,
  waitForAudioDownloadCancellationCleanup,
} from '../../services/audio/download/activeDownloads';
import type { BibleSliceCreator, BibleState } from './bibleStoreTypes';
import { loadAudioDownloadModules, trackBibleStoreEvent } from './bibleStoreDeferredServices';
import {
  appendDownloadedAudioBooks,
  clampPercent,
  getDisplayableActiveAudioJobs,
  getLatestPersistedAudioJobByTranslation,
  mapAudioDownloadProgress,
  updateTranslationAudioJobProgress,
  updateTranslationAudioJobState,
} from './audioDownloadJobModel';

type AudioDownloadSlice = Pick<
  BibleState,
  | 'reattachAudioDownloads'
  | 'downloadAudioForBook'
  | 'downloadAudioForBooks'
  | 'downloadAudioForTranslation'
>;

/** Offline audio downloads: one book, a collection of books, and resuming after a restart. */
export const createAudioDownloadSlice: BibleSliceCreator<AudioDownloadSlice> = (set, get) => {
  const runningRequests = new Map<string, Promise<void>>();
  const shareDownload =
    <Args extends [translationId: string, ...unknown[]]>(
      keyFor: (...args: Args) => string,
      jobIdFor: (...args: Args) => string,
      download: (signal: AbortSignal, ...args: Args) => Promise<void>
    ) =>
    (...args: Args): Promise<void> => {
      const key = keyFor(...args);
      const existing = runningRequests.get(key);
      if (existing) return existing;
      const jobId = jobIdFor(...args);
      const requestId = `${jobId}:request:${key}`;
      const request = registerAudioDownloadAbortController(requestId);
      const pending = Promise.resolve()
        .then(async () => {
          await waitForAudioDownloadCancellationCleanup(jobId, request.controller.signal);
          if (request.controller.signal.aborted) return;
          try {
            await download(request.controller.signal, ...args);
          } catch (error) {
            if (!request.controller.signal.aborted) throw error;
          }
        })
        .finally(() => {
          runningRequests.delete(key);
          releaseAudioDownloadAbortController(requestId, request);
        });
      runningRequests.set(key, pending);
      return pending;
    };

  const handleAudioJobUpdate = (job: AudioDownloadJobRecord, signal: AbortSignal) => {
    if (signal.aborted) return;
    const terminal = job.status === 'completed' || job.status === 'failed';
    set((state) => ({
      translations: state.translations.map((item) =>
        terminal && item.activeDownloadJob && item.activeDownloadJob.id !== job.id
          ? item
          : updateTranslationAudioJobState(item, job)
      ),
      downloadProgress:
        terminal && state.downloadProgress?.jobId && state.downloadProgress.jobId !== job.id
          ? state.downloadProgress
          : mapAudioDownloadProgress(job),
    }));
  };

  const handleUnverifiedAudioCache = (
    { translationId, bookId }: { translationId: string; bookId: string },
    signal: AbortSignal
  ) => {
    if (signal.aborted) return;
    set((state) => ({
      translations: state.translations.map((item) =>
        item.id === translationId && item.downloadedAudioBooks.includes(bookId)
          ? {
              ...item,
              downloadedAudioBooks: item.downloadedAudioBooks.filter((id) => id !== bookId),
            }
          : item
      ),
    }));
  };

  // A finished request may share a translation with another book, or the one global banner
  // with another translation. Read the surviving persisted jobs before replacing either slot.
  const restoreOtherAudioDownloads = async (
    jobStore: AudioDownloadJobStore,
    finishedJobId: string,
    translationId: string,
    downloadedBookIds: string[] = []
  ) => {
    const progressBeforeRead = get().downloadProgress;
    const rowBeforeRead = get().translations.find(
      (item) => item.id === translationId
    )?.activeDownloadJob;
    const snapshot = await jobStore.listJobs();
    // A second job can finish, be cancelled, or be deleted while listJobs is reading.
    // Resolve snapshot ids again before presenting them; a same-id retry supplies its new record.
    const currentJobs = await Promise.all(snapshot.map((job) => jobStore.getJob(job.id)));
    const activeJobs = getDisplayableActiveAudioJobs(
      currentJobs.filter((job): job is AudioDownloadJobRecord => Boolean(job))
    ).filter(
      (job) => job.id !== finishedJobId && !hasPendingAudioDownloadCancellationCleanup(job.id)
    );
    const byTranslation = getLatestPersistedAudioJobByTranslation(activeJobs);
    const visible = byTranslation.get(translationId) ?? activeJobs[0] ?? null;
    set((state) => ({
      translations: state.translations.map((item) =>
        item.id === translationId
          ? {
              ...(item.activeDownloadJob === rowBeforeRead &&
              (!item.activeDownloadJob || item.activeDownloadJob.id === finishedJobId)
                ? byTranslation.has(translationId)
                  ? updateTranslationAudioJobState(item, byTranslation.get(translationId) ?? null)
                  : { ...item, activeDownloadJob: null }
                : item),
              downloadedAudioBooks: appendDownloadedAudioBooks(
                item.downloadedAudioBooks,
                downloadedBookIds
              ),
            }
          : item
      ),
      downloadProgress:
        state.downloadProgress === progressBeforeRead &&
        (!state.downloadProgress || state.downloadProgress.jobId === finishedJobId)
          ? visible
            ? mapAudioDownloadProgress(visible)
            : null
          : state.downloadProgress,
    }));
  };

  return {
    reattachAudioDownloads: async () => {
      const progressAtStart = get().downloadProgress;
      const recoveryOwners = new Map<
        string,
        ReturnType<typeof registerAudioDownloadAbortController>
      >();
      const ownerFor = (jobId: string) => {
        const existing = recoveryOwners.get(jobId);
        if (existing) return existing;
        const owner = registerAudioDownloadAbortController(`${jobId}:request:reattach`);
        recoveryOwners.set(jobId, owner);
        return owner;
      };
      // A hydrated banner can be cancelled while the recovery services are still loading.
      if (progressAtStart?.jobId) ownerFor(progressAtStart.jobId);
      for (const translation of get().translations) {
        if (translation.activeDownloadJob?.id) ownerFor(translation.activeDownloadJob.id);
      }

      try {
        const audio = await loadAudioDownloadModules();
        const jobStore = await audio.createAudioDownloadJobStore({
          fileSystem: audio.expoAudioFileSystemAdapter,
          rootUri: audio.AUDIO_DOWNLOAD_ROOT_URI,
        });
        const transport = await audio.createBackgroundAudioDownloadTransport();
        const jobs = await jobStore.listJobs();
        const pendingJobs = jobs.filter(
          (job) => job.status === 'downloading' || job.status === 'queued'
        );
        const collections = new Map(
          pendingJobs
            .filter((job) => job.scope === 'translation')
            .map((job) => [job.translationId, job])
        );
        const collectionCoversBook = (
          collection: AudioDownloadJobRecord,
          book: AudioDownloadJobRecord
        ) => isAudioDownloadBookOwnedByCollection(book, collection);
        // A collection owns its covered child records. Independent books still need recovery;
        // choosing the newest job is only for the single displayed slot, not the work queue.
        const recoveryJobs = pendingJobs.filter((job) => {
          const collection = collections.get(job.translationId);
          return !collection || !collectionCoversBook(collection, job);
        });
        const results = await Promise.allSettled(
          recoveryJobs.map(async (job) => {
            const signal = ownerFor(job.id).controller.signal;
            await waitForAudioDownloadCancellationCleanup(job.id, signal);
            if (signal.aborted) return null;
            const current = await jobStore.getJob(job.id);
            if (!current || (current.status !== 'downloading' && current.status !== 'queued'))
              return null;
            try {
              // Native collection ids match the whole translation namespace. Resume only its
              // persisted children so a selected subset cannot revive an independent book.
              // The service persists each book job before creating any native chapter task.
              const nativeJobs =
                current.scope === 'translation'
                  ? pendingJobs.filter((candidate) => collectionCoversBook(current, candidate))
                  : [current];
              for (const nativeJob of nativeJobs) {
                if (signal.aborted) return null;
                const persisted = await jobStore.getJob(nativeJob.id);
                if (
                  !persisted ||
                  (persisted.status !== 'downloading' && persisted.status !== 'queued')
                )
                  continue;
                await transport.reattachJob?.(nativeJob.id, signal);
              }
            } catch (error) {
              if (!signal.aborted)
                console.warn('[Bible] Failed to reattach audio download job:', current.id, error);
            }
            if (signal.aborted) return null;
            const refreshed = await jobStore.getJob(current.id);
            return refreshed &&
              (refreshed.status === 'downloading' || refreshed.status === 'queued')
              ? refreshed
              : null;
          })
        );
        const failure = results.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
        const recovered = results.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : []
        );
        const activeJobs = recovered.filter((job): job is AudioDownloadJobRecord =>
          Boolean(job && !recoveryOwners.get(job.id)?.controller.signal.aborted)
        );
        const liveJobsByTranslation = getLatestPersistedAudioJobByTranslation(activeJobs);
        set((state) => ({
          translations: state.translations.map((translation) => {
            const currentJobId = translation.activeDownloadJob?.id;
            if (currentJobId && !recoveryOwners.has(currentJobId)) return translation;
            if (currentJobId && recoveryOwners.get(currentJobId)?.controller.signal.aborted)
              return translation;
            return updateTranslationAudioJobState(
              translation,
              liveJobsByTranslation.get(translation.id) ?? null
            );
          }),
          downloadProgress:
            state.downloadProgress === progressAtStart
              ? activeJobs[0]
                ? mapAudioDownloadProgress(activeJobs[0])
                : null
              : state.downloadProgress,
        }));

        // Native reattachment resumes only surviving chapter tasks. The JS loop verifies saved
        // files and schedules chapters that never started, preserving a selected collection.
        const availableBookIds = new Set(bibleBooks.map((book) => book.id));
        activeJobs.forEach((job) => {
          if (recoveryOwners.get(job.id)?.controller.signal.aborted) return;
          if (job.scope === 'translation') {
            void get()
              .downloadAudioForBooks(
                job.translationId,
                job.requestedBookIds ?? bibleBooks.map((book) => book.id)
              )
              .catch((error) =>
                console.warn('[Bible] Failed to resume audio translation download:', job.id, error)
              );
          } else if (job.bookId && availableBookIds.has(job.bookId)) {
            void get()
              .downloadAudioForBook(job.translationId, job.bookId)
              .catch((error) =>
                console.warn('[Bible] Failed to resume audio book download:', job.id, error)
              );
          }
        });
      } finally {
        for (const [jobId, owner] of recoveryOwners) {
          releaseAudioDownloadAbortController(`${jobId}:request:reattach`, owner);
        }
      }
    },

    downloadAudioForBook: shareDownload(
      (translationId: string, bookId: string) => `${translationId}:book:${bookId}`,
      (translationId: string, bookId: string) =>
        `${AUDIO_DOWNLOAD_JOB_ID_PREFIX}${translationId}:book:${bookId}`,
      async (signal: AbortSignal, translationId: string, bookId: string) => {
        const translation = get().translations.find((item) => item.id === translationId);
        const book = getBookById(bookId);

        if (!translation?.hasAudio || !book) {
          throw new Error('Audio downloads are not available for this book.');
        }

        const audio = await loadAudioDownloadModules();
        if (signal.aborted) return;
        const jobStore = await audio.createAudioDownloadJobStore({
          fileSystem: audio.expoAudioFileSystemAdapter,
          rootUri: audio.AUDIO_DOWNLOAD_ROOT_URI,
        });
        const transport = await audio.createBackgroundAudioDownloadTransport();
        if (signal.aborted) return;
        const handleAudioBookProgress = ({
          bookId: activeBookId,
          progress,
          translationId: activeTranslationId,
          jobId,
        }: AudioDownloadBookProgress) => {
          if (signal.aborted) return;
          set((state) => ({
            translations: state.translations.map((item) =>
              item.id === activeTranslationId && item.activeDownloadJob?.id === jobId
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
        let requestJobId = `${AUDIO_DOWNLOAD_JOB_ID_PREFIX}${translationId}:book:${bookId}`;
        const handleRequestJobUpdate = (job: AudioDownloadJobRecord) => {
          requestJobId = job.id;
          handleAudioJobUpdate(job, signal);
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
            signal,
            hooks: {
              onUnverifiedCache: (book) => handleUnverifiedAudioCache(book, signal),
              onStart: handleRequestJobUpdate,
              onReattach: handleRequestJobUpdate,
              onFailure: handleRequestJobUpdate,
              onComplete: handleRequestJobUpdate,
              onProgress: handleAudioBookProgress,
            },
          });
        } catch (error) {
          if (audio.isAudioDownloadCancellation(error)) {
            await restoreOtherAudioDownloads(jobStore, requestJobId, translationId);
            return;
          }
          throw error;
        }

        if (signal.aborted) return;
        await restoreOtherAudioDownloads(jobStore, requestJobId, translationId, [bookId]);

        trackBibleStoreEvent('audio_download_completed', {
          book_count: 1,
          book_id: bookId,
          chapter_count: book.chapters,
          content_kind: 'audio',
          download_scope: 'book',
          download_units: 1,
          translation_id: translationId,
        });
      }
    ),

    downloadAudioForBooks: shareDownload(
      (translationId: string, bookIds: string[]) =>
        `${translationId}:collection:${[...new Set(bookIds)].sort().join(',')}`,
      (translationId: string) => `${AUDIO_DOWNLOAD_JOB_ID_PREFIX}${translationId}:translation:all`,
      async (signal: AbortSignal, translationId: string, bookIds: string[]) => {
        const translation = get().translations.find((item) => item.id === translationId);
        if (!translation?.hasAudio) {
          throw new Error('Audio downloads are not available for this translation.');
        }

        const selectedBooks = bibleBooks.filter((book) => bookIds.includes(book.id));
        if (selectedBooks.length === 0) {
          throw new Error('Audio downloads are not available for the selected books.');
        }

        const audio = await loadAudioDownloadModules();
        if (signal.aborted) return;
        const jobStore = await audio.createAudioDownloadJobStore({
          fileSystem: audio.expoAudioFileSystemAdapter,
          rootUri: audio.AUDIO_DOWNLOAD_ROOT_URI,
        });
        const transport = await audio.createBackgroundAudioDownloadTransport();
        if (signal.aborted) return;
        // Chapter-level aggregate across every book in the collection, so a whole-Bible download
        // moves instead of sitting at 0% until a book finishes. The service already coalesces
        // these events. (N25)
        const handleAudioCollectionProgress = ({
          jobId,
          progress,
          translationId: progressTranslationId,
        }: AudioDownloadBookProgress) => {
          if (signal.aborted) return;
          set((state) => ({
            translations: state.translations.map((item) =>
              item.id === progressTranslationId && item.activeDownloadJob?.id === jobId
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
        let requestJobId = `${AUDIO_DOWNLOAD_JOB_ID_PREFIX}${translationId}:translation:all`;
        const handleRequestJobUpdate = (job: AudioDownloadJobRecord) => {
          requestJobId = job.id;
          handleAudioJobUpdate(job, signal);
        };
        const handleAudioBookComplete = ({
          bookId: completedBookId,
          completedBooks,
          totalBooks,
          translationId: completedTranslationId,
          jobId,
        }: AudioDownloadCollectionProgress) => {
          if (signal.aborted) return;
          const collectionProgress = clampPercent((completedBooks / totalBooks) * 100);
          set((state) => {
            // Never walk backwards: the chapter aggregate above is always >= this book fraction.
            const nextProgress = Math.max(
              state.downloadProgress?.jobId === jobId ? (state.downloadProgress.progress ?? 0) : 0,
              collectionProgress
            );
            return {
              translations: state.translations.map((item) =>
                item.id === completedTranslationId
                  ? item.activeDownloadJob?.id === jobId
                    ? updateTranslationAudioJobProgress(
                        mergeDownloadedAudioBook(item, completedBookId),
                        nextProgress
                      )
                    : mergeDownloadedAudioBook(item, completedBookId)
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
            signal,
            hooks: {
              onUnverifiedCache: (book) => handleUnverifiedAudioCache(book, signal),
              onStart: handleRequestJobUpdate,
              onReattach: handleRequestJobUpdate,
              onFailure: handleRequestJobUpdate,
              onComplete: handleRequestJobUpdate,
              onProgress: handleAudioCollectionProgress,
              onBookComplete: handleAudioBookComplete,
            },
          });
        } catch (error) {
          // User cancellation is terminal-but-not-a-failure: return without throwing so the
          // picker shows no error alert. (M2)
          if (audio.isAudioDownloadCancellation(error)) {
            await restoreOtherAudioDownloads(jobStore, requestJobId, translationId);
            return;
          }
          throw error;
        }

        if (signal.aborted) return;
        await restoreOtherAudioDownloads(
          jobStore,
          requestJobId,
          translationId,
          result.downloadedBookIds
        );

        trackBibleStoreEvent('audio_download_completed', {
          book_count: result.downloadedBookIds.length,
          chapter_count: selectedBooks.reduce((total, book) => total + book.chapters, 0),
          content_kind: 'audio',
          download_scope:
            result.downloadedBookIds.length === bibleBooks.length ? 'translation' : 'collection',
          download_units: result.downloadedBookIds.length,
          translation_id: translationId,
        });
      }
    ),

    downloadAudioForTranslation: async (translationId: string) => {
      await get().downloadAudioForBooks(
        translationId,
        bibleBooks.map((book) => book.id)
      );
    },
  };
};
