/** Public download entry points: one book, or a whole translation book by book. */
import type { BibleBook } from '../../../constants/books';
import { buildAudioChapterTargets } from '../audioDownloads';
import {
  AudioDownloadInsufficientSpaceError,
  isOutOfSpaceError,
} from '../audioDownloadErrorMessage';
import type {
  AudioDownloadLifecycleHooks,
  AudioFileSystemAdapter,
  DownloadContext,
  RemoteAudioAsset,
  ResolveRemoteAudio,
} from './types';
import { AudioDownloadCancelledError } from './errors';
import {
  DEFAULT_AUDIO_ROOT_URI,
  createAudioDownloadTaskId,
  getBookAudioDirectoryUri,
  getChapterAudioFileUri,
} from './audioFileLocations';
import {
  UNTRACKED_CHAPTER_SIZES,
  isCachedChapterSizeWrong,
  isValidDownloadedAudioFile,
  openVerifiedChapterSizes,
  verifyDownloadedChapterAudio,
} from './fileVerification';
import { assertEnoughFreeSpaceForAudioDownload, toInsufficientSpaceError } from './freeSpace';
import {
  registerAudioDownloadAbortController,
  releaseAudioDownloadAbortController,
} from './activeDownloads';
import {
  completeAudioDownloadJob,
  failAudioDownloadJob,
  resolveJobStore,
  startAudioDownloadJob,
} from './jobRegistry';
import {
  clampProgress,
  downloadChapterWithInactivityTimeoutAndRetry,
  runWithConcurrency,
} from './chapterTransfer';

const DEFAULT_CHAPTER_DOWNLOAD_CONCURRENCY = 4;
const DEFAULT_BOOK_DOWNLOAD_CONCURRENCY = 2;

interface DownloadAudioBookParams extends DownloadContext {
  translationId: string;
  book: BibleBook;
  resolveRemoteAudio: ResolveRemoteAudio;
  fileSystem: AudioFileSystemAdapter;
  signal?: AbortSignal;
  // Set by the translation-scope path: the collection already ran one pre-flight for every book,
  // and its own lifecycle hooks own the UI-visible job id.
  skipFreeSpacePreflight?: boolean;
}

interface DownloadAudioTranslationParams extends DownloadContext {
  translationId: string;
  books: BibleBook[];
  resolveRemoteAudio: ResolveRemoteAudio;
  fileSystem: AudioFileSystemAdapter;
}

