import { useTranslation } from 'react-i18next';
import { AppState, Platform } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAudioStore } from '../stores/audioStore';
import { useBibleStore } from '../stores/bibleStore';
import { useLibraryStore } from '../stores/libraryStore';
import { useProgressStore } from '../stores/progressStore';
import {
  audioPlayer,
  backgroundMusicPlayer,
  clearBibleNowPlaying,
  type BibleNowPlayingInput,
  type BibleNowPlayingLocalizedStrings,
  getChapterAudioUrl,
  isAudioAvailable,
  prefetchChapterAudio,
  subscribeBibleNowPlayingRemoteCommands,
  syncBibleNowPlaying,
} from '../services/audio';
import { expoAudioFileSystemAdapter } from '../services/audio/audioDownloadStorage';
import { fetchRemoteChapterAudio } from '../services/audio/audioRemote';
import type { TrackPlayerProgressSnapshot } from '../services/audio/audioPlayer';
import { trackAnonymousUsageEvent } from '../services/analytics';
import { elapsedListeningMs } from '../services/analytics/listeningTime';
import { getAdjacentBibleChapter, getBookById, getTranslatedBookName } from '../constants';
import type {
  AudioPlaybackSequenceEntry,
  AudioStatus,
  BackgroundMusicChoice,
  PlaybackRate,
  SleepTimerOption,
} from '../types';
import { advanceAudioQueue } from '../stores/audioQueueModel';
import { resolveRepeatPlaybackTarget } from '../stores/audioPlaybackCompletionModel';
import {
  findAdjacentAvailableChapter,
  getAudioChaptersForBook,
  isChapterAudioCovered,
  type AudioChapterMap,
} from '../services/bible/contentAvailability';
import {
  peekAudioChapterMap,
  resolveAudioChapterMap,
} from '../services/audio/audioChapterCoverage';
import { useTranslationContentSummary } from './useTranslationContentSummary';
import { reportHandledError } from '../services/diagnostics/crashReportQueue';
import {
  getAdjacentAudioPlaybackSequenceEntry,
  hasAudioPlaybackSequenceEntry,
} from '../stores/audioPlaybackSequenceModel';

/**
 * Whether Play should continue the loaded sound where it stopped. An idle player
 * with a loaded sound has played its chapter to the end (a pause leaves it
 * "paused"), so Play starts that chapter again instead of resuming at its end.
 */
function canResumeLoadedChapter(state: {
  status: AudioStatus;
  currentBookId: string | null;
  currentChapter: number | null;
  currentPosition: number;
  duration: number;
}): boolean {
  return (
    state.status !== 'idle' &&
    Boolean(state.currentBookId && state.currentChapter) &&
    audioPlayer.isLoaded() &&
    state.currentPosition > 0 &&
    (state.duration <= 0 || state.currentPosition < state.duration)
  );
}

// The reader is pushed over the book browser, so going back unmounts this hook while
// the chapter keeps playing. Like the native playback callbacks, the lock-screen,
// notification and headset command subscription outlives the screen and is only
// handed over when another player mounts.
let activeRemoteCommandUnsubscribe: (() => void) | null = null;

// The listening telemetry interval is started from those same native callbacks, so
// a closed reader can start one after it unmounts. A per-player ref would leave that
// interval where the next player can't reach it, and every reopen would add another
// 30-second emitter. One shared holder lets whichever player owns the callbacks
// stop it.
const audioProgressTelemetryTimer: { current: ReturnType<typeof setInterval> | null } = {
  current: null,
};
const audioProgressTelemetryLastEmittedAt = { current: 0 };

// Whether the listener (or the sleep timer) paused playback, as opposed to the system
// (a call, another app's audio, a headphone unplug). Only a system pause may be undone
// when iOS reports that an interruption has ended.
const pausedByListener = { current: false };

/** The chapter after (or before) this one, within a sparse set's exact coverage if known. */
function getAdjacentAudioChapter(
  bookId: string,
  chapter: number,
  direction: -1 | 1,
  coverage: AudioChapterMap | undefined
) {
  return coverage
    ? findAdjacentAvailableChapter(bookId, chapter, direction, coverage)
    : getAdjacentBibleChapter(bookId, chapter, direction);
}

function findLiveTranslation(translationId: string) {
  return useBibleStore.getState().translations.find((candidate) => candidate.id === translationId);
}

/** How often a loaded chapter that is buffering checks that its sound still exists. */
const STALLED_STREAM_CHECK_INTERVAL_MS = 5000;

// A chapter change briefly reports a stopped player between two chapters, and the
// music bed must play through that gap. Shared for the same reason as the timer
// above: the finish handler that starts a transition can belong to a closed reader.
const chapterTransition = { current: false };

// The music bed follows the narration from a store subscription rather than a render
// effect. Lock-screen pause, the sleep timer and the end of playback all change the
// status after the reader has closed, and the bed has to stop with the narration.
let backgroundMusicSubscription: (() => void) | null = null;
let backgroundMusicOffHandled = false;

