import type { BibleTranslation } from '../../types';
import { syncRemoteAudioMetadataResolverWithTranslations } from '../../services/audio/audioRemote';
import { readTextPackInstallJournal } from '../../services/bible/textPackInstallJournal';
import {
  removeTextPackDeletion,
  removeTextPackInstall,
  upsertTextPackDeletion,
} from '../../services/bible/textPackInstallJournalModel';
import {
  hasTranslationDownloadData,
  reconcileMissingRuntimeTranslationPacks,
  resetTranslationDownloadState,
} from '../bibleStoreModel';
import type { BibleSliceCreator, BibleState, BibleStoreAccess } from './bibleStoreTypes';
import {
  deleteFileSystemPath,
  fileSystemPathIsUsableDatabase,
  invalidateInstalledBibleDatabaseAtPath,
  loadAudioDownloadModules,
  syncVerseTimestampMetadata,
} from './bibleStoreDeferredServices';
import { recoverTextPackJournal } from './textPackJournalRecovery';
import { collectTextPackArtifactPaths } from './textPackInstallModel';
import {
  acquireTextPackMutationLock,
  activeTextDownloadPromises,
  nextTextPackJournalOperationId,
  saveTextPackJournal,
} from './textPackRuntime';

type TextPackMaintenanceSlice = Pick<
  BibleState,
  'reconcileTranslationPacks' | 'recoverMissingInstalledPack' | 'deleteTranslation'
>;

/** Keeping installed packs honest with the disk, and removing a translation's downloads. */
export const createTextPackMaintenanceSlice: BibleSliceCreator<TextPackMaintenanceSlice> = (
  set,
  get
) => {
  const store: BibleStoreAccess = { getState: get, setState: set };

  return {
    reconcileTranslationPacks: async () => {
      await recoverTextPackJournal(store);
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
              await import('../../services/bible/cloudTranslationService');
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

    deleteTranslation: async (translationId) => {
      const activeTextDownloadAtDeleteStart = activeTextDownloadPromises.get(translationId);
      if (activeTextDownloadAtDeleteStart) {
        try {
          const cloud = await import('../../services/bible/cloudTranslationService');
          cloud.cancelActiveCatalogTextPackDownload(translationId);
          await cloud.waitForActiveCatalogTextPackDownload(translationId);
          await activeTextDownloadAtDeleteStart;
        } catch (error) {
          console.warn('[Bible] Failed to settle text pack before deletion:', translationId, error);
        }
      }
      await recoverTextPackJournal(store);
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
          console.warn('[Bible] Failed to stop translation audio downloads:', translationId, error);
        }

        const filePaths = collectTextPackArtifactPaths(
          translation,
          readTextPackInstallJournal().installs[translationId]
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
                  console.warn('[Bible] Failed to cancel translation download job:', job.id, error);
                }

                await jobStore.removeJob(job.id);
              })
          );
        } catch (error) {
          console.warn('[Bible] Failed to clear translation download jobs:', translationId, error);
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
  };
};
