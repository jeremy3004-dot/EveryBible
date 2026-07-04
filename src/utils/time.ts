/**
 * Formats a playback duration in milliseconds as `m:ss` (e.g. `3:07`).
 * Shared across audio surfaces so the format stays identical everywhere.
 */
export function formatPlaybackTime(ms: number): string {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
