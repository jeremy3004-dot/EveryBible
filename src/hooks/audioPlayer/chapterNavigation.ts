import { audioPlayer, clearBibleNowPlaying } from '../../services/audio';
import { useAudioStore } from '../../stores/audioStore';
import {
  getAdjacentAudioPlaybackSequenceEntry,
  hasAudioPlaybackSequenceEntry,
} from '../../stores/audioPlaybackSequenceModel';
import type { AudioPlaybackSequenceEntry, AudioStatus } from '../../types';
import { stopAudioProgressTelemetry } from './listeningTelemetry';
import { stopPositionInterpolation } from './playbackProgress';
import type {
  AudioPlayerSession,
  PlayChapterForTranslation,
  ResolveAudioCoverage,
  SyncNowPlaying,
} from './playerSession';
import { chapterTransition, navigationIntent } from './sharedPlaybackState';
import { getAdjacentAudioChapter } from './useAudioCoverage';

export type NavigateChapterForTranslation = (
  translationId: string,
  bookId: string,
  chapter: number,
  verse?: number,
  statusAtInvocation?: AudioStatus
) => Promise<void>;

/**
 * Manual chapter navigation, and switching the translation of the loaded chapter,
 * keep the listener's current playback intent. A paused target is selected
 * unloaded, so it cannot briefly start sounding.
 */
export async function navigateToChapter(
  session: AudioPlayerSession,
  playChapterForTranslation: PlayChapterForTranslation,
  syncNowPlaying: SyncNowPlaying,
  targetTranslationId: string,
  bookId: string,
  chapter: number,
  verse?: number,
  statusAtInvocation?: AudioStatus
): Promise<void> {
  const liveStatus = useAudioStore.getState().status;
  // Completion can settle idle while a manual step waits for coverage. Preserve
  // that step's intent, but a native interruption's live paused state must win.
  const statusAtNavigation =
    liveStatus === 'idle' ? (statusAtInvocation ?? liveStatus) : liveStatus;
  if (statusAtNavigation === 'playing' || statusAtNavigation === 'loading') {
    await playChapterForTranslation(targetTranslationId, bookId, chapter, verse);
    return;
  }

  const requestId = ++session.playRequestId;
  chapterTransition.current = false;
  stopPositionInterpolation(session);
  stopAudioProgressTelemetry();
  await audioPlayer.stop();
  if (requestId !== session.playRequestId) {
    return;
  }
  const store = useAudioStore.getState();
  store.setCurrentTrack(targetTranslationId, bookId, chapter);
  store.syncQueueToTrack(targetTranslationId, bookId, chapter);
  const { playbackSequence } = useAudioStore.getState();
  if (
    playbackSequence.length > 0 &&
    !hasAudioPlaybackSequenceEntry(playbackSequence, bookId, chapter)
  ) {
    store.clearPlaybackSequence();
  }
  store.setStatus(statusAtNavigation === 'paused' ? 'paused' : 'idle');
  if (statusAtNavigation === 'paused') {
    // Remote navigation can outlive the reader: publish the paused target now,
    // keeping its native controls available without waiting for a React effect.
    syncNowPlaying({ isPlaying: false, positionMs: 0, durationMs: 0 }, true);
  } else {
    void clearBibleNowPlaying();
  }
}

export interface StepChapterContext {
  session: AudioPlayerSession;
  fallbackTranslationId: string;
  resolveAudioCoverage: ResolveAudioCoverage;
  navigateChapterForTranslation: NavigateChapterForTranslation;
}

/**
 * Steps the player one chapter back or forward: a pinned plan or rhythm session
 * first, then the queue, then plain (or sparse-set) chapter adjacency. State is
 * read at call time because lock-screen commands arrive after the reader unmounts,
 * when the reader's render may be several auto-advanced chapters behind.
 */
