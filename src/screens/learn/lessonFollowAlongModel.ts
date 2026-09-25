import type { Verse } from '../../types';

/** Between a verse number and its words in the story paragraph (a thin space). */
export const STORY_VERSE_NUMBER_GAP = ' ';

/** Identifies a verse across the story's passage blocks. */
export const storyVerseKey = (verse: Pick<Verse, 'bookId' | 'chapter' | 'verse'>): string =>
  `${verse.bookId}:${verse.chapter}:${verse.verse}`;

/**
 * Where each verse's number starts in its paragraph's text, in UTF-16 units. Mirrors how the
 * story paragraph is rendered: a heading on its own line ("\n" + heading + "\n"), otherwise a
 * space between verses, then the number, the thin space and the words.
 */
export function storyVerseTextStarts(
  verses: readonly Pick<Verse, 'verse' | 'text' | 'heading'>[]
): number[] {
  const starts: number[] = [];
  let length = 0;
  verses.forEach((verse, index) => {
    if (verse.heading) {
      length += verse.heading.length + 2;
    } else if (index > 0) {
      length += 1;
    }
    starts.push(length);
    length += String(verse.verse).length + STORY_VERSE_NUMBER_GAP.length + verse.text.length;
  });
  return starts;
}

/** One laid-out line of a paragraph, as `onTextLayout` reports it. */
export interface StoryTextLine {
  y: number;
  text: string;
}

/**
 * The top of the line each verse starts on, relative to its paragraph. Nested Text spans have
 * no layout of their own, so the verse is found by its character offset in the paragraph's
 * laid-out lines. Null for a verse past the lines reported.
 */
export function storyVerseLineTops(
  verses: readonly Pick<Verse, 'verse' | 'text' | 'heading'>[],
  lines: readonly StoryTextLine[]
): (number | null)[] {
  const starts = storyVerseTextStarts(verses);
  let lineIndex = 0;
  let lineEnd = lines[0]?.text.length ?? 0;
  return starts.map((start) => {
    while (lineIndex < lines.length - 1 && start >= lineEnd) {
      lineIndex += 1;
      lineEnd += lines[lineIndex]?.text.length ?? 0;
    }
    return start < lineEnd ? (lines[lineIndex]?.y ?? null) : null;
  });
}

export interface LessonFollowScrollInput {
  /** The followed verse's top, in scroll content coordinates. */
  verseY: number;
  scrollY: number;
  viewportHeight: number;
  /** The story section's extent, in scroll content coordinates. */
  storyTop: number;
  storyBottom: number;
}

/**
 * Where to scroll so the followed verse stays in view, or null to stay put. The page only
 * follows while the story fills the middle of the screen: someone reading the questions
 * above or below it is left where they are.
 */
export function lessonFollowScrollTarget({
  verseY,
  scrollY,
  viewportHeight,
  storyTop,
  storyBottom,
}: LessonFollowScrollInput): number | null {
  if (viewportHeight <= 0) return null;
  const middle = scrollY + viewportHeight / 2;
  if (storyTop > middle || storyBottom < middle) return null;
  // The floating listen capsule covers the bottom of the screen, so the band stops short of it.
  const comfortableTop = scrollY + viewportHeight * 0.15;
  const comfortableBottom = scrollY + viewportHeight * 0.65;
  if (verseY >= comfortableTop && verseY <= comfortableBottom) return null;
  return Math.max(0, verseY - viewportHeight * 0.3);
}
