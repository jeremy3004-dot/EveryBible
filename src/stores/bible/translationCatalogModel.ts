/**
 * Pure rules for the translation catalog and the reader's translation choice.
 */
import type { BibleTranslation } from '../../types';

/**
 * A catalog refresh replaces a runtime translation's metadata but never what this device has
 * installed: download flags, pack paths and install state carry over from the existing row.
 */
export function carryInstallStateIntoRuntimeTranslation(
  translation: BibleTranslation,
  existing: BibleTranslation | undefined
): BibleTranslation {
  return {
    ...translation,
    isDownloaded: translation.isDownloaded || existing?.isDownloaded === true,
    downloadedBooks:
      translation.downloadedBooks.length > 0
        ? translation.downloadedBooks
        : (existing?.downloadedBooks ?? []),
    downloadedAudioBooks:
      translation.downloadedAudioBooks.length > 0
        ? translation.downloadedAudioBooks
        : (existing?.downloadedAudioBooks ?? []),
    installState: existing?.installState ?? translation.installState,
    activeTextPackVersion: existing?.activeTextPackVersion ?? translation.activeTextPackVersion,
    pendingTextPackVersion: existing?.pendingTextPackVersion ?? translation.pendingTextPackVersion,
    pendingTextPackLocalPath:
      existing?.pendingTextPackLocalPath ?? translation.pendingTextPackLocalPath,
    textPackLocalPath: existing?.textPackLocalPath ?? translation.textPackLocalPath,
    rollbackTextPackVersion:
      existing?.rollbackTextPackVersion ?? translation.rollbackTextPackVersion,
    rollbackTextPackLocalPath:
      existing?.rollbackTextPackLocalPath ?? translation.rollbackTextPackLocalPath,
    lastInstallError: existing?.lastInstallError ?? translation.lastInstallError,
  };
}

/** A trimmed language name, or null for anything blank or not a string. */
export function normalizePreferredTranslationLanguage(language: unknown): string | null {
  return typeof language === 'string' && language.trim().length > 0 ? language.trim() : null;
}

/**
 * Whether the translation's text can be read on this device right now: a bundled translation
 * always can, a runtime one only once its pack is installed.
 */
export function hasReadableTranslationText(translation: BibleTranslation): boolean {
  const hasInstalledTextPack = Boolean(translation.textPackLocalPath);
  return translation.hasText && (translation.source !== 'runtime' || hasInstalledTextPack);
}
