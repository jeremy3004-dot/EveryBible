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

// Measured from the September reference: play center y824 -> y889 on a
// 440x956pt iPhone. Its diameter stays fixed throughout the transition.
export const READER_PLAY_BUTTON_SIZE = 64;
export const READER_PLAY_COLLAPSE_TRAVEL = 65;
export const READER_CHAPTER_BUTTON_SIZE = 40;
