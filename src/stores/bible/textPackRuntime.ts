/**
 * Process-lifetime coordination for text pack installs, deletions and recovery.
 *
 * One module instance per app process, shared by every text pack action of the single Bible
 * store: which download owns a translation, the per-translation mutation lock, and the
 * translations whose readiness check must not re-enter recovery.
 */
import { writeTextPackInstallJournal } from '../../services/bible/textPackInstallJournal';
import type { TextPackInstallJournal } from '../../services/bible/textPackInstallJournalModel';

let textDownloadOperationSequence = 0;
/** translationId → operation id of the download that currently owns it. */
export const activeTextDownloadOperationIds = new Map<string, string>();
/** translationId → the promise every concurrent caller of that download shares. */
export const activeTextDownloadPromises = new Map<string, Promise<'installed' | 'cancelled'>>();
/** Translations whose text cancel was requested but not yet accepted by the transfer. */
export const pendingTextCancellationIds = new Set<string>();
const textPackMutationTails = new Map<string, Promise<void>>();
const textPackRecoveryReadinessBypass = new Set<string>();

export function isTextPackReadinessBypassed(translationId: string): boolean {
  return textPackRecoveryReadinessBypass.has(translationId);
}

export async function readRegisteredTextPackRepresentative(
  translationId: string,
  localPath: string,
  representative: { bookId: string; chapter: number },
  options: { invalidate?: boolean } = {}
): Promise<void> {
  textPackRecoveryReadinessBypass.add(translationId);
  try {
    const { getChapter, invalidateInstalledBibleDatabaseAtPath } =
      await import('../../services/bible/bibleDatabase');
    if (options.invalidate !== false) {
      await invalidateInstalledBibleDatabaseAtPath(localPath);
    }
    const verses = await getChapter(translationId, representative.bookId, representative.chapter);
    if (verses.length === 0) {
      throw new Error('Recovered translation returned no readable representative chapter.');
    }
  } finally {
    textPackRecoveryReadinessBypass.delete(translationId);
  }
}

export async function acquireTextPackMutationLock(translationId: string): Promise<() => void> {
  const previous = textPackMutationTails.get(translationId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  textPackMutationTails.set(translationId, tail);
  await previous;
  return () => {
    release();
    if (textPackMutationTails.get(translationId) === tail) {
      textPackMutationTails.delete(translationId);
    }
  };
}

export function nextTextDownloadOperationId(translationId: string): string {
  textDownloadOperationSequence += 1;
  return `${translationId}:${textDownloadOperationSequence}`;
}

let textPackJournalOperationSequence = 0;

export function nextTextPackJournalOperationId(translationId: string): string {
  textPackJournalOperationSequence += 1;
  return `${translationId}:${Date.now()}:${textPackJournalOperationSequence}`;
}

export function saveTextPackJournal(journal: TextPackInstallJournal): void {
  writeTextPackInstallJournal(journal);
}
