import {
  subscribeBibleNowPlayingRemoteCommands,
  type BibleNowPlayingRemoteCommand,
} from '../../services/audio';
import { canResumeLoadedChapter } from '../../services/audio/audioPlaybackStartModel';
import { useAudioStore } from '../../stores/audioStore';
import { isAudioLoaded, pausedByListener } from './sharedPlaybackState';

/** The player actions lock-screen, notification and headset commands drive. */
export interface RemoteCommandControls {
  /** Play whatever Play would start when nothing is playing. */
  playFromRemote: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  skipForward: () => Promise<void>;
  skipBackward: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  nextChapter: () => Promise<unknown>;
  previousChapter: () => Promise<unknown>;
}

/** Carries out one remote command against the player's live state. */
export async function routeRemoteCommand(
  command: BibleNowPlayingRemoteCommand,
  controls: RemoteCommandControls
): Promise<void> {
  switch (command.command) {
    case 'play':
      await controls.playFromRemote();
      return;
    case 'toggle': {
      // A chapter still loading is on its way to playing, so the button pauses it.
      const { status: statusAtToggle } = useAudioStore.getState();
      if (statusAtToggle === 'playing' || statusAtToggle === 'loading') {
        await controls.pause();
      } else {
        await controls.playFromRemote();
      }
      return;
    }
    case 'interruption-ended': {
      // Resume only a chapter the interruption paused. One the listener or the
      // sleep timer paused before the call stays paused, and a finished one is
      // not started again.
      const store = useAudioStore.getState();
      if (
        !pausedByListener.current &&
        store.status === 'paused' &&
        canResumeLoadedChapter(store, isAudioLoaded)
      ) {
        await controls.resume();
      }
      return;
    }
    case 'pause':
      await controls.pause();
      return;
    case 'stop':
      await controls.stop();
      return;
    case 'seek-forward':
      await controls.skipForward();
      return;
    case 'seek-backward':
      await controls.skipBackward();
      return;
    case 'seek-position':
      if (typeof command.positionSeconds === 'number') {
        await controls.seekTo(command.positionSeconds * 1000);
      }
      return;
    case 'next':
      await controls.nextChapter();
      return;
    case 'previous':
      await controls.previousChapter();
      return;
  }
}

// The reader is pushed over the book browser, so going back unmounts the player
// while the chapter keeps playing. Like the native playback callbacks, the
// lock-screen, notification and headset command subscription outlives the screen
// and is only handed over when another player mounts.
let activeRemoteCommandUnsubscribe: (() => void) | null = null;

/**
 * Points remote commands at these controls, replacing whichever player held them.
 * There is never more than one subscription, and unmounting does not end it.
 */
export function takeOverRemoteCommands(controls: RemoteCommandControls): void {
  activeRemoteCommandUnsubscribe?.();
  activeRemoteCommandUnsubscribe = subscribeBibleNowPlayingRemoteCommands((command) =>
    routeRemoteCommand(command, controls)
  );
}
