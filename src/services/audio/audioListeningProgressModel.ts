import { elapsedListeningMs } from '../analytics/listeningTime';

/** How often a playing chapter reports listening progress. */
export const AUDIO_PROGRESS_TELEMETRY_INTERVAL_MS = 30000;

export type AudioPlaybackProgressReason = 'tick' | 'pause' | 'stop' | 'chapter-change' | 'finish';

export interface ListeningProgressState {
  currentTranslationId: string | null;
  currentBookId: string | null;
  currentChapter: number | null;
  currentPosition: number;
  duration: number;
  playbackRate: number;
}

export interface AudioPlaybackProgressInput {
  state: ListeningProgressState;
  reason: AudioPlaybackProgressReason;
  /** Report even a short segment (a pause, stop or chapter change closes one). */
  force: boolean;
  /** When the current listening segment started (0 when none is running). */
  segmentStartedAt: number;
  now: number;
  fallbackTranslationId: string;
}

/**
 * The `audio_playback_progress` properties for the listening segment that ends
 * now, or null when there is nothing to report: no chapter with a known
 * duration, no segment running, or a periodic tick that comes less than half an
 * interval after the last report.
 */
export function buildAudioPlaybackProgressEvent(
  input: AudioPlaybackProgressInput
): Record<string, unknown> | null {
  const { state, reason, force, now } = input;
  const bookId = state.currentBookId;
  const chapter = state.currentChapter;
  const durationMs = state.duration;
  if (!bookId || !chapter || durationMs <= 0) {
    return null;
  }

  const listenedMs = elapsedListeningMs(input.segmentStartedAt, now);
  if (!force && reason === 'tick' && listenedMs < AUDIO_PROGRESS_TELEMETRY_INTERVAL_MS / 2) {
    return null;
  }
  if (listenedMs <= 0) {
    return null;
  }

  const positionMs = state.currentPosition;
  const progressPercent =
    durationMs > 0 ? Math.min(100, Math.round((positionMs / durationMs) * 1000) / 10) : 0;

  return {
    book_id: bookId,
    chapter,
    duration_ms: durationMs,
    listened_ms: Math.max(0, listenedMs),
    mode: 'listen',
    playback_rate: state.playbackRate ?? 1,
    position_ms: positionMs,
    progress_percent: progressPercent,
    reason,
    translation_id: state.currentTranslationId ?? input.fallbackTranslationId,
  };
}