function syncBackgroundMusicWithPlayback(status: AudioStatus, choice: BackgroundMusicChoice): void {
  if (status === 'playing') {
    // The chapter change, if any, has finished.
    chapterTransition.current = false;
  }

  if (choice === 'off') {
    if (!backgroundMusicOffHandled) {
      backgroundMusicOffHandled = true;
      void backgroundMusicPlayer.stop();
    }
    return;
  }

  // Keep music playing during chapter transitions; pause it with the narration.
  backgroundMusicOffHandled = false;
  const shouldPlay = status === 'playing' || status === 'loading' || chapterTransition.current;
  void backgroundMusicPlayer.sync(choice, shouldPlay);
}

function followPlaybackWithBackgroundMusic(): void {
  // Each mounted player reconciles the bed once, as the render effect used to.
  backgroundMusicOffHandled = false;
  const { status, backgroundMusicChoice } = useAudioStore.getState();
  syncBackgroundMusicWithPlayback(status, backgroundMusicChoice);

  backgroundMusicSubscription ??= useAudioStore.subscribe((state, previous) => {
    if (
      state.status !== previous.status ||
      state.backgroundMusicChoice !== previous.backgroundMusicChoice
    ) {
      syncBackgroundMusicWithPlayback(state.status, state.backgroundMusicChoice);
    }
  });
}

