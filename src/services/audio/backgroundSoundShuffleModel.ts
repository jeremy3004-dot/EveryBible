import type { BackgroundMusicChoice } from '../../types';
import type { BackgroundMusicOption } from './backgroundMusicCatalog';
import type { BackgroundSoundAvailability } from './backgroundSoundCache';

/**
 * The sounds Shuffle may pick right now: every real sound that can play without waiting,
 * which means bundled or already on disk. A sound that still needs downloading is left out
 * even when online: a pick at a chapter boundary would leave the bed silent while it
 * downloads, and would spend mobile data the listener never asked to spend.
 */
export function listShuffleCandidates(
  options: readonly BackgroundMusicOption[],
  availabilityOf: (option: BackgroundMusicOption) => BackgroundSoundAvailability
): BackgroundMusicChoice[] {
  return options
    .filter((option) => option.id !== 'off' && option.id !== 'shuffle')
    .filter((option) => {
      const availability = availabilityOf(option);
      return availability === 'bundled' || availability === 'cached';
    })
    .map((option) => option.id);
}

/**
 * Picks a sound from `candidates`, never `avoid` unless it is the only one. `random`
 * returns a number in [0, 1), as Math.random does.
 */
export function pickShuffleSound(
  candidates: readonly BackgroundMusicChoice[],
  avoid: BackgroundMusicChoice | null,
  random: () => number
): BackgroundMusicChoice | null {
  const pool = candidates.filter((candidate) => candidate !== avoid);
  const from = pool.length > 0 ? pool : candidates;
  if (from.length === 0) return null;
  const index = Math.min(from.length - 1, Math.floor(random() * from.length));
  return from[index] ?? null;
}

/**
 * Shuffle's pick for a listening session. `chapterKey` names the chapter the pick was made
 * for, so the next chapter gets a fresh sound; `previous` outlives the session so the
 * first sound of the next one is not a repeat of the last.
 */
export interface ShuffleSession {
  current: BackgroundMusicChoice | null;
  chapterKey: string | null;
  previous: BackgroundMusicChoice | null;
}

export const IDLE_SHUFFLE_SESSION: ShuffleSession = {
  current: null,
  chapterKey: null,
  previous: null,
};

/**
 * The session with a sound for `chapterKey`: the same sound while the chapter stays the
 * same (a pause and resume keeps it), a different one when the chapter or the session is
 * new.
 */
export function shuffleForChapter(
  session: ShuffleSession,
  chapterKey: string,
  candidates: readonly BackgroundMusicChoice[],
  random: () => number
): ShuffleSession {
  if (session.current !== null && session.chapterKey === chapterKey) {
    return session;
  }

  const lastHeard = session.current ?? session.previous;
  const next = pickShuffleSound(candidates, lastHeard, random);
  return { current: next, chapterKey, previous: lastHeard };
}

/** Playback has ended: the next session starts with a new pick. */
export function endShuffleSession(session: ShuffleSession): ShuffleSession {
  if (session.current === null) return session;
  return { current: null, chapterKey: null, previous: session.current };
}
