import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAudioStore } from '../stores/audioStore';
import { useBibleStore } from '../stores/bibleStore';
import { useLibraryStore } from '../stores/libraryStore';
import {
  audioPlayer,
  backgroundMusicPlayer,
  clearBibleNowPlaying,
  type BibleNowPlayingInput,
  getChapterAudioUrl,
  isAudioAvailable,
  prefetchChapterAudio,
  subscribeBibleNowPlayingRemoteCommands,
  syncBibleNowPlaying,
} from '../services/audio';
import type { TrackPlayerProgressSnapshot } from '../services/audio/audioPlayer';
import { trackAnonymousUsageEvent, trackEvent } from '../services/analytics';
import { getAdjacentBibleChapter, getBookById } from '../constants';
import type { AudioPlaybackSequenceEntry, PlaybackRate, SleepTimerOption } from '../types';
import { advanceAudioQueue } from '../stores/audioQueueModel';
import { resolveRepeatPlaybackTarget } from '../stores/audioPlaybackCompletionModel';
import {
  getAdjacentAudioPlaybackSequenceEntry,
  hasAudioPlaybackSequenceEntry,
} from '../stores/audioPlaybackSequenceModel';

export function useAudioPlayer(translationId: string = 'bsb') {
  const AUDIO_PROGRESS_TELEMETRY_INTERVAL_MS = 30000;
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playRequestIdRef = useRef(0);
  const isChapterTransitioningRef = useRef(false);
  const backgroundMusicOffHandledRef = useRef(false);
  const playChapterForTranslationRef = useRef<
    ((
      translationId: string,
      bookId: string,
      chapter: number,
      verse?: number,
      options?: { startPositionMs?: number | null }
    ) => Promise<void>) | null
  >(null);
  const [sleepTimerNow, setSleepTimerNow] = useState(() => Date.now());

  // Interpolation refs — track the last real poll so we can estimate position
  // between 100ms ticks using wall-clock time. Cleared on seek/pause/stop.
  const lastPollPositionRef = useRef<number>(0);
  const lastPollTimeRef = useRef<number>(0);
  const interpolationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioProgressTelemetryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioProgressTelemetryLastEmittedAtRef = useRef<number>(0);
  const lastNowPlayingSignatureRef = useRef<string | null>(null);

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
    clearAudioReturnTarget,
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
      clearAudioReturnTarget: state.clearAudioReturnTarget,
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

  const syncCurrentNowPlaying = useCallback(
    (overrides: Partial<BibleNowPlayingInput> = {}, force = false) => {
      const state = useAudioStore.getState();
      const resolvedTranslationId =
        overrides.translationId ?? state.currentTranslationId ?? translationId;
      const resolvedBookId = overrides.bookId ?? state.currentBookId;
      const resolvedChapter = overrides.chapter ?? state.currentChapter;

      if (!resolvedBookId || !resolvedChapter) {
        lastNowPlayingSignatureRef.current = null;
        void clearBibleNowPlaying();
        return;
      }

      const resolvedPositionMs = overrides.positionMs ?? state.currentPosition;
      const resolvedDurationMs = overrides.durationMs ?? state.duration;
      const resolvedIsPlaying = overrides.isPlaying ?? state.status === 'playing';
      const resolvedPlaybackRate = overrides.playbackRate ?? state.playbackRate ?? 1;
      // Look up translation name from bibleStore so runtime (catalog) translations
      // — which are absent from the static constants — still appear on the lock screen.
      const resolvedTranslationName =
        overrides.translationName ??
        useBibleStore.getState().translations.find((t) => t.id === resolvedTranslationId)?.name;

      // Compute skip availability so the lock screen next/previous buttons reflect
      // whether adjacent chapters actually exist. Queue entries take priority over
      // the linear chapter adjacency check.
      const resolvedCanSkipNext =
        overrides.canSkipNext ??
        Boolean(
          state.queue[state.queueIndex + 1] ??
            getAdjacentBibleChapter(resolvedBookId, resolvedChapter, 1)
        );
      const resolvedCanSkipPrevious =
        overrides.canSkipPrevious ??
        Boolean(
          state.queue[state.queueIndex - 1] ??
            getAdjacentBibleChapter(resolvedBookId, resolvedChapter, -1)
        );

      const signature = [
        resolvedTranslationId,
        resolvedBookId,
        resolvedChapter,
        Math.floor(resolvedPositionMs / 1000),
        Math.floor(resolvedDurationMs / 1000),
        resolvedIsPlaying ? '1' : '0',
        resolvedPlaybackRate,
        resolvedCanSkipNext ? '1' : '0',
        resolvedCanSkipPrevious ? '1' : '0',
      ].join('|');

      if (!force && lastNowPlayingSignatureRef.current === signature) {
        return;
      }

      lastNowPlayingSignatureRef.current = signature;
      void syncBibleNowPlaying({
        translationId: resolvedTranslationId,
        translationName: resolvedTranslationName,
        bookId: resolvedBookId,
        chapter: resolvedChapter,
        positionMs: resolvedPositionMs,
        durationMs: resolvedDurationMs,
        isPlaying: resolvedIsPlaying,
        playbackRate: resolvedPlaybackRate,
        canSkipNext: resolvedCanSkipNext,
        canSkipPrevious: resolvedCanSkipPrevious,
      });
    },
    [translationId]
  );

  const stopAudioProgressTelemetryTimer = useCallback(() => {
    if (audioProgressTelemetryTimerRef.current) {
      clearInterval(audioProgressTelemetryTimerRef.current);
      audioProgressTelemetryTimerRef.current = null;
    }
  }, []);

  const resetAudioProgressTelemetryClock = useCallback(() => {
    audioProgressTelemetryLastEmittedAtRef.current = Date.now();
  }, []);

  const emitAudioPlaybackProgress = useCallback(
    (reason: 'tick' | 'pause' | 'stop' | 'chapter-change' | 'finish', force = false) => {
      const state = useAudioStore.getState();
      const bookId = state.currentBookId;
      const chapter = state.currentChapter;
      const durationMs = state.duration;
      if (!bookId || !chapter || durationMs <= 0) {
        return;
      }

      const now = Date.now();
      const lastEmittedAt = audioProgressTelemetryLastEmittedAtRef.current || now;
      const elapsedMs = Math.max(0, now - lastEmittedAt);
      const listenedMs = Math.round(elapsedMs * (state.playbackRate ?? 1));

      if (!force && reason === 'tick' && listenedMs < AUDIO_PROGRESS_TELEMETRY_INTERVAL_MS / 2) {
        return;
      }

      if (!force && listenedMs <= 0) {
        return;
      }

      const resolvedPositionMs = state.currentPosition;
      const progressPercent =
        durationMs > 0 ? Math.min(100, Math.round((resolvedPositionMs / durationMs) * 1000) / 10) : 0;

      trackAnonymousUsageEvent('audio_playback_progress', {
        book_id: bookId,
        chapter,
        duration_ms: durationMs,
        listened_ms: Math.max(0, listenedMs),
        mode: 'listen',
        playback_rate: state.playbackRate ?? 1,
        position_ms: resolvedPositionMs,
        progress_percent: progressPercent,
        reason,
        translation_id: state.currentTranslationId ?? translationId,
      });

      audioProgressTelemetryLastEmittedAtRef.current = now;
    },
    [translationId]
  );

  const startAudioProgressTelemetry = useCallback(() => {
    if (audioProgressTelemetryTimerRef.current) {
      return;
    }

    resetAudioProgressTelemetryClock();
    audioProgressTelemetryTimerRef.current = setInterval(() => {
      emitAudioPlaybackProgress('tick');
    }, AUDIO_PROGRESS_TELEMETRY_INTERVAL_MS);
  }, [emitAudioPlaybackProgress, resetAudioProgressTelemetryClock]);

  const playChapterForTranslation = useCallback(
    async (
      targetTranslationId: string,
      bookId: string,
      chapter: number,
      verse?: number,
      options?: { startPositionMs?: number | null }
    ) => {
      if (!isAudioAvailable(targetTranslationId)) {
        setError('Audio not available for this translation');
        void clearBibleNowPlaying();
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
        const startPositionMs = Math.max(0, Math.round(options?.startPositionMs ?? 0));
        const audioData = await getChapterAudioUrl(targetTranslationId, bookId, chapter, verse);

        if (playRequestId !== playRequestIdRef.current) {
          return;
        }

        if (!audioData) {
          setError('Audio not available for this chapter');
          void clearBibleNowPlaying();
          setStatus('error');
          return;
        }

        await audioPlayer.loadAndPlay(audioData.url, playbackRate);
        if (startPositionMs > 0) {
          await audioPlayer.seekTo(startPositionMs);
          setPosition(startPositionMs);
        }
        setDuration(audioData.duration);
        setStatus('playing');
        useLibraryStore.getState().recordHistory(bookId, chapter, 0);
        syncCurrentNowPlaying(
          {
            translationId: targetTranslationId,
            bookId,
            chapter,
            positionMs: startPositionMs,
            durationMs: audioData.duration,
            isPlaying: true,
            playbackRate,
          },
          true
        );

        // Prefetch next chapters
        prefetchChapterAudio(targetTranslationId, bookId, chapter + 1, 2);
      } catch (err) {
        if (playRequestId !== playRequestIdRef.current) {
          return;
        }

        const message = err instanceof Error ? err.message : 'Failed to play audio';
        setError(message);
        void clearBibleNowPlaying();
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
      setPosition,
      syncQueueToTrackInStore,
      playbackSequence,
      clearPlaybackSequence,
      syncCurrentNowPlaying,
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
      syncCurrentNowPlaying({
        translationId: useAudioStore.getState().currentTranslationId ?? translationId,
        bookId: useAudioStore.getState().currentBookId ?? undefined,
        chapter: useAudioStore.getState().currentChapter ?? undefined,
        positionMs: nextPosition,
        durationMs: nextDuration,
        isPlaying: snapshot.isPlaying,
        playbackRate: useAudioStore.getState().playbackRate ?? 1,
      });

      // Record the real poll anchor for interpolation
      lastPollPositionRef.current = nextPosition;
      lastPollTimeRef.current = Date.now();

      if (snapshot.isPlaying) {
        setStatus('playing');
        startAudioProgressTelemetry();

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
        stopAudioProgressTelemetryTimer();

        if (snapshot.isBuffering) {
          setStatus('loading');
        } else {
          setStatus('paused');
        }
      }
    },
    [
      setPosition,
      setDuration,
      setStatus,
      startAudioProgressTelemetry,
      stopAudioProgressTelemetryTimer,
      syncCurrentNowPlaying,
      translationId,
    ]
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

    emitAudioPlaybackProgress('finish', true);
    stopAudioProgressTelemetryTimer();

    // Fire analytics event for the chapter that just finished
    if (bookId && chapterNum) {
      trackEvent('audio_completed', {
        duration_ms: finishedDuration,
        book: bookId,
        chapter: chapterNum,
        translation_id: finishedTranslationId ?? translationId,
      });
    }

    // Persist the finished listen even when playback ends without a manual pause
    // or a subsequent chapter transition. This keeps plan/listen completion in sync
    // for the last required chapter of the day.
    if (bookId && chapterNum && finishedDuration > 0) {
      useLibraryStore.getState().recordHistory(bookId, chapterNum, 1);
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

    const reachedPlaybackSequenceBoundary =
      bookId && chapterNum
        ? playbackSequence.length > 0 &&
          hasAudioPlaybackSequenceEntry(playbackSequence, bookId, chapterNum)
        : false;
    if (reachedPlaybackSequenceBoundary) {
      void clearBibleNowPlaying();
      clearAudioReturnTarget();
      setStatus('idle');
      return;
    }

    if (!shouldAutoAdvance || !bookId || !chapterNum) {
      void clearBibleNowPlaying();
      clearAudioReturnTarget();
      setStatus('idle');
      return;
    }

    if (!currentBook) {
      void clearBibleNowPlaying();
      clearAudioReturnTarget();
      setStatus('idle');
      return;
    }

    const adjacentChapter = getAdjacentBibleChapter(bookId, chapterNum, 1);
    if (adjacentChapter && playChapterForTranslationRef.current) {
      await playChapterForTranslationRef.current(
        store.currentTranslationId ?? translationId,
        adjacentChapter.bookId,
        adjacentChapter.chapter
      );
    } else {
      void clearBibleNowPlaying();
      clearAudioReturnTarget();
      setStatus('idle');
    }
  }, [
    clearAudioReturnTarget,
    emitAudioPlaybackProgress,
    setStatus,
    stopAudioProgressTelemetryTimer,
    translationId,
  ]);

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
    if (!currentBookId || !currentChapter || status === 'idle' || status === 'error') {
      lastNowPlayingSignatureRef.current = null;
      void clearBibleNowPlaying();
      return;
    }

    syncCurrentNowPlaying();
  }, [
    currentBookId,
    currentChapter,
    currentTranslationId,
    status,
    translationId,
    syncCurrentNowPlaying,
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
    emitAudioPlaybackProgress('pause', true);
    stopAudioProgressTelemetryTimer();
    setStatus('paused');
    if (currentBookId && currentChapter && duration > 0) {
      useLibraryStore.getState().recordHistory(
        currentBookId,
        currentChapter,
        currentPosition / duration
      );
    }
    syncCurrentNowPlaying(
      {
        isPlaying: false,
        positionMs: currentPosition,
        durationMs: duration,
      },
      true
    );
  }, [
    currentBookId,
    currentChapter,
    currentPosition,
    duration,
    emitAudioPlaybackProgress,
    setStatus,
    stopAudioProgressTelemetryTimer,
    syncCurrentNowPlaying,
  ]);

  // Resume playback
  const resume = useCallback(async () => {
    const store = useAudioStore.getState();
    const resumePosition = Math.max(store.currentPosition, store.lastPosition);

    // Reset poll anchor so interpolation starts fresh from the resumed position.
    // If the native player lost its offset during an interruption, re-seek first.
    if (audioPlayer.isLoaded() && resumePosition > 0) {
      await audioPlayer.seekTo(resumePosition);
    }

    lastPollPositionRef.current = resumePosition;
    lastPollTimeRef.current = Date.now();
    await audioPlayer.resume();
    setStatus('playing');
    syncCurrentNowPlaying(
      {
        isPlaying: true,
        positionMs: Math.max(useAudioStore.getState().currentPosition, resumePosition),
        durationMs: useAudioStore.getState().duration,
      },
      true
    );
  }, [setStatus, syncCurrentNowPlaying]);

  // Stop playback completely
  const stop = useCallback(async () => {
    if (interpolationTimerRef.current) {
      clearInterval(interpolationTimerRef.current);
      interpolationTimerRef.current = null;
    }
    emitAudioPlaybackProgress('stop', true);
    stopAudioProgressTelemetryTimer();
    if (currentBookId && currentChapter && duration > 0) {
      useLibraryStore.getState().recordHistory(
        currentBookId,
        currentChapter,
        currentPosition / duration
      );
    }
    await audioPlayer.stop();
    await backgroundMusicPlayer.stop();
    void clearBibleNowPlaying();
    clearAudioReturnTarget();
    resetPlayback();
  }, [
    clearAudioReturnTarget,
    currentBookId,
    currentChapter,
    currentPosition,
    duration,
    emitAudioPlaybackProgress,
    resetPlayback,
    stopAudioProgressTelemetryTimer,
  ]);

  // Toggle play/pause
  const togglePlayPause = useCallback(async () => {
    if (status === 'playing') {
      await pause();
    } else if (
      currentBookId &&
      currentChapter &&
      audioPlayer.isLoaded() &&
      currentPosition > 0 &&
      (duration <= 0 || currentPosition < duration)
    ) {
      await resume();
    } else if (currentBookId && currentChapter) {
      await playChapterForTranslation(
        currentTranslationId ?? translationId,
        currentBookId,
        currentChapter,
        undefined,
        { startPositionMs: lastPosition }
      );
    } else if (lastPlayedBookId && lastPlayedChapter) {
      await playChapterForTranslation(
        lastPlayedTranslationId ?? translationId,
        lastPlayedBookId,
        lastPlayedChapter,
        undefined,
        { startPositionMs: lastPosition }
      );
    }
  }, [
    status,
    currentTranslationId,
    currentBookId,
    currentChapter,
    currentPosition,
    duration,
    lastPosition,
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

    const isPinnedToPlaybackSequence =
      currentBookId && currentChapter
        ? playbackSequence.length > 0 &&
          hasAudioPlaybackSequenceEntry(playbackSequence, currentBookId, currentChapter)
        : false;
    if (isPinnedToPlaybackSequence) {
      return null;
    }

    if (!currentBookId || !currentChapter) return null;
    const adjacentChapter = getAdjacentBibleChapter(currentBookId, currentChapter, -1);
    if (!adjacentChapter) return null;
    await playChapterForTranslation(
      currentTranslationId ?? translationId,
      adjacentChapter.bookId,
      adjacentChapter.chapter
    );
    return adjacentChapter;
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

    const isPinnedToPlaybackSequence =
      currentBookId && currentChapter
        ? playbackSequence.length > 0 &&
          hasAudioPlaybackSequenceEntry(playbackSequence, currentBookId, currentChapter)
        : false;
    if (isPinnedToPlaybackSequence) {
      return null;
    }

    if (!currentBookId || !currentChapter) return null;
    const adjacentChapter = getAdjacentBibleChapter(currentBookId, currentChapter, 1);
    if (!adjacentChapter) return null;

    await playChapterForTranslation(
      currentTranslationId ?? translationId,
      adjacentChapter.bookId,
      adjacentChapter.chapter
    );
    return adjacentChapter;
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
    return subscribeBibleNowPlayingRemoteCommands(async (command) => {
      switch (command.command) {
        case 'play': {
          const store = useAudioStore.getState();

          if (store.status === 'playing') {
            return;
          }

          if (
            store.currentBookId &&
            store.currentChapter &&
            audioPlayer.isLoaded() &&
            store.currentPosition > 0 &&
            (store.duration <= 0 || store.currentPosition < store.duration)
          ) {
            await resume();
            return;
          }

          if (store.currentBookId && store.currentChapter) {
            await playChapterForTranslation(
              store.currentTranslationId ?? translationId,
              store.currentBookId,
              store.currentChapter,
              undefined,
              { startPositionMs: store.lastPosition }
            );
            return;
          }

          if (store.lastPlayedBookId && store.lastPlayedChapter) {
            await playChapterForTranslation(
              store.lastPlayedTranslationId ?? translationId,
              store.lastPlayedBookId,
              store.lastPlayedChapter,
              undefined,
              { startPositionMs: store.lastPosition }
            );
          }
          return;
        }
        case 'pause':
          await pause();
          return;
        case 'stop':
          await stop();
          return;
        case 'seek-forward':
          await skipForward();
          return;
        case 'seek-backward':
          await skipBackward();
          return;
        case 'seek-position':
          if (typeof command.positionSeconds === 'number') {
            await seekTo(command.positionSeconds * 1000);
          }
          return;
        case 'next':
          await nextChapter();
          return;
        case 'previous':
          await previousChapter();
          return;
      }
    });
  }, [
    nextChapter,
    pause,
    playChapterForTranslation,
    previousChapter,
    resume,
    seekTo,
    skipBackward,
    skipForward,
    stop,
    translationId,
  ]);

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