export function useAudioPlayer(translationId: string = 'bsb') {
  const { t } = useTranslation();
  const AUDIO_PROGRESS_TELEMETRY_INTERVAL_MS = 30000;
  const AUDIO_POSITION_INTERPOLATION_INTERVAL_MS = 250;
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playRequestIdRef = useRef(0);
  const playbackErrorIdRef = useRef(0);
  const playChapterForTranslationRef = useRef<
    | ((
        translationId: string,
        bookId: string,
        chapter: number,
        verse?: number,
        options?: { startPositionMs?: number | null }
      ) => Promise<void>)
    | null
  >(null);
  const [sleepTimerNow, setSleepTimerNow] = useState(() => Date.now());

  // Interpolation refs — track the last real poll so we can estimate position
  // between native snapshots using wall-clock time. Cleared on seek/pause/stop.
  const lastPollPositionRef = useRef<number>(0);
  const lastPollTimeRef = useRef<number>(0);
  const isMountedRef = useRef(false);
  const interpolationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastNowPlayingSignatureRef = useRef<string | null>(null);
  // Native progress callbacks outlive the reader, so the sleep timer's expiry also
  // runs from them and needs the latest pause action.
  const pauseRef = useRef<(() => Promise<void>) | null>(null);

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

  // Exact per-chapter audio coverage. Every Language sets describe their audio only
  // through a signed manifest, and it is sparse, so plain chapter adjacency walks into
  // chapters that can never play. Until coverage resolves every walk stays on the
  // canonical 1..N path.
  //
  // Chapter walks read coverage from the coverage service when they happen, for the
  // translation they walk: auto-advance and lock-screen commands run long after the
  // reader closed, for whichever translation is playing by then. What the reader
  // rendered is only a fallback, and only for the translation it was rendered for.
  const renderedAudioTranslationId = currentTranslationId ?? translationId;
  const activeAudioTranslation = useBibleStore((state) =>
    state.translations.find((candidate) => candidate.id === renderedAudioTranslationId)
  );
  const audioChapterMap = useTranslationContentSummary(activeAudioTranslation)?.audioChapters;
  const renderedAudioChapterMapRef = useRef<
    { translationId: string; chapters: AudioChapterMap } | undefined
  >(undefined);
  renderedAudioChapterMapRef.current = audioChapterMap
    ? { translationId: renderedAudioTranslationId, chapters: audioChapterMap }
    : undefined;

  const renderedAudioChapterMap = useCallback((coverageTranslationId: string) => {
    const rendered = renderedAudioChapterMapRef.current;
    return rendered?.translationId === coverageTranslationId ? rendered.chapters : undefined;
  }, []);

  /** Coverage already known for a translation, for callers that cannot wait. */
  const peekAudioCoverage = useCallback(
    (coverageTranslationId: string) =>
      peekAudioChapterMap(findLiveTranslation(coverageTranslationId)) ??
      renderedAudioChapterMap(coverageTranslationId),
    [renderedAudioChapterMap]
  );

  /** Coverage for a translation as of now, resolving it if nothing has yet. */
  const resolveAudioCoverage = useCallback(
    async (coverageTranslationId: string) =>
      (await resolveAudioChapterMap(findLiveTranslation(coverageTranslationId))) ??
      renderedAudioChapterMap(coverageTranslationId),
    [renderedAudioChapterMap]
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
      // the linear chapter adjacency check, and an exact chapter map (Every Language)
      // decides for translations whose audio skips books and chapters.
      const coverage = peekAudioCoverage(resolvedTranslationId);
      const resolvedAdjacentChapter = (direction: -1 | 1) =>
        getAdjacentAudioChapter(resolvedBookId, resolvedChapter, direction, coverage);
      const resolvedCanSkipNext =
        overrides.canSkipNext ??
        Boolean(state.queue[state.queueIndex + 1] ?? resolvedAdjacentChapter(1));
      const resolvedCanSkipPrevious =
        overrides.canSkipPrevious ??
        Boolean(state.queue[state.queueIndex - 1] ?? resolvedAdjacentChapter(-1));
      // Both lock screens title the entry with the book in the interface language.
      const bookName = getTranslatedBookName(resolvedBookId, t);
      // Android builds its media notification from JS, so it also needs the control
      // labels in the interface language. iOS publishes those natively.
      const localized: BibleNowPlayingLocalizedStrings | undefined =
        Platform.OS === 'android'
          ? {
              bookName,
              channelName: t('audio.nowPlaying'),
              play: t('interface.playChapterAudio'),
              pause: t('interface.pauseChapterAudio'),
              previous: t('audio.previousChapter'),
              next: t('audio.nextChapter'),
              skipBackward: t('audio.skipBackward'),
              skipForward: t('audio.skipForward'),
            }
          : undefined;

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
        bookName,
      ].join('|');

      if (!force && lastNowPlayingSignatureRef.current === signature) {
        return;
      }

      lastNowPlayingSignatureRef.current = signature;
      void syncBibleNowPlaying({
        translationId: resolvedTranslationId,
        translationName: resolvedTranslationName,
        bookId: resolvedBookId,
        bookName,
        chapter: resolvedChapter,
        positionMs: resolvedPositionMs,
        durationMs: resolvedDurationMs,
        isPlaying: resolvedIsPlaying,
        playbackRate: resolvedPlaybackRate,
        canSkipNext: resolvedCanSkipNext,
        canSkipPrevious: resolvedCanSkipPrevious,
        ...(localized ? { localized } : {}),
      });
    },
    [peekAudioCoverage, t, translationId]
  );

  const stopAudioProgressTelemetryTimer = useCallback(() => {
    if (audioProgressTelemetryTimer.current) {
      clearInterval(audioProgressTelemetryTimer.current);
      audioProgressTelemetryTimer.current = null;
    }
    audioProgressTelemetryLastEmittedAt.current = 0;
  }, []);

  const resetAudioProgressTelemetryClock = useCallback(() => {
    audioProgressTelemetryLastEmittedAt.current = Date.now();
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
      const listenedMs = elapsedListeningMs(audioProgressTelemetryLastEmittedAt.current, now);

      if (!force && reason === 'tick' && listenedMs < AUDIO_PROGRESS_TELEMETRY_INTERVAL_MS / 2) {
        return;
      }

      if (listenedMs <= 0) {
        return;
      }

      const resolvedPositionMs = state.currentPosition;
      const progressPercent =
        durationMs > 0
          ? Math.min(100, Math.round((resolvedPositionMs / durationMs) * 1000) / 10)
          : 0;

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

      audioProgressTelemetryLastEmittedAt.current = now;
    },
    [translationId]
  );

  const startAudioProgressTelemetry = useCallback(() => {
    if (audioProgressTelemetryTimer.current) {
      return;
    }

    resetAudioProgressTelemetryClock();
    audioProgressTelemetryTimer.current = setInterval(() => {
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
        setError(t('interface.audioUnavailableTranslation'));
        void clearBibleNowPlaying();
        return;
      }

      const playRequestId = ++playRequestIdRef.current;
      pausedByListener.current = false;

      // Read at call time: auto-advance and lock-screen commands reach this after the
      // reader has unmounted, when this render's track and settings are stale.
      const {
        currentBookId: outgoingBookId,
        currentChapter: outgoingChapter,
        currentPosition: positionBeforeSwitch,
        duration: durationBeforeSwitch,
        playbackSequence,
      } = useAudioStore.getState();
      // Read when the sound is created: resolving the chapter and loading it can take
      // seconds, and a speed picked meanwhile belongs to this chapter.
      const livePlaybackRate = () => useAudioStore.getState().playbackRate;

      // Any call that replaces an already-active chapter is a transition — mark
      // it so the background music keeps running during the gap.
      if (outgoingBookId && outgoingChapter) {
        chapterTransition.current = true;
      }

      if (outgoingBookId && outgoingChapter && durationBeforeSwitch > 0) {
        useLibraryStore
          .getState()
          .recordHistory(
            outgoingBookId,
            outgoingChapter,
            positionBeforeSwitch / durationBeforeSwitch
          );
      }

      emitAudioPlaybackProgress('chapter-change', true);
      stopAudioProgressTelemetryTimer();
      await audioPlayer.stop();
      if (playRequestId !== playRequestIdRef.current) return;
      const startPositionMs = Math.max(0, Math.round(options?.startPositionMs ?? 0));
      setStatus('loading');
      // Keep the resume point until the chapter actually plays: a load that fails, or
      // a second Play while it is slow, must resume at the same place, not at 0:00.
      setCurrentTrack(targetTranslationId, bookId, chapter, startPositionMs);
      syncQueueToTrackInStore(targetTranslationId, bookId, chapter);
      if (
        playbackSequence.length > 0 &&
        !hasAudioPlaybackSequenceEntry(playbackSequence, bookId, chapter)
      ) {
        clearPlaybackSequence();
      }

      try {
        let audioData = await getChapterAudioUrl(targetTranslationId, bookId, chapter, verse);
        const initialAudioUrl = audioData?.url ?? null;

        if (playRequestId !== playRequestIdRef.current) {
          return;
        }

        if (!audioData) {
          setError(t('interface.audioUnavailableChapter'));
          void clearBibleNowPlaying();
          return;
        }

        try {
          const errorId = playbackErrorIdRef.current;
          await audioPlayer.loadAndPlay(audioData.url, livePlaybackRate(), startPositionMs);
          if (errorId !== playbackErrorIdRef.current) {
            throw new Error('Native playback failed');
          }
        } catch (initialLoadError) {
          if (playRequestId !== playRequestIdRef.current) return;
          const shouldRetryWithRemoteFallback = audioData.url.startsWith('file://');
          if (!shouldRetryWithRemoteFallback) {
            throw initialLoadError;
          }

          const remoteFallback = await fetchRemoteChapterAudio(
            targetTranslationId,
            bookId,
            chapter,
            verse
          );
          if (playRequestId !== playRequestIdRef.current) return;

          if (!remoteFallback || remoteFallback.url === audioData.url) {
            throw initialLoadError;
          }

          const fallbackErrorId = playbackErrorIdRef.current;
          await audioPlayer.loadAndPlay(remoteFallback.url, livePlaybackRate(), startPositionMs);
          if (fallbackErrorId !== playbackErrorIdRef.current) {
            throw new Error('Native playback failed');
          }
          if (playRequestId !== playRequestIdRef.current) return;
          audioData = remoteFallback;

          // If a downloaded chapter file can no longer be decoded, remove it so
          // future playback prefers the healthy remote asset instead of looping
          // on the same broken local file forever.
          if (initialAudioUrl && expoAudioFileSystemAdapter.deleteFile) {
            await expoAudioFileSystemAdapter.deleteFile(initialAudioUrl).catch(() => {});
          }
        }

        if (playRequestId !== playRequestIdRef.current) {
          // The native player disposes superseded sounds. Stopping its singleton
          // here would stop whichever newer chapter now owns it.
          return;
        }

        // The sound was created at the resume point, so there is nothing to seek.
        if (startPositionMs > 0) {
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
            playbackRate: livePlaybackRate(),
          },
          true
        );

        // Prefetch next chapters
        prefetchChapterAudio(targetTranslationId, bookId, chapter + 1, 2);
        // Warm this translation's coverage (the manifest that resolved this chapter is
        // cached), so the lock-screen skip buttons know it without the reader open.
        void resolveAudioCoverage(targetTranslationId);
      } catch (error) {
        if (playRequestId !== playRequestIdRef.current) {
          return;
        }

        reportHandledError('audio.load', error);
        const message = t('interface.audioPlayFailed');
        setError(message);
        void clearBibleNowPlaying();
      }
    },
    [
      emitAudioPlaybackProgress,
      stopAudioProgressTelemetryTimer,
      setStatus,
      setCurrentTrack,
      setError,
      setDuration,
      setPosition,
      syncQueueToTrackInStore,
      clearPlaybackSequence,
      syncCurrentNowPlaying,
      resolveAudioCoverage,
      t,
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

  // Native callbacks intentionally outlive the reader screen so playback can
  // advance chapters. Only a mounted reader in the foreground needs UI ticks.
  useEffect(() => {
    isMountedRef.current = true;
    const stopInterpolation = () => {
      if (interpolationTimerRef.current) {
        clearInterval(interpolationTimerRef.current);
        interpolationTimerRef.current = null;
      }
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopInterpolation();
      // On foreground, wait for the next native snapshot to re-anchor the UI.
    });
    return () => {
      isMountedRef.current = false;
      subscription.remove();
      stopInterpolation();
    };
  }, []);

  // Handle playback status updates from track-player wrapper
  const handleStatusUpdate = useCallback(
    (snapshot: TrackPlayerProgressSnapshot) => {
      const currentPosition = useAudioStore.getState().currentPosition;
      const currentDuration = useAudioStore.getState().duration;
      // The monotonic clamp exists to suppress stop-like snapshots (position
      // collapsing toward 0) that a background-music teardown can surface —
      // those must never drag the Bible progress bar backward. But a genuine
      // playing progress event from the Bible sound is the authoritative
      // position and must be allowed to correct interpolation overshoot
      // downward. Treat a non-zero, still-playing snapshot as authoritative;
      // otherwise keep the position monotonic.
      const isAuthoritativeProgress = snapshot.isPlaying && snapshot.positionMillis > 0;
      const nextPosition = isAuthoritativeProgress
        ? snapshot.positionMillis
        : Math.max(currentPosition, snapshot.positionMillis);
      const nextDuration =
        snapshot.durationMillis > 0
          ? Math.max(currentDuration, snapshot.durationMillis)
          : currentDuration;

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
        // The sleep-timer interval below only runs while the reader is mounted.
        // Native progress keeps arriving about once a second while audio plays,
        // mounted or not, so it also enforces the expiry.
        const { sleepTimerEndTime: sleepEndTime } = useAudioStore.getState();
        if (sleepEndTime && Date.now() >= sleepEndTime && pauseRef.current) {
          useAudioStore.getState().clearSleepTimer();
          void pauseRef.current();
          return;
        }

        setStatus('playing');
        startAudioProgressTelemetry();

        // Keep interpolation lightweight on Android. This updates the visible
        // progress often enough for controls without turning playback into a
        // high-frequency persisted-store write loop.
        if (
          isMountedRef.current &&
          AppState.currentState === 'active' &&
          !interpolationTimerRef.current
        ) {
          interpolationTimerRef.current = setInterval(() => {
            const playbackRate = useAudioStore.getState().playbackRate ?? 1.0;
            // Bound the elapsed used for interpolation to one interval. Without
            // this cap, a delayed or stalled native poll lets the interpolated
            // value race arbitrarily far past the true position, and the
            // monotonic clamp would then keep that overshoot forever. Capping to
            // one interval keeps interpolation at most ~one tick ahead of the
            // last real poll, so the next real snapshot can correct it.
            const elapsed = Math.min(
              Date.now() - lastPollTimeRef.current,
              AUDIO_POSITION_INTERPOLATION_INTERVAL_MS
            );
            const interpolated = lastPollPositionRef.current + elapsed * playbackRate;
            const currentPosition = useAudioStore.getState().currentPosition;
            const currentDuration = useAudioStore.getState().duration;
            const cappedInterpolated =
              currentDuration > 0 ? Math.min(interpolated, currentDuration) : interpolated;
            useAudioStore.getState().setPosition(Math.max(currentPosition, cappedInterpolated));
          }, AUDIO_POSITION_INTERPOLATION_INTERVAL_MS);
        }
      } else {
        // Not playing — stop interpolation and clear the timer
        if (interpolationTimerRef.current) {
          clearInterval(interpolationTimerRef.current);
          interpolationTimerRef.current = null;
        }
        // The stopped snapshot of a finished chapter arrives before the finish
        // handler, so it closes out the last segment as a finish.
        emitAudioPlaybackProgress(snapshot.didJustFinish ? 'finish' : 'pause', true);
        stopAudioProgressTelemetryTimer();

        // A finished chapter's status is the finish handler's call (the next
        // chapter, or idle). Reporting "paused" for the instant in between would
        // dip the music bed at every chapter boundary.
        if (snapshot.didJustFinish) {
          return;
        }
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
      emitAudioPlaybackProgress,
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

    // Fire analytics event for the chapter that just finished. Routed through
    // the unified anonymous-usage pipeline (P1 S3) so it lands for signed-out
    // listeners too and picks up server-side geo enrichment.
    if (bookId && chapterNum) {
      trackAnonymousUsageEvent('audio_completed', {
        duration_ms: finishedDuration,
        book: bookId,
        chapter: chapterNum,
        translation_id: finishedTranslationId ?? translationId,
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
      useProgressStore.getState().markChapterListened(bookId, chapterNum, finishedDuration);
    }

    // A plan or rhythm owns playback until its last chapter finishes.
    // Global repeat and queue preferences must not escape that session.
    const nextSequenceEntry =
      bookId && chapterNum
        ? getAdjacentAudioPlaybackSequenceEntry(playbackSequence, bookId, chapterNum, 1)
        : null;
    if (nextSequenceEntry && playChapterForTranslationRef.current) {
      chapterTransition.current = true;
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

    // Coverage is read from here on, per translation and at the moment of advancing.
    // Resolving it can wait on the manifest, and the listener may pause, stop or pick
    // another chapter meanwhile; any of those owns playback from then on.
    // (The status is no guide: the native player can still report the finished sound
    // as paused after it ends. A listener pause or stop is flagged on pausedByListener.)
    const requestIdAtFinish = playRequestIdRef.current;
    const pausedByListenerAtFinish = pausedByListener.current;
    const listenerTookOver = () => {
      const live = useAudioStore.getState();
      return (
        playRequestIdRef.current !== requestIdAtFinish ||
        (pausedByListener.current && !pausedByListenerAtFinish) ||
        live.currentTranslationId !== finishedTranslationId ||
        live.currentBookId !== bookId ||
        live.currentChapter !== chapterNum
      );
    };
    const finishedCoverageTranslationId = finishedTranslationId ?? translationId;

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
    if (repeatTarget && playChapterForTranslationRef.current) {
      chapterTransition.current = true;
      await playChapterForTranslationRef.current(
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
      if (!playChapterForTranslationRef.current) break;

      chapterTransition.current = true;
      setQueueIndex(nextQueuedEntry.queueIndex);
      await playChapterForTranslationRef.current(entry.translationId, entry.bookId, entry.chapter);
      return;
    }

    if (!shouldAutoAdvance || !bookId || !chapterNum || !currentBook) {
      void clearBibleNowPlaying();
      clearAudioReturnTarget();
      setStatus('idle');
      return;
    }

    const coverage = await resolveAudioCoverage(finishedCoverageTranslationId);
    if (listenerTookOver()) return;
    const adjacentChapter = getAdjacentAudioChapter(bookId, chapterNum, 1, coverage);
    if (adjacentChapter && playChapterForTranslationRef.current) {
      chapterTransition.current = true;
      await playChapterForTranslationRef.current(
        finishedCoverageTranslationId,
        adjacentChapter.bookId,
        adjacentChapter.chapter
      );
    } else {
      // Nothing further has audio: end playback exactly as the end of the Bible does.
      void clearBibleNowPlaying();
      clearAudioReturnTarget();
      setStatus('idle');
    }
  }, [
    clearAudioReturnTarget,
    emitAudioPlaybackProgress,
    resolveAudioCoverage,
    setStatus,
    stopAudioProgressTelemetryTimer,
    translationId,
  ]);

  // Set up audio player callbacks
  useEffect(() => {
    audioPlayer.setCallbacks({
      onStatusUpdate: handleStatusUpdate,
      onPlaybackFinished: handlePlaybackFinished,
      onError: () => {
        // Some native commands report through this callback and still resolve.
        // Their callers must not replace this error with a successful status.
        playbackErrorIdRef.current += 1;
        chapterTransition.current = false;
        setError(t('interface.audioPlayFailed'));
      },
    });

    return () => {
      // Clean up interpolation timer when hook unmounts
      if (interpolationTimerRef.current) {
        clearInterval(interpolationTimerRef.current);
        interpolationTimerRef.current = null;
      }
      // Flush the active segment before callbacks change or the player unmounts.
      emitAudioPlaybackProgress('pause', true);
      stopAudioProgressTelemetryTimer();
    };
  }, [
    handleStatusUpdate,
    handlePlaybackFinished,
    setError,
    stopAudioProgressTelemetryTimer,
    emitAudioPlaybackProgress,
    t,
  ]);

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

  const sleepTimerRemaining = useMemo(() => {
    // A paused timer is frozen in the store, so the countdown shown matches
    // what is left once playback resumes.
    const remainingMs = sleepTimerEndTime
      ? sleepTimerEndTime - sleepTimerNow
      : sleepTimerRemainingMs;
    if (remainingMs === null) {
      return null;
    }

    return Math.max(0, Math.ceil(remainingMs / 1000 / 60));
  }, [sleepTimerEndTime, sleepTimerNow, sleepTimerRemainingMs]);

  // Pause playback
  const pause = useCallback(async () => {
    playRequestIdRef.current += 1;
    pausedByListener.current = true;
    chapterTransition.current = false;
    // Stop interpolation immediately so position freezes at pause point
    if (interpolationTimerRef.current) {
      clearInterval(interpolationTimerRef.current);
      interpolationTimerRef.current = null;
    }
    emitAudioPlaybackProgress('pause', true);
    stopAudioProgressTelemetryTimer();
    setStatus('paused');
    const {
      currentBookId: bookAtPause,
      currentChapter: chapterAtPause,
      currentPosition: positionAtPause,
      duration: durationAtPause,
    } = useAudioStore.getState();
    syncCurrentNowPlaying(
      {
        isPlaying: false,
        positionMs: positionAtPause,
        durationMs: durationAtPause,
      },
      true
    );
    await audioPlayer.pause();
    if (bookAtPause && chapterAtPause && durationAtPause > 0) {
      useLibraryStore
        .getState()
        .recordHistory(bookAtPause, chapterAtPause, positionAtPause / durationAtPause);
    }
  }, [
    emitAudioPlaybackProgress,
    setStatus,
    stopAudioProgressTelemetryTimer,
    syncCurrentNowPlaying,
  ]);

  pauseRef.current = pause;

  // Sleep timer check and remaining time calculation
  useEffect(() => {
    // Always clear any stale interval from a prior render before potentially
    // starting a new one, so only one interval is ever active at a time.
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }

    if (sleepTimerEndTime && (status === 'playing' || status === 'loading')) {
      // The end time moves on every resume; re-anchor the countdown now rather
      // than showing the stale pre-pause clock for up to a second.
      setSleepTimerNow(Date.now());
      sleepTimerRef.current = setInterval(() => {
        const now = Date.now();
        setSleepTimerNow(now);
        // Read the live end time: a pause freezes the timer in the store before
        // this effect re-runs, and a frozen timer must not expire.
        const liveEndTime = useAudioStore.getState().sleepTimerEndTime;

        if (liveEndTime !== null && now >= liveEndTime) {
          // Expire once and use the same cancellation/status path as Pause.
          if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
          sleepTimerRef.current = null;
          clearSleepTimer();
          void pause();
        }
      }, 1000);
    }

    return () => {
      if (sleepTimerRef.current) {
        clearInterval(sleepTimerRef.current);
        sleepTimerRef.current = null;
      }
    };
  }, [sleepTimerEndTime, status, clearSleepTimer, pause]);

  // Resume playback
  const resume = useCallback(async () => {
    const requestId = ++playRequestIdRef.current;
    pausedByListener.current = false;
    const errorId = playbackErrorIdRef.current;
    const store = useAudioStore.getState();
    // Live resume: the loaded player already holds the true offset, and
    // currentPosition reflects any scrubs made while paused. Using
    // max(currentPosition, lastPosition) here leaks the 5s persistence
    // hysteresis on lastPosition and undoes small backward scrubs. Only fall
    // back to the max-with-lastPosition logic on cold restore, where the
    // player is unloaded and lastPosition is the last durable anchor.
    const isLoaded = audioPlayer.isLoaded();
    const resumePosition = isLoaded
      ? store.currentPosition
      : Math.max(store.currentPosition, store.lastPosition);

    // A stream that failed mid-chapter leaves a sound the native side has released.
    // Android only says so when the next command fails, so load the chapter again at
    // the same spot rather than reporting an error for a sound that no longer exists.
    const reloadIfSoundWasReleased = async () => {
      if (requestId !== playRequestIdRef.current || !isLoaded || audioPlayer.isLoaded()) return;
      const { currentTranslationId, currentBookId, currentChapter } = useAudioStore.getState();
      if (!currentBookId || !currentChapter) return;
      await playChapterForTranslation(
        currentTranslationId ?? translationId,
        currentBookId,
        currentChapter,
        undefined,
        { startPositionMs: resumePosition }
      );
    };

    // Reset poll anchor so interpolation starts fresh from the resumed position.
    // If the native player lost its offset during an interruption, re-seek first.
    if (isLoaded && resumePosition > 0) {
      await audioPlayer.seekTo(resumePosition);
    }
    if (requestId !== playRequestIdRef.current) return;
    if (errorId !== playbackErrorIdRef.current) {
      await reloadIfSoundWasReleased();
      return;
    }

    lastPollPositionRef.current = resumePosition;
    lastPollTimeRef.current = Date.now();
    await audioPlayer.resume();
    if (requestId !== playRequestIdRef.current) return;
    if (errorId !== playbackErrorIdRef.current) {
      await reloadIfSoundWasReleased();
      return;
    }
    setStatus('playing');
    syncCurrentNowPlaying(
      {
        isPlaying: true,
        positionMs: Math.max(useAudioStore.getState().currentPosition, resumePosition),
        durationMs: useAudioStore.getState().duration,
      },
      true
    );
  }, [playChapterForTranslation, setStatus, syncCurrentNowPlaying, translationId]);

  // Stop playback completely
  const stop = useCallback(async () => {
    playRequestIdRef.current += 1;
    pausedByListener.current = true;
    const requestId = playRequestIdRef.current;
    chapterTransition.current = false;
    if (interpolationTimerRef.current) {
      clearInterval(interpolationTimerRef.current);
      interpolationTimerRef.current = null;
    }
    emitAudioPlaybackProgress('stop', true);
    stopAudioProgressTelemetryTimer();
    const {
      currentBookId: bookAtStop,
      currentChapter: chapterAtStop,
      currentPosition: positionAtStop,
      duration: durationAtStop,
    } = useAudioStore.getState();
    if (bookAtStop && chapterAtStop && durationAtStop > 0) {
      useLibraryStore
        .getState()
        .recordHistory(bookAtStop, chapterAtStop, positionAtStop / durationAtStop);
    }
    void clearBibleNowPlaying();
    clearAudioReturnTarget();
    resetPlayback();
    await audioPlayer.stop();
    if (requestId !== playRequestIdRef.current) return;
    await backgroundMusicPlayer.stop();
  }, [
    clearAudioReturnTarget,
    emitAudioPlaybackProgress,
    resetPlayback,
    stopAudioProgressTelemetryTimer,
  ]);

  // Toggle play/pause
  const togglePlayPause = useCallback(async () => {
    // Resume offsets are action-time data, not a transport render dependency.
    const { currentPosition, duration, lastPosition } = useAudioStore.getState();
    if (status === 'playing') {
      await pause();
    } else if (
      canResumeLoadedChapter({ status, currentBookId, currentChapter, currentPosition, duration })
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
    async (requestedPositionMs: number) => {
      // Lock-screen and notification scrubbers can report a position past the end.
      // Kept unclamped, it became the visible position and the durable resume point.
      const { duration } = useAudioStore.getState();
      const positionMs = Math.max(
        0,
        duration > 0 ? Math.min(requestedPositionMs, duration) : requestedPositionMs
      );
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
      const { currentBookId, currentChapter, currentPosition, duration } = useAudioStore.getState();
      if (!currentBookId || !currentChapter || duration <= 0) {
        return;
      }

      const nextPosition = Math.max(0, Math.min(duration, currentPosition + deltaMs));
      // Re-anchor interpolation on the skip target, exactly as seekTo does.
      // Without this the next interpolation tick extrapolates from the stale
      // pre-skip poll and the monotonic clamp snaps a backward skip forward
      // again until the native player reports a fresh position.
      lastPollPositionRef.current = nextPosition;
      lastPollTimeRef.current = Date.now();
      await audioPlayer.seekTo(nextPosition);
      setPosition(nextPosition);
    },
    [setPosition]
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

  // Manual chapter navigation, and switching the translation of the loaded
  // chapter, keep the user's current playback intent. A paused target is
  // selected unloaded, so it cannot briefly start sounding.
  const navigateChapterForTranslation = useCallback(
    async (targetTranslationId: string, bookId: string, chapter: number, verse?: number) => {
      const statusAtNavigation = useAudioStore.getState().status;
      if (statusAtNavigation === 'playing' || statusAtNavigation === 'loading') {
        await playChapterForTranslation(targetTranslationId, bookId, chapter, verse);
        return;
      }

      const requestId = ++playRequestIdRef.current;
      chapterTransition.current = false;
      if (interpolationTimerRef.current) {
        clearInterval(interpolationTimerRef.current);
        interpolationTimerRef.current = null;
      }
      stopAudioProgressTelemetryTimer();
      await audioPlayer.stop();
      if (requestId !== playRequestIdRef.current) {
        return;
      }
      setCurrentTrack(targetTranslationId, bookId, chapter);
      syncQueueToTrackInStore(targetTranslationId, bookId, chapter);
      const { playbackSequence } = useAudioStore.getState();
      if (
        playbackSequence.length > 0 &&
        !hasAudioPlaybackSequenceEntry(playbackSequence, bookId, chapter)
      ) {
        clearPlaybackSequence();
      }
      setStatus(statusAtNavigation === 'paused' ? 'paused' : 'idle');
      void clearBibleNowPlaying();
    },
    [
      clearPlaybackSequence,
      playChapterForTranslation,
      setCurrentTrack,
      setStatus,
      stopAudioProgressTelemetryTimer,
      syncQueueToTrackInStore,
    ]
  );

  // Steps the player one chapter back or forward: the queue first, then a pinned
  // plan or rhythm session, then plain (or sparse-set) chapter adjacency. State is
  // read at call time because lock-screen commands arrive after the reader unmounts,
  // when this render's track may be several auto-advanced chapters behind.
  const stepChapter = useCallback(
    async (direction: -1 | 1): Promise<AudioPlaybackSequenceEntry | null> => {
      const {
        queue: liveQueue,
        queueIndex: liveQueueIndex,
        playbackSequence: liveSequence,
        currentTranslationId: liveTranslationId,
        currentBookId: liveBookId,
        currentChapter: liveChapter,
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
      const targetTranslationId = liveTranslationId ?? translationId;

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
        liveSequence.length > 0 &&
        hasAudioPlaybackSequenceEntry(liveSequence, liveBookId, liveChapter);
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
    },
    [navigateChapterForTranslation, resolveAudioCoverage, setQueueIndex, translationId]
  );

  const previousChapter = useCallback(() => stepChapter(-1), [stepChapter]);
  const nextChapter = useCallback(() => stepChapter(1), [stepChapter]);

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
    activeRemoteCommandUnsubscribe?.();
    const playFromRemote = async () => {
      const store = useAudioStore.getState();

      if (store.status === 'playing') {
        return;
      }

      if (canResumeLoadedChapter(store)) {
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
    };

    activeRemoteCommandUnsubscribe = subscribeBibleNowPlayingRemoteCommands(async (command) => {
      switch (command.command) {
        case 'play':
          await playFromRemote();
          return;
        case 'toggle': {
          // A chapter still loading is on its way to playing, so the button pauses it.
          const { status: statusAtToggle } = useAudioStore.getState();
          if (statusAtToggle === 'playing' || statusAtToggle === 'loading') {
            await pause();
          } else {
            await playFromRemote();
          }
          return;
        }
        case 'interruption-ended': {
          // Resume only a chapter the interruption paused. One the listener or the
          // sleep timer paused before the call stays paused, and a finished one is
          // not started again.
          const store = useAudioStore.getState();
          if (
            !pausedByListener.current &&
            store.status === 'paused' &&
            canResumeLoadedChapter(store)
          ) {
            await resume();
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
    // No cleanup: the subscription stays live after unmount (see
    // activeRemoteCommandUnsubscribe) and the next run or player replaces it.
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
