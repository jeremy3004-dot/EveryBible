import type { Verse } from '../../types';

export interface BibleSelectionReferenceInput {
  bookName: string;
  chapter: number;
  verses: number[];
  translationLabel: string;
}

export const normalizeBibleSelectionVerses = (verses: number[]): number[] =>
  [...new Set(verses)].sort((left, right) => left - right);

const formatVerseRun = (startVerse: number, endVerse: number): string =>
  startVerse === endVerse ? `${startVerse}` : `${startVerse}-${endVerse}`;

export const formatBibleSelectionReference = ({
  bookName,
  chapter,
  verses,
  translationLabel,
}: BibleSelectionReferenceInput): string => {
  const normalizedVerses = normalizeBibleSelectionVerses(verses);

  if (normalizedVerses.length === 0) {
    return `${bookName} ${chapter} ${translationLabel}`.trim();
  }

  const verseLabels: string[] = [];
  let runStart = normalizedVerses[0];
  let runEnd = normalizedVerses[0];

  for (const verse of normalizedVerses.slice(1)) {
    if (verse === runEnd + 1) {
      runEnd = verse;
      continue;
    }

    verseLabels.push(formatVerseRun(runStart, runEnd));
    runStart = verse;
    runEnd = verse;
  }

  verseLabels.push(formatVerseRun(runStart, runEnd));

  return `${bookName} ${chapter}:${verseLabels.join(', ')} ${translationLabel}`.trim();
};

export const extractBibleSelectionText = (
  verses: Pick<Verse, 'text' | 'verse'>[],
  selectedVerses: number[]
): string => {
  const selectedVerseSet = new Set(normalizeBibleSelectionVerses(selectedVerses));

  return verses
    .filter((verse) => selectedVerseSet.has(verse.verse))
    .map((verse) => verse.text.trim())
    .filter((text) => text.length > 0)
    .join(' ');
};

export const toggleBibleSelectionVerse = (
  selectedVerses: number[],
  verse: number
): number[] => {
  const normalizedVerses = normalizeBibleSelectionVerses(selectedVerses);

  if (normalizedVerses.includes(verse)) {
    return normalizedVerses.filter((selectedVerse) => selectedVerse !== verse);
  }

  return normalizeBibleSelectionVerses([...normalizedVerses, verse]);
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
