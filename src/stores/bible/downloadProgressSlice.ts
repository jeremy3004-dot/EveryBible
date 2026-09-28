import { bibleBooks } from '../../constants/books';
import type { BibleSliceCreator, BibleState } from './bibleStoreTypes';
import { loadAudioDownloadModules } from './bibleStoreDeferredServices';
import { resolveAudioCancellationJobId } from './audioDownloadJobModel';
import { installStateAfterTextCancel } from './textPackInstallModel';
import { pendingTextCancellationIds } from './textPackRuntime';
import {
  isAudioDownloadBookOwnedByCollection,
  runAudioBookExclusively,
  requestAudioDownloadCancellation,
  runAudioDownloadCancellationCleanup,
  waitForAudioDownloadOwnersToSettle,
} from '../../services/audio/download/activeDownloads';
import type { AudioDownloadJobRecord } from '../../services/audio/audioDownloadService';

type DownloadProgressSlice = Pick<BibleState, 'downloadProgress' | 'cancelDownload'>;

/**
 * The single download banner shared by text and audio transfers, and cancelling whichever
 * transfer currently owns it.
 */
export const createDownloadProgressSlice: BibleSliceCreator<DownloadProgressSlice> = (
  set,
  get
) => ({
  downloadProgress: null,

  cancelDownload: () => {
    const progress = get().downloadProgress;
    const cancelledTranslationId = progress?.translationId;
    const resolvedJobId = resolveAudioCancellationJobId(progress, get().translations);
    if (resolvedJobId) {
      const jobId = resolvedJobId;
      requestAudioDownloadCancellation(jobId);
      const ownersSettled = waitForAudioDownloadOwnersToSettle(jobId);
      // Stop the in-JS scheduling loop (runWithConcurrency) immediately, ask the native
      // background transport to stop any in-flight task for the same real job id, AND remove
      // the persisted registry record so the cancelled job can't resurrect as a phantom
      // "Loading… 0%" on the next launch's reattach. (M1/M2)
      runAudioDownloadCancellationCleanup(jobId, async () => {
        const audio = await loadAudioDownloadModules();
        let jobStore: Awaited<ReturnType<typeof audio.createAudioDownloadJobStore>> | null = null;
        let parent: AudioDownloadJobRecord | null = null;
        let coveredChildren: AudioDownloadJobRecord[] = [];
        try {
          jobStore = await audio.createAudioDownloadJobStore({
            fileSystem: audio.expoAudioFileSystemAdapter,
            rootUri: audio.AUDIO_DOWNLOAD_ROOT_URI,
          });
          parent = await jobStore.getJob(jobId);
          if (parent?.scope === 'translation') {
            coveredChildren = (await jobStore.listJobs()).filter(
              (job) =>
                parent &&
                isAudioDownloadBookOwnedByCollection(job, parent) &&
                (job.status === 'downloading' || job.status === 'queued')
            );
          }
        } catch {
          // Without a registry record, a collection's native subset is unknown.
        }
        await ownersSettled;
        // Legacy full-translation tasks can predate child records. Modern tasks always persist
        // their child first, so only the captured owned candidates need namespace leases.
        const legacyParent = parent?.scope === 'translation' && !parent.runId;
        const candidateBookIds =
          parent?.scope === 'translation'
            ? legacyParent
              ? (parent.requestedBookIds ?? bibleBooks.map((book) => book.id))
              : coveredChildren.flatMap((child) => (child.bookId ? [child.bookId] : []))
            : jobId.split(':')[2] === 'book'
              ? [jobId.split(':')[3]!]
              : [];
        const directoryUris = [...new Set(candidateBookIds)]
          .sort()
          .map((bookId) =>
            audio.getBookAudioDirectoryUri(
              parent?.translationId ?? jobId.split(':')[1]!,
              bookId,
              audio.AUDIO_DOWNLOAD_ROOT_URI
            )
          );
        const cleanupSignal = new AbortController().signal;
        const underLeases = (index: number): Promise<void> =>
          index < directoryUris.length
            ? runAudioBookExclusively(directoryUris[index]!, cleanupSignal, () =>
                underLeases(index + 1)
              )
            : cleanNamespaces();
        const cleanNamespaces = async () => {
          let nativeBookIds = candidateBookIds;
          if (parent?.scope === 'translation' && jobStore) {
            const current = await jobStore.listJobs();
            nativeBookIds = candidateBookIds.filter((bookId) => {
              const row = current.find(
                (job) =>
                  job.scope === 'book' &&
                  job.translationId === parent?.translationId &&
                  job.bookId === bookId
              );
              return !row || isAudioDownloadBookOwnedByCollection(row, parent!);
            });
          }
          try {
            const activeTransport = await audio.createBackgroundAudioDownloadTransport();
            if (parent?.scope === 'translation') {
              await activeTransport.cancelJob?.(jobId, { bookIds: nativeBookIds });
            } else if (jobId.split(':')[2] !== 'translation') {
              await activeTransport.cancelJob?.(jobId);
            }
          } catch {
            // Native transport may be unavailable in some Expo/dev contexts.
          }
          if (jobStore) {
            for (const child of coveredChildren) {
              try {
                const current = await jobStore.getJob(child.id);
                // Run identity survives terminal updates; a later standalone has a fresh identity.
                if (current && (child.runId ? current.runId === child.runId : current === child))
                  await jobStore.removeJob(child.id);
              } catch {
                // Continue retiring the other records after one failed native registry write.
              }
            }
            try {
              await jobStore.removeJob(jobId);
            } catch {
              /* Best-effort registry cleanup. */
            }
          }
        };
        await underLeases(0);
      });
    } else if (cancelledTranslationId) {
      pendingTextCancellationIds.add(cancelledTranslationId);
      import('../../services/bible/cloudTranslationService')
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
                ? { ...translation, installState: installStateAfterTextCancel(translation) }
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
            translation.id === cancelledTranslationId &&
            translation.activeDownloadJob?.id === resolvedJobId
              ? { ...translation, activeDownloadJob: null }
              : translation
          )
        : state.translations,
    }));
  },
});
