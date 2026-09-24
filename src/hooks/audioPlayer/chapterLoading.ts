import {
  audioPlayer,
  clearBibleNowPlaying,
  getChapterAudioUrl,
  isAudioAvailable,
  prefetchChapterAudio,
} from '../../services/audio';
import { expoAudioFileSystemAdapter } from '../../services/audio/audioDownloadStorage';
import { fetchRemoteChapterAudio } from '../../services/audio/audioRemote';
import {
  AudioLoadTimeoutError,
  shouldRetryAudioLoad,
} from '../../services/audio/audioLoadRetryModel';
import { hasSleepTimerExpired } from '../../services/audio/audioSleepTimerModel';
import { reportHandledError } from '../../services/diagnostics/crashReportQueue';
import { useAudioStore } from '../../stores/audioStore';
import { hasAudioPlaybackSequenceEntry } from '../../stores/audioPlaybackSequenceModel';
import { useLibraryStore } from '../../stores/libraryStore';
import type { PlaybackRate } from '../../types';
import { emitAudioPlaybackProgress, stopAudioProgressTelemetry } from './listeningTelemetry';
import type {
  AudioPlayerSession,
  PlayChapterOptions,
  ResolveAudioCoverage,
  SyncNowPlaying,
  Translate,
} from './playerSession';
import { chapterTransition, pausedByListener } from './sharedPlaybackState';

/**
 * The most one attempt at loading a chapter may take before it is abandoned. Cold
 * chapters on the media CDN took 4-11 s to first byte on device, and the player makes
 * several requests before it can start, so this is generous. It bounds a load that
 * never settles; a native timeout that fires sooner is retried the same way.
 */
export const CHAPTER_AUDIO_LOAD_TIMEOUT_MS = 30_000;

const isDownloadedAudioUrl = (url: string) => url.startsWith('file://');

/**
 * One attempt at loading and starting `url`, abandoned after
 * CHAPTER_AUDIO_LOAD_TIMEOUT_MS. The native player also reports some failures through
 * its error callback while the load itself resolves; those fail the attempt too.
 */
async function loadChapterAudioOnce(
  session: AudioPlayerSession,
  playRequestId: number,
  url: string,
  playbackRate: () => PlaybackRate,
  startPositionMs: number
): Promise<void> {
  const errorId = session.playbackErrorId;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const load = audioPlayer.loadAndPlay(url, playbackRate(), startPositionMs);
  try {
    await Promise.race([
      load,
      new Promise<never>((_, reject) => {
        deadline = setTimeout(
          () => reject(new AudioLoadTimeoutError(CHAPTER_AUDIO_LOAD_TIMEOUT_MS)),
          CHAPTER_AUDIO_LOAD_TIMEOUT_MS
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof AudioLoadTimeoutError) {
      // Whatever the abandoned load does later is of no interest.
      load.catch(() => {});
      // Unload it, or a stream that turns up after the listener was told it failed
      // would start playing. A newer command already owns the player.
      if (playRequestId === session.playRequestId) await audioPlayer.stop();
    }
    throw error;
  } finally {
    clearTimeout(deadline);
  }
  if (errorId !== session.playbackErrorId) {
    throw new Error(session.lastPlaybackError ?? 'Native playback failed');
  }
}

/**
 * Loads and starts a chapter, trying a stream once more when the first attempt timed
 * out or lost the connection: a cold chapter's first request can time out while the
 * CDN edge fetches it, and the second is served warm. The chapter stays "loading"
 * throughout; only the second failure is the caller's to surface.
 */
async function loadChapterAudio(
  session: AudioPlayerSession,
  playRequestId: number,
  url: string,
  playbackRate: () => PlaybackRate,
  startPositionMs: number
): Promise<void> {
  try {
    await loadChapterAudioOnce(session, playRequestId, url, playbackRate, startPositionMs);
  } catch (error) {
    if (
      playRequestId !== session.playRequestId ||
      isDownloadedAudioUrl(url) ||
      !shouldRetryAudioLoad(error)
    ) {
      throw error;
    }
    useAudioStore.getState().setStatus('loading');
    await loadChapterAudioOnce(session, playRequestId, url, playbackRate, startPositionMs);
  }
}

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

    session.loadingPlayRequestId = playRequestId;
    try {
      await loadChapterAudio(
        session,
        playRequestId,
        audioData.url,
        livePlaybackRate,
        startPositionMs
      );
    } catch (initialLoadError) {
      if (playRequestId !== session.playRequestId) return;
      const shouldRetryWithRemoteFallback = isDownloadedAudioUrl(audioData.url);
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

      await loadChapterAudio(
        session,
        playRequestId,
        remoteFallback.url,
        livePlaybackRate,
        startPositionMs
      );
      if (playRequestId !== session.playRequestId) return;
      audioData = remoteFallback;

      // If a downloaded chapter file can no longer be decoded, remove it so
      // future playback prefers the healthy remote asset instead of looping
      // on the same broken local file forever.
      if (initialAudioUrl && expoAudioFileSystemAdapter.deleteFile) {
        await expoAudioFileSystemAdapter.deleteFile(initialAudioUrl).catch(() => {});
      }
    } finally {
      if (session.loadingPlayRequestId === playRequestId) session.loadingPlayRequestId = null;
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

    // A chapter that ran out of time even after its retry is a failure worth hearing
    // about; being offline is not.
    reportHandledError('audio.load', error, { reportTimeouts: true });
    chapterTransition.current = false;
    store.setError(t('interface.audioPlayFailed'));
    void clearBibleNowPlaying();
  }
}