export async function stepChapter(
  {
    session,
    fallbackTranslationId,
    resolveAudioCoverage,
    navigateChapterForTranslation,
  }: StepChapterContext,
  direction: -1 | 1
): Promise<AudioPlaybackSequenceEntry | null> {
  const stepRequestId = ++navigationIntent.current;
  navigationIntent.pendingId = stepRequestId;
  const statusAtInvocation = useAudioStore.getState().status;
  const requestId = session.playRequestId;
  const navigateToTarget = async (
    translationId: string,
    target: AudioPlaybackSequenceEntry
  ): Promise<AudioPlaybackSequenceEntry | null> => {
    const navigation = navigateChapterForTranslation(
      translationId,
      target.bookId,
      target.chapter,
      undefined,
      statusAtInvocation
    );
    // Navigation claims its playback generation before awaiting native stop/load.
    // Capture that claim, so its own increment is valid but a later command is not.
    const navigationRequestId = session.playRequestId;
    if (navigationRequestId !== requestId && navigationIntent.pendingId === stepRequestId) {
      navigationIntent.pendingId = null;
    }
    await navigation;
    if (
      navigationRequestId !== session.playRequestId ||
      stepRequestId !== navigationIntent.current
    ) {
      return null;
    }
    return target;
  };
  const navigatePinnedOrQueued = (): Promise<AudioPlaybackSequenceEntry | null> | undefined => {
    const {
      queue: liveQueue,
      queueIndex: liveQueueIndex,
      playbackSequence: liveSequence,
      currentTranslationId: liveTranslationId,
      currentBookId: liveBookId,
      currentChapter: liveChapter,
      setQueueIndex,
    } = useAudioStore.getState();

    const targetTranslationId = liveTranslationId ?? fallbackTranslationId;
    // A pinned session owns manual navigation as it owns automatic completion,
    // including its boundaries, even when an older listening queue is retained.
    if (
      liveBookId &&
      liveChapter &&
      hasAudioPlaybackSequenceEntry(liveSequence, liveBookId, liveChapter)
    ) {
      const sequenceEntry = getAdjacentAudioPlaybackSequenceEntry(
        liveSequence,
        liveBookId,
        liveChapter,
        direction
      );
      return sequenceEntry
        ? navigateToTarget(targetTranslationId, sequenceEntry)
        : Promise.resolve(null);
    }

    const queuedEntry = liveQueue[liveQueueIndex + direction];
    if (queuedEntry) {
      setQueueIndex(liveQueueIndex + direction);
      return navigateToTarget(queuedEntry.translationId, {
        bookId: queuedEntry.bookId,
        chapter: queuedEntry.chapter,
      });
    }

    return undefined;
  };
  try {
    const {
      currentTranslationId: liveTranslationId,
      currentBookId: liveBookId,
      currentChapter: liveChapter,
    } = useAudioStore.getState();
    const targetTranslationId = liveTranslationId ?? fallbackTranslationId;
    const priorityNavigation = navigatePinnedOrQueued();
    if (priorityNavigation) return priorityNavigation;

    if (!liveBookId || !liveChapter) return null;

    const coverage = await resolveAudioCoverage(targetTranslationId);
    // Coverage may need a manifest fetch. A later Play, Pause or Stop owns the
    // transport by then; this old chapter lookup must not navigate away from it.
    if (requestId !== session.playRequestId || stepRequestId !== navigationIntent.current)
      return null;
    const current = useAudioStore.getState();
    if (
      current.currentTranslationId !== liveTranslationId ||
      current.currentBookId !== liveBookId ||
      current.currentChapter !== liveChapter
    )
      return null;
    // Queue edits and a newly pinned session can arrive during the manifest fetch.
    // Apply the same live priority before selecting ordinary chapter adjacency.
    const livePriorityNavigation = navigatePinnedOrQueued();
    if (livePriorityNavigation) return livePriorityNavigation;
    const adjacentChapter = getAdjacentAudioChapter(liveBookId, liveChapter, direction, coverage);
    if (!adjacentChapter) return null;

    return navigateToTarget(targetTranslationId, adjacentChapter);
  } finally {
    if (navigationIntent.pendingId === stepRequestId) navigationIntent.pendingId = null;
  }
}
