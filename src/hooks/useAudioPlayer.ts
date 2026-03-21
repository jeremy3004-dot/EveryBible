import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AVPlaybackStatus } from 'expo-av';
import { useAudioStore, useLibraryStore } from '../stores';
import {
  audioPlayer,
  getChapterAudioUrl,
  isAudioAvailable,
  prefetchChapterAudio,
} from '../services/audio';
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
  const playChapterForTranslationRef = useRef<
    ((translationId: string, bookId: string, chapter: number, verse?: number) => Promise<void>) | null
  >(null);
  const [sleepTimerNow, setSleepTimerNow] = useState(() => Date.now());

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
    resetPlayback,
  } = useAudioStore();

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

  // Handle playback status updates from expo-av
  const handleStatusUpdate = useCallback(
    (playbackStatus: AVPlaybackStatus) => {
      if (!playbackStatus.isLoaded) {
        if (playbackStatus.error) {
          setError(playbackStatus.error);
        }
        return;
      }

      setPosition(playbackStatus.positionMillis);
      setDuration(playbackStatus.durationMillis || 0);

      if (playbackStatus.isPlaying) {
        setStatus('playing');
      } else if (playbackStatus.isBuffering) {
        setStatus('loading');
      } else {
        setStatus('paused');
      }
    },
    [setPosition, setDuration, setStatus, setError]
  );

  // Handle playback finished - auto-advance to next chapter
  const handlePlaybackFinished = useCallback(async () => {
    const store = useAudioStore.getState();
    const {
      autoAdvanceChapter: shouldAutoAdvance,
      repeatMode: activeRepeatMode,
      currentBookId: bookId,
      currentChapter: chapterNum,
      queue,
      queueIndex,
      setQueueIndex,
      playbackSequence,
    } = store;

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
  }, [handleStatusUpdate, handlePlaybackFinished, setError]);

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
    await audioPlayer.resume();
    setStatus('playing');
  }, [setStatus]);

  // Stop playback completely
  const stop = useCallback(async () => {
    if (currentBookId && currentChapter && duration > 0) {
      useLibraryStore.getState().recordHistory(
        currentBookId,
        currentChapter,
        currentPosition / duration
      );
    }
    await audioPlayer.stop();
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
  };
}
