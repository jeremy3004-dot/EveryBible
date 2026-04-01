import type { Verse } from '../../types';

export interface BibleSelectionReferenceInput {
  bookName: string;
  chapter: number;
  verses: number[];
  translationLabel: string;
}

export interface BibleSelectionShareTranslationLabelInput {
  translationName?: string | null;
  translationAbbreviation?: string | null;
  translationLanguage?: string | null;
}

export interface BibleSelectionVerseRange {
  verse_start: number;
  verse_end: number;
}

export const normalizeBibleSelectionVerses = (verses: number[]): number[] =>
  [...new Set(verses)].sort((left, right) => left - right);

const normalizeSelectionLabel = (value?: string | null): string => value?.trim() ?? '';

export const getBibleSelectionShareTranslationLabel = ({
  translationName,
  translationAbbreviation,
  translationLanguage,
}: BibleSelectionShareTranslationLabelInput): string => {
  const normalizedName = normalizeSelectionLabel(translationName);
  const normalizedAbbreviation = normalizeSelectionLabel(translationAbbreviation);
  const normalizedLanguage = normalizeSelectionLabel(translationLanguage);

  if (!normalizedAbbreviation) {
    return normalizedName || normalizedLanguage;
  }

  const abbreviationMatchesLanguage =
    normalizedLanguage.length > 0 &&
    normalizedAbbreviation.localeCompare(normalizedLanguage, undefined, {
      sensitivity: 'accent',
      usage: 'search',
    }) === 0;

  if (abbreviationMatchesLanguage && normalizedName.length > 0) {
    return normalizedName;
  }

  return normalizedAbbreviation;
};

const formatVerseRun = (startVerse: number, endVerse: number): string =>
  startVerse === endVerse ? `${startVerse}` : `${startVerse}-${endVerse}`;

export const buildBibleSelectionVerseRanges = (
  verses: number[]
): BibleSelectionVerseRange[] => {
  const normalizedVerses = normalizeBibleSelectionVerses(verses);

  if (normalizedVerses.length === 0) {
    return [];
  }

  const verseRanges: BibleSelectionVerseRange[] = [];
  let rangeStart = normalizedVerses[0];
  let rangeEnd = normalizedVerses[0];

  for (const verse of normalizedVerses.slice(1)) {
    if (verse === rangeEnd + 1) {
      rangeEnd = verse;
      continue;
    }

    verseRanges.push({
      verse_start: rangeStart,
      verse_end: rangeEnd,
    });
    rangeStart = verse;
    rangeEnd = verse;
  }

  verseRanges.push({
    verse_start: rangeStart,
    verse_end: rangeEnd,
  });

  return verseRanges;
};

export const formatBibleSelectionReference = ({
  bookName,
  chapter,
  verses,
  translationLabel,
}: BibleSelectionReferenceInput): string => {
  const verseRanges = buildBibleSelectionVerseRanges(verses);

  if (verseRanges.length === 0) {
    return `${bookName} ${chapter} ${translationLabel}`.trim();
  }

  const verseLabels = verseRanges.map((range) => formatVerseRun(range.verse_start, range.verse_end));

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
