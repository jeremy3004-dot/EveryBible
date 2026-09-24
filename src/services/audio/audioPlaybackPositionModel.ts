/**
 * Position arithmetic for the audio Bible player: how a native progress snapshot,
 * the between-snapshot interpolation, a seek and a skip each move the visible
 * position. All times and positions are in milliseconds.
 */

export interface PlaybackProgress {
  positionMs: number;
  durationMs: number;
}

export interface PlaybackProgressSnapshot {
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
}

/**
 * The position and duration to show after a native progress snapshot.
 *
 * The position is kept monotonic to suppress stop-like snapshots (position
 * collapsing toward 0) that a background-music teardown can surface; those must
 * never drag the Bible progress bar backward. A non-zero snapshot of a sound that
 * is still playing is authoritative, though, and may correct interpolation
 * overshoot downward. The duration only grows, and a snapshot without one keeps
 * the known duration.
 */
export function resolveSnapshotProgress(
  current: PlaybackProgress,
  snapshot: PlaybackProgressSnapshot
): PlaybackProgress {
  const isAuthoritativeProgress = snapshot.isPlaying && snapshot.positionMillis > 0;
  return {
    positionMs: isAuthoritativeProgress
      ? snapshot.positionMillis
      : Math.max(current.positionMs, snapshot.positionMillis),
    durationMs:
      snapshot.durationMillis > 0
        ? Math.max(current.durationMs, snapshot.durationMillis)
        : current.durationMs,
  };
}

export interface PlaybackInterpolationInput {
  /** Position reported by the last real native snapshot (or seek). */
  anchorPositionMs: number;
  /** Wall-clock time of that anchor. */
  anchorTimeMs: number;
  nowMs: number;
  playbackRate: number;
  /** Position currently shown. */
  currentPositionMs: number;
  durationMs: number;
  /** Longest wall-clock gap one interpolation step may cover. */
  maxElapsedMs: number;
}

/**
 * The estimated position between two native snapshots.
 *
 * The elapsed time is bounded to one interpolation interval. Without that cap a
 * delayed or stalled native poll lets the estimate race arbitrarily far past the
 * true position, and the monotonic clamp would then keep that overshoot forever.
 * Capped, interpolation stays at most about one tick ahead of the last real poll,
 * so the next real snapshot can correct it. The estimate never passes the end of
 * the chapter and never moves the shown position backward.
 */
export function interpolatePlaybackPosition(input: PlaybackInterpolationInput): number {
  const elapsed = Math.min(input.nowMs - input.anchorTimeMs, input.maxElapsedMs);
  const interpolated = input.anchorPositionMs + elapsed * input.playbackRate;
  const capped = input.durationMs > 0 ? Math.min(interpolated, input.durationMs) : interpolated;
  return Math.max(input.currentPositionMs, capped);
}

/**
 * A seek target within the chapter. Lock-screen and notification scrubbers can
 * report a position past the end; kept unclamped, it became the visible position
 * and the durable resume point. An unknown duration (0) only clamps at the start.
 */
export function clampSeekPosition(requestedPositionMs: number, durationMs: number): number {
  return Math.max(
    0,
    durationMs > 0 ? Math.min(requestedPositionMs, durationMs) : requestedPositionMs
  );
}

/** Where a relative skip lands, kept within the chapter. */
export function skipTargetPosition(
  positionMs: number,
  deltaMs: number,
  durationMs: number
): number {
  return Math.max(0, Math.min(durationMs, positionMs + deltaMs));
}
