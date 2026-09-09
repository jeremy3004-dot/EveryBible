import type { BibleTranslation, DailyScripture, DailyScriptureReference, Verse } from '../../types';

export type ChapterPresentationMode = 'text' | 'audio-first' | 'empty';

interface AudioFirstChapterFact {
  label: string;
  value: string;
}

export interface AudioFirstChapterPresentation {
  title: string;
  pills: string[];
  facts: AudioFirstChapterFact[];
}

interface ChapterPresentationOptions {
  verses: Verse[];
  translation?: Pick<BibleTranslation, 'hasText' | 'hasAudio' | 'audioGranularity'>;
  audioAvailable: boolean;
}

interface BuildDailyScriptureOptions {
  reference: DailyScriptureReference;
  verse: Verse | null;
  passageText?: string | null;
  translation?: Pick<BibleTranslation, 'hasAudio' | 'audioGranularity'>;
  audioAvailable: boolean;
}

interface BuildAudioFirstChapterPresentationOptions {
  bookName: string;
  chapter: number;
  translationLabel: string;
  testamentLabel: string;
  chapterLabel: string;
  availableLabel: string;
  offlineLabel?: string;
}

/**
 * Whether a chapter's text is worth fetching at all.
 *
 * Audio-only translations (Bhujel, and every other `hasText: false` entry) have no
 * text pack to read, so a lookup throws. The reader treated that throw as a load
 * failure and rendered its error card, which sits ahead of the audio-first branch —
 * so audio played while the screen showed "couldn't load", instead of the chapter
 * artwork. Skipping the query leaves `verses` empty, which is exactly what
 * getChapterPresentationMode() needs to resolve 'audio-first'.
 *
 * An unknown translation returns true: text must never be skipped just because the
 * catalog entry has not resolved yet.
 */
export function shouldAttemptChapterTextLoad(
  translation?: Pick<BibleTranslation, 'hasText'>
): boolean {
  if (!translation) {
    return true;
  }
  return translation.hasText;
}

export function getChapterPresentationMode({
  verses,
  translation,
  audioAvailable,
}: ChapterPresentationOptions): ChapterPresentationMode {
  if (verses.length > 0) {
    return 'text';
  }

  if (translation?.hasAudio && audioAvailable) {
    return 'audio-first';
  }

  return 'empty';
}

export function buildAudioFirstChapterPresentation({
  bookName,
  chapter,
  translationLabel,
  testamentLabel,
  chapterLabel,
  availableLabel,
  offlineLabel,
}: BuildAudioFirstChapterPresentationOptions): AudioFirstChapterPresentation {
  return {
    title: `${bookName} ${chapter}`,
    pills: [translationLabel, testamentLabel, offlineLabel].filter(Boolean) as string[],
    facts: [
      { label: chapterLabel, value: String(chapter) },
      { label: availableLabel, value: translationLabel },
    ],
  };
}

export function formatDailyScriptureReferenceLabel(
  bookName: string,
  chapter: number,
  verse?: number,
  verseEnd?: number
): string {
  if (!verse) {
    return `${bookName} ${chapter}`;
  }

  if (!verseEnd || verseEnd === verse) {
    return `${bookName} ${chapter}:${verse}`;
  }

  return `${bookName} ${chapter}:${verse}-${verseEnd}`;
}

export function buildDailyScripture({
  reference,
  verse,
  passageText,
  translation,
  audioAvailable,
}: BuildDailyScriptureOptions): DailyScripture {
  const verseText = passageText?.trim() || verse?.text?.trim() || null;
  const verseEnd = reference.verseEnd;

  if (verseText) {
    return {
      kind: 'verse-text',
      bookId: reference.bookId,
      chapter: reference.chapter,
      verse: reference.verse,
      ...(verseEnd !== undefined ? { verseEnd } : {}),
      text: verseText,
      playScope: 'none',
    };
  }

  if (translation?.hasAudio && audioAvailable) {
    const playScope = translation.audioGranularity === 'verse' ? 'verse' : 'chapter';

    return {
      kind: playScope === 'verse' ? 'verse-audio' : 'section-audio',
      bookId: reference.bookId,
      chapter: reference.chapter,
      verse: reference.verse,
      ...(verseEnd !== undefined ? { verseEnd } : {}),
      text: null,
      playScope,
    };
  }

  return {
    kind: 'empty',
    bookId: reference.bookId,
    chapter: reference.chapter,
    verse: reference.verse,
    ...(verseEnd !== undefined ? { verseEnd } : {}),
    text: null,
    playScope: 'none',
  };
}
