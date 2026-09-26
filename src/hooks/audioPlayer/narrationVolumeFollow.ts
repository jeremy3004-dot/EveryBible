import { audioPlayer } from '../../services/audio';
import { useAudioStore } from '../../stores/audioStore';

// The Voice level follows the store from a subscription, like the music bed: the audio
// sheet changes it while a chapter plays, and every chapter loaded afterwards (auto-advance
// and lock-screen skips included, with the reader closed) has to play at it.
let narrationVolumeSubscription: (() => void) | null = null;

/** Applies the stored Voice level now and on every change. Subscribes once. */
export function followNarrationVolume(): void {
  void audioPlayer.setVolume(useAudioStore.getState().narrationVolume);

  narrationVolumeSubscription ??= useAudioStore.subscribe((state, previous) => {
    if (state.narrationVolume !== previous.narrationVolume) {
      void audioPlayer.setVolume(state.narrationVolume);
    }
  });
}
