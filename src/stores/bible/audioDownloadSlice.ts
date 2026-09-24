// Direct module import, not the '../../constants' barrel: the barrel re-exports bookIcons, which
// drags a ~298KB vector JSON into the store's startup graph. (P3)
import { bibleBooks, getBookById } from '../../constants/books';
import type {
  AudioDownloadBookProgress,
  AudioDownloadCollectionProgress,
  AudioDownloadJobRecord,
} from '../../services/audio/audioDownloadService';
import { mergeDownloadedAudioBook } from '../bibleStoreModel';
import type { BibleSliceCreator, BibleState } from './bibleStoreTypes';
import { loadAudioDownloadModules, trackBibleStoreEvent } from './bibleStoreDeferredServices';
import {
  appendDownloadedAudioBooks,
  clampPercent,
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
  const handleAudioJobUpdate = (job: AudioDownloadJobRecord) => {
    set((state) => ({
      translations: state.translations.map((item) => updateTranslationAudioJobState(item, job)),
      downloadProgress: mapAudioDownloadProgress(job),
    }));
  };

  // A user cancellation is not an error — clear the in-flight job/progress so no error alert
  // surfaces. Genuine failures propagate to the caller. (M2)
  const clearCancelledAudioDownload = (translationId: string) => {
    set((state) => ({
      translations: state.translations.map((item) =>
        item.id === translationId ? { ...item, activeDownloadJob: null } : item
      ),
      downloadProgress:
        get().downloadProgress?.translationId === translationId ? null : get().downloadProgress,
    }));
  };

  return {
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
        if (audio.isAudioDownloadCancellation(error)) {
          clearCancelledAudioDownload(translationId);
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
        // User cancellation is terminal-but-not-a-failure: return without throwing so the
        // picker shows no error alert. (M2)
        if (audio.isAudioDownloadCancellation(error)) {
          clearCancelledAudioDownload(translationId);
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
                downloadedAudioBooks: appendDownloadedAudioBooks(
                  item.downloadedAudioBooks,
                  result.downloadedBookIds
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
  };
};
