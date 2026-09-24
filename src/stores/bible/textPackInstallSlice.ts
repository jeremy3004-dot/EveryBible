import { readTextPackInstallJournal } from '../../services/bible/textPackInstallJournal';
import {
  removeTextPackInstall,
  upsertTextPackInstall,
} from '../../services/bible/textPackInstallJournalModel';
import type { BibleSliceCreator, BibleState, BibleStoreAccess } from './bibleStoreTypes';
import {
  invalidateInstalledBibleDatabaseAtPath,
  scheduleTextPackSearchIndexBuild,
  trackBibleStoreEvent,
} from './bibleStoreDeferredServices';
import { recoverTextPackJournal } from './textPackJournalRecovery';
import {
  installStateAfterTextCancel,
  isBundledSeedTranslation,
  mapTextPackDownloadProgress,
  markTextPackInstalled,
  restoreTextPackAfterFailedReadback,
  type TextPackTransferProgress,
} from './textPackInstallModel';
import {
  acquireTextPackMutationLock,
  activeTextDownloadOperationIds,
  activeTextDownloadPromises,
  nextTextDownloadOperationId,
  nextTextPackJournalOperationId,
  pendingTextCancellationIds,
  readRegisteredTextPackRepresentative,
  saveTextPackJournal,
} from './textPackRuntime';

type TextPackInstallSlice = Pick<BibleState, 'downloadTranslation' | 'downloadAllBooks'>;

/**
 * Downloading and installing a translation's catalog text pack (a prebuilt SQLite file).
 *
 * One download per translation at a time: concurrent callers share the running download's
 * promise, and the per-translation mutation lock orders it against deletion and recovery.
 */
export const createTextPackInstallSlice: BibleSliceCreator<TextPackInstallSlice> = (set, get) => {
  const store: BibleStoreAccess = { getState: get, setState: set };

  return {
    downloadTranslation: async (translationId: string, _bookId?: string) => {
      const existingDownload = activeTextDownloadPromises.get(translationId);
      if (existingDownload) {
        return existingDownload;
      }
      await recoverTextPackJournal(store);
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

      // Bundled seeded translations are already present in the app's bundled database.
      // Mark them available, but do not pretend runtime/cloud translations are installed
      // unless a local pack path exists.
      if (translation && isBundledSeedTranslation(translation)) {
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
        } = await import('../../services/bible/cloudTranslationService');
        isTextPackDownloadCancelled = isDownloadCancelled;

        const handleProgress = (progress: TextPackTransferProgress) => {
          const activeProgress = get().downloadProgress;
          if (
            activeTextDownloadOperationIds.get(translationId) !== operationId ||
            pendingTextCancellationIds.has(translationId) ||
            activeProgress?.translationId !== translationId ||
            activeProgress?.jobId
          ) {
            return;
          }
          set({ downloadProgress: mapTextPackDownloadProgress(translationId, progress) });
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
          await import('../../services/bible/cloudTranslationService');
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
                  ...markTextPackInstalled(t, localPath, textPack?.version ?? '1'),
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
            await import('../../services/bible/cloudTranslationService');
          await invalidateInstalledBibleDatabaseAtPath(localPath).catch(() => {});
          await deleteCatalogTextPackArtifacts(localPath).catch(() => {});
          set((state) => ({
            translations: state.translations.map((item) =>
              item.id === translationId
                ? restoreTextPackAfterFailedReadback(item, translation)
                : item
            ),
          }));
          throw readbackError;
        }

        const previousTextPackPath = translation?.textPackLocalPath;
        if (previousTextPackPath && previousTextPackPath !== localPath) {
          try {
            const { deleteCatalogTextPackArtifacts } =
              await import('../../services/bible/cloudTranslationService');
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
                          installState: installStateAfterTextCancel(t),
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
  };
};
