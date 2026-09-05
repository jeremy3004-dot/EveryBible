/** Listening minutes measure elapsed attention, independent of playback speed. */
export function elapsedListeningMs(startedAt: number, now: number): number {
  return startedAt > 0 ? Math.max(0, now - startedAt) : 0;
}
