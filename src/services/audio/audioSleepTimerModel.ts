/** Whether a running sleep timer has reached its end. A paused (frozen) timer has none. */
export function hasSleepTimerExpired(sleepTimerEndTime: number | null, now: number): boolean {
  return sleepTimerEndTime !== null && now >= sleepTimerEndTime;
}

/**
 * Whole minutes left on the sleep timer, rounded up, or null when none is set.
 * A running timer counts down to its end time; a paused one is frozen in the
 * store, so the countdown shown matches what is left once playback resumes.
 */
export function sleepTimerRemainingMinutes(
  sleepTimerEndTime: number | null,
  now: number,
  frozenRemainingMs: number | null
): number | null {
  const remainingMs = sleepTimerEndTime ? sleepTimerEndTime - now : frozenRemainingMs;
  if (remainingMs === null) {
    return null;
  }

  return Math.max(0, Math.ceil(remainingMs / 1000 / 60));
}
