import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';
import { useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAudioStore } from '../stores/audioStore';
import { audioPlayer, isAudioAvailable } from '../services/audio';
import type { BibleNowPlayingInput } from '../services/audio/audioNowPlayingModel';
import type { TrackPlayerProgressSnapshot } from '../services/audio/audioPlayer';
import { resolvePlaybackStart } from '../services/audio/audioPlaybackStartModel';
import type { PlaybackRate, SleepTimerOption } from '../types';
import {
  chapterTransition,
  clearPlayerNowPlaying,
  emitAudioPlaybackProgress,
  finishChapterAndAdvance,
  followPlaybackWithBackgroundMusic,
  handlePlaybackStatusUpdate,
  isAudioLoaded,
  loadChapterForTranslation,
  navigateToChapter,
  pausePlayback,
  resumePlayback,
  seekPlayback,
  skipPlayback,
  startPlayback,
  stepChapter,
  stopAudioProgressTelemetry,
  stopPlayback,
  stopPositionInterpolation,
  syncPlayerNowPlaying,
  takeOverRemoteCommands,
  useAudioCoverage,
  useAudioPlayerSession,
  useSleepTimerCountdown,
  type PlayChapterOptions,
} from './audioPlayer';

// The pieces of the player live in ./audioPlayer. Native playback callbacks,
// lock-screen commands, the music bed and listening telemetry outlive the reader
// screen, so their shared state is module-level there; this hook wires one mounted
// player to them and to the audio store.

/** How often a loaded chapter that is buffering checks that its sound still exists. */
const STALLED_STREAM_CHECK_INTERVAL_MS = 5000;