export async function downloadAudioBook({
  rootUri,
  translationId,
  book,
  resolveRemoteAudio,
  fileSystem,
  jobStore,
  hooks,
  transport,
  signal: externalSignal,
  skipFreeSpacePreflight,
}: DownloadAudioBookParams): Promise<{ bookId: string; chapterCount: number }> {
  const resolvedRootUri = rootUri ?? DEFAULT_AUDIO_ROOT_URI;
  const activeJobStore = jobStore ?? (await resolveJobStore(fileSystem, resolvedRootUri));
  const activeTransport = transport ?? { downloadFile: fileSystem.downloadFile };
  const directoryUri = getBookAudioDirectoryUri(translationId, book.id, resolvedRootUri);
  const chapterTargets = buildAudioChapterTargets([book]);
  const chapterProgressByNumber = new Map<number, number>();

  if (!skipFreeSpacePreflight) {
    await assertEnoughFreeSpaceForAudioDownload({
      fileSystem,
      chapterCount: chapterTargets.length,
    });
  }

  const job = await startAudioDownloadJob({
    translationId,
    scope: 'book',
    bookId: book.id,
    jobStore: activeJobStore,
    hooks,
  });

  // EVERY book job registers its own controller, including nested ones. Previously a nested book
  // job reused the parent's signal and was absent from the registry, so anything holding a book
  // job id (the native transport's task namespace, a reattach, a stale downloadProgress.jobId)
  // could not abort it. The parent signal is chained into the child so cancelling the translation
  // still stops every book. (N22)
  const activeDownload = registerAudioDownloadAbortController(job.id);
  const ownAbortController = activeDownload.controller;
  const signal = ownAbortController.signal;
  const onExternalAbort = () => ownAbortController.abort();
  if (externalSignal) {
    if (externalSignal.aborted) ownAbortController.abort();
    else externalSignal.addEventListener('abort', onExternalAbort);
  }

  let lastEmittedProgress = -1;
  let lastEmittedCompletedChapters = -1;
  let verifiedSizes = UNTRACKED_CHAPTER_SIZES;

  const emitBookProgress = (chapter?: number): void => {
    const totalChapters = chapterTargets.length;
    if (totalChapters === 0) {
      return;
    }

    const completedChapters = chapterTargets.reduce(
      (count, target) => count + (chapterProgressByNumber.get(target.chapter) === 100 ? 1 : 0),
      0
    );
    const aggregateProgress =
      chapterTargets.reduce(
        (sum, target) => sum + (chapterProgressByNumber.get(target.chapter) ?? 0),
        0
      ) / totalChapters;
    const progress = clampProgress(aggregateProgress);

    if (progress === lastEmittedProgress && completedChapters === lastEmittedCompletedChapters) {
      return;
    }

    lastEmittedProgress = progress;
    lastEmittedCompletedChapters = completedChapters;

    hooks?.onProgress?.({
      translationId,
      bookId: book.id,
      chapter,
      progress,
      completedChapters,
      totalChapters,
      jobId: job.id,
    });
  };

  try {
    await fileSystem.ensureDirectory(directoryUri);
    verifiedSizes = await openVerifiedChapterSizes(fileSystem, directoryUri);
    await runWithConcurrency(
      chapterTargets,
      DEFAULT_CHAPTER_DOWNLOAD_CONCURRENCY,
      async (target) => {
        chapterProgressByNumber.set(target.chapter, 0);
        const fileUri = getChapterAudioFileUri(
          translationId,
          target.bookId,
          target.chapter,
          resolvedRootUri
        );
        let remoteAudio: RemoteAudioAsset | null;
        if (await isValidDownloadedAudioFile(fileSystem, fileUri, true)) {
          if (signal.aborted) throw new AudioDownloadCancelledError();
          if (await verifiedSizes.isVerified(target.chapter, fileUri)) {
            if (signal.aborted) throw new AudioDownloadCancelledError();
            chapterProgressByNumber.set(target.chapter, 100);
            emitBookProgress(target.chapter);
            return;
          }
          // A file over the 1KB floor can still be a truncated transfer (an interrupted download
          // from an older build wrote straight to this path). When the source publishes the
          // chapter's size, a mismatch means incomplete: delete it and download again. A lookup
          // failure keeps the file, as before, rather than failing a download that is done, but
          // leaves it unverified so the next resume checks it again.
          let lookupFailed = false;
          remoteAudio = await resolveRemoteAudio(
            translationId,
            target.bookId,
            target.chapter
          ).catch(() => {
            lookupFailed = true;
            return null;
          });
          if (signal.aborted) throw new AudioDownloadCancelledError();
          if (!(await isCachedChapterSizeWrong(fileSystem, fileUri, remoteAudio?.bytes))) {
            if (!lookupFailed) await verifiedSizes.record(target.chapter, fileUri);
            chapterProgressByNumber.set(target.chapter, 100);
            emitBookProgress(target.chapter);
            return;
          }
          await fileSystem.deleteFile?.(fileUri);
        } else {
          remoteAudio = await resolveRemoteAudio(translationId, target.bookId, target.chapter);
        }

        if (!remoteAudio?.url) {
          throw new Error(`Audio is not available for ${target.bookId} ${target.chapter}`);
        }

        await downloadChapterWithInactivityTimeoutAndRetry(async (onActivity, attemptSignal) => {
          await activeTransport.downloadFile(remoteAudio.url, fileUri, {
            jobId: job.id,
            taskId: createAudioDownloadTaskId(job.id, target.bookId, target.chapter),
            translationId,
            bookId: target.bookId,
            chapter: target.chapter,
            signal: attemptSignal,
            onProgress: ({ bytesDownloaded, bytesTotal }) => {
              if (!onActivity()) return;
              const chapterProgress =
                bytesTotal > 0
                  ? Math.min(99, clampProgress((bytesDownloaded / bytesTotal) * 100))
                  : 0;
              chapterProgressByNumber.set(target.chapter, chapterProgress);
              emitBookProgress(target.chapter);
            },
          });
          if (attemptSignal.aborted) throw new AudioDownloadCancelledError();
          await verifyDownloadedChapterAudio({
            fileSystem,
            fileUri,
            expected: { bytes: remoteAudio.bytes, sha256: remoteAudio.sha256 },
          });
        }, signal);

        if (signal.aborted) throw new AudioDownloadCancelledError();
        await verifiedSizes.record(target.chapter, fileUri);
        chapterProgressByNumber.set(target.chapter, 100);
        emitBookProgress(target.chapter);
      },
      signal
    );

    if (signal.aborted) {
      throw new AudioDownloadCancelledError();
    }
  } catch (error) {
    let failure = error instanceof Error ? error : new Error(String(error));

    // A cancellation is a first-class terminal state, not a failure. Remove the persisted job so
    // it can't resurrect as a phantom "Loading… 0%" on the next launch, and skip failAudioDownloadJob
    // (which would fire onFailure → an error alert in the UI). (M2)
    if (failure instanceof AudioDownloadCancelledError) {
      await activeJobStore.removeJob(job.id);
      throw failure;
    }

    if (isOutOfSpaceError(failure) && !(failure instanceof AudioDownloadInsufficientSpaceError)) {
      failure = await toInsufficientSpaceError(
        fileSystem,
        chapterTargets.filter((target) => chapterProgressByNumber.get(target.chapter) !== 100)
          .length
      );
    }

    await failAudioDownloadJob({
      jobId: job.id,
      jobStore: activeJobStore,
      error: failure,
      hooks,
    });
    throw failure;
  } finally {
    externalSignal?.removeEventListener('abort', onExternalAbort);
    // Settle the size record before the job counts as stopped: a delete waits on that, and a
    // late write must not land in a directory it has removed.
    await verifiedSizes.flush();
    releaseAudioDownloadAbortController(job.id, activeDownload);
  }

  await completeAudioDownloadJob({
    jobId: job.id,
    jobStore: activeJobStore,
    hooks,
  });

  return { bookId: book.id, chapterCount: chapterTargets.length };
}

