import { backgroundMusicPlayer } from '../../services/audio';
import { useAudioStore } from '../../stores/audioStore';
import type { AudioStatus, BackgroundMusicChoice } from '../../types';
import { chapterTransition } from './sharedPlaybackState';

// The music bed follows the narration from a store subscription rather than a render
// effect. Lock-screen pause, the sleep timer and the end of playback all change the
// status after the reader has closed, and the bed has to stop with the narration.
let backgroundMusicSubscription: (() => void) | null = null;
let backgroundMusicOffHandled = false;

function syncBackgroundMusicWithPlayback(status: AudioStatus, choice: BackgroundMusicChoice): void {
  if (status === 'playing' || status === 'error' || status === 'idle') {
    // The chapter change, if any, is over: it played, or it failed. A failed next
    // chapter must not leave the bed playing on its own; on a locked phone that is
    // music with no narration and no visible reason, until someone unlocks it.
    chapterTransition.current = false;
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
  const shouldPlay = status === 'playing' || status === 'loading' || chapterTransition.current;
  void backgroundMusicPlayer.sync(choice, shouldPlay);
}

/**
 * Reconciles the music bed with the narration now, and keeps it following the
 * narration from then on. The store subscription is created once, however many
 * players mount.
 */
export function followPlaybackWithBackgroundMusic(): void {
  // Each mounted player reconciles the bed once, as the render effect used to.
  backgroundMusicOffHandled = false;
  const { status, backgroundMusicChoice } = useAudioStore.getState();
  syncBackgroundMusicWithPlayback(status, backgroundMusicChoice);

  backgroundMusicSubscription ??= useAudioStore.subscribe((state, previous) => {
    if (
      state.status !== previous.status ||
      state.backgroundMusicChoice !== previous.backgroundMusicChoice
    ) {
      syncBackgroundMusicWithPlayback(state.status, state.backgroundMusicChoice);
    }
  });
}
