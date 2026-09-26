import type { BibleTranslation } from '../../../../types';
import {
  FOLLOW_ALONG_TIMESTAMP_LEAD_MS,
  getSortedTimestampVerseNumbers,
} from '../../bibleReaderModel';

type VerseTimestamps = Record<number, number>;

/**
 * How long Read Along leaves a listener where they scrolled before it follows the
 * reading again.
 */
export const READ_ALONG_MANUAL_SCROLL_PAUSE_MS = 4_000;

/**
 * A position may step back this far without the highlight stepping back with it. The
 * store interpolates the position between polls, so a real poll can land a little
 * behind the last tick and briefly re-cross a verse boundary. A seek back further than
 * this is a real move and the highlight follows it.
 */
export const READ_ALONG_BACKWARD_TOLERANCE_MS = 750;

/** The current verse sits this far down the visible text, so what comes next shows below it. */
export const READ_ALONG_FOCUS_FRACTION = 0.3;

/** Read Along's text for a recording without text of its own: the bundled BSB. */
export const READ_ALONG_FALLBACK_TEXT_TRANSLATION_ID = 'bsb';

/**
 * The verse being spoken at `positionMs`, from exact verse timings, the way the reader
 * resolves it (the same lead, the same ascending verse order). Null without timings:
 * Read Along and the Audio sheet only name a verse the recording actually marks, never
 * the reader's length-based estimate.
 */
export function getTimedVerse(
  timestamps: VerseTimestamps | null | undefined,
  positionMs: number
): number | null {
  if (!timestamps || !Number.isFinite(positionMs) || positionMs < 0) return null;
  const verseNumbers = getSortedTimestampVerseNumbers(timestamps);
  const [first] = verseNumbers;
  if (first == null) return null;
  const positionSeconds = (positionMs + FOLLOW_ALONG_TIMESTAMP_LEAD_MS) / 1000;
  let current = first;
  for (const verse of verseNumbers) {
    const start = timestamps[verse];
    if (start == null || start > positionSeconds) break;
    current = verse;
  }
  return current;
}

/**
 * The verse to show, given the verse at the position and the verse
 * READ_ALONG_BACKWARD_TOLERANCE_MS ahead of it: a step back that the tolerance covers
 * keeps the verse already shown, so the highlight never flickers at a boundary.
 */
export function resolveShownVerse({
  verseAtPosition,
  verseAhead,
  previousVerse,
}: {
  verseAtPosition: number | null;
  verseAhead: number | null;
  previousVerse: number | null;
}): number | null {
  if (verseAtPosition == null || previousVerse == null || verseAtPosition >= previousVerse) {
    return verseAtPosition;
  }
  return verseAhead != null && verseAhead >= previousVerse ? previousVerse : verseAtPosition;
}

/** `getTimedVerse` with `resolveShownVerse`'s protection against boundary flicker. */
export function resolveTimedVerse({
  timestamps,
  positionMs,
  previousVerse,
}: {
  timestamps: VerseTimestamps | null | undefined;
  positionMs: number;
  previousVerse: number | null;
}): number | null {
  return resolveShownVerse({
    verseAtPosition: getTimedVerse(timestamps, positionMs),
    verseAhead: getTimedVerse(timestamps, positionMs + READ_ALONG_BACKWARD_TOLERANCE_MS),
    previousVerse,
  });
}

/** Whether Read Along may scroll to the current verse: not while a listener's own scroll is recent. */
export function shouldAutoFollow({
  nowMs,
  lastManualScrollAtMs,
}: {
  nowMs: number;
  lastManualScrollAtMs: number | null;
}): boolean {
  return (
    lastManualScrollAtMs == null ||
    nowMs - lastManualScrollAtMs >= READ_ALONG_MANUAL_SCROLL_PAUSE_MS
  );
}

/** The scroll offset that puts a verse's top at READ_ALONG_FOCUS_FRACTION of the viewport. */
export function getReadAlongScrollOffset({
  verseTopY,
  viewportHeight,
}: {
  verseTopY: number;
  viewportHeight: number;
}): number {
  return Math.max(0, Math.round(verseTopY - viewportHeight * READ_ALONG_FOCUS_FRACTION));
}

/** How much of the chapter has played, 0 to 1. */
export function getReadAlongProgress(positionMs: number, durationMs: number): number {
  if (!(durationMs > 0) || !Number.isFinite(positionMs)) return 0;
  return Math.min(1, Math.max(0, positionMs / durationMs));
}

export interface ReadAlongTextCandidate {
  translationId: string;
  /** Text from another translation than the recording's, which Read Along says. */
  isFallback: boolean;
}

/**
 * Where Read Along looks for text when the reader has none on screen for the chapter,
 * in order: the recording's own translation when it has text (the text may simply not
 * be on screen yet, or not be downloaded), then the bundled BSB, which is on every
 * device, so an audio-only recording still has a chapter to read along with.
 */
export function getReadAlongTextCandidates({
  translationId,
  translation,
}: {
  translationId: string;
  translation: Pick<BibleTranslation, 'hasText'> | undefined;
}): ReadAlongTextCandidate[] {
  const candidates: ReadAlongTextCandidate[] = [];
  if (translation?.hasText !== false) candidates.push({ translationId, isFallback: false });
  if (translationId.toLowerCase() !== READ_ALONG_FALLBACK_TEXT_TRANSLATION_ID) {
    candidates.push({ translationId: READ_ALONG_FALLBACK_TEXT_TRANSLATION_ID, isFallback: true });
  } else if (candidates.length === 0) {
    candidates.push({ translationId, isFallback: false });
  }
  return candidates;
}
