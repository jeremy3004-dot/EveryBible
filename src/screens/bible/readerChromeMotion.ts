import { READER_TAB_BAR_COLLAPSE_DISTANCE } from '../../navigation/readerTabBarMotion';

interface ReaderChromeScrollInput {
  progress: number;
  previousOffset: number;
  offset: number;
  viewportHeight: number;
  contentHeight: number;
  reduceMotion?: boolean;
}

/** Direction-sensitive, UI-thread motion. Clamp the offsets before taking a
 * delta so iOS rubber-banding cannot hide the controls during rebound. */
export function getNextReaderChromeProgress({
  progress,
  previousOffset,
  offset,
  viewportHeight,
  contentHeight,
  reduceMotion = false,
}: ReaderChromeScrollInput): number {
  'worklet';
  const maxOffset = Math.max(0, contentHeight - viewportHeight);
  if (reduceMotion || maxOffset === 0) return 0;

  const current = Math.max(0, Math.min(offset, maxOffset));
  const previous = Math.max(0, Math.min(previousOffset, maxOffset));
  const distance = READER_TAB_BAR_COLLAPSE_DISTANCE;
  const next = progress + (current - previous) / distance;
  // Reveal continuously as either end approaches; content padding stays fixed.
  return Math.max(0, Math.min(1, next, current / distance, (maxOffset - current) / distance));
}

/**
 * The chrome's progress for a list that moved on its own — back to the top of a new
 * chapter, onto a plan's focus verse, after the verse the audio is on. Only the
 * reader's finger collapses or reveals the chrome, so the move leaves it where it was,
 * unless the chapter no longer scrolls at all: then nothing could bring hidden chrome
 * back, and it is shown.
 */
export function getSettledReaderChromeProgress({
  progress,
  viewportHeight,
  contentHeight,
  reduceMotion = false,
}: Pick<
  ReaderChromeScrollInput,
  'progress' | 'viewportHeight' | 'contentHeight' | 'reduceMotion'
>): number {
  'worklet';
  if (reduceMotion || contentHeight - viewportHeight <= 0) return 0;
  return Math.max(0, Math.min(1, progress));
}

/**
 * The chrome a new chapter opens with when the reader stepped there itself (the
 * chapter arrows, a swipe, audio moving on to the next chapter): collapsed stays
 * collapsed, shown stays shown, and a half-way chrome settles on the nearer end.
 */
export function getCarriedReaderChromeProgress(progress: number): number {
  'worklet';
  return progress >= 0.5 ? 1 : 0;
}
