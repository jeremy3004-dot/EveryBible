import type { BibleSliceCreator, BibleState } from './bibleStoreTypes';
import { loadAudioDownloadModules } from './bibleStoreDeferredServices';
import { resolveAudioCancellationJobId } from './audioDownloadJobModel';
import { installStateAfterTextCancel } from './textPackInstallModel';
import { pendingTextCancellationIds } from './textPackRuntime';

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
            translation.id === cancelledTranslationId
              ? { ...translation, activeDownloadJob: null }
              : translation
          )
        : state.translations,
    }));
  },
});
