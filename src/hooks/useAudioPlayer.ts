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
import type { PlaybackRate, SleepTimerOption } from '../types';
import { advanceAudioQueue } from '../stores/audioQueueModel';

export function useAudioPlayer(translationId: string = 'bsb') {
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playChapterRef = useRef<
    ((bookId: string, chapter: number, verse?: number) => Promise<void>) | null
  >(null);
  const [sleepTimerNow, setSleepTimerNow] = useState(() => Date.now());

  const {
    status,
    currentBookId,
    currentChapter,
    currentPosition,
    duration,
    error,
    showPlayer,
    queue,
    queueIndex,
    lastPlayedBookId,
    lastPlayedChapter,
    lastPosition,
    playbackRate,
    autoAdvanceChapter,
    sleepTimerMinutes,
    sleepTimerEndTime,
    setStatus,
    setCurrentTrack,
    setPosition,
    setDuration,
    setError,
    syncQueueToTrack,
    addToQueue,
    removeFromQueue,
    clearQueue,
    setQueueIndex,
    setShowPlayer,
    togglePlayer,
    setPlaybackRate,
    setAutoAdvanceChapter,
    setSleepTimer,
    clearSleepTimer,
    resetPlayback,
  } = useAudioStore();

  // Play a specific chapter (defined early to be used in callbacks)
  const playChapter = useCallback(
    async (bookId: string, chapter: number, verse?: number) => {
      if (!isAudioAvailable(translationId)) {
        setError('Audio not available for this translation');
        return;
      }

      setStatus('loading');
      setCurrentTrack(bookId, chapter);
      syncQueueToTrack(bookId, chapter);

      try {
        const audioData = await getChapterAudioUrl(translationId, bookId, chapter, verse);

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
        prefetchChapterAudio(translationId, bookId, chapter + 1, 2);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to play audio';
        setError(message);
        setStatus('error');
      }
    },
    [
      translationId,
      playbackRate,
      setStatus,
      setCurrentTrack,
      setError,
      setDuration,
      syncQueueToTrack,
    ]
  );

  // Keep ref updated for use in callbacks
  useEffect(() => {
    playChapterRef.current = playChapter;
  }, [playChapter]);

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
      currentBookId: bookId,
      currentChapter: chapterNum,
      queue,
      queueIndex,
      setQueueIndex,
    } = store;

    const nextQueuedEntry = advanceAudioQueue(queue, queueIndex);
    if (nextQueuedEntry && playChapterRef.current) {
      setQueueIndex(nextQueuedEntry.queueIndex);
      await playChapterRef.current(nextQueuedEntry.entry.bookId, nextQueuedEntry.entry.chapter);
      return;
    }

    if (!shouldAutoAdvance || !bookId || !chapterNum) {
      setStatus('idle');
      return;
    }

    const book = getBookById(bookId);
    if (!book) {
      setStatus('idle');
      return;
    }

    const nextChapterNum = chapterNum + 1;

    // Check if there's a next chapter in this book
    if (nextChapterNum <= book.chapters && playChapterRef.current) {
      // Auto-advance to next chapter
      await playChapterRef.current(bookId, nextChapterNum);
    } else {
      // End of book - stop playback
      setStatus('idle');
    }
  }, [setStatus]);

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
      await playChapter(currentBookId, currentChapter);
    } else if (lastPlayedBookId && lastPlayedChapter) {
      await playChapter(lastPlayedBookId, lastPlayedChapter);
    }
  }, [
    status,
    currentBookId,
    currentChapter,
    lastPlayedBookId,
    lastPlayedChapter,
    pause,
    resume,
    playChapter,
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
  const previousChapter = useCallback(async () => {
    const previousQueuedEntry = queue[queueIndex - 1];
    if (previousQueuedEntry) {
      setQueueIndex(queueIndex - 1);
      await playChapter(previousQueuedEntry.bookId, previousQueuedEntry.chapter);
      return;
    }

    if (!currentBookId || !currentChapter || currentChapter <= 1) return;
    await playChapter(currentBookId, currentChapter - 1);
  }, [currentBookId, currentChapter, playChapter, queue, queueIndex, setQueueIndex]);

  // Navigate to next chapter
  const nextChapter = useCallback(async () => {
    const nextQueuedEntry = queue[queueIndex + 1];
    if (nextQueuedEntry) {
      setQueueIndex(queueIndex + 1);
      await playChapter(nextQueuedEntry.bookId, nextQueuedEntry.chapter);
      return;
    }

    if (!currentBookId || !currentChapter) return;

    const book = getBookById(currentBookId);
    if (!book || currentChapter >= book.chapters) return;

    await playChapter(currentBookId, currentChapter + 1);
  }, [currentBookId, currentChapter, playChapter, queue, queueIndex, setQueueIndex]);

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
    currentBookId,
    currentChapter,
    currentPosition,
    duration,
    error,
    showPlayer,
    queue,
    queueIndex,
    lastPlayedBookId,
    lastPlayedChapter,
    lastPosition,
    playbackRate,
    autoAdvanceChapter,
    sleepTimerMinutes,
    sleepTimerRemaining,
    audioAvailable,

    // Player visibility
    setShowPlayer,
    togglePlayer,

    // Playback controls
    playChapter,
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
    startSleepTimer,
    clearSleepTimer,
  };
}
