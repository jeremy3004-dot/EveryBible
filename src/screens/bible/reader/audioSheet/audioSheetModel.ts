import type {
  BackgroundMusicChoice,
  RepeatMode,
  RepeatPassage,
  RepeatPassagePoint,
} from '../../../../types/audio';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Which page of the audio sheet is showing. */
export type AudioSheetPage = 'main' | 'library' | 'passage';

/**
 * The sound library's tiles: Off, Shuffle, then every catalog sound in catalog order.
 * The catalog grows as remote sounds are published, so this reads whatever it holds.
 */
export function soundLibraryChoices(
  catalog: ReadonlyArray<{ id: BackgroundMusicChoice }>
): BackgroundMusicChoice[] {
  const sounds = catalog
    .map((option) => option.id)
    .filter((id) => id !== 'off' && id !== 'shuffle');
  return ['off', 'shuffle', ...new Set(sounds)];
}

/** Every sound's name lives beside the bundled ones under interface.music. */
export const soundLabelKey = (choice: BackgroundMusicChoice) => `interface.music.${choice}.label`;

export function repeatChipLabelKey(mode: RepeatMode): string {
  switch (mode) {
    case 'chapter':
      return 'audio.repeatOptionChapter';
    case 'book':
      return 'audio.repeatOptionBook';
    case 'passage':
      return 'audio.repeatOptionPassage';
    default:
      return 'audio.repeatOptionOff';
  }
}

/** "Genesis 1:1–13", or "Genesis 1:1–2:3" across chapters. */
export function formatRepeatPassage(
  passage: Pick<RepeatPassage, 'start' | 'end'>,
  bookName: string,
  t: Translate
): string {
  const { start, end } = passage;
  if (start.chapter === end.chapter) {
    return t('audio.passageRangeInChapter', {
      book: bookName,
      chapter: start.chapter,
      startVerse: start.verse,
      endVerse: end.verse,
    });
  }
  return t('audio.passageRange', {
    book: bookName,
    startChapter: start.chapter,
    startVerse: start.verse,
    endChapter: end.chapter,
    endVerse: end.verse,
  });
}

// ---- Passage picker ---------------------------------------------------------------

/** Psalm 119, the longest chapter: the ceiling while a chapter's real count is unknown. */
export const MAX_VERSES_IN_CHAPTER = 176;

export interface PassageDraft {
  start: RepeatPassagePoint;
  end: RepeatPassagePoint;
}

/** The verse count of a chapter of the current book, or null while it is unknown. */
export type VerseCountLookup = (chapter: number) => number | null;

export type PassageField = 'startChapter' | 'startVerse' | 'endChapter' | 'endVerse';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const lastVerse = (chapter: number, verseCount: VerseCountLookup) =>
  verseCount(chapter) ?? MAX_VERSES_IN_CHAPTER;

/**
 * Where the picker opens: the stored passage when it belongs to this book, else the
 * whole of the chapter being read.
 */
export function initialPassageDraft(
  stored: RepeatPassage | null,
  bookId: string,
  chapter: number,
  chapterCount: number
): PassageDraft {
  if (stored && stored.bookId === bookId && stored.end.chapter <= chapterCount) {
    return { start: { ...stored.start }, end: { ...stored.end } };
  }
  return {
    start: { chapter, verse: 1 },
    end: { chapter, verse: MAX_VERSES_IN_CHAPTER },
  };
}

/** Pulls both ends inside their chapters' verse counts and keeps the end at or after the start. */
export function clampPassageDraft(
  draft: PassageDraft,
  chapterCount: number,
  verseCount: VerseCountLookup
): PassageDraft {
  const startChapter = clamp(draft.start.chapter, 1, chapterCount);
  const start = {
    chapter: startChapter,
    verse: clamp(draft.start.verse, 1, lastVerse(startChapter, verseCount)),
  };
  const endChapter = clamp(draft.end.chapter, startChapter, chapterCount);
  const endMinVerse = endChapter === startChapter ? start.verse : 1;
  const end = {
    chapter: endChapter,
    verse: clamp(draft.end.verse, endMinVerse, lastVerse(endChapter, verseCount)),
  };
  return { start, end };
}

/**
 * One stepper press. Moving a chapter resets its verse to that chapter's natural edge
 * (the start to verse 1, the end to the last verse); moving the start past the end
 * carries the end along.
 */
export function stepPassageDraft(
  draft: PassageDraft,
  field: PassageField,
  delta: number,
  chapterCount: number,
  verseCount: VerseCountLookup
): PassageDraft {
  const current = clampPassageDraft(draft, chapterCount, verseCount);
  const { start, end } = current;
  let next: PassageDraft;
  switch (field) {
    case 'startChapter': {
      const chapter = clamp(start.chapter + delta, 1, chapterCount);
      next = {
        start: { chapter, verse: 1 },
        end: end.chapter < chapter ? { chapter, verse: lastVerse(chapter, verseCount) } : end,
      };
      break;
    }
    case 'startVerse': {
      const verse = start.verse + delta;
      next = {
        start: { chapter: start.chapter, verse },
        end:
          end.chapter === start.chapter && end.verse < verse
            ? { chapter: end.chapter, verse }
            : end,
      };
      break;
    }
    case 'endChapter': {
      const chapter = clamp(end.chapter + delta, start.chapter, chapterCount);
      next = { start, end: { chapter, verse: lastVerse(chapter, verseCount) } };
      break;
    }
    case 'endVerse':
      next = { start, end: { chapter: end.chapter, verse: end.verse + delta } };
      break;
  }
  return clampPassageDraft(next, chapterCount, verseCount);
}

/** The bounds a stepper shows, for disabling its buttons. */
export function passageFieldBounds(
  draft: PassageDraft,
  field: PassageField,
  chapterCount: number,
  verseCount: VerseCountLookup
): { value: number; min: number; max: number } {
  const { start, end } = clampPassageDraft(draft, chapterCount, verseCount);
  switch (field) {
    case 'startChapter':
      return { value: start.chapter, min: 1, max: chapterCount };
    case 'startVerse':
      return { value: start.verse, min: 1, max: lastVerse(start.chapter, verseCount) };
    case 'endChapter':
      return { value: end.chapter, min: start.chapter, max: chapterCount };
    case 'endVerse':
      return {
        value: end.verse,
        min: end.chapter === start.chapter ? start.verse : 1,
        max: lastVerse(end.chapter, verseCount),
      };
  }
}

/** The highest verse number in a chapter's verses (translations may skip some). */
export const chapterVerseCount = (verses: ReadonlyArray<{ verse: number }>): number =>
  verses.reduce((highest, verse) => Math.max(highest, verse.verse), 0);
