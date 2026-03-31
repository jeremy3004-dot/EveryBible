const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export function getHomeVerseBackgroundIndex(
  date: Date,
  backgroundCount: number
): number {
  if (backgroundCount <= 0) {
    return 0;
  }

  const startOfYear = Date.UTC(date.getFullYear(), 0, 0);
  const startOfDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfYear = Math.floor((startOfDay - startOfYear) / DAY_IN_MILLISECONDS);

  return (dayOfYear - 1) % backgroundCount;
}
