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

export type StoryStatus = 'loading' | 'error' | 'empty' | 'ready';

/**
 * How many verses the Story lays out on its first commit. A whole chapter set as one
 * nested-Text paragraph took ~1.4 s of UI-thread layout on an Android emulator, with
 * nothing on screen until it finished; the first screenful is enough to open on.
 */
export const STORY_FIRST_PAINT_VERSES = 8;

/**
 * The first `maxVerses` verses of a story, across its blocks in order. Returns the
 * same view when it already fits, so a short story is never re-laid-out.
 */
export function limitStoryPassageView(view: StoryPassageView, maxVerses: number): StoryPassageView {
  if (view.verseCount <= maxVerses) return view;
  let remaining = maxVerses;
  const blocks: StoryPassageBlockView[] = [];
  for (const block of view.blocks) {
    if (remaining <= 0) break;
    blocks.push(
      block.verses.length <= remaining
        ? block
        : { ...block, verses: block.verses.slice(0, remaining) }
    );
    remaining -= block.verses.length;
  }
  return { ...view, blocks, verseCount: maxVerses };
}

/**
 * Binds each chapter number to the book name before it, with a no-break space, so a
 * reference that has to wrap ("LISTEN · GENESIS 1") moves as a unit instead of leaving
 * the "1" alone on a second line.
 */
export function keepReferenceTogether(reference: string): string {
  return reference.replace(/ (?=\d)/g, ' ');
}

/**
 * Which Story state to render. A load that threw is an error the reader can
 * retry; a passage that loaded with no verses is genuinely empty. Showing both
 * as "No passage text available" hid the failure and offered no way out.
 */
export function resolveStoryStatus({
  isLoading,
  loadFailed,
  view,
}: {
  isLoading: boolean;
  loadFailed: boolean;
  view: StoryPassageView | null;
}): StoryStatus {
  if (isLoading) return 'loading';
  if (loadFailed) return 'error';
  return view ? 'ready' : 'empty';
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
