import { trackAnonymousUsageEvent } from '../../services/analytics';
import {
  AUDIO_PROGRESS_TELEMETRY_INTERVAL_MS,
  buildAudioPlaybackProgressEvent,
  type AudioPlaybackProgressReason,
} from '../../services/audio/audioListeningProgressModel';
import { useAudioStore } from '../../stores/audioStore';

// The listening telemetry interval is started from the native playback callbacks,
// so a closed reader can start one after it unmounts. A per-player ref would leave
// that interval where the next player can't reach it, and every reopen would add
// another 30-second emitter. One shared holder lets whichever player owns the
// callbacks stop it.
const audioProgressTelemetryTimer: { current: ReturnType<typeof setInterval> | null } = {
  current: null,
};
const audioProgressTelemetryLastEmittedAt = { current: 0 };

export function stopAudioProgressTelemetry(): void {
  if (audioProgressTelemetryTimer.current) {
    clearInterval(audioProgressTelemetryTimer.current);
    audioProgressTelemetryTimer.current = null;
  }
  audioProgressTelemetryLastEmittedAt.current = 0;
}

/** Reports the listening segment that ends now, if there is one worth reporting. */
export function emitAudioPlaybackProgress(
  fallbackTranslationId: string,
  reason: AudioPlaybackProgressReason,
  force = false
): void {
  const now = Date.now();
  const properties = buildAudioPlaybackProgressEvent({
    state: useAudioStore.getState(),
    reason,
    force,
    segmentStartedAt: audioProgressTelemetryLastEmittedAt.current,
    now,
    fallbackTranslationId,
  });
  if (!properties) {
    return;
  }

  trackAnonymousUsageEvent('audio_playback_progress', properties);
  audioProgressTelemetryLastEmittedAt.current = now;
}

/** Starts the periodic report for a playing chapter, unless one is already running. */
export function startAudioProgressTelemetry(fallbackTranslationId: string): void {
  if (audioProgressTelemetryTimer.current) {
    return;
  }

  audioProgressTelemetryLastEmittedAt.current = Date.now();
  audioProgressTelemetryTimer.current = setInterval(() => {
    emitAudioPlaybackProgress(fallbackTranslationId, 'tick');
  }, AUDIO_PROGRESS_TELEMETRY_INTERVAL_MS);
}
