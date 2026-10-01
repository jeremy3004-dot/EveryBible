/**
 * Pure transitions for installing, recovering and removing catalog text packs.
 *
 * The store's text pack actions own the locks, journal and file work; the row and banner
 * shapes they write are decided here so each transition can be tested on its own.
 */
import type { BibleTranslation, TranslationDownloadProgress } from '../../types';
import type {
  TextPackInstallJournal,
  TextPackInstallJournalEntry,
} from '../../services/bible/textPackInstallJournalModel';
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

const PACK_DIRECTORY_MARKER = '/translations/';

/**
 * Installed packs are persisted as absolute paths, but iOS can hand the app a new container UUID
 * after an update or restore, so every saved path then points at a directory that no longer
 * exists. Pack files always live under `<documentDirectory>/translations/`, so the part from that
 * directory onward is re-anchored on the current document directory. Paths that do not have the
 * marker (or when there is no document directory) are returned untouched.
 */
export function rebaseTextPackPath<T extends string | null | undefined>(
  path: T,
  documentDirectory: string | undefined
): T | string {
  if (!path || !documentDirectory) return path;
  const packsRoot = `${documentDirectory.replace(/\/$/, '')}${PACK_DIRECTORY_MARKER}`;
  if (path.startsWith(packsRoot)) return path;
  const markerIndex = path.indexOf(PACK_DIRECTORY_MARKER);
  if (markerIndex < 0) return path;
  return `${packsRoot}${path.slice(markerIndex + PACK_DIRECTORY_MARKER.length)}`;
}

/** Re-anchors every saved pack path on a translation list; returns the same array if none moved. */
export function rebaseTranslationPackPaths(
  translations: BibleTranslation[],
  documentDirectory: string | undefined
): BibleTranslation[] {
  let changed = false;
  const next = translations.map((translation) => {
    const textPackLocalPath = rebaseTextPackPath(translation.textPackLocalPath, documentDirectory);
    const pendingTextPackLocalPath = rebaseTextPackPath(
      translation.pendingTextPackLocalPath,
      documentDirectory
    );
    const rollbackTextPackLocalPath = rebaseTextPackPath(
      translation.rollbackTextPackLocalPath,
      documentDirectory
    );
    if (
      textPackLocalPath === translation.textPackLocalPath &&
      pendingTextPackLocalPath === translation.pendingTextPackLocalPath &&
      rollbackTextPackLocalPath === translation.rollbackTextPackLocalPath
    ) {
      return translation;
    }
    changed = true;
    return {
      ...translation,
      textPackLocalPath,
      pendingTextPackLocalPath,
      rollbackTextPackLocalPath,
    };
  });
  return changed ? next : translations;
}

/** Re-anchors the paths inside the install/deletion journal; same object if none moved. */
export function rebaseTextPackJournalPaths(
  journal: TextPackInstallJournal,
  documentDirectory: string | undefined
): TextPackInstallJournal {
  let changed = false;
  const move = (path: string): string => {
    const next = rebaseTextPackPath(path, documentDirectory);
    if (next !== path) changed = true;
    return next;
  };
  const installs = Object.fromEntries(
    Object.entries(journal.installs).map(([id, entry]) => [
      id,
      {
        ...entry,
        finalPath: move(entry.finalPath),
        stagingPath: move(entry.stagingPath),
        rollbackPath: move(entry.rollbackPath),
        ...(entry.previousPath ? { previousPath: move(entry.previousPath) } : {}),
      },
    ])
  );
  const deletions = Object.fromEntries(
    Object.entries(journal.deletions).map(([id, entry]) => [
      id,
      { ...entry, paths: entry.paths.map(move) },
    ])
  );
  return changed ? { installs, deletions } : journal;
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
