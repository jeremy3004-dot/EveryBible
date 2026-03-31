import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAudioStore, useLibraryStore } from '../stores';
import {
  audioPlayer,
  backgroundMusicPlayer,
  clearBibleNowPlaying,
  getChapterAudioUrl,
  isAudioAvailable,
  prefetchChapterAudio,
  subscribeBibleNowPlayingRemoteCommands,
  syncBibleNowPlaying,
} from '../services/audio';
import type { TrackPlayerProgressSnapshot } from '../services/audio/audioPlayer';
import { trackEvent } from '../services/analytics';
import { getBookById } from '../constants';
import type { AudioPlaybackSequenceEntry, PlaybackRate, SleepTimerOption } from '../types';
import { advanceAudioQueue } from '../stores/audioQueueModel';
import { resolveRepeatPlaybackTarget } from '../stores/audioPlaybackCompletionModel';
import {
  getAdjacentAudioPlaybackSequenceEntry,
  hasAudioPlaybackSequenceEntry,
} from '../stores/audioPlaybackSequenceModel';

export function useAudioPlayer(translationId: string = 'bsb') {
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playRequestIdRef = useRef(0);
  const isChapterTransitioningRef = useRef(false);
  const backgroundMusicOffHandledRef = useRef(false);
  const playChapterForTranslationRef = useRef<
    ((translationId: string, bookId: string, chapter: number, verse?: number) => Promise<void>) | null
  >(null);
  const [sleepTimerNow, setSleepTimerNow] = useState(() => Date.now());

  // Interpolation refs — track the last real poll so we can estimate position
  // between 100ms ticks using wall-clock time. Cleared on seek/pause/stop.
  const lastPollPositionRef = useRef<number>(0);
  const lastPollTimeRef = useRef<number>(0);
  const interpolationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    status,
    currentTranslationId,
    currentBookId,
    currentChapter,
    currentPosition,
    duration,
    error,
    showPlayer,
    queue,
    queueIndex,
    playbackSequence,
    lastPlayedTranslationId,
    lastPlayedBookId,
    lastPlayedChapter,
    lastPosition,
    playbackRate,
    autoAdvanceChapter,
    repeatMode,
    sleepTimerMinutes,
    sleepTimerEndTime,
    backgroundMusicChoice,
    setStatus,
    setCurrentTrack,
    setPosition,
    setDuration,
    setError,
    syncQueueToTrack: syncQueueToTrackInStore,
    addToQueue: addToQueueInStore,
    removeFromQueue,
    clearQueue,
    setQueueIndex,
    clearPlaybackSequence,
    setShowPlayer,
    togglePlayer,
    setPlaybackRate,
    setAutoAdvanceChapter,
    setRepeatMode,
    cycleRepeatMode,
    setSleepTimer,
    clearSleepTimer,
    setBackgroundMusicChoice,
    resetPlayback,
  } = useAudioStore(
    useShallow((state) => ({
      status: state.status,
      currentTranslationId: state.currentTranslationId,
      currentBookId: state.currentBookId,
      currentChapter: state.currentChapter,
      currentPosition: state.currentPosition,
      duration: state.duration,
      error: state.error,
      showPlayer: state.showPlayer,
      queue: state.queue,
      queueIndex: state.queueIndex,
      playbackSequence: state.playbackSequence,
      lastPlayedTranslationId: state.lastPlayedTranslationId,
      lastPlayedBookId: state.lastPlayedBookId,
      lastPlayedChapter: state.lastPlayedChapter,
      lastPosition: state.lastPosition,
      playbackRate: state.playbackRate,
      autoAdvanceChapter: state.autoAdvanceChapter,
      repeatMode: state.repeatMode,
      sleepTimerMinutes: state.sleepTimerMinutes,
      sleepTimerEndTime: state.sleepTimerEndTime,
      backgroundMusicChoice: state.backgroundMusicChoice,
      setStatus: state.setStatus,
      setCurrentTrack: state.setCurrentTrack,
      setPosition: state.setPosition,
      setDuration: state.setDuration,
      setError: state.setError,
      syncQueueToTrack: state.syncQueueToTrack,
      addToQueue: state.addToQueue,
      removeFromQueue: state.removeFromQueue,
      clearQueue: state.clearQueue,
      setQueueIndex: state.setQueueIndex,
      clearPlaybackSequence: state.clearPlaybackSequence,
      setShowPlayer: state.setShowPlayer,
      togglePlayer: state.togglePlayer,
      setPlaybackRate: state.setPlaybackRate,
      setAutoAdvanceChapter: state.setAutoAdvanceChapter,
      setRepeatMode: state.setRepeatMode,
      cycleRepeatMode: state.cycleRepeatMode,
      setSleepTimer: state.setSleepTimer,
      clearSleepTimer: state.clearSleepTimer,
      setBackgroundMusicChoice: state.setBackgroundMusicChoice,
      resetPlayback: state.resetPlayback,
    }))
  );

  const playChapterForTranslation = useCallback(
    async (targetTranslationId: string, bookId: string, chapter: number, verse?: number) => {
      if (!isAudioAvailable(targetTranslationId)) {
        setError('Audio not available for this translation');
        return;
      }

      const playRequestId = ++playRequestIdRef.current;

      if (currentBookId && currentChapter && duration > 0) {
        useLibraryStore.getState().recordHistory(
          currentBookId,
          currentChapter,
          currentPosition / duration
        );
      }

      await audioPlayer.stop();
      setStatus('loading');
      setCurrentTrack(targetTranslationId, bookId, chapter);
      syncQueueToTrackInStore(targetTranslationId, bookId, chapter);
      if (
        playbackSequence.length > 0 &&
        !hasAudioPlaybackSequenceEntry(playbackSequence, bookId, chapter)
      ) {
        clearPlaybackSequence();
      }

      try {
        const audioData = await getChapterAudioUrl(targetTranslationId, bookId, chapter, verse);

        if (playRequestId !== playRequestIdRef.current) {
          return;
        }

        if (!audioData) {
          setError('Audio not available for this chapter');
          setStatus('error');
          return;
        }

        await audioPlayer.loadAndPlay(audioData.url, playbackRate);
        setDuration(audioData.duration);
        setStatus('playing');
        useLibraryStore.getState().recordHistory(bookId, chapter, 0);

        // Prefetch next chapters
        prefetchChapterAudio(targetTranslationId, bookId, chapter + 1, 2);
      } catch (err) {
        if (playRequestId !== playRequestIdRef.current) {
          return;
        }

        const message = err instanceof Error ? err.message : 'Failed to play audio';
        setError(message);
        setStatus('error');
      }
    },
    [
      currentBookId,
      currentChapter,
      currentPosition,
      duration,
      playbackRate,
      setStatus,
      setCurrentTrack,
      setError,
      setDuration,
      syncQueueToTrackInStore,
      playbackSequence,
      clearPlaybackSequence,
    ]
  );

  const playChapter = useCallback(
    async (bookId: string, chapter: number, verse?: number) => {
      await playChapterForTranslation(translationId, bookId, chapter, verse);
    },
    [playChapterForTranslation, translationId]
  );

  useEffect(() => {
    playChapterForTranslationRef.current = playChapterForTranslation;
  }, [playChapterForTranslation]);

  // Handle playback status updates from track-player wrapper
  const handleStatusUpdate = useCallback(
    (snapshot: TrackPlayerProgressSnapshot) => {
      const currentPosition = useAudioStore.getState().currentPosition;
      const currentDuration = useAudioStore.getState().duration;
      // Keep the visible position monotonic so stop-like snapshots from
      // background-music teardown cannot pull the Bible progress bar backward.
      const nextPosition = Math.max(currentPosition, snapshot.positionMillis);
      const nextDuration =
        snapshot.durationMillis > 0 ? Math.max(currentDuration, snapshot.durationMillis) : currentDuration;

      setPosition(nextPosition);
      setDuration(nextDuration);

      // Record the real poll anchor for interpolation
      lastPollPositionRef.current = nextPosition;
      lastPollTimeRef.current = Date.now();

      if (snapshot.isPlaying) {
        setStatus('playing');

        // Start 50ms interpolation timer if not already running
        if (!interpolationTimerRef.current) {
          interpolationTimerRef.current = setInterval(() => {
            const playbackRate = useAudioStore.getState().playbackRate ?? 1.0;
            const elapsed = Date.now() - lastPollTimeRef.current;
            const interpolated = lastPollPositionRef.current + elapsed * playbackRate;
            const currentPosition = useAudioStore.getState().currentPosition;
            const currentDuration = useAudioStore.getState().duration;
            const cappedInterpolated =
              currentDuration > 0 ? Math.min(interpolated, currentDuration) : interpolated;
            useAudioStore.getState().setPosition(Math.max(currentPosition, cappedInterpolated));
          }, 50);
        }
      } else {
        // Not playing — stop interpolation and clear the timer
        if (interpolationTimerRef.current) {
          clearInterval(interpolationTimerRef.current);
          interpolationTimerRef.current = null;
        }

        if (snapshot.isBuffering) {
          setStatus('loading');
        } else {
          setStatus('paused');
        }
      }
    },
    [setPosition, setDuration, setStatus]
  );

  // Handle playback finished - auto-advance to next chapter
  const handlePlaybackFinished = useCallback(async () => {
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

    // Fire analytics event for the chapter that just finished
    if (bookId && chapterNum) {
      trackEvent('audio_completed', {
        duration_ms: finishedDuration,
        book: bookId,
        chapter: chapterNum,
        translation_id: finishedTranslationId ?? translationId,
      });
    }

    const currentBook = bookId ? getBookById(bookId) : null;
    const repeatTarget = resolveRepeatPlaybackTarget({
      repeatMode: activeRepeatMode,
      bookId,
      chapter: chapterNum,
      totalChapters: currentBook?.chapters ?? null,
    });
    if (repeatTarget && playChapterForTranslationRef.current) {
      await playChapterForTranslationRef.current(
        store.currentTranslationId ?? translationId,
        repeatTarget.bookId,
        repeatTarget.chapter
      );
      return;
    }

    const nextQueuedEntry = advanceAudioQueue(queue, queueIndex);
    if (nextQueuedEntry && playChapterForTranslationRef.current) {
      setQueueIndex(nextQueuedEntry.queueIndex);
      await playChapterForTranslationRef.current(
        nextQueuedEntry.entry.translationId,
        nextQueuedEntry.entry.bookId,
        nextQueuedEntry.entry.chapter
      );
      return;
    }

    const nextSequenceEntry =
      bookId && chapterNum
        ? getAdjacentAudioPlaybackSequenceEntry(playbackSequence, bookId, chapterNum, 1)
        : null;
    if (nextSequenceEntry && playChapterForTranslationRef.current) {
      await playChapterForTranslationRef.current(
        store.currentTranslationId ?? translationId,
        nextSequenceEntry.bookId,
        nextSequenceEntry.chapter
      );
      return;
    }

    if (!shouldAutoAdvance || !bookId || !chapterNum) {
      setStatus('idle');
      return;
    }

    if (!currentBook) {
      setStatus('idle');
      return;
    }

    const nextChapterNum = chapterNum + 1;

    // Check if there's a next chapter in this book
    if (nextChapterNum <= currentBook.chapters && playChapterForTranslationRef.current) {
      // Auto-advance to next chapter
      await playChapterForTranslationRef.current(
        store.currentTranslationId ?? translationId,
        bookId,
        nextChapterNum
      );
    } else {
      // End of book - stop playback
      setStatus('idle');
    }
  }, [setStatus, translationId]);

  // Set up audio player callbacks
  useEffect(() => {
    audioPlayer.setCallbacks({
      onStatusUpdate: handleStatusUpdate,
      onPlaybackFinished: handlePlaybackFinished,
      onError: setError,
    });

    return () => {
      // Clean up interpolation timer when hook unmounts
      if (interpolationTimerRef.current) {
        clearInterval(interpolationTimerRef.current);
        interpolationTimerRef.current = null;
      }
    };
  }, [handleStatusUpdate, handlePlaybackFinished, setError]);

  useEffect(() => {
    if (status === 'playing') {
      // Chapter finished transitioning
      isChapterTransitioningRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    const activeTranslationId = currentTranslationId ?? translationId;

    if (!currentBookId || !currentChapter || status === 'idle') {
      clearBibleNowPlaying();
      return;
    }

    syncBibleNowPlaying({
      translationId: activeTranslationId,
      bookId: currentBookId,
      chapter: currentChapter,
      positionMs: currentPosition,
      durationMs: duration,
      isPlaying: status === 'playing',
      playbackRate,
    });
  }, [
    currentBookId,
    currentChapter,
    currentPosition,
    currentTranslationId,
    duration,
    playbackRate,
    status,
    translationId,
  ]);

  useEffect(() => {
    if (backgroundMusicChoice === 'off') {
      if (!backgroundMusicOffHandledRef.current) {
        backgroundMusicOffHandledRef.current = true;
        void backgroundMusicPlayer.stop();
      }

      return;
    }

    // Keep music playing during chapter transitions (isChapterTransitioningRef).
    // Pause it when the user explicitly pauses (status==='paused' and not transitioning).
    backgroundMusicOffHandledRef.current = false;
    const shouldPlayBackgroundMusic =
      status === 'playing' ||
      status === 'loading' ||
      isChapterTransitioningRef.current;

    void backgroundMusicPlayer.sync(backgroundMusicChoice, shouldPlayBackgroundMusic);
  }, [backgroundMusicChoice, status]);

  // Sleep timer check and remaining time calculation
  useEffect(() => {
    if (sleepTimerEndTime) {
      if (status === 'playing') {
        sleepTimerRef.current = setInterval(() => {
          const now = Date.now();
          setSleepTimerNow(now);

          if (now >= sleepTimerEndTime) {
            // Timer expired - stop playback
            audioPlayer.pause();
            clearSleepTimer();
          }
        }, 1000);
      }
    }

    return () => {
      if (sleepTimerRef.current) {
        clearInterval(sleepTimerRef.current);
        sleepTimerRef.current = null;
      }
    };
  }, [sleepTimerEndTime, status, clearSleepTimer]);

  const sleepTimerRemaining = useMemo(() => {
    if (!sleepTimerEndTime) {
      return null;
    }

    return Math.max(0, Math.ceil((sleepTimerEndTime - sleepTimerNow) / 1000 / 60));
  }, [sleepTimerEndTime, sleepTimerNow]);

  // Pause playback
  const pause = useCallback(async () => {
    // Stop interpolation immediately so position freezes at pause point
    if (interpolationTimerRef.current) {
      clearInterval(interpolationTimerRef.current);
      interpolationTimerRef.current = null;
    }
    await audioPlayer.pause();
    setStatus('paused');
    if (currentBookId && currentChapter && duration > 0) {
      useLibraryStore.getState().recordHistory(
        currentBookId,
        currentChapter,
        currentPosition / duration
      );
    }
  }, [currentBookId, currentChapter, currentPosition, duration, setStatus]);

  // Resume playback
  const resume = useCallback(async () => {
    // Reset poll anchor so interpolation starts fresh from the current position
    lastPollPositionRef.current = useAudioStore.getState().currentPosition;
    lastPollTimeRef.current = Date.now();
    await audioPlayer.resume();
    setStatus('playing');
  }, [setStatus]);

  // Stop playback completely
  const stop = useCallback(async () => {
    if (interpolationTimerRef.current) {
      clearInterval(interpolationTimerRef.current);
      interpolationTimerRef.current = null;
    }
    if (currentBookId && currentChapter && duration > 0) {
      useLibraryStore.getState().recordHistory(
        currentBookId,
        currentChapter,
        currentPosition / duration
      );
    }
    await audioPlayer.stop();
    await backgroundMusicPlayer.stop();
    clearBibleNowPlaying();
    resetPlayback();
  }, [currentBookId, currentChapter, currentPosition, duration, resetPlayback]);

  // Toggle play/pause
  const togglePlayPause = useCallback(async () => {
    if (status === 'playing') {
      await pause();
    } else if (status === 'paused') {
      await resume();
    } else if (currentBookId && currentChapter) {
      await playChapterForTranslation(
        currentTranslationId ?? translationId,
        currentBookId,
        currentChapter
      );
    } else if (lastPlayedBookId && lastPlayedChapter) {
      await playChapterForTranslation(
        lastPlayedTranslationId ?? translationId,
        lastPlayedBookId,
        lastPlayedChapter
      );
    }
  }, [
    status,
    currentTranslationId,
    currentBookId,
    currentChapter,
    lastPlayedTranslationId,
    lastPlayedBookId,
    lastPlayedChapter,
    pause,
    resume,
    playChapterForTranslation,
    translationId,
  ]);

  // Seek to position
  const seekTo = useCallback(
    async (positionMs: number) => {
      // Reset interpolation anchor to the seek target so we don't overshoot
      lastPollPositionRef.current = positionMs;
      lastPollTimeRef.current = Date.now();
      await audioPlayer.seekTo(positionMs);
      setPosition(positionMs);
    },
    [setPosition]
  );

  const skipBy = useCallback(
    async (deltaMs: number) => {
      if (!currentBookId || !currentChapter || duration <= 0) {
        return;
      }

      const nextPosition = Math.max(0, Math.min(duration, currentPosition + deltaMs));
      await audioPlayer.seekTo(nextPosition);
      setPosition(nextPosition);
    },
    [currentBookId, currentChapter, currentPosition, duration, setPosition]
  );

  const skipBackward = useCallback(async () => {
    await skipBy(-10000);
  }, [skipBy]);

  const skipForward = useCallback(async () => {
    await skipBy(10000);
  }, [skipBy]);

  // Change playback rate
  const changePlaybackRate = useCallback(
    async (rate: PlaybackRate) => {
      await audioPlayer.setRate(rate);
      setPlaybackRate(rate);
    },
    [setPlaybackRate]
  );

  // Navigate to previous chapter
  const previousChapter = useCallback(async (): Promise<AudioPlaybackSequenceEntry | null> => {
    isChapterTransitioningRef.current = true;
    const previousQueuedEntry = queue[queueIndex - 1];
    if (previousQueuedEntry) {
      setQueueIndex(queueIndex - 1);
      await playChapterForTranslation(
        previousQueuedEntry.translationId,
        previousQueuedEntry.bookId,
        previousQueuedEntry.chapter
      );
      return {
        bookId: previousQueuedEntry.bookId,
        chapter: previousQueuedEntry.chapter,
      };
    }

    const previousSequenceEntry =
      currentBookId && currentChapter
        ? getAdjacentAudioPlaybackSequenceEntry(playbackSequence, currentBookId, currentChapter, -1)
        : null;
    if (previousSequenceEntry) {
      await playChapterForTranslation(
        currentTranslationId ?? translationId,
        previousSequenceEntry.bookId,
        previousSequenceEntry.chapter
      );
      return previousSequenceEntry;
    }

    if (!currentBookId || !currentChapter || currentChapter <= 1) return null;
    await playChapterForTranslation(
      currentTranslationId ?? translationId,
      currentBookId,
      currentChapter - 1
    );
    return { bookId: currentBookId, chapter: currentChapter - 1 };
  }, [
    currentBookId,
    currentChapter,
    currentTranslationId,
    playChapterForTranslation,
    playbackSequence,
    queue,
    queueIndex,
    setQueueIndex,
    translationId,
  ]);

  // Navigate to next chapter
  const nextChapter = useCallback(async (): Promise<AudioPlaybackSequenceEntry | null> => {
    isChapterTransitioningRef.current = true;
    const nextQueuedEntry = queue[queueIndex + 1];
    if (nextQueuedEntry) {
      setQueueIndex(queueIndex + 1);
      await playChapterForTranslation(
        nextQueuedEntry.translationId,
        nextQueuedEntry.bookId,
        nextQueuedEntry.chapter
      );
      return {
        bookId: nextQueuedEntry.bookId,
        chapter: nextQueuedEntry.chapter,
      };
    }

    const nextSequenceEntry =
      currentBookId && currentChapter
        ? getAdjacentAudioPlaybackSequenceEntry(playbackSequence, currentBookId, currentChapter, 1)
        : null;
    if (nextSequenceEntry) {
      await playChapterForTranslation(
        currentTranslationId ?? translationId,
        nextSequenceEntry.bookId,
        nextSequenceEntry.chapter
      );
      return nextSequenceEntry;
    }

    if (!currentBookId || !currentChapter) return null;

    const book = getBookById(currentBookId);
    if (!book || currentChapter >= book.chapters) return null;

    await playChapterForTranslation(
      currentTranslationId ?? translationId,
      currentBookId,
      currentChapter + 1
    );
    return { bookId: currentBookId, chapter: currentChapter + 1 };
  }, [
    currentBookId,
    currentChapter,
    currentTranslationId,
    playChapterForTranslation,
    playbackSequence,
    queue,
    queueIndex,
    setQueueIndex,
    translationId,
  ]);

  const addToQueue = useCallback(
    (bookId: string, chapter: number) => {
      addToQueueInStore(translationId, bookId, chapter);
    },
    [addToQueueInStore, translationId]
  );

  // Set sleep timer
  const startSleepTimer = useCallback(
    (minutes: SleepTimerOption) => {
      setSleepTimer(minutes);
    },
    [setSleepTimer]
  );

  // Check if audio is available for current translation
  const audioAvailable = isAudioAvailable(translationId);

  useEffect(() => {
    return subscribeBibleNowPlayingRemoteCommands({
      onPlay: async () => {
        const store = useAudioStore.getState();

        if (store.status === 'playing') {
          return;
        }

        if (store.status === 'paused') {
          await resume();
          return;
        }

        if (store.currentBookId && store.currentChapter) {
          await playChapterForTranslation(
            store.currentTranslationId ?? translationId,
            store.currentBookId,
            store.currentChapter
          );
          return;
        }

        if (store.lastPlayedBookId && store.lastPlayedChapter) {
          await playChapterForTranslation(
            store.lastPlayedTranslationId ?? translationId,
            store.lastPlayedBookId,
            store.lastPlayedChapter
          );
        }
      },
      onPause: pause,
      onStop: stop,
      onSeek: seekTo,
      onNext: async () => {
        await nextChapter();
      },
      onPrevious: async () => {
        await previousChapter();
      },
    });
  }, [nextChapter, pause, playChapterForTranslation, previousChapter, resume, seekTo, stop, translationId]);

  return {
    // State
    status,
    currentTranslationId,
    currentBookId,
    currentChapter,
    currentPosition,
    duration,
    error,
    showPlayer,
    queue,
    queueIndex,
    playbackSequence,
    lastPlayedTranslationId,
    lastPlayedBookId,
    lastPlayedChapter,
    lastPosition,
    playbackRate,
    autoAdvanceChapter,
    repeatMode,
    sleepTimerMinutes,
    sleepTimerRemaining,
    backgroundMusicChoice,
    audioAvailable,

    // Player visibility
    setShowPlayer,
    togglePlayer,

    // Playback controls
    playChapter,
    playChapterForTranslation,
    addToQueue,
    removeFromQueue,
    clearQueue,
    pause,
    resume,
    stop,
    togglePlayPause,
    seekTo,
    skipBackward,
    skipForward,

    // Navigation
    previousChapter,
    nextChapter,

    // Settings
    changePlaybackRate,
    setAutoAdvanceChapter,
    setRepeatMode,
    cycleRepeatMode,
    startSleepTimer,
    clearSleepTimer,
    changeBackgroundMusicChoice: setBackgroundMusicChoice,
  };
}
