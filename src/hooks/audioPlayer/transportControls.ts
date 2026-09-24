import { audioPlayer, backgroundMusicPlayer, clearBibleNowPlaying } from '../../services/audio';
import type { PlaybackStartAction } from '../../services/audio/audioPlaybackStartModel';
import {
  clampSeekPosition,
  skipTargetPosition,
} from '../../services/audio/audioPlaybackPositionModel';
import { useAudioStore } from '../../stores/audioStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { emitAudioPlaybackProgress, stopAudioProgressTelemetry } from './listeningTelemetry';
import { anchorPositionInterpolation, stopPositionInterpolation } from './playbackProgress';
import type {
  AudioPlayerSession,
  PlayChapterForTranslation,
  SyncNowPlaying,
} from './playerSession';
import { chapterTransition, pausedByListener } from './sharedPlaybackState';

export interface TransportContext {
  session: AudioPlayerSession;
  fallbackTranslationId: string;
}

/** Records how far into the current chapter the listener got. */
function recordCurrentChapterHistory(): void {
  const { currentBookId, currentChapter, currentPosition, duration } = useAudioStore.getState();
  if (currentBookId && currentChapter && duration > 0) {
    useLibraryStore
      .getState()
      .recordHistory(currentBookId, currentChapter, currentPosition / duration);
  }
}

export async function pausePlayback({
  session,
  fallbackTranslationId,
  syncNowPlaying,
}: TransportContext & { syncNowPlaying: SyncNowPlaying }): Promise<void> {
  session.playRequestId += 1;
  pausedByListener.current = true;
  chapterTransition.current = false;
  // Stop interpolation immediately so position freezes at pause point
  stopPositionInterpolation(session);
  emitAudioPlaybackProgress(fallbackTranslationId, 'pause', true);
  stopAudioProgressTelemetry();
  useAudioStore.getState().setStatus('paused');
  const {
    currentBookId: bookAtPause,
    currentChapter: chapterAtPause,
    currentPosition: positionAtPause,
    duration: durationAtPause,
  } = useAudioStore.getState();
  syncNowPlaying(
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
}

export async function resumePlayback({
  session,
  fallbackTranslationId,
  syncNowPlaying,
  playChapterForTranslation,
}: TransportContext & {
  syncNowPlaying: SyncNowPlaying;
  playChapterForTranslation: PlayChapterForTranslation;
}): Promise<void> {
  const requestId = ++session.playRequestId;
  pausedByListener.current = false;
  const errorId = session.playbackErrorId;
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
    if (requestId !== session.playRequestId || !isLoaded || audioPlayer.isLoaded()) return;
    const { currentTranslationId, currentBookId, currentChapter } = useAudioStore.getState();
    if (!currentBookId || !currentChapter) return;
    await playChapterForTranslation(
      currentTranslationId ?? fallbackTranslationId,
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
  if (requestId !== session.playRequestId) return;
  if (errorId !== session.playbackErrorId) {
    await reloadIfSoundWasReleased();
    return;
  }

  anchorPositionInterpolation(session, resumePosition);
  await audioPlayer.resume();
  if (requestId !== session.playRequestId) return;
  if (errorId !== session.playbackErrorId) {
    await reloadIfSoundWasReleased();
    return;
  }
  useAudioStore.getState().setStatus('playing');
  syncNowPlaying(
    {
      isPlaying: true,
      positionMs: Math.max(useAudioStore.getState().currentPosition, resumePosition),
      durationMs: useAudioStore.getState().duration,
    },
    true
  );
}

export async function stopPlayback({
  session,
  fallbackTranslationId,
}: TransportContext): Promise<void> {
  session.playRequestId += 1;
  pausedByListener.current = true;
  const requestId = session.playRequestId;
  chapterTransition.current = false;
  stopPositionInterpolation(session);
  emitAudioPlaybackProgress(fallbackTranslationId, 'stop', true);
  stopAudioProgressTelemetry();
  recordCurrentChapterHistory();
  void clearBibleNowPlaying();
  useAudioStore.getState().clearAudioReturnTarget();
  useAudioStore.getState().resetPlayback();
  await audioPlayer.stop();
  if (requestId !== session.playRequestId) return;
  await backgroundMusicPlayer.stop();
}

/** Carries out what Play resolved to: resume the loaded sound, or load a chapter. */
export async function startPlayback(
  start: PlaybackStartAction | null,
  resume: () => Promise<void>,
  playChapterForTranslation: PlayChapterForTranslation
): Promise<void> {
  if (!start) return;
  if (start.kind === 'resume') {
    await resume();
    return;
  }
  await playChapterForTranslation(start.translationId, start.bookId, start.chapter, undefined, {
    startPositionMs: start.startPositionMs,
  });
}

export async function seekPlayback(
  session: AudioPlayerSession,
  requestedPositionMs: number
): Promise<void> {
  const positionMs = clampSeekPosition(requestedPositionMs, useAudioStore.getState().duration);
  // Reset interpolation anchor to the seek target so we don't overshoot
  anchorPositionInterpolation(session, positionMs);
  await audioPlayer.seekTo(positionMs);
  useAudioStore.getState().setPosition(positionMs);
}

export async function skipPlayback(session: AudioPlayerSession, deltaMs: number): Promise<void> {
  const { currentBookId, currentChapter, currentPosition, duration } = useAudioStore.getState();
  if (!currentBookId || !currentChapter || duration <= 0) {
    return;
  }

  const nextPosition = skipTargetPosition(currentPosition, deltaMs, duration);
  // Re-anchor interpolation on the skip target, exactly as a seek does. Without
  // this the next interpolation tick extrapolates from the stale pre-skip poll and
  // the monotonic clamp snaps a backward skip forward again until the native
  // player reports a fresh position.
  anchorPositionInterpolation(session, nextPosition);
  await audioPlayer.seekTo(nextPosition);
  useAudioStore.getState().setPosition(nextPosition);
}
