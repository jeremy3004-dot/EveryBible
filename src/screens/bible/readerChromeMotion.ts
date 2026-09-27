interface ReaderChromeScrollInput {
  progress: number;
  previousOffset: number;
  offset: number;
  viewportHeight: number;
  contentHeight: number;
  reduceMotion?: boolean;
}

/** Finger travel in one direction that drops or brings back the chrome. */
export const READER_CHROME_SNAP_TRAVEL = 8;
/** At the very top of a chapter the chrome stays up. */
const READER_CHROME_TOP_ZONE = 16;
/** Near the end it comes back, for the next-chapter controls. */
const READER_CHROME_END_ZONE = 96;
/** How long the chrome takes to drop or return once it snaps. */
export const READER_CHROME_SNAP_MS = 200;

interface ReaderChromeTargetInput extends Omit<ReaderChromeScrollInput, 'progress'> {
  /** Where the chrome is headed now: 0 shown, 1 dropped. */
  target: 0 | 1;
  /** Finger travel so far in the current direction (+ down, - up). */
  travel: number;
}

/**
 * Where the chrome should be after one scroll update from the reader's finger. It
 * snaps rather than following the finger: a few points of travel down drops it all
 * the way, a few points up brings it back, and the top and end of a chapter keep it
 * up. Offsets are clamped first so iOS rubber-banding cannot hide it during rebound.
 */
export function getNextReaderChromeTarget({
  target,
  travel,
  previousOffset,
  offset,
  viewportHeight,
  contentHeight,
  reduceMotion = false,
}: ReaderChromeTargetInput): { target: 0 | 1; travel: number } {
  'worklet';
  const maxOffset = Math.max(0, contentHeight - viewportHeight);
  if (reduceMotion || maxOffset === 0) return { target: 0, travel: 0 };

  const current = Math.max(0, Math.min(offset, maxOffset));
  const previous = Math.max(0, Math.min(previousOffset, maxOffset));
  const delta = current - previous;
  // Travel adds up while the direction holds and starts over when it reverses.
  const nextTravel =
    delta === 0 ? travel : Math.sign(delta) === Math.sign(travel) ? travel + delta : delta;

  if (current <= READER_CHROME_TOP_ZONE || maxOffset - current <= READER_CHROME_END_ZONE) {
    return { target: 0, travel: nextTravel };
  }
  if (nextTravel >= READER_CHROME_SNAP_TRAVEL) return { target: 1, travel: nextTravel };
  if (nextTravel <= -READER_CHROME_SNAP_TRAVEL) return { target: 0, travel: nextTravel };
  return { target, travel: nextTravel };
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
