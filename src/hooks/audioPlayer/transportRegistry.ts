import { useAudioStore } from '../../stores/audioStore';
import type { RemoteCommandControls } from './remoteCommands';

// The player bar drives playback on every tab, long after the reader that started
// it has closed. It uses the same controls the lock screen does — those of the last
// player that mounted — rather than mounting a second player, whose native
// callbacks, sleep-timer countdown and remote-command subscription would compete
// with the reader's. Kept apart from remoteCommands so the tab bar, which boots with
// the app, does not load the native audio stack to reach it.
let activeControls: RemoteCommandControls | null = null;

/** Called by each player as it takes over the lock-screen commands. */
export function registerPlayerTransport(controls: RemoteCommandControls): void {
  activeControls = controls;
}

/** Whether any player has mounted in this run of the app. */
export function hasPlayerTransport(): boolean {
  return activeControls != null;
}

/** Pause what is playing (or loading), otherwise play or resume it. */
export async function toggleActivePlayback(): Promise<void> {
  const controls = activeControls;
  if (!controls) return;
  const { status } = useAudioStore.getState();
  if (status === 'playing' || status === 'loading') {
    await controls.pause();
    return;
  }
  await controls.playFromRemote();
}

/** Step the playing session one chapter back or forward, as the lock screen does. */
export async function stepActivePlayback(direction: -1 | 1): Promise<void> {
  const controls = activeControls;
  if (!controls) return;
  await (direction < 0 ? controls.previousChapter() : controls.nextChapter());
}

/** Forget the registered player (tests). */
export function resetPlayerTransport(): void {
  activeControls = null;
}
