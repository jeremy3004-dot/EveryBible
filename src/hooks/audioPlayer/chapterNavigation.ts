import { audioPlayer, clearBibleNowPlaying } from '../../services/audio';
import { useAudioStore } from '../../stores/audioStore';
import {
  getAdjacentAudioPlaybackSequenceEntry,
  hasAudioPlaybackSequenceEntry,
} from '../../stores/audioPlaybackSequenceModel';
import type { AudioPlaybackSequenceEntry } from '../../types';
import { stopAudioProgressTelemetry } from './listeningTelemetry';
import { stopPositionInterpolation } from './playbackProgress';
import type {
  AudioPlayerSession,
  PlayChapterForTranslation,
  ResolveAudioCoverage,
} from './playerSession';
import { chapterTransition } from './sharedPlaybackState';
import { getAdjacentAudioChapter } from './useAudioCoverage';

export type NavigateChapterForTranslation = (
  translationId: string,
  bookId: string,
  chapter: number,
  verse?: number
) => Promise<void>;

/**
 * Manual chapter navigation, and switching the translation of the loaded chapter,
 * keep the listener's current playback intent. A paused target is selected
 * unloaded, so it cannot briefly start sounding.
 */
export async function navigateToChapter(
  session: AudioPlayerSession,
  playChapterForTranslation: PlayChapterForTranslation,
  targetTranslationId: string,
  bookId: string,
  chapter: number,
  verse?: number
): Promise<void> {
  const statusAtNavigation = useAudioStore.getState().status;
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
  void clearBibleNowPlaying();
}

export interface StepChapterContext {
  fallbackTranslationId: string;
  resolveAudioCoverage: ResolveAudioCoverage;
  navigateChapterForTranslation: NavigateChapterForTranslation;
}

/**
 * Steps the player one chapter back or forward: the queue first, then a pinned
 * plan or rhythm session, then plain (or sparse-set) chapter adjacency. State is
 * read at call time because lock-screen commands arrive after the reader unmounts,
 * when the reader's render may be several auto-advanced chapters behind.
 */
export async function stepChapter(
  {
    fallbackTranslationId,
    resolveAudioCoverage,
    navigateChapterForTranslation,
  }: StepChapterContext,
  direction: -1 | 1
): Promise<AudioPlaybackSequenceEntry | null> {
  const {
    queue: liveQueue,
    queueIndex: liveQueueIndex,
    playbackSequence: liveSequence,
    currentTranslationId: liveTranslationId,
    currentBookId: liveBookId,
    currentChapter: liveChapter,
    setQueueIndex,
  } = useAudioStore.getState();

  const queuedEntry = liveQueue[liveQueueIndex + direction];
  if (queuedEntry) {
    setQueueIndex(liveQueueIndex + direction);
    await navigateChapterForTranslation(
      queuedEntry.translationId,
      queuedEntry.bookId,
      queuedEntry.chapter
    );
    return { bookId: queuedEntry.bookId, chapter: queuedEntry.chapter };
  }

  if (!liveBookId || !liveChapter) return null;
  const targetTranslationId = liveTranslationId ?? fallbackTranslationId;

  const sequenceEntry = getAdjacentAudioPlaybackSequenceEntry(
    liveSequence,
    liveBookId,
    liveChapter,
    direction
  );
  if (sequenceEntry) {
    await navigateChapterForTranslation(
      targetTranslationId,
      sequenceEntry.bookId,
      sequenceEntry.chapter
    );
    return sequenceEntry;
  }

  const isPinnedToPlaybackSequence =
    liveSequence.length > 0 && hasAudioPlaybackSequenceEntry(liveSequence, liveBookId, liveChapter);
  if (isPinnedToPlaybackSequence) {
    return null;
  }

  const coverage = await resolveAudioCoverage(targetTranslationId);
  const adjacentChapter = getAdjacentAudioChapter(liveBookId, liveChapter, direction, coverage);
  if (!adjacentChapter) return null;

  await navigateChapterForTranslation(
    targetTranslationId,
    adjacentChapter.bookId,
    adjacentChapter.chapter
  );
  return adjacentChapter;
}
