import type { RefObject } from 'react';

/**
 * The chapter the reader is stepping to by itself — its chapter arrows (on the
 * player bar, its strip or the listen transport), a swipe, or audio moving on to the
 * next chapter — so that chapter opens with the chrome as the reader left it. Any
 * other arrival (a plan day, search, the picker, a link, another tab) opens expanded.
 */
export type ReaderChromeCarryRef = RefObject<string | null>;

const chapterKeyOf = (bookId: string, chapter: number) => `${bookId}:${chapter}`;

/** Called just before the reader moves its own route to another chapter. */
export function markReaderChromeCarry(
  ref: ReaderChromeCarryRef,
  bookId: string,
  chapter: number
): void {
  ref.current = chapterKeyOf(bookId, chapter);
}

/**
 * Whether the chapter now shown is the one the reader stepped to. Consumed either way,
 * so a step that never landed cannot carry the chrome into a later, unrelated arrival.
 */
export function takeReaderChromeCarry(
  ref: ReaderChromeCarryRef,
  bookId: string,
  chapter: number
): boolean {
  const carried = ref.current === chapterKeyOf(bookId, chapter);
  ref.current = null;
  return carried;
}
