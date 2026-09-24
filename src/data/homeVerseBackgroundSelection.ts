const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

/**
 * Counts local calendar days continuously rather than restarting each 1 January: a
 * day-of-year count repeated 31 December's photograph on 1 January whenever the year's
 * length was a multiple of the photo count (364 = 26 × 14). The local date's components
 * are read as UTC, so DST and time-zone offsets cannot skip or repeat a day.
 */
export function getHomeVerseBackgroundIndex(date: Date, backgroundCount: number): number {
  if (backgroundCount <= 0) {
    return 0;
  }

  const localDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNumber = Math.floor(localDay / DAY_IN_MILLISECONDS);

  return ((dayNumber % backgroundCount) + backgroundCount) % backgroundCount;
}
