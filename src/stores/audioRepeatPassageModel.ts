import type { RepeatPassage } from '../types';

// Decisions for `repeatMode: 'passage'`, kept pure so the playback engine
// (hooks/audioPlayer/passageRepeat.ts) only carries them out.
//
// Two precisions, chosen by what the translation offers:
// - With verse timings (BSB, WEB), the loop runs from the start of `start.verse`
//   to the end of `end.verse`, where "the end" is the start of the next timed verse
//   (or the chapter's end when `end.verse` is its last verse).
// - Without them (other translations, Every Language, Bible.is), the ends round out
//   to whole chapters: every loop starts at the top of `start.chapter` and runs to
//   the end of `end.chapter`.

/** Verse start times in seconds, keyed by verse number (services/bible/verseTimestamps). */
export type PassageVerseTimings = Readonly<Record<number, number>>;

/**
 * The follow-along highlight reads timings 150 ms early because the voice starts a
 * little before each recorded time. The passage cuts on the same allowance, so its
 * first word is not clipped and the next verse's first syllable is not heard.
 */
export const PASSAGE_TIMESTAMP_LEAD_MS = 150;

/**
 * Native progress arrives about once a second (trackPlayer's
 * progressUpdateIntervalMillis). The end boundary is timed exactly once it is less
 * than a tick and a half away, rather than waiting for the tick after it has passed.
 */
export const PASSAGE_BOUNDARY_SCHEDULE_WINDOW_MS = 1500;

/**
 * The most two consecutive progress reports can differ by while the chapter simply
 * plays (at 1x, including a missed tick or two). A larger step is a seek from
 * somewhere, and crossing the end verse by seeking is the listener's choice.
 */
const CONTINUOUS_PLAYBACK_MAX_STEP_MS = 3500;

interface ChapterRef {
  bookId: string;
  chapter: number;
}

/** Verse numbers with a usable time, ascending. */
function timedVerses(timings: PassageVerseTimings): number[] {
  return Object.keys(timings)
    .map(Number)
    .filter((verse) => {
      const seconds = timings[verse];
      return (
        Number.isInteger(verse) &&
        verse > 0 &&
        typeof seconds === 'number' &&
        Number.isFinite(seconds) &&
        seconds >= 0
      );
    })
    .sort((a, b) => a - b);
}

const timingMs = (timings: PassageVerseTimings, verse: number): number =>
  Math.max(0, Math.round((timings[verse] ?? 0) * 1000) - PASSAGE_TIMESTAMP_LEAD_MS);

/**
 * Where `verse` starts, in ms. Verse 1 starts at the top, so the chapter's spoken
 * heading is kept. A verse with no time of its own starts at the nearest timed verse
 * before it (hearing a verse early beats skipping it); a verse past the chapter's
 * last one clamps to that last verse.
 */
export function resolvePassageVerseStartMs(
  timings: PassageVerseTimings | null,
  verse: number
): number {
  if (!timings || verse <= 1) return 0;
  const verses = timedVerses(timings);
  let startVerse: number | null = null;
  for (const timed of verses) {
    if (timed > verse) break;
    startVerse = timed;
  }
  return startVerse === null ? 0 : timingMs(timings, startVerse);
}

/**
 * Where `verse` ends, in ms: where the next timed verse starts. Null means the
 * chapter's end: `verse` is the last verse (or past it), or there are no timings.
 */
export function resolvePassageVerseEndMs(
  timings: PassageVerseTimings | null,
  verse: number
): number | null {
  if (!timings) return null;
  const next = timedVerses(timings).find((timed) => timed > verse);
  return next === undefined ? null : timingMs(timings, next);
}

/**
 * The passage fitted to its book, or null when the book has no chapters. A chapter
 * past the book's last clamps to it; an end moved that way runs to the chapter's end,
 * and a start moved that way begins at its top. The store only holds passages with
 * start ≤ end, but a reversed one is put in order rather than trusted.
 *
 * Every other function here takes a passage this has fitted.
 */
export function normalizeRepeatPassage(
  passage: RepeatPassage,
  totalChapters: number
): RepeatPassage | null {
  if (!Number.isInteger(totalChapters) || totalChapters <= 0) return null;
  const fit = (point: RepeatPassage['start'], movedVerse: number) => {
    const chapter = Math.min(totalChapters, Math.max(1, Math.trunc(point.chapter)));
    const verse = Math.max(1, Math.trunc(point.verse));
    return { chapter, verse: chapter === point.chapter ? verse : movedVerse };
  };
  const start = fit(passage.start, 1);
  const end = fit(passage.end, Number.MAX_SAFE_INTEGER);
  const reversed =
    start.chapter > end.chapter || (start.chapter === end.chapter && start.verse > end.verse);
  return reversed
    ? { bookId: passage.bookId, start: end, end: start }
    : { bookId: passage.bookId, start, end };
}

export interface PassageChapterBounds {
  /** Where the passage starts in this chapter, in ms. */
  startMs: number;
  /** Where it ends in this chapter, in ms; null runs to the chapter's end. */
  endMs: number | null;
}

/**
 * The stretch of `chapter` the passage covers. Chapters between the ends are whole.
 * Timings that run backwards (bad data) cannot shrink the stretch to nothing: the end
 * then falls back to the chapter's end.
 */