export async function downloadAudioTranslation({
  rootUri,
  translationId,
  books,
  resolveRemoteAudio,
  fileSystem,
  jobStore,
  hooks,
  transport,
}: DownloadAudioTranslationParams): Promise<{ downloadedBookIds: string[] }> {
  const resolvedRootUri = rootUri ?? DEFAULT_AUDIO_ROOT_URI;
  const activeJobStore = jobStore ?? (await resolveJobStore(fileSystem, resolvedRootUri));
  const activeTransport = transport ?? { downloadFile: fileSystem.downloadFile };
  const downloadedBookIds: string[] = [];
  const totalChapters = buildAudioChapterTargets(books).length;

  await assertEnoughFreeSpaceForAudioDownload({ fileSystem, chapterCount: totalChapters });

  const translationJob = await startAudioDownloadJob({
    translationId,
    scope: 'translation',
    jobStore: activeJobStore,
    hooks,
  });

  // Passing this signal into every nested downloadAudioBook means cancelling the
  // translation job also stops whichever book's chapter loop is currently in flight.
  const activeDownload = registerAudioDownloadAbortController(translationJob.id);
  const signal = activeDownload.controller.signal;

  // Book-scope lifecycle events must NOT reach the caller: startAudioDownloadJob fires onStart for
  // each nested BOOK job, which used to overwrite the UI's downloadProgress.jobId with a job id
  // that cancelDownload could not act on. The collection's own hooks stay authoritative. (N22)
  const completedChaptersByBook = new Map<string, number>();
  let lastEmittedProgress = -1;
  let lastEmittedCompletedChapters = -1;
  const bookHooks: AudioDownloadLifecycleHooks = {
    // Aggregate chapters across every book so a whole-Bible download reports real progress instead
    // of sitting at 0% until an entire book finishes. Coalesced exactly like the per-book emitter
    // so the set() rate stays where the June ANR fix put it. (N25)
    onProgress: (event) => {
      completedChaptersByBook.set(event.bookId, event.completedChapters);
      if (!hooks?.onProgress || totalChapters === 0) return;
      let completedChapters = 0;
      completedChaptersByBook.forEach((count) => {
        completedChapters += count;
      });
      const progress = clampProgress((completedChapters / totalChapters) * 100);
      if (progress === lastEmittedProgress && completedChapters === lastEmittedCompletedChapters) {
        return;
      }
      lastEmittedProgress = progress;
      lastEmittedCompletedChapters = completedChapters;
      hooks.onProgress?.({
        translationId,
        bookId: event.bookId,
        chapter: event.chapter,
        progress,
        completedChapters,
        totalChapters,
        jobId: translationJob.id,
      });
    },
  };

  try {
    try {
      await runWithConcurrency(
        books,
        DEFAULT_BOOK_DOWNLOAD_CONCURRENCY,
        async (book) => {
          const result = await downloadAudioBook({
            rootUri: resolvedRootUri,
            translationId,
            book,
            resolveRemoteAudio,
            fileSystem,
            jobStore: activeJobStore,
            hooks: bookHooks,
            transport: activeTransport,
            signal,
            skipFreeSpacePreflight: true,
          });
          downloadedBookIds.push(result.bookId);
          hooks?.onBookComplete?.({
            translationId,
            bookId: result.bookId,
            completedBooks: downloadedBookIds.length,
            totalBooks: books.length,
            jobId: translationJob.id,
          });
        },
        signal
      );

      if (signal.aborted) {
        throw new AudioDownloadCancelledError();
      }
    } catch (error) {
      let failure = error instanceof Error ? error : new Error(String(error));

      // A book that ran out of space counted only its own chapters: restate the room every
      // chapter still missing from the translation needs.
      if (isOutOfSpaceError(failure)) {
        let completedChapters = 0;
        completedChaptersByBook.forEach((count) => {
          completedChapters += count;
        });
        failure = await toInsufficientSpaceError(fileSystem, totalChapters - completedChapters);
      }

      // Cancellation is terminal-but-not-a-failure: drop the persisted job and re-throw without
      // firing onFailure, so cancelling a full-Bible audio download doesn't surface an error alert
      // or leave a phantom job behind. (M2)
      if (failure instanceof AudioDownloadCancelledError) {
        await activeJobStore.removeJob(translationJob.id);
        throw failure;
      }

      await failAudioDownloadJob({
        jobId: translationJob.id,
        jobStore: activeJobStore,
        error: failure,
        hooks,
      });
      throw failure;
    }
  } finally {
    releaseAudioDownloadAbortController(translationJob.id, activeDownload);
  }

  await completeAudioDownloadJob({
    jobId: translationJob.id,
    jobStore: activeJobStore,
    hooks,
  });

  return { downloadedBookIds };
}
