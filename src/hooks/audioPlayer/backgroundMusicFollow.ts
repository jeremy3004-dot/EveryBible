import { backgroundMusicPlayer } from '../../services/audio';
import {
  IDLE_SHUFFLE_SESSION,
  endShuffleSession,
  shuffleForChapter,
  type ShuffleSession,
} from '../../services/audio/backgroundSoundShuffleModel';
import { useAudioStore } from '../../stores/audioStore';
import type { AudioStatus, BackgroundMusicChoice } from '../../types';
import { chapterTransition } from './sharedPlaybackState';

// The music bed follows the narration from a store subscription rather than a render
// effect. Lock-screen pause, the sleep timer and the end of playback all change the
// status after the reader has closed, and the bed has to stop with the narration.
let backgroundMusicSubscription: (() => void) | null = null;
let backgroundMusicOffHandled = false;
// Shuffle's pick lives here, not in the store: the persisted choice stays 'shuffle', and
// each launch starts a fresh session.
let shuffleSession: ShuffleSession = IDLE_SHUFFLE_SESSION;

interface BedInputs {
  status: AudioStatus;
  backgroundMusicChoice: BackgroundMusicChoice;
  currentTranslationId: string | null;
  currentBookId: string | null;
  currentChapter: number | null;
}

let shuffleSyncQueued = false;

const chapterKeyOf = (state: BedInputs): string =>
  `${state.currentTranslationId ?? ''}:${state.currentBookId ?? ''}:${state.currentChapter ?? ''}`;

const shouldBedPlay = (status: AudioStatus): boolean =>
  status === 'playing' || status === 'loading' || chapterTransition.current;

/**
 * Starting a chapter sets the status and then the chapter, back to back. Resolving
 * Shuffle once both have landed makes that one pick for the new chapter, not a pick for
 * the old chapter replaced at once by another: the second could otherwise repeat the
 * sound the last session ended on.
 */
function queueShuffledBedSync(): void {
  if (shuffleSyncQueued) return;
  shuffleSyncQueued = true;
  queueMicrotask(() => {
    shuffleSyncQueued = false;
    const state = useAudioStore.getState();
    if (state.backgroundMusicChoice !== 'shuffle') return;
    syncShuffledBed(state, shouldBedPlay(state.status));
  });
}

/** Resolves Shuffle to a sound for the chapter playing, and plays or pauses it. */
function syncShuffledBed(state: BedInputs, shouldPlay: boolean): void {
  const sessionOver = state.status === 'idle' || state.status === 'error';

  if (!shouldPlay) {
    const heard = shuffleSession.current;
    // Playback ended rather than paused: the next Play starts a new session and a new pick.
    if (sessionOver) shuffleSession = endShuffleSession(shuffleSession);
    if (heard) void backgroundMusicPlayer.sync(heard, false);
    return;
  }

  const wasPlaying = shuffleSession.current;
  shuffleSession = shuffleForChapter(
    shuffleSession,
    chapterKeyOf(state),
    backgroundMusicPlayer.getShuffleCandidates(),
    Math.random
  );
  const pick = shuffleSession.current;
  if (pick) {
    // A different pick while one plays crossfades between them, as switching sound does.
    void backgroundMusicPlayer.sync(pick, true);
  } else if (wasPlaying) {
    void backgroundMusicPlayer.stop();
  }
}

function syncBackgroundMusicWithPlayback(state: BedInputs): void {
  const { status, backgroundMusicChoice: choice } = state;
  if (status === 'playing' || status === 'error' || status === 'idle') {
    // The chapter change, if any, is over: it played, or it failed. A failed next
    // chapter must not leave the bed playing on its own; on a locked phone that is
    // music with no narration and no visible reason, until someone unlocks it.
    chapterTransition.current = false;
  }

  if (choice !== 'shuffle') {
    shuffleSession = endShuffleSession(shuffleSession);
  }

  if (choice === 'off') {
    if (!backgroundMusicOffHandled) {
      backgroundMusicOffHandled = true;
      void backgroundMusicPlayer.stop();
    }
    return;
  }

  // Keep music playing during chapter transitions; pause it with the narration.
  backgroundMusicOffHandled = false;
  if (choice === 'shuffle') {
    queueShuffledBedSync();
    return;
  }
  void backgroundMusicPlayer.sync(choice, shouldBedPlay(status));
}

/**
 * Reconciles the music bed with the narration now, and keeps it following the
 * narration from then on: its sound, whether it plays, its Sound level, and with
 * Shuffle a new sound for each chapter. The store subscription is created once,
 * however many players mount.
 */
export function followPlaybackWithBackgroundMusic(): void {
  // Each mounted player reconciles the bed once, as the render effect used to.
  backgroundMusicOffHandled = false;
  const state = useAudioStore.getState();
  backgroundMusicPlayer.setLevel(state.backgroundMusicLevel);
  syncBackgroundMusicWithPlayback(state);

  backgroundMusicSubscription ??= useAudioStore.subscribe((next, previous) => {
    if (next.backgroundMusicLevel !== previous.backgroundMusicLevel) {
      backgroundMusicPlayer.setLevel(next.backgroundMusicLevel);
    }
    const chapterChanged =
      next.backgroundMusicChoice === 'shuffle' && chapterKeyOf(next) !== chapterKeyOf(previous);
    if (
      next.status !== previous.status ||
      next.backgroundMusicChoice !== previous.backgroundMusicChoice ||
      chapterChanged
    ) {
      syncBackgroundMusicWithPlayback(next);
    }
  });
}
