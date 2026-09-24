import { getBookById } from '../../constants';
import { clearBibleNowPlaying } from '../../services/audio';
import { trackAnonymousUsageEvent } from '../../services/analytics';
import {
  getAudioChaptersForBook,
  isChapterAudioCovered,
} from '../../services/bible/contentAvailability';
import { useAudioStore } from '../../stores/audioStore';
import { resolveRepeatPlaybackTarget } from '../../stores/audioPlaybackCompletionModel';
import {
  getAdjacentAudioPlaybackSequenceEntry,
  hasAudioPlaybackSequenceEntry,
} from '../../stores/audioPlaybackSequenceModel';
import { advanceAudioQueue } from '../../stores/audioQueueModel';
import { useLibraryStore } from '../../stores/libraryStore';
import { useProgressStore } from '../../stores/progressStore';
import { emitAudioPlaybackProgress, stopAudioProgressTelemetry } from './listeningTelemetry';
import type { AudioPlayerSession, ResolveAudioCoverage } from './playerSession';
import { chapterTransition, pausedByListener } from './sharedPlaybackState';
import { getAdjacentAudioChapter } from './useAudioCoverage';

export interface PlaybackCompletionContext {
  session: AudioPlayerSession;
  fallbackTranslationId: string;
  resolveAudioCoverage: ResolveAudioCoverage;
}

/** Nothing further plays: clear the lock screen and the return tab, and go idle. */
function endPlayback(): void {
  void clearBibleNowPlaying();
  useAudioStore.getState().clearAudioReturnTarget();
  useAudioStore.getState().setStatus('idle');
}

/**
 * Records a chapter heard to the end, then plays whatever follows it: the next
 * chapter of a plan or rhythm session, the repeat target, the next queued chapter
 * with audio, or (with auto-advance on) the next chapter with audio. Otherwise
 * playback ends.
 */