export function resolvePassageChapterBounds(
  passage: RepeatPassage,
  chapter: number,
  timings: PassageVerseTimings | null
): PassageChapterBounds {
  const startMs =
    chapter === passage.start.chapter
      ? resolvePassageVerseStartMs(timings, passage.start.verse)
      : 0;
  const endMs =
    chapter === passage.end.chapter ? resolvePassageVerseEndMs(timings, passage.end.verse) : null;
  return { startMs, endMs: endMs !== null && endMs > startMs ? endMs : null };
}

/** Whether `chapter` of `bookId` is one of the passage's chapters. */
export function isPassageChapter(passage: RepeatPassage, { bookId, chapter }: ChapterRef): boolean {
  return (
    bookId === passage.bookId && chapter >= passage.start.chapter && chapter <= passage.end.chapter
  );
}

/**
 * Whether a position lies inside the passage. `timings` are the chapter's own
 * (null without them, which makes every passage chapter inside from top to end).
 */
export function isPassagePosition(
  passage: RepeatPassage,
  position: ChapterRef & { positionMs: number },
  timings: PassageVerseTimings | null
): boolean {
  if (!isPassageChapter(passage, position)) return false;
  const { startMs, endMs } = resolvePassageChapterBounds(passage, position.chapter, timings);
  return position.positionMs >= startMs && (endMs === null || position.positionMs < endMs);
}

/**
 * The passage chapters that have audio, ascending. `availableChapters` is the exact
 * per-chapter coverage when the translation has one (Every Language sets are sparse);
 * undefined means every chapter can play.
 */
function coveredPassageChapters(
  passage: RepeatPassage,
  availableChapters: readonly number[] | undefined
): number[] {
  const inRange: number[] = [];
  for (let chapter = passage.start.chapter; chapter <= passage.end.chapter; chapter += 1) {
    if (!availableChapters || availableChapters.includes(chapter)) inRange.push(chapter);
  }
  return inRange;
}

export interface PassagePlaybackTarget {
  bookId: string;
  chapter: number;
  /** True when this goes back to the passage's start rather than on to its next chapter. */
  loops: boolean;
}

/** Where every loop begins: the first passage chapter with audio. */
export function resolvePassageLoopStart(
  passage: RepeatPassage,
  availableChapters?: readonly number[]
): PassagePlaybackTarget | null {
  const first = coveredPassageChapters(passage, availableChapters)[0];
  return first === undefined ? null : { bookId: passage.bookId, chapter: first, loops: true };
}

/**
 * What follows a chapter that played to its end while the passage repeats. A passage
 * chapter before the last goes on to the next passage chapter with audio. The last
 * one, or any chapter outside the passage (the listener went elsewhere), goes back to
 * the passage's start. Null when no passage chapter has audio.
 */
export function resolvePassageChapterAdvance(
  passage: RepeatPassage,
  finished: ChapterRef,
  availableChapters?: readonly number[]
): PassagePlaybackTarget | null {
  const covered = coveredPassageChapters(passage, availableChapters);
  if (covered.length === 0) return null;
  if (isPassageChapter(passage, finished)) {
    const next = covered.find((chapter) => chapter > finished.chapter);
    if (next !== undefined) return { bookId: passage.bookId, chapter: next, loops: false };
  }
  return resolvePassageLoopStart(passage, availableChapters);
}

/**
 * Where a loop starts in its first chapter, in ms: the start verse when the loop
 * begins in the start chapter and it has timings; the top otherwise (including a start
 * chapter that has no audio, whose loop begins in the next chapter that does).
 */
export function resolvePassageLoopStartMs(
  passage: RepeatPassage,
  loopChapter: number,
  timings: PassageVerseTimings | null
): number {
  return loopChapter === passage.start.chapter
    ? resolvePassageVerseStartMs(timings, passage.start.verse)
    : 0;
}

export type PassageBoundaryCheck =
  | { kind: 'none' }
  | { kind: 'loop' }
  | { kind: 'schedule'; delayMs: number };

/**
 * What one progress report means for the end verse. The loop runs when playback
 * crosses the end by playing: the previous report was before it and this one is at
 * or past it, a step no bigger than playing makes. A start past the end (a resume
 * there, or a seek there) is the listener's: the chapter plays on to its end, which
 * loops. Shortly before the end, a wall-clock timer is asked for, so the loop does
 * not wait for a report that comes up to a second late.
 */
export function checkPassageEndBoundary({
  previousPositionMs,
  positionMs,
  endMs,
  playbackRate,
}: {
  previousPositionMs: number | null;
  positionMs: number;
  endMs: number | null;
  playbackRate: number;
}): PassageBoundaryCheck {
  if (endMs === null || !Number.isFinite(positionMs)) return { kind: 'none' };
  const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  if (positionMs >= endMs) {
    const crossedByPlaying =
      previousPositionMs !== null &&
      previousPositionMs < endMs &&
      positionMs - previousPositionMs <= CONTINUOUS_PLAYBACK_MAX_STEP_MS * Math.max(1, rate);
    return crossedByPlaying ? { kind: 'loop' } : { kind: 'none' };
  }
  const delayMs = (endMs - positionMs) / rate;
  return delayMs <= PASSAGE_BOUNDARY_SCHEDULE_WINDOW_MS
    ? { kind: 'schedule', delayMs: Math.max(0, Math.round(delayMs)) }
    : { kind: 'none' };
}
