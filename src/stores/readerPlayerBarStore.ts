import { create } from 'zustand';

// Transient UI state, never persisted. The player bar lives in the tab navigator,
// outside the reader, but on the reader its transport is the reader's own: Play
// starts the displayed chapter, and the chevrons follow plan and rhythm sessions
// and the chapters the translation covers. The focused reader publishes what those
// controls should show and do; the bar only renders it.

/** What the focused reader's controls show. Plain values, compared field by field. */
export interface ReaderPlayerBarControls {
  /** False on the audio-only listen screen, which has its own transport. */
  showsPlayer: boolean;
  /** The hide-play-button preference (a plan session always shows it). */
  showPlayButton: boolean;
  /** The displayed chapter is playing (or loading). */
  isPlaying: boolean;
  isLoading: boolean;
  /** Why the displayed chapter failed to play; Play tries again. */
  errorMessage: string | null;
  hasPrevious: boolean;
  hasNext: boolean;
  /** The next control completes the plan day or session instead of moving on. */
  nextIsCompletion: boolean;
  nextAccessibilityLabel: string;
  nextAccessibilityHint: string | null;
  /** The loaded chapter is the displayed one, so its progress belongs on the bar. */
  showsProgress: boolean;
}

/** What the focused reader's controls do. Stable functions that call the reader's latest handlers. */
export interface ReaderPlayerBarActions {
  playPause: () => void;
  previous: () => void;
  next: () => void;
  openAudioSheet: () => void;
}

interface ReaderPlayerBarState {
  ownerKey: string | null;
  controls: ReaderPlayerBarControls | null;
  actions: ReaderPlayerBarActions | null;
}

export const useReaderPlayerBarStore = create<ReaderPlayerBarState>(() => ({
  ownerKey: null,
  controls: null,
  actions: null,
}));

const sameControls = (a: ReaderPlayerBarControls | null, b: ReaderPlayerBarControls): boolean =>
  a != null &&
  (Object.keys(b) as Array<keyof ReaderPlayerBarControls>).every((key) => a[key] === b[key]);

/**
 * Publishes the focused reader's controls. Unchanged values leave the store alone,
 * so the reader may call this after every render without redrawing the bar.
 */
export function publishReaderPlayerBar(
  ownerKey: string,
  controls: ReaderPlayerBarControls,
  actions: ReaderPlayerBarActions
): void {
  const current = useReaderPlayerBarStore.getState();
  if (
    current.ownerKey === ownerKey &&
    current.actions === actions &&
    sameControls(current.controls, controls)
  ) {
    return;
  }
  useReaderPlayerBarStore.setState({ ownerKey, controls: { ...controls }, actions });
}

/** Withdraws a reader's controls, unless another reader has taken over since. */
export function releaseReaderPlayerBar(ownerKey: string): void {
  if (useReaderPlayerBarStore.getState().ownerKey !== ownerKey) return;
  useReaderPlayerBarStore.setState({ ownerKey: null, controls: null, actions: null });
}