export async function finishChapterAndAdvance({
  session,
  fallbackTranslationId,
  resolveAudioCoverage,
}: PlaybackCompletionContext): Promise<void> {
  const store = useAudioStore.getState();
  const {
    autoAdvanceChapter: shouldAutoAdvance,
    repeatMode: activeRepeatMode,
    currentBookId: bookId,
    currentChapter: chapterNum,
    currentTranslationId: finishedTranslationId,
    duration: finishedDuration,
    queue,
    queueIndex,
    setQueueIndex,
    playbackSequence,
  } = store;

  emitAudioPlaybackProgress(fallbackTranslationId, 'finish', true);
  stopAudioProgressTelemetry();

  // Fire analytics event for the chapter that just finished. Routed through
  // the unified anonymous-usage pipeline (P1 S3) so it lands for signed-out
  // listeners too and picks up server-side geo enrichment.
  if (bookId && chapterNum) {
    trackAnonymousUsageEvent('audio_completed', {
      duration_ms: finishedDuration,
      book: bookId,
      chapter: chapterNum,
      translation_id: finishedTranslationId ?? fallbackTranslationId,
    });
  }

  // Persist the finished listen even when playback ends without a manual pause
  // or a subsequent chapter transition. This keeps plan/listen completion in sync
  // for the last required chapter of the day.
  // A chapter heard to the end has nothing left to resume. Keeping its end offset as
  // the resume point made the next Play (or the first Play after a relaunch) seek
  // straight to the end and finish again without a sound.
  store.clearResumePosition();

  if (bookId && chapterNum && finishedDuration > 0) {
    useLibraryStore.getState().recordHistory(bookId, chapterNum, 1);
    // A finished listen also counts as covering the chapter, so the Home
    // reading ledger can credit chapters heard cover to cover, not just read.
    // Its minutes were banked segment by segment as it played.
    useProgressStore.getState().markChapterListened(bookId, chapterNum);
  }

  // A plan or rhythm owns playback until its last chapter finishes.
  // Global repeat and queue preferences must not escape that session.
  const nextSequenceEntry =
    bookId && chapterNum
      ? getAdjacentAudioPlaybackSequenceEntry(playbackSequence, bookId, chapterNum, 1)
      : null;
  if (nextSequenceEntry && session.playChapterForTranslation) {
    chapterTransition.current = true;
    await session.playChapterForTranslation(
      store.currentTranslationId ?? fallbackTranslationId,
      nextSequenceEntry.bookId,
      nextSequenceEntry.chapter
    );
    return;
  }

  const reachedPlaybackSequenceBoundary =
    bookId && chapterNum
      ? playbackSequence.length > 0 &&
        hasAudioPlaybackSequenceEntry(playbackSequence, bookId, chapterNum)
      : false;
  if (reachedPlaybackSequenceBoundary) {
    endPlayback();
    return;
  }

  // Coverage is read from here on, per translation and at the moment of advancing.
  // Resolving it can wait on the manifest, and the listener may pause, stop or pick
  // another chapter meanwhile; any of those owns playback from then on.
  // (The status is no guide: the native player can still report the finished sound
  // as paused after it ends. A listener pause or stop is flagged on pausedByListener.)
  const requestIdAtFinish = session.playRequestId;
  const pausedByListenerAtFinish = pausedByListener.current;
  const listenerTookOver = () => {
    const live = useAudioStore.getState();
    return (
      session.playRequestId !== requestIdAtFinish ||
      (pausedByListener.current && !pausedByListenerAtFinish) ||
      live.currentTranslationId !== finishedTranslationId ||
      live.currentBookId !== bookId ||
      live.currentChapter !== chapterNum
    );
  };
  const finishedCoverageTranslationId = finishedTranslationId ?? fallbackTranslationId;

  const currentBook = bookId ? getBookById(bookId) : null;
  const repeatCoverage =
    activeRepeatMode === 'book' && bookId
      ? await resolveAudioCoverage(finishedCoverageTranslationId)
      : undefined;
  if (listenerTookOver()) return;
  const repeatTarget = resolveRepeatPlaybackTarget({
    repeatMode: activeRepeatMode,
    bookId,
    chapter: chapterNum,
    totalChapters: currentBook?.chapters ?? null,
    availableChapters: bookId ? getAudioChaptersForBook(repeatCoverage, bookId) : undefined,
  });
  if (repeatTarget && session.playChapterForTranslation) {
    chapterTransition.current = true;
    await session.playChapterForTranslation(
      finishedCoverageTranslationId,
      repeatTarget.bookId,
      repeatTarget.chapter
    );
    return;
  }

  // Queued chapters play in order; one its translation has no audio for is skipped.
  for (
    let nextQueuedEntry = advanceAudioQueue(queue, queueIndex);
    nextQueuedEntry;
    nextQueuedEntry = advanceAudioQueue(queue, nextQueuedEntry.queueIndex)
  ) {
    const { entry } = nextQueuedEntry;
    const entryCoverage = await resolveAudioCoverage(entry.translationId);
    if (listenerTookOver()) return;
    if (!isChapterAudioCovered(entryCoverage, entry.bookId, entry.chapter)) continue;
    if (!session.playChapterForTranslation) break;

    chapterTransition.current = true;
    setQueueIndex(nextQueuedEntry.queueIndex);
    await session.playChapterForTranslation(entry.translationId, entry.bookId, entry.chapter);
    return;
  }

  if (!shouldAutoAdvance || !bookId || !chapterNum || !currentBook) {
    endPlayback();
    return;
  }

  const coverage = await resolveAudioCoverage(finishedCoverageTranslationId);
  if (listenerTookOver()) return;
  const adjacentChapter = getAdjacentAudioChapter(bookId, chapterNum, 1, coverage);
  if (adjacentChapter && session.playChapterForTranslation) {
    chapterTransition.current = true;
    await session.playChapterForTranslation(
      finishedCoverageTranslationId,
      adjacentChapter.bookId,
      adjacentChapter.chapter
    );
  } else {
    // Nothing further has audio: end playback exactly as the end of the Bible does.
    endPlayback();
  }
}
