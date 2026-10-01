/**
 * Finishes text pack installs and deletions that a previous process left half done.
 *
 * Every text pack action, and the database readiness resolver, awaits this before touching a
 * pack, so a killed install or delete is settled (adopted, rolled back, or retired) before the
 * store trusts the row again. It runs at most once at a time, and stops running once the
 * journal is empty. An entry that cannot be retired does not make every read repeat the pass:
 * until the journal gains an entry or a back-off window passes, only an explicit `force` retries.
 */
import { readTextPackInstallJournal } from '../../services/bible/textPackInstallJournal';
import {
  removeTextPackDeletion,
  removeTextPackInstall,
  type TextPackInstallJournal,
} from '../../services/bible/textPackInstallJournalModel';
import { resetTranslationDownloadState } from '../bibleStoreModel';
import type { BibleStoreAccess } from './bibleStoreTypes';
import {
  fileSystemPathIsUsableDatabase,
  getCurrentDocumentDirectory,
} from './bibleStoreDeferredServices';
import {
  journalRecoveredVersion,
  journalRecoveryExpectedSha256,
  markTextPackInstalled,
  rebaseTextPackJournalPaths,
  rebaseTranslationPackPaths,
} from './textPackInstallModel';
import {
  acquireTextPackMutationLock,
  activeTextDownloadOperationIds,
  readRegisteredTextPackRepresentative,
  saveTextPackJournal,
} from './textPackRuntime';

const STUCK_RECOVERY_BACKOFF_MS = 60_000;

let textPackJournalRecovered = false;
let textPackJournalRecoveryPromise: Promise<void> | null = null;
// What the last unfinished pass left in the journal, and when, so an unchanged journal is not
// re-swept before every chapter read.
let stuckJournalSignature: string | null = null;
let stuckJournalPassAt = 0;

function journalSignature(journal: TextPackInstallJournal): string {
  return JSON.stringify([
    Object.values(journal.installs).map((entry) => entry.operationId),
    Object.values(journal.deletions).map((entry) => entry.operationId),
  ]);
}

export async function recoverTextPackJournal(
  store: BibleStoreAccess,
  options: { force?: boolean } = {}
): Promise<void> {
  if (textPackJournalRecovered) {
    return;
  }
  if (
    !options.force &&
    stuckJournalSignature !== null &&
    Date.now() - stuckJournalPassAt < STUCK_RECOVERY_BACKOFF_MS &&
    journalSignature(readTextPackInstallJournal()) === stuckJournalSignature
  ) {
    return;
  }
  if (textPackJournalRecoveryPromise) {
    return textPackJournalRecoveryPromise;
  }

  textPackJournalRecoveryPromise = (async () => {
    // Saved pack paths are absolute and iOS can change the container they point into, so
    // re-anchor them (and the journal's) before anything checks or deletes a file.
    const documentDirectory = await getCurrentDocumentDirectory();
    store.setState((state) => {
      const translations = rebaseTranslationPackPaths(state.translations, documentDirectory);
      return translations === state.translations ? state : { translations };
    });
    const storedJournal = readTextPackInstallJournal();
    const journal = rebaseTextPackJournalPaths(storedJournal, documentDirectory);
    if (journal !== storedJournal) saveTextPackJournal(journal);
    const completedDeletions = new Map<
      string,
      { deletionOperationId: string; installOperationId?: string }
    >();
    const completedInstalls = new Map<string, string>();
    const {
      deleteCatalogTextPackArtifacts,
      recoverInterruptedCatalogTextPack,
      validateCatalogTextPack,
    } = await import('../../services/bible/cloudTranslationService');
    const translationsBeingDeleted = new Set(Object.keys(journal.deletions));
    // A failed delete can outlive a successful reinstall at a unique candidate path.
    // Only an install captured by that delete belongs to its tombstone.
    const installsBeingDeleted = new Set(
      Object.entries(journal.installs)
        .filter(([translationId, install]) => {
          const deletion = journal.deletions[translationId];
          return deletion?.paths.some((path) =>
            [install.finalPath, install.stagingPath, install.rollbackPath].includes(path)
          );
        })
        .map(([translationId]) => translationId)
    );

    for (const [translationId, deletion] of Object.entries(journal.deletions)) {
      const releaseTextPackMutation = await acquireTextPackMutationLock(translationId);
      try {
        store.setState((state) => ({
          translations: state.translations.map((translation) =>
            translation.id === translationId &&
            (!translation.textPackLocalPath ||
              deletion.paths.includes(translation.textPackLocalPath))
              ? resetTranslationDownloadState(translation)
              : translation
          ),
        }));
        await Promise.all(deletion.paths.map((path) => deleteCatalogTextPackArtifacts(path)));
        completedDeletions.set(translationId, {
          deletionOperationId: deletion.operationId,
          installOperationId: installsBeingDeleted.has(translationId)
            ? journal.installs[translationId]?.operationId
            : undefined,
        });
      } catch (error) {
        console.warn('[Bible] Text pack deletion recovery is pending:', translationId, error);
      } finally {
        releaseTextPackMutation();
      }
    }

    for (const [translationId, install] of Object.entries(journal.installs)) {
      if (
        installsBeingDeleted.has(translationId) ||
        activeTextDownloadOperationIds.has(translationId)
      ) {
        continue;
      }
      const releaseTextPackMutation = await acquireTextPackMutationLock(translationId);
      const priorTranslation = store
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
          journalRecoveryExpectedSha256(recoveryResult, install),
          translationId
        );
        const recoveredVersion = journalRecoveredVersion(recoveryResult, install);
        const recoveredTranslation = store
          .getState()
          .translations.find((translation) => translation.id === translationId);
        if (recoveredTranslation) {
          store.setState((state) => ({
            translations: state.translations.map((translation) =>
              translation.id === translationId
                ? markTextPackInstalled(
                    translation,
                    install.finalPath,
                    recoveredVersion || translation.activeTextPackVersion || '1'
                  )
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
          store.setState((state) => ({
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
    const legacyTranslations = store
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
          await import('../../services/bible/cloudTranslationService')
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
        store.setState((state) => ({
          translations: state.translations.map((item) =>
            item.id === translation.id
              ? markTextPackInstalled(item, paths.finalPath, recoveredVersion)
              : item
          ),
        }));
        await readRegisteredTextPackRepresentative(translation.id, paths.finalPath, representative);
        if (recoveryResult === 'current') {
          await deleteCatalogTextPackArtifacts(paths.rollbackPath);
        }
      } catch (error) {
        store.setState((state) => ({
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
    stuckJournalSignature = textPackJournalRecovered ? null : journalSignature(latestJournal);
    stuckJournalPassAt = Date.now();
  })().finally(() => {
    textPackJournalRecoveryPromise = null;
  });
  return textPackJournalRecoveryPromise;
}
