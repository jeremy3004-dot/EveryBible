import { audioPlayer } from '../../services/audio';

// Module-level state shared by every mounted player. Native playback callbacks,
// lock-screen commands and the sleep timer act after the reader has unmounted, so
// state they share cannot live in one player's refs.

/**
 * Whether playback was paused or ended by the listener, the sleep timer or chapter
 * completion, as opposed to the system (a call, another app's audio, a headphone
 * unplug). Only a system pause may be undone when an interruption ends; explicit
 * Play clears this intent.
 */
export const pausedByListener = { current: false };

/**
 * A chapter change briefly reports a stopped player between two chapters, and the
 * music bed must play through that gap. Shared because the finish handler that
 * starts a transition can belong to a closed reader.
 */
export const chapterTransition = { current: false };

/**
 * The latest command to take over playback, from any player: every mounted reader
 * drives the one native player, so a closed reader's stalled load must see that a
 * reopened reader has since played something else, and leave it alone.
 */
export const playRequest = { current: 0 };

/**
 * Manual chapter walks share one player and can wait for coverage before claiming
 * playRequest. Completion yields to their intent without cancelling an active load.
 * pendingId covers a walk already waiting when the native chapter finishes.
 */
export const navigationIntent: { current: number; pendingId: number | null } = {
  current: 0,
  pendingId: null,
};

/**
 * The latest seek or skip across every reader of the one native player. Separate
 * from playRequest so adjusting position cannot cancel a chapter still loading.
 */
export const seekRequest = { current: 0 };

/**
 * The play request whose chapter is being loaded. That load reports its own failure,
 * after retrying a stalled stream, so a native error meanwhile is not shown yet.
 */
export const loadingPlayRequest: { current: number | null } = { current: null };

/** Whether the native player holds a sound, asked lazily by the playback models. */
export const isAudioLoaded = (): boolean => audioPlayer.isLoaded();
