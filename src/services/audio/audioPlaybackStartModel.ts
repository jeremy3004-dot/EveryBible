import type { AudioStatus } from '../../types';

export interface LoadedChapterState {
  status: AudioStatus;
  currentBookId: string | null;
  currentChapter: number | null;
  currentPosition: number;
  duration: number;
}

/**
 * Whether Play should continue the loaded sound where it stopped. An idle player
 * with a loaded sound has played its chapter to the end (a pause leaves it
 * "paused"), so Play starts that chapter again instead of resuming at its end.
 *
 * `isLoaded` is asked only once the store says a chapter is selected.
 */
export function canResumeLoadedChapter(
  state: LoadedChapterState,
  isLoaded: () => boolean
): boolean {
  return (
    state.status !== 'idle' &&
    Boolean(state.currentBookId && state.currentChapter) &&
    isLoaded() &&
    state.currentPosition > 0 &&
    (state.duration <= 0 || state.currentPosition < state.duration)
  );
}

export interface PlaybackStartState extends LoadedChapterState {
  currentTranslationId: string | null;
  lastPosition: number;
  lastPlayedTranslationId: string | null;
  lastPlayedBookId: string | null;
  lastPlayedChapter: number | null;
}

export type PlaybackStartAction =
  | { kind: 'resume' }
  | {
      kind: 'play';
      translationId: string;
      bookId: string;
      chapter: number;
      startPositionMs: number;
    };

/**
 * What Play does when nothing is playing: continue the loaded sound, load the
 * selected chapter again at its resume point, or fall back to the chapter played
 * last. Null when there is nothing to play.
 */
export function resolvePlaybackStart(
  state: PlaybackStartState,
  fallbackTranslationId: string,
  isLoaded: () => boolean
): PlaybackStartAction | null {
  if (canResumeLoadedChapter(state, isLoaded)) {
    return { kind: 'resume' };
  }

  if (state.currentBookId && state.currentChapter) {
    return {
      kind: 'play',
      translationId: state.currentTranslationId ?? fallbackTranslationId,
      bookId: state.currentBookId,
      chapter: state.currentChapter,
      startPositionMs: state.lastPosition,
    };
  }

  if (state.lastPlayedBookId && state.lastPlayedChapter) {
    return {
      kind: 'play',
      translationId: state.lastPlayedTranslationId ?? fallbackTranslationId,
      bookId: state.lastPlayedBookId,
      chapter: state.lastPlayedChapter,
      startPositionMs: state.lastPosition,
    };
  }

  return null;
}
