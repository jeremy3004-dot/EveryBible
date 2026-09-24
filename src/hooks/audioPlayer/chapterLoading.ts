import {
  audioPlayer,
  clearBibleNowPlaying,
  getChapterAudioUrl,
  isAudioAvailable,
  prefetchChapterAudio,
} from '../../services/audio';
import { expoAudioFileSystemAdapter } from '../../services/audio/audioDownloadStorage';
import { fetchRemoteChapterAudio } from '../../services/audio/audioRemote';
import { hasSleepTimerExpired } from '../../services/audio/audioSleepTimerModel';
import { reportHandledError } from '../../services/diagnostics/crashReportQueue';
import { useAudioStore } from '../../stores/audioStore';
import { hasAudioPlaybackSequenceEntry } from '../../stores/audioPlaybackSequenceModel';
import { useLibraryStore } from '../../stores/libraryStore';
import { emitAudioPlaybackProgress, stopAudioProgressTelemetry } from './listeningTelemetry';
import type {
  AudioPlayerSession,
  PlayChapterOptions,
  ResolveAudioCoverage,
  SyncNowPlaying,
  Translate,
} from './playerSession';
import { chapterTransition, pausedByListener } from './sharedPlaybackState';

interface HeldTrack {
  translationId: string;
  bookId: string;
  chapter: number;
  positionMs: number;
  durationMs: number;
}

/**
 * With the reader closed, the sleep timer is enforced only from native progress,
 * which a chapter reports once it is already sounding. A timer that has run out by
 * a chapter boundary holds the next chapter back instead: selected and paused at
 * its start, so Play (or the lock screen) carries on from there. Returns whether
 * it held it.
 */
async function holdChapterForExpiredSleepTimer(
  syncNowPlaying: SyncNowPlaying,
  track: HeldTrack
): Promise<boolean> {
  const store = useAudioStore.getState();
  if (!hasSleepTimerExpired(store.sleepTimerEndTime, Date.now())) {
    return false;
  }

  store.clearSleepTimer();
  // As a listener pause: the end of an interruption must not start it.
  pausedByListener.current = true;
  chapterTransition.current = false;
  store.setStatus('paused');
  syncNowPlaying({ ...track, isPlaying: false }, true);
  if (audioPlayer.isLoaded()) {
    await audioPlayer.pause();
  }
  return true;
}

export interface ChapterLoadContext {
  session: AudioPlayerSession;
  t: Translate;
  fallbackTranslationId: string;
  syncNowPlaying: SyncNowPlaying;
  resolveAudioCoverage: ResolveAudioCoverage;
}

/**
 * Loads a chapter in a translation and plays it, from `startPositionMs` if given.
 * A newer command (another chapter, pause, stop) supersedes a load still in
 * flight. A downloaded file that no longer decodes falls back to the remote asset.
 */
export async function loadChapterForTranslation(
  { session, t, fallbackTranslationId, syncNowPlaying, resolveAudioCoverage }: ChapterLoadContext,
  targetTranslationId: string,
  bookId: string,
  chapter: number,
  verse?: number,
  options?: PlayChapterOptions
): Promise<void> {
  const store = useAudioStore.getState();
  if (!isAudioAvailable(targetTranslationId)) {
    store.setError(t('interface.audioUnavailableTranslation'));
    void clearBibleNowPlaying();
    return;
  }

  const playRequestId = ++session.playRequestId;
  pausedByListener.current = false;

  // Read at call time: auto-advance and lock-screen commands reach this after the
  // reader has unmounted, when this render's track and settings are stale.
  const {
    currentBookId: outgoingBookId,
    currentChapter: outgoingChapter,
    currentPosition: positionBeforeSwitch,
    duration: durationBeforeSwitch,
    playbackSequence,
  } = store;
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
      .recordHistory(outgoingBookId, outgoingChapter, positionBeforeSwitch / durationBeforeSwitch);
  }

  emitAudioPlaybackProgress(fallbackTranslationId, 'chapter-change', true);
  stopAudioProgressTelemetry();
  await audioPlayer.stop();
  if (playRequestId !== session.playRequestId) return;
  const startPositionMs = Math.max(0, Math.round(options?.startPositionMs ?? 0));
  store.setStatus('loading');
  // Keep the resume point until the chapter actually plays: a load that fails, or
  // a second Play while it is slow, must resume at the same place, not at 0:00.
  store.setCurrentTrack(targetTranslationId, bookId, chapter, startPositionMs);
  store.syncQueueToTrack(targetTranslationId, bookId, chapter);
  if (
    playbackSequence.length > 0 &&
    !hasAudioPlaybackSequenceEntry(playbackSequence, bookId, chapter)
  ) {
    store.clearPlaybackSequence();
  }

  const heldTrack: HeldTrack = {
    translationId: targetTranslationId,
    bookId,
    chapter,
    positionMs: startPositionMs,
    durationMs: 0,
  };
  if (await holdChapterForExpiredSleepTimer(syncNowPlaying, heldTrack)) return;

  try {
    let audioData = await getChapterAudioUrl(targetTranslationId, bookId, chapter, verse);
    const initialAudioUrl = audioData?.url ?? null;

    if (playRequestId !== session.playRequestId) {
      return;
    }

    if (await holdChapterForExpiredSleepTimer(syncNowPlaying, heldTrack)) return;

    if (!audioData) {
      store.setError(t('interface.audioUnavailableChapter'));
      void clearBibleNowPlaying();
      return;
    }

    try {
      const errorId = session.playbackErrorId;
      await audioPlayer.loadAndPlay(audioData.url, livePlaybackRate(), startPositionMs);
      if (errorId !== session.playbackErrorId) {
        throw new Error('Native playback failed');
      }
    } catch (initialLoadError) {
      if (playRequestId !== session.playRequestId) return;
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
      if (playRequestId !== session.playRequestId) return;

      if (!remoteFallback || remoteFallback.url === audioData.url) {
        throw initialLoadError;
      }

      const fallbackErrorId = session.playbackErrorId;
      await audioPlayer.loadAndPlay(remoteFallback.url, livePlaybackRate(), startPositionMs);
      if (fallbackErrorId !== session.playbackErrorId) {
        throw new Error('Native playback failed');
      }
      if (playRequestId !== session.playRequestId) return;
      audioData = remoteFallback;

      // If a downloaded chapter file can no longer be decoded, remove it so
      // future playback prefers the healthy remote asset instead of looping
      // on the same broken local file forever.
      if (initialAudioUrl && expoAudioFileSystemAdapter.deleteFile) {
        await expoAudioFileSystemAdapter.deleteFile(initialAudioUrl).catch(() => {});
      }
    }

    if (playRequestId !== session.playRequestId) {
      // The native player disposes superseded sounds. Stopping its singleton
      // here would stop whichever newer chapter now owns it.
      return;
    }

    // The sound was created at the resume point, so there is nothing to seek.
    if (startPositionMs > 0) {
      store.setPosition(startPositionMs);
    }
    store.setDuration(audioData.duration);
    // Loading can take long enough for the timer to run out meanwhile.
    if (
      await holdChapterForExpiredSleepTimer(syncNowPlaying, {
        ...heldTrack,
        durationMs: audioData.duration,
      })
    ) {
      return;
    }
    store.setStatus('playing');
    useLibraryStore.getState().recordHistory(bookId, chapter, 0);
    syncNowPlaying(
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
    if (playRequestId !== session.playRequestId) {
      return;
    }

    reportHandledError('audio.load', error);
    store.setError(t('interface.audioPlayFailed'));
    void clearBibleNowPlaying();
  }
}
