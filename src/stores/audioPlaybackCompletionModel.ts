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
}: {
  repeatMode: RepeatMode;
  bookId: string | null;
  chapter: number | null;
  totalChapters: number | null;
}): { bookId: string; chapter: number } | null {
  if (repeatMode === 'off' || !bookId || !chapter || !totalChapters || totalChapters <= 0) {
    return null;
  }

  if (repeatMode === 'chapter') {
    return { bookId, chapter };
  }

  return {
    bookId,
    chapter: chapter >= totalChapters ? 1 : chapter + 1,
  };
}
