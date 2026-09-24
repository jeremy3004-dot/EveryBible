import type { PassageBlock } from '../../services/gather/gatherBibleService';
import type { Verse } from '../../types';

export interface StoryPassageBlockView {
  key: string;
  /** Shown above the verses; null when one block in the reading translation needs none. */
  heading: string | null;
  verses: Verse[];
}

export interface StoryPassageView {
  blocks: StoryPassageBlockView[];
  verseCount: number;
  /** The translations actually on screen, in first-seen order. */
  translationNames: string[];
}

/**
 * Shapes a lesson's passage blocks for the Story section. Returns null when no
 * block has a verse, so the screen shows its empty state instead of a blank
 * paragraph. A block read from a fallback translation always carries a heading
 * naming that translation, so borrowed text is never passed off as the
 * reader's own translation.
 */
export function buildStoryPassageView(
  blocks: PassageBlock[],
  readingTranslationId: string,
  translationName: (translationId: string) => string
): StoryPassageView | null {
  const readable = blocks.filter((block) => block.verses.length > 0);
  if (readable.length === 0) {
    return null;
  }

  const showHeadings = readable.length > 1;
  const translationNames = [
    ...new Set(readable.map((block) => translationName(block.translationId))),
  ];

  return {
    blocks: readable.map((block, index) => {
      const borrowed = block.translationId !== readingTranslationId;
      return {
        key: `${index}:${block.label}`,
        heading: borrowed
          ? `${block.label} · ${translationName(block.translationId)}`
          : showHeadings
            ? block.label
            : null,
        verses: block.verses,
      };
    }),
    verseCount: readable.reduce((total, block) => total + block.verses.length, 0),
    translationNames,
  };
}
