import { create } from 'zustand';
import { seekActivePlayback } from '../../hooks/audioPlayer/transportRegistry';
import { useAudioStore } from '../../stores/audioStore';

interface PlayerBarScrubState {
  /** The share of the chapter under the finger while the line is dragged, else null. */
  fraction: number | null;
}

/**
 * The drag on the player bar's progress line. Kept out of the bar's own state so a
 * drag redraws only the line, as the playback tick does, not the whole bar.
 */
export const usePlayerBarScrubStore = create<PlayerBarScrubState>(() => ({ fraction: null }));

export function beginPlayerBarScrub(fraction: number): void {
  usePlayerBarScrubStore.setState({ fraction });
}

export function movePlayerBarScrub(fraction: number): void {
  usePlayerBarScrubStore.setState({ fraction });
}

/** The finger lifted: seek to where it was, then let the line follow playback again. */
export function commitPlayerBarScrub(fraction: number): void {
  usePlayerBarScrubStore.setState({ fraction: null });
  const { duration } = useAudioStore.getState();
  if (duration <= 0) return;
  void seekActivePlayback(Math.round(fraction * duration));
}

/** The drag was taken away (a scroll, or the bar hid): drop the preview, no seek. */
export function cancelPlayerBarScrub(): void {
  usePlayerBarScrubStore.setState({ fraction: null });
}
