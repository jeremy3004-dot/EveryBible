import { getBookById } from '../../constants';
import type { RepeatPassage } from '../../types';
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
import { getAudioTrackId } from '../../stores/audioQueueModel';
import { useLibraryStore } from '../../stores/libraryStore';
import { useProgressStore } from '../../stores/progressStore';
import { emitAudioPlaybackProgress, stopAudioProgressTelemetry } from './listeningTelemetry';
import type { AudioPlayerSession, ResolveAudioCoverage } from './playerSession';
import { resolvePassageFinishTarget } from './passageRepeat';
import { followAutoAdvancedChapter } from './readingPositionFollow';
import { chapterTransition, navigationIntent, pausedByListener } from './sharedPlaybackState';
import { getAdjacentAudioChapter } from './useAudioCoverage';

export interface PlaybackCompletionContext {
  session: AudioPlayerSession;
  fallbackTranslationId: string;
  resolveAudioCoverage: ResolveAudioCoverage;
}

/** Nothing further plays: clear the lock screen and the return tab, and go idle. */
function endPlayback(): void {
  // A later seek may cue the finished sound, but only explicit Play may restart it.
  pausedByListener.current = true;
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
  const requestIdAtFinish = session.playRequestId;
  const pausedByListenerAtFinish = pausedByListener.current;
  const navigationIntentAtFinish = navigationIntent.current;
  const manualStepPendingAtFinish = navigationIntent.pendingId !== null;
  const {
    autoAdvanceChapter: shouldAutoAdvance,
    currentBookId: bookId,
    currentChapter: chapterNum,
    currentTranslationId: finishedTranslationId,
    duration: finishedDuration,
    playbackSequence,
  } = store;

  // Every chapter this handler starts is audio moving on by itself, not a listener's pick,
  // so a listener who was following along keeps following (with the reader open or not).
  const followTo = (nextBookId: string, nextChapter: number) => {
    if (bookId && chapterNum) {
      followAutoAdvancedChapter(
        { bookId, chapter: chapterNum },
        { bookId: nextBookId, chapter: nextChapter }
      );
    }
  };

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
  const shouldStopAdvancing = () => {
    if (listenerTookOver()) return true;
    // The listener can choose "End of chapter" while coverage or passage timings
    // resolve. Re-read it before any advance, but only while this finished chapter
    // still owns playback: a replacement chapter keeps its own timer.
    const live = useAudioStore.getState();
    if (live.sleepTimerMinutes === 'end-of-chapter') {
      // Consuming the timer supersedes an unclaimed manual lookup, as Pause does.
      ++session.playRequestId;
      live.clearSleepTimer();
      pausedByListener.current = true;
      chapterTransition.current = false;
      endPlayback();
      return true;
    }
    if (manualStepPendingAtFinish || navigationIntent.current !== navigationIntentAtFinish) {
      endPlayback();
      return true;
    }
    return false;
  };
  if (shouldStopAdvancing()) return;

  // A plan or rhythm owns playback until its last chapter finishes.
  // Global repeat and queue preferences must not escape that session.
  const nextSequenceEntry =
    bookId && chapterNum
      ? getAdjacentAudioPlaybackSequenceEntry(playbackSequence, bookId, chapterNum, 1)
      : null;
  if (nextSequenceEntry && session.playChapterForTranslation) {
    chapterTransition.current = true;
    followTo(nextSequenceEntry.bookId, nextSequenceEntry.chapter);
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
  const finishedCoverageTranslationId = finishedTranslationId ?? fallbackTranslationId;

  const currentBook = bookId ? getBookById(bookId) : null;
  // Repeat choices and the queue can change while coverage resolves. Cache even
  // undefined coverage so each translation settles once in this completion.
  const coverageByTranslation = new Map<string, Awaited<ReturnType<ResolveAudioCoverage>>>();
  const resolveCachedCoverage: ResolveAudioCoverage = async (translationId) => {
    if (!coverageByTranslation.has(translationId)) {
      const coverage = await resolveAudioCoverage(translationId);
      // Preserve the completion guard's ordering before this cache wrapper adds
      // another continuation: an End-of-chapter timer must beat an unclaimed step.
      if (shouldStopAdvancing()) return undefined;
      coverageByTranslation.set(translationId, coverage);
    }
    return coverageByTranslation.get(translationId);
  };
  let settledPassage: {
    passage: RepeatPassage | null;
    target: Awaited<ReturnType<typeof resolvePassageFinishTarget>>;
  } | null = null;
  const finishedTrackId =
    bookId && chapterNum
      ? getAudioTrackId(finishedCoverageTranslationId, bookId, chapterNum)
      : null;
  let queueAnchorExpected = store.queue.some((entry) => entry.id === finishedTrackId);
  let linearCoverageReady = false;

  for (;;) {
    if (shouldStopAdvancing()) return;
    const live = useAudioStore.getState();
    // Repeat has priority over the queue. Revisit it after every lookup so a
    // chip or passage edit applies to the chapter that is still finishing.
    if (live.repeatMode === 'passage' && bookId && chapterNum) {
      const rawPassage = live.repeatPassage;
      if (!settledPassage || settledPassage.passage !== rawPassage) {
        const target = await resolvePassageFinishTarget(resolveCachedCoverage, {
          translationId: finishedCoverageTranslationId,
          bookId,
          chapter: chapterNum,
        });
        if (shouldStopAdvancing()) return;
        const current = useAudioStore.getState();
        if (current.repeatMode !== 'passage' || current.repeatPassage !== rawPassage) continue;
        settledPassage = { passage: rawPassage, target };
        // Refresh the queue too: passage resolution may have yielded even when
        // its settled target is null. A null result is cached, not retried.
        continue;
      }
      const passageTarget = settledPassage.target;
      if (passageTarget && session.playChapterForTranslation) {
        chapterTransition.current = true;
        followTo(passageTarget.bookId, passageTarget.chapter);
        await session.playChapterForTranslation(
          finishedCoverageTranslationId,
          passageTarget.bookId,
          passageTarget.chapter,
          undefined,
          { startPositionMs: passageTarget.startPositionMs }
        );
        return;
      }
    }
    if (
      live.repeatMode === 'book' &&
      bookId &&
      !coverageByTranslation.has(finishedCoverageTranslationId)
    ) {
      await resolveCachedCoverage(finishedCoverageTranslationId);
      continue;
    }
    const repeatTarget = resolveRepeatPlaybackTarget({
      repeatMode: live.repeatMode,
      bookId,
      chapter: chapterNum,
      totalChapters: currentBook?.chapters ?? null,
      availableChapters: bookId
        ? getAudioChaptersForBook(coverageByTranslation.get(finishedCoverageTranslationId), bookId)
        : undefined,
    });
    if (repeatTarget && session.playChapterForTranslation) {
      chapterTransition.current = true;
      followTo(repeatTarget.bookId, repeatTarget.chapter);
      await session.playChapterForTranslation(
        finishedCoverageTranslationId,
        repeatTarget.bookId,
        repeatTarget.chapter
      );
      return;
    }

    const anchorIndex = live.queue.findIndex((entry) => entry.id === finishedTrackId);
    if (anchorIndex >= 0) queueAnchorExpected = true;
    else if (queueAnchorExpected) {
      // Removing the finished entry abandons its queue position. Keep the edited
      // queue intact rather than guessing which successor the listener intended.
      endPlayback();
      return;
    }

    let unresolvedTranslationId: string | undefined;
    for (const [index, entry] of live.queue.entries()) {
      if (index <= anchorIndex) continue;
      if (!coverageByTranslation.has(entry.translationId)) {
        unresolvedTranslationId = entry.translationId;
        break;
      }
      const entryCoverage = coverageByTranslation.get(entry.translationId);
      if (!isChapterAudioCovered(entryCoverage, entry.bookId, entry.chapter)) continue;
      if (!session.playChapterForTranslation) break;

      chapterTransition.current = true;
      live.setQueueIndex(index);
      followTo(entry.bookId, entry.chapter);
      await session.playChapterForTranslation(entry.translationId, entry.bookId, entry.chapter);
      return;
    }
    if (unresolvedTranslationId !== undefined) {
      await resolveCachedCoverage(unresolvedTranslationId);
      continue;
    }

    if (!shouldAutoAdvance || !bookId || !chapterNum || !currentBook) {
      endPlayback();
      return;
    }
    if (!linearCoverageReady) {
      if (!coverageByTranslation.has(finishedCoverageTranslationId)) {
        await resolveCachedCoverage(finishedCoverageTranslationId);
      }
      linearCoverageReady = true;
      // Even a queue exhausted before this lookup may now have a new entry.
      continue;
    }

    const adjacentChapter = getAdjacentAudioChapter(
      bookId,
      chapterNum,
      1,
      coverageByTranslation.get(finishedCoverageTranslationId)
    );
    if (adjacentChapter && session.playChapterForTranslation) {
      chapterTransition.current = true;
      followTo(adjacentChapter.bookId, adjacentChapter.chapter);
      await session.playChapterForTranslation(
        finishedCoverageTranslationId,
        adjacentChapter.bookId,
        adjacentChapter.chapter
      );
    } else {
      // Nothing further has audio: end playback as the end of the Bible does.
      endPlayback();
    }
    return;
  }
}
