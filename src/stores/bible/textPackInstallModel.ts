/**
 * Pure transitions for installing, recovering and removing catalog text packs.
 *
 * The store's text pack actions own the locks, journal and file work; the row and banner
 * shapes they write are decided here so each transition can be tested on its own.
 */
import type { BibleTranslation, TranslationDownloadProgress } from '../../types';
import type { TextPackInstallJournalEntry } from '../../services/bible/textPackInstallJournalModel';
import { clampPercent } from './audioDownloadJobModel';

/** What cloudTranslationService reports while a pack is transferred and indexed. */
export interface TextPackTransferProgress {
  error?: string;
  phase: 'fetching' | 'indexing' | 'complete' | 'error';
  totalVerses: number;
  versesDownloaded: number;
  bytesDownloaded?: number;
  bytesTotal?: number;
}

/** Result of `recoverInterruptedCatalogTextPack`: which copy, if any, is now at the final path. */
export type TextPackRecoveryResult = 'current' | 'current-without-rollback' | 'previous' | 'none';

export function mapTextPackDownloadProgress(
  translationId: string,
  progress: TextPackTransferProgress
): TranslationDownloadProgress {
  // Clamped: bytesTotal is the response's advertised length, which the bytes written can
  // pass (a compressed response, say), and the picker prints this value as a percentage.
  const pct =
    progress.bytesTotal && progress.bytesTotal > 0
      ? clampPercent(((progress.bytesDownloaded ?? 0) / progress.bytesTotal) * 100)
      : progress.totalVerses > 0
        ? clampPercent((progress.versesDownloaded / progress.totalVerses) * 100)
        : 0;
  return {
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
  };
}

/**
 * Bundled seeded translations are already present in the app's bundled database; runtime
 * (cloud) translations are only installed once a local pack path exists.
 */
export function isBundledSeedTranslation(translation: BibleTranslation | undefined): boolean {
  const hasInstalledTextPack = Boolean(translation?.textPackLocalPath);
  return Boolean(
    translation?.hasText && translation?.source !== 'runtime' && !hasInstalledTextPack
  );
}

export function markTextPackInstalled(
  translation: BibleTranslation,
  localPath: string,
  activeTextPackVersion: string
): BibleTranslation {
  return {
    ...translation,
    isDownloaded: true,
    hasText: true,
    installState: 'installed' as const,
    textPackLocalPath: localPath,
    activeTextPackVersion,
  };
}

/**
 * A downloaded pack that failed its read-back is discarded: the row returns to the pack it
 * had before the download, or to remote-only when there was none.
 */
export function restoreTextPackAfterFailedReadback(
  item: BibleTranslation,
  previous: BibleTranslation | undefined
): BibleTranslation {
  return previous?.textPackLocalPath
    ? {
        ...item,
        isDownloaded: true,
        hasText: true,
        installState: 'installed' as const,
        textPackLocalPath: previous.textPackLocalPath,
        activeTextPackVersion: previous.activeTextPackVersion,
      }
    : {
        ...item,
        isDownloaded: false,
        installState: 'remote-only' as const,
        textPackLocalPath: null,
      };
}

/** The install state a row settles to once its text transfer is cancelled. */
export function installStateAfterTextCancel(
  translation: BibleTranslation
): 'installed' | 'remote-only' {
  return translation.textPackLocalPath ? 'installed' : 'remote-only';
}

/** Every file a translation's text install may have left on disk, each once. */
export function collectTextPackArtifactPaths(
  translation: BibleTranslation,
  pendingJournalInstall: TextPackInstallJournalEntry | undefined
): string[] {
  return Array.from(
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
}

/**
 * The checksum a journaled install is validated against after recovery. Only a pack known to
 * be the new download can be held to the new checksum.
 */
export function journalRecoveryExpectedSha256(
  recoveryResult: TextPackRecoveryResult,
  install: TextPackInstallJournalEntry
): string | undefined {
  return recoveryResult === 'current' ||
    (recoveryResult === 'current-without-rollback' && install.phase === 'activating')
    ? install.expectedSha256
    : undefined;
}

/** The pack version a journaled install is registered with after recovery, if known. */
export function journalRecoveredVersion(
  recoveryResult: TextPackRecoveryResult,
  install: TextPackInstallJournalEntry
): string | undefined {
  return recoveryResult === 'previous'
    ? install.previousVersion || undefined
    : recoveryResult === 'current-without-rollback' && install.phase !== 'activating'
      ? install.previousVersion || undefined
      : install.version || undefined;
}
