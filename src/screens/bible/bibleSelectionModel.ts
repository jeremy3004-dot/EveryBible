import type { Verse } from '../../types';

export interface BibleSelectionReferenceInput {
  bookName: string;
  chapter: number;
  startVerse: number;
  endVerse?: number | null;
  translationLabel: string;
}

export interface BibleSelectionRange {
  startVerse: number;
  endVerse?: number | null;
}

export const formatBibleSelectionReference = ({
  bookName,
  chapter,
  startVerse,
  endVerse,
  translationLabel,
}: BibleSelectionReferenceInput): string => {
  const verseLabel =
    endVerse != null && endVerse !== startVerse ? `${startVerse}-${endVerse}` : `${startVerse}`;

  return `${bookName} ${chapter}:${verseLabel} ${translationLabel}`.trim();
};

export const extractBibleSelectionText = (
  verses: Pick<Verse, 'text' | 'verse'>[],
  selection: BibleSelectionRange
): string => {
  const endVerse = selection.endVerse ?? selection.startVerse;

  return verses
    .filter((verse) => verse.verse >= selection.startVerse && verse.verse <= endVerse)
    .map((verse) => verse.text.trim())
    .filter((text) => text.length > 0)
    .join(' ');
};

export const buildBibleSelectionShareText = ({
  referenceLabel,
  selectedText,
}: {
  referenceLabel: string;
  selectedText: string;
}): string => {
  const trimmedText = selectedText.trim();

  return trimmedText.length > 0 ? `${referenceLabel}\n\n${trimmedText}` : referenceLabel;
};
