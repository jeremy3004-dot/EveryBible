type TextPackInstallPhase = 'downloading' | 'activating';

export interface TextPackInstallJournalEntry {
  operationId: string;
  translationId: string;
  version: string;
  expectedSha256?: string;
  expectedVerseCount?: number;
  previousPath?: string | null;
  previousVersion?: string | null;
  finalPath: string;
  stagingPath: string;
  rollbackPath: string;
  phase: TextPackInstallPhase;
  updatedAt: number;
}

export interface TextPackDeletionJournalEntry {
  operationId: string;
  translationId: string;
  paths: string[];
  updatedAt: number;
}

export interface TextPackInstallJournal {
  installs: Record<string, TextPackInstallJournalEntry>;
  deletions: Record<string, TextPackDeletionJournalEntry>;
}

export const emptyTextPackInstallJournal = (): TextPackInstallJournal => ({
  installs: {},
  deletions: {},
});

export function upsertTextPackInstall(
  journal: TextPackInstallJournal,
  entry: TextPackInstallJournalEntry
): TextPackInstallJournal {
  return {
    ...journal,
    installs: { ...journal.installs, [entry.translationId]: entry },
  };
}

export function removeTextPackInstall(
  journal: TextPackInstallJournal,
  translationId: string
): TextPackInstallJournal {
  const installs = { ...journal.installs };
  delete installs[translationId];
  return { ...journal, installs };
}

export function upsertTextPackDeletion(
  journal: TextPackInstallJournal,
  entry: TextPackDeletionJournalEntry
): TextPackInstallJournal {
  return {
    ...journal,
    deletions: { ...journal.deletions, [entry.translationId]: entry },
  };
}

export function removeTextPackDeletion(
  journal: TextPackInstallJournal,
  translationId: string
): TextPackInstallJournal {
  const deletions = { ...journal.deletions };
  delete deletions[translationId];
  return { ...journal, deletions };
}
