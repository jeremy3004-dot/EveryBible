import type { RepeatMode } from '../types';

const repeatModeCycle: RepeatMode[] = ['off', 'chapter', 'book'];

export function getNextRepeatMode(mode: RepeatMode): RepeatMode {
  const currentIndex = repeatModeCycle.indexOf(mode);
  return repeatModeCycle[(currentIndex + 1) % repeatModeCycle.length] ?? 'off';
}

export function resolveRepeatPlaybackTarget({
  repeatMode,
  bookId,
  chapter,
  totalChapters,
  availableChapters,
}: {
  repeatMode: RepeatMode;
  bookId: string | null;
  chapter: number | null;
  totalChapters: number | null;
  /**
   * Exact per-chapter audio coverage for this book, when the translation has one
   * (Every Language sets are sparse — Psalms can be chapter 117 alone). Omitted or
   * undefined keeps the plain 1..totalChapters walk.
   */
  availableChapters?: readonly number[] | undefined;
}): { bookId: string; chapter: number } | null {
  if (repeatMode === 'off' || !bookId || !chapter || !totalChapters || totalChapters <= 0) {
    return null;
  }

  if (repeatMode === 'chapter') {
    return { bookId, chapter };
  }

  if (availableChapters) {
    if (availableChapters.length === 0) {
      return null;
    }

    const ordered = [...availableChapters].sort((a, b) => a - b);
    return { bookId, chapter: ordered.find((entry) => entry > chapter) ?? ordered[0] };
  }

  return {
    bookId,
    chapter: chapter >= totalChapters ? 1 : chapter + 1,
  };
}
