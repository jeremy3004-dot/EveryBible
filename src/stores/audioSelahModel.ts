import type { AudioStatus, BackgroundMusicChoice } from '../types';
import { resolvePassageVerseStartMs, type PassageVerseTimings } from './audioRepeatPassageModel';

// Selah: "pause the reading, keep the music". The decisions it makes, kept free of
// players and timers (src/hooks/audioPlayer/selah.ts carries them out).

/** How long the narration takes to fade out into Selah, and back in out of it. */
export const SELAH_FADE_MS = 750;

/** How far back the narration picks up after Selah, so no words are lost. */
export const SELAH_REWIND_MS = 1500;

/**
 * With verse timings, a Selah that began at most this long after its verse started picks
 * up at the start of that verse instead of SELAH_REWIND_MS back.
 */
export const SELAH_VERSE_START_WINDOW_MS = 6000;

/** The longest Selah holds the music on its own before the music fades and playback ends. */
export const SELAH_MAX_HOLD_MS = 30 * 60 * 1000;

/** How long the music takes to fade away when Selah runs out. */
export const SELAH_BED_FADE_OUT_MS = 3000;

export interface SelahAvailabilityInput {
  backgroundMusicChoice: BackgroundMusicChoice;
  currentBookId: string | null;
  currentChapter: number | null;
  status: AudioStatus;
}

/**
 * Whether Selah can be used: a background sound is on (Selah keeps it playing) and a
 * chapter is loaded, playing, paused or buffering.
 */
export function canSelah(state: SelahAvailabilityInput): boolean {
  return (
    state.backgroundMusicChoice !== 'off' &&
    state.currentBookId !== null &&
    state.currentChapter !== null &&
    (state.status === 'playing' || state.status === 'paused' || state.status === 'loading')
  );
}

/** The verse sounding at `positionMs`: the last one that has started by then. */
function verseAt(timings: PassageVerseTimings, positionMs: number): number | null {
  let current: number | null = null;
  const verses = Object.keys(timings)
    .map(Number)
    .filter((verse) => Number.isInteger(verse) && verse > 0 && Number.isFinite(timings[verse]))
    .sort((a, b) => a - b);
  for (const verse of verses) {
    if (resolvePassageVerseStartMs(timings, verse) > positionMs) break;
    current = verse;
  }
  return current;
}

/**
 * Where the narration picks up after a Selah that paused it at `positionMs`: the start of
 * the verse it paused in (read as the follow-along highlight reads it) when that is
 * within SELAH_VERSE_START_WINDOW_MS, otherwise SELAH_REWIND_MS earlier. Timings not
 * known (null, or still loading: undefined) mean the plain rewind.
 */
export function resolveSelahResumePositionMs(
  positionMs: number,
  timings: PassageVerseTimings | null | undefined
): number {
  const pausedAt = Number.isFinite(positionMs) ? Math.max(0, positionMs) : 0;
  const rewound = Math.max(0, pausedAt - SELAH_REWIND_MS);
  if (!timings) return rewound;
  const verse = verseAt(timings, pausedAt);
  if (verse === null) return rewound;
  const verseStartMs = resolvePassageVerseStartMs(timings, verse);
  return pausedAt - verseStartMs <= SELAH_VERSE_START_WINDOW_MS ? verseStartMs : rewound;
}

export type SelahDeadlineReason = 'sleep-timer' | 'max-hold';

export interface SelahDeadline {
  atMs: number;
  reason: SelahDeadlineReason;
}

/**
 * When the music Selah is holding has to end, and why: the sleep timer's stop time
 * (it keeps counting through Selah), or SELAH_MAX_HOLD_MS after Selah began, whichever
 * comes first. An End of chapter timer has no stop time: the paused chapter never ends,
 * so only the hold limit applies.
 */
export function resolveSelahDeadline(input: {
  heldSinceMs: number;
  sleepTimerEndTime: number | null;
}): SelahDeadline {
  const maxHoldAt = input.heldSinceMs + SELAH_MAX_HOLD_MS;
  if (input.sleepTimerEndTime !== null && input.sleepTimerEndTime <= maxHoldAt) {
    return { atMs: input.sleepTimerEndTime, reason: 'sleep-timer' };
  }
  return { atMs: maxHoldAt, reason: 'max-hold' };
}
