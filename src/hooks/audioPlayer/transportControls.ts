import { bibleNarrationOwner, claimNarration } from '../../services/audio/narrationOwnership';
import { captureActivePlaybackPause } from './transportRegistry';
import { audioPlayer, backgroundMusicPlayer, clearBibleNowPlaying } from '../../services/audio';
import type { PlaybackStartAction } from '../../services/audio/audioPlaybackStartModel';
import {
  clampSeekPosition,
  skipTargetPosition,
} from '../../services/audio/audioPlaybackPositionModel';
import { useAudioStore } from '../../stores/audioStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { emitAudioPlaybackProgress, stopAudioProgressTelemetry } from './listeningTelemetry';
import { notePassageManualSeek } from './passageRepeat';
import { anchorPositionInterpolation, stopPositionInterpolation } from './playbackProgress';
import {
  abandonSelahResume,
  completeSelahResume,
  endSelahForPause,
  restoreNarrationVolume,
  silenceNarrationForSelahResume,
  takeSelahResume,
} from './selah';
import type {
  AudioPlayerSession,
  PlayChapterForTranslation,
  SyncNowPlaying,
} from './playerSession';
import { chapterTransition, pausedByListener, seekRequest } from './sharedPlaybackState';

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

export interface PauseOptions {
  /**
   * Selah's own pause: the narration pauses and Selah stays on, so the bed plays on.
   * Any other pause ends Selah and pauses the bed with the narration.
   */
  holdForSelah?: boolean;
  /** A cross-player handoff must fail if the native sound could not be suspended. */
  requireSuspension?: boolean;
}

export async function pausePlayback(
  {
    session,
    fallbackTranslationId,
    syncNowPlaying,
  }: TransportContext & { syncNowPlaying: SyncNowPlaying },
  { holdForSelah = false, requireSuspension = false }: PauseOptions = {}
): Promise<void> {
  const requestId = ++session.playRequestId;
  if (!holdForSelah) endSelahForPause();
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
  await audioPlayer.pause(requireSuspension ? { requireSuspension: true } : undefined);
  if (requireSuspension) await backgroundMusicPlayer.stop();
  // A Selah fade (out into it, or back in from it) ends here: paused, the narration goes
  // back to the Voice level, where the next chapter or resume expects it.
  if (requestId === session.playRequestId) restoreNarrationVolume();
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
  const seekIdAtResume = seekRequest.current;
  const errorId = session.playbackErrorId;
  const narration = claimNarration('bible', bibleNarrationOwner, captureActivePlaybackPause());
  try {
    await narration.ready;
  } catch {
    // The outgoing sound may still be audible. Keep the existing paused chapter
    // ready for an explicit retry instead of starting a second sound.
    return;
  }
  if (requestId !== session.playRequestId || !narration.isCurrent()) return;
  pausedByListener.current = false;
  // Out of Selah the narration picks up a little earlier, so no words are lost, and
  // fades back in. Selah ends here, whichever Play (reader, bar, lock screen) resumed it.
  const selahResume = takeSelahResume();
  const store = useAudioStore.getState();
  // Live resume: the loaded player already holds the true offset, and
  // currentPosition reflects any scrubs made while paused. Using
  // max(currentPosition, lastPosition) here leaks the 5s persistence
  // hysteresis on lastPosition and undoes small backward scrubs. Only fall
  // back to the max-with-lastPosition logic on cold restore, where the
  // player is unloaded and lastPosition is the last durable anchor.
  const isLoaded = audioPlayer.isLoaded();
  const resumePosition = selahResume
    ? selahResume.positionMs
    : isLoaded
      ? store.currentPosition
      : Math.max(store.currentPosition, store.lastPosition);
  const fadesIn = selahResume !== null && isLoaded;
  // Overtaken by a newer command, or the sound has gone: Selah ends here, and the
  // narration must not stay silenced for whatever plays next.
  const standDown = () => {
    if (selahResume) abandonSelahResume(selahResume);
  };

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

  if (fadesIn) await silenceNarrationForSelahResume();
  if (requestId !== session.playRequestId) return standDown();
  if (errorId !== session.playbackErrorId) {
    standDown();
    await reloadIfSoundWasReleased();
    return;
  }
  // Reset poll anchor so interpolation starts fresh from the resumed position.
  // If the native player lost its offset during an interruption, re-seek first.
  if (seekIdAtResume === seekRequest.current && isLoaded && (resumePosition > 0 || selahResume)) {
    await audioPlayer.seekTo(resumePosition);
  }
  if (requestId !== session.playRequestId) return standDown();
  if (errorId !== session.playbackErrorId) {
    standDown();
    await reloadIfSoundWasReleased();
    return;
  }
  // A scrub or skip owns its anchor immediately, even while its native seek is pending.
  // Keep the Play intent, but leave that newer command's position alone.
  if (seekIdAtResume === seekRequest.current) {
    if (selahResume) useAudioStore.getState().setPosition(resumePosition);
    anchorPositionInterpolation(session, resumePosition);
  }
  await audioPlayer.resume();
  if (requestId !== session.playRequestId) return standDown();
  if (errorId !== session.playbackErrorId) {
    standDown();
    await reloadIfSoundWasReleased();
    return;
  }
  useAudioStore.getState().setStatus('playing');
  if (selahResume) completeSelahResume(selahResume, fadesIn);
  syncNowPlaying(
    {
      isPlaying: true,
      positionMs:
        seekIdAtResume === seekRequest.current
          ? Math.max(useAudioStore.getState().currentPosition, resumePosition)
          : useAudioStore.getState().currentPosition,
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
  const requestId = session.playRequestId;
  const seekRequestId = ++seekRequest.current;
  const positionMs = clampSeekPosition(requestedPositionMs, useAudioStore.getState().duration);
  // The listener's own move: a repeated passage does not take it for playback reaching its end.
  notePassageManualSeek();
  // Reset interpolation anchor to the seek target so we don't overshoot
  anchorPositionInterpolation(session, positionMs);
  await audioPlayer.seekTo(positionMs);
  // A newer seek or playback command can take over while its native seek settles.
  // That command owns the store position and durable resume point now.
  if (requestId !== session.playRequestId || seekRequestId !== seekRequest.current) return;
  useAudioStore.getState().setPosition(positionMs);
}

export async function skipPlayback(session: AudioPlayerSession, deltaMs: number): Promise<void> {
  const requestId = session.playRequestId;
  const { currentBookId, currentChapter, currentPosition, duration } = useAudioStore.getState();
  if (!currentBookId || !currentChapter || duration <= 0) {
    return;
  }

  const seekRequestId = ++seekRequest.current;
  const nextPosition = skipTargetPosition(currentPosition, deltaMs, duration);
  notePassageManualSeek();
  // Re-anchor interpolation on the skip target, exactly as a seek does. Without
  // this the next interpolation tick extrapolates from the stale pre-skip poll and
  // the monotonic clamp snaps a backward skip forward again until the native
  // player reports a fresh position.
  anchorPositionInterpolation(session, nextPosition);
  await audioPlayer.seekTo(nextPosition);
  if (requestId !== session.playRequestId || seekRequestId !== seekRequest.current) return;
  useAudioStore.getState().setPosition(nextPosition);
}
