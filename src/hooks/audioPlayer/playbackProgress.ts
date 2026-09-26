import { AppState } from 'react-native';
import type { TrackPlayerProgressSnapshot } from '../../services/audio/audioPlayer';
import {
  interpolatePlaybackPosition,
  resolveSnapshotProgress,
} from '../../services/audio/audioPlaybackPositionModel';
import { hasSleepTimerExpired } from '../../services/audio/audioSleepTimerModel';
import { useAudioStore } from '../../stores/audioStore';
import {
  emitAudioPlaybackProgress,
  startAudioProgressTelemetry,
  stopAudioProgressTelemetry,
} from './listeningTelemetry';
import type { AudioPlayerSession, SyncNowPlaying } from './playerSession';
import { pausedByListener } from './sharedPlaybackState';

const AUDIO_POSITION_INTERPOLATION_INTERVAL_MS = 250;

export function stopPositionInterpolation(session: AudioPlayerSession): void {
  if (session.interpolationTimer) {
    clearInterval(session.interpolationTimer);
    session.interpolationTimer = null;
  }
}

/** Re-anchors interpolation on a position the player has just been given. */
export function anchorPositionInterpolation(session: AudioPlayerSession, positionMs: number): void {
  session.lastPollPosition = positionMs;
  session.lastPollTime = Date.now();
}

// Keep interpolation lightweight on Android. This updates the visible progress
// often enough for controls without turning playback into a high-frequency
// persisted-store write loop. Only a mounted reader in the foreground needs it.
function startPositionInterpolation(session: AudioPlayerSession): void {
  if (!session.isMounted || AppState.currentState !== 'active' || session.interpolationTimer) {
    return;
  }

  session.interpolationTimer = setInterval(() => {
    const { playbackRate, currentPosition, duration, setPosition } = useAudioStore.getState();
    setPosition(
      interpolatePlaybackPosition({
        anchorPositionMs: session.lastPollPosition,
        anchorTimeMs: session.lastPollTime,
        nowMs: Date.now(),
        playbackRate: playbackRate ?? 1.0,
        currentPositionMs: currentPosition,
        durationMs: duration,
        maxElapsedMs: AUDIO_POSITION_INTERPOLATION_INTERVAL_MS,
      })
    );
  }, AUDIO_POSITION_INTERPOLATION_INTERVAL_MS);
}

export interface PlaybackProgressContext {
  session: AudioPlayerSession;
  fallbackTranslationId: string;
  syncNowPlaying: SyncNowPlaying;
}

/** Applies a native progress snapshot of the Bible sound to the player state. */
export function handlePlaybackStatusUpdate(
  { session, fallbackTranslationId, syncNowPlaying }: PlaybackProgressContext,
  snapshot: TrackPlayerProgressSnapshot
): void {
  const store = useAudioStore.getState();
  const { positionMs: nextPosition, durationMs: nextDuration } = resolveSnapshotProgress(
    { positionMs: store.currentPosition, durationMs: store.duration },
    snapshot
  );

  store.setPosition(nextPosition);
  store.setDuration(nextDuration);
  syncNowPlaying({
    translationId: useAudioStore.getState().currentTranslationId ?? fallbackTranslationId,
    bookId: useAudioStore.getState().currentBookId ?? undefined,
    chapter: useAudioStore.getState().currentChapter ?? undefined,
    positionMs: nextPosition,
    durationMs: nextDuration,
    isPlaying: snapshot.isPlaying,
    playbackRate: useAudioStore.getState().playbackRate ?? 1,
  });

  // Record the real poll anchor for interpolation
  anchorPositionInterpolation(session, nextPosition);

  // A listener pause (Pause, Selah's hold, the sleep timer) sets the paused status before
  // the native player has stopped, and a report already on its way can still say playing.
  // Taking it at its word flipped the player back to playing, and so ended Selah as if the
  // reading had been restarted. Every way of playing again clears pausedByListener first.
  if (snapshot.isPlaying && pausedByListener.current) {
    return;
  }

  if (snapshot.isPlaying) {
    // The reader's sleep-timer interval only runs while it is mounted. Native
    // progress keeps arriving about once a second while audio plays, mounted or
    // not, so it also enforces the expiry.
    const { sleepTimerEndTime } = useAudioStore.getState();
    if (hasSleepTimerExpired(sleepTimerEndTime, Date.now()) && session.pause) {
      useAudioStore.getState().clearSleepTimer();
      void session.pause();
      return;
    }

    store.setStatus('playing');
    startAudioProgressTelemetry(fallbackTranslationId);
    startPositionInterpolation(session);
    return;
  }

  // Not playing: stop interpolation and close the listening segment. The stopped
  // snapshot of a finished chapter arrives before the finish handler, so it closes
  // out the last segment as a finish.
  stopPositionInterpolation(session);
  emitAudioPlaybackProgress(
    fallbackTranslationId,
    snapshot.didJustFinish ? 'finish' : 'pause',
    true
  );
  stopAudioProgressTelemetry();

  // A finished chapter's status is the finish handler's call (the next chapter, or
  // idle). Reporting "paused" for the instant in between would dip the music bed at
  // every chapter boundary.
  if (snapshot.didJustFinish) {
    return;
  }
  store.setStatus(snapshot.isBuffering ? 'loading' : 'paused');
}
