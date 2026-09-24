import { mmkvInstance } from '../../stores/mmkvStorage';
import {
  emptyTextPackInstallJournal,
  type TextPackDeletionJournalEntry,
  type TextPackInstallJournal,
  type TextPackInstallJournalEntry,
} from './textPackInstallJournalModel';

export const TEXT_PACK_INSTALL_JOURNAL_KEY = 'bible.textPackInstallJournal.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === 'string';

// Recovery dereferences these fields. An entry missing one would throw on every recovery pass and
// never be retired, which keeps recovery (and its filesystem sweep) running before every read.
function isInstallEntry(value: unknown): value is TextPackInstallJournalEntry {
  return (
    isRecord(value) &&
    isString(value.operationId) &&
    isString(value.translationId) &&
    isString(value.finalPath) &&
    isString(value.stagingPath) &&
    isString(value.rollbackPath)
  );
}

function isDeletionEntry(value: unknown): value is TextPackDeletionJournalEntry {
  return (
    isRecord(value) &&
    isString(value.operationId) &&
    isString(value.translationId) &&
    Array.isArray(value.paths) &&
    value.paths.every(isString)
  );
}

function keepEntries<T>(
  entries: Record<string, unknown>,
  isEntry: (value: unknown) => value is T
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(entries).filter((entry): entry is [string, T] => isEntry(entry[1]))
  );
}

function parseJournal(raw: string | undefined): TextPackInstallJournal {
  if (!raw) return emptyTextPackInstallJournal();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.installs) || !isRecord(parsed.deletions)) {
      return emptyTextPackInstallJournal();
    }
    return {
      installs: keepEntries(parsed.installs, isInstallEntry),
      deletions: keepEntries(parsed.deletions, isDeletionEntry),
    };
  } catch {
    return emptyTextPackInstallJournal();
  }
}

export function readTextPackInstallJournal(): TextPackInstallJournal {
  return parseJournal(mmkvInstance.getString(TEXT_PACK_INSTALL_JOURNAL_KEY));
}

export function writeTextPackInstallJournal(journal: TextPackInstallJournal): void {
  if (Object.keys(journal.installs).length === 0 && Object.keys(journal.deletions).length === 0) {
    mmkvInstance.delete(TEXT_PACK_INSTALL_JOURNAL_KEY);
    return;
  }
  mmkvInstance.set(TEXT_PACK_INSTALL_JOURNAL_KEY, JSON.stringify(journal));
}
