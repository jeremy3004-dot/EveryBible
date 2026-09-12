import { mmkvInstance } from '../../stores/mmkvStorage';
import {
  emptyTextPackInstallJournal,
  type TextPackInstallJournal,
} from './textPackInstallJournalModel';

export const TEXT_PACK_INSTALL_JOURNAL_KEY = 'bible.textPackInstallJournal.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJournal(raw: string | undefined): TextPackInstallJournal {
  if (!raw) return emptyTextPackInstallJournal();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.installs) || !isRecord(parsed.deletions)) {
      return emptyTextPackInstallJournal();
    }
    return {
      installs: parsed.installs as TextPackInstallJournal['installs'],
      deletions: parsed.deletions as TextPackInstallJournal['deletions'],
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