export function useAudioPlayer(translationId: string = 'bsb') {
  const { t } = useTranslation();
  const sessionRef = useAudioPlayerSession();

  const {
    status,
    currentTranslationId,
    currentBookId,
    currentChapter,
    error,
    showPlayer,
    queue,
    queueIndex,
    playbackSequence,
    lastPlayedTranslationId,
    lastPlayedBookId,
    lastPlayedChapter,
    playbackRate,
    autoAdvanceChapter,
    repeatMode,
    sleepTimerMinutes,
    sleepTimerEndTime,
    sleepTimerRemainingMs,
    backgroundMusicChoice,
    setError,
    addToQueue: addToQueueInStore,
    removeFromQueue,
    clearQueue,
    setShowPlayer,
    togglePlayer,
    setPlaybackRate,
    setAutoAdvanceChapter,
    setRepeatMode,
    cycleRepeatMode,
    setSleepTimer,
    clearSleepTimer,
    setBackgroundMusicChoice,
  } = useAudioStore(
    useShallow((state) => ({
      status: state.status,
      currentTranslationId: state.currentTranslationId,
      currentBookId: state.currentBookId,
      currentChapter: state.currentChapter,
      error: state.error,
      showPlayer: state.showPlayer,
      queue: state.queue,
      queueIndex: state.queueIndex,
      playbackSequence: state.playbackSequence,
      lastPlayedTranslationId: state.lastPlayedTranslationId,
      lastPlayedBookId: state.lastPlayedBookId,
      lastPlayedChapter: state.lastPlayedChapter,
      playbackRate: state.playbackRate,
      autoAdvanceChapter: state.autoAdvanceChapter,
      repeatMode: state.repeatMode,
      sleepTimerMinutes: state.sleepTimerMinutes,
      sleepTimerEndTime: state.sleepTimerEndTime,
      sleepTimerRemainingMs: state.sleepTimerRemainingMs,
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

  const { peekAudioCoverage, resolveAudioCoverage } = useAudioCoverage(
    currentTranslationId ?? translationId
  );

  const syncCurrentNowPlaying = useCallback(
    (overrides: Partial<BibleNowPlayingInput> = {}, force = false) =>
      syncPlayerNowPlaying(
        { session: sessionRef.current, t, fallbackTranslationId: translationId, peekAudioCoverage },
        overrides,
        force
      ),
    [peekAudioCoverage, sessionRef, t, translationId]
  );

  const playChapterForTranslation = useCallback(
    (
      targetTranslationId: string,
      bookId: string,
      chapter: number,
      verse?: number,
      options?: PlayChapterOptions
    ) =>
      loadChapterForTranslation(
        {
          session: sessionRef.current,
          t,
          fallbackTranslationId: translationId,
          syncNowPlaying: syncCurrentNowPlaying,
          resolveAudioCoverage,
        },
        targetTranslationId,
        bookId,
        chapter,
        verse,
        options
      ),
    [resolveAudioCoverage, sessionRef, syncCurrentNowPlaying, t, translationId]
  );

  const playChapter = useCallback(
    async (bookId: string, chapter: number, verse?: number) => {
      await playChapterForTranslation(translationId, bookId, chapter, verse);
    },
    [playChapterForTranslation, translationId]
  );

  // Handle playback status updates from track-player wrapper
  const handleStatusUpdate = useCallback(
    (snapshot: TrackPlayerProgressSnapshot) =>
      handlePlaybackStatusUpdate(
        {
          session: sessionRef.current,
          fallbackTranslationId: translationId,
          syncNowPlaying: syncCurrentNowPlaying,
        },
        snapshot
      ),
    [sessionRef, syncCurrentNowPlaying, translationId]
  );

  // Handle playback finished - auto-advance to next chapter
  const handlePlaybackFinished = useCallback(
    () =>
      finishChapterAndAdvance({
        session: sessionRef.current,
        fallbackTranslationId: translationId,
        resolveAudioCoverage,
      }),
    [resolveAudioCoverage, sessionRef, translationId]
  );

  const pause = useCallback(
    () =>
      pausePlayback({
        session: sessionRef.current,
        fallbackTranslationId: translationId,
        syncNowPlaying: syncCurrentNowPlaying,
      }),
    [sessionRef, syncCurrentNowPlaying, translationId]
  );
  // Native progress callbacks outlive the reader and enforce the sleep timer with it.
  // Set during render, as the latest action for the sleep-timer expiry in native
  // progress callbacks, which outlive the reader.
  // eslint-disable-next-line react-hooks/refs -- intentional render-time handoff
  sessionRef.current.pause = pause;

  const resume = useCallback(
    () =>
      resumePlayback({
        session: sessionRef.current,
        fallbackTranslationId: translationId,
        syncNowPlaying: syncCurrentNowPlaying,
        playChapterForTranslation,
      }),
    [playChapterForTranslation, sessionRef, syncCurrentNowPlaying, translationId]
  );

  // Stop playback completely
  const stop = useCallback(
    () => stopPlayback({ session: sessionRef.current, fallbackTranslationId: translationId }),
    [sessionRef, translationId]
  );

  // Toggle play/pause
  const togglePlayPause = useCallback(async () => {
    if (status === 'playing') {
      await pause();
      return;
    }
    // Resume offsets are action-time data, not a transport render dependency.
    const { currentPosition, duration, lastPosition } = useAudioStore.getState();
    const start = resolvePlaybackStart(
      {
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
      },
      translationId,
      isAudioLoaded
    );
    await startPlayback(start, resume, playChapterForTranslation);
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

  const seekTo = useCallback(
    (requestedPositionMs: number) => seekPlayback(sessionRef.current, requestedPositionMs),
    [sessionRef]
  );
  const skipBackward = useCallback(() => skipPlayback(sessionRef.current, -10000), [sessionRef]);
  const skipForward = useCallback(() => skipPlayback(sessionRef.current, 10000), [sessionRef]);

  // Change playback rate
  const changePlaybackRate = useCallback(
    async (rate: PlaybackRate) => {
      await audioPlayer.setRate(rate);
      setPlaybackRate(rate);
    },
    [setPlaybackRate]
  );

  const navigateChapterForTranslation = useCallback(
    (targetTranslationId: string, bookId: string, chapter: number, verse?: number) =>
      navigateToChapter(
        sessionRef.current,
        playChapterForTranslation,
        targetTranslationId,
        bookId,
        chapter,
        verse
      ),
    [playChapterForTranslation, sessionRef]
  );

  const stepChapterBy = useCallback(
    (direction: -1 | 1) =>
      stepChapter(
        {
          fallbackTranslationId: translationId,
          resolveAudioCoverage,
          navigateChapterForTranslation,
        },
        direction
      ),
    [navigateChapterForTranslation, resolveAudioCoverage, translationId]
  );
  const previousChapter = useCallback(() => stepChapterBy(-1), [stepChapterBy]);
  const nextChapter = useCallback(() => stepChapterBy(1), [stepChapterBy]);

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
    sessionRef.current.playChapterForTranslation = playChapterForTranslation;
  }, [playChapterForTranslation, sessionRef]);

  // Native callbacks intentionally outlive the reader screen so playback can
  // advance chapters. Only a mounted reader in the foreground needs UI ticks.
  useEffect(() => {
    const session = sessionRef.current;
    session.isMounted = true;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopPositionInterpolation(session);
      // On foreground, wait for the next native snapshot to re-anchor the UI.
    });
    return () => {
      session.isMounted = false;
      subscription.remove();
      stopPositionInterpolation(session);
    };
  }, [sessionRef]);

  // Set up audio player callbacks
  useEffect(() => {
    const session = sessionRef.current;
    audioPlayer.setCallbacks({
      onStatusUpdate: handleStatusUpdate,
      onPlaybackFinished: handlePlaybackFinished,
      onError: () => {
        // Some native commands report through this callback and still resolve.
        // Their callers must not replace this error with a successful status.
        session.playbackErrorId += 1;
        chapterTransition.current = false;
        setError(t('interface.audioPlayFailed'));
      },
    });

    return () => {
      // Clean up interpolation timer when hook unmounts
      stopPositionInterpolation(session);
      // Flush the active segment before callbacks change or the player unmounts.
      emitAudioPlaybackProgress(translationId, 'pause', true);
      stopAudioProgressTelemetry();
    };
  }, [handleStatusUpdate, handlePlaybackFinished, sessionRef, setError, t, translationId]);

  useEffect(() => {
    if (!currentBookId || !currentChapter || status === 'idle' || status === 'error') {
      clearPlayerNowPlaying(sessionRef.current);
      return;
    }

    syncCurrentNowPlaying();
  }, [
    currentBookId,
    currentChapter,
    currentTranslationId,
    sessionRef,
    status,
    translationId,
    syncCurrentNowPlaying,
  ]);

  useEffect(() => {
    followPlaybackWithBackgroundMusic();
  }, []);

  // A loaded chapter that is buffering mid-stream may be waiting on a sound the
  // native side has already released (Android does so silently when the stream
  // fails), which would leave an endless spinner with the controls disabled. Check
  // now and then that the sound still exists; a released one surfaces as an error
  // that Play recovers from. The first load of a chapter is not loaded yet, so it is
  // left to its own load error.
  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setInterval(() => {
      if (audioPlayer.isLoaded()) void audioPlayer.verifyLoaded();
    }, STALLED_STREAM_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [status]);

  const sleepTimerRemaining = useSleepTimerCountdown({
    sleepTimerEndTime,
    sleepTimerRemainingMs,
    status,
    clearSleepTimer,
    pause,
  });

  useEffect(() => {
    // No cleanup: the subscription stays live after unmount and the next run or
    // player replaces it.
    takeOverRemoteCommands({
      playFromRemote: async () => {
        const store = useAudioStore.getState();
        if (store.status === 'playing') {
          return;
        }
        await startPlayback(
          resolvePlaybackStart(store, translationId, isAudioLoaded),
          resume,
          playChapterForTranslation
        );
      },
      pause,
      resume,
      stop,
      skipForward,
      skipBackward,
      seekTo,
      nextChapter,
      previousChapter,
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
    error,
    showPlayer,
    queue,
    queueIndex,
    playbackSequence,
    lastPlayedTranslationId,
    lastPlayedBookId,
    lastPlayedChapter,
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
    navigateChapterForTranslation,

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
