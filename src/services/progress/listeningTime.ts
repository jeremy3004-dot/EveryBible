const MINUTE_MS = 60_000;

const isCountableMs = (value: number) => Number.isFinite(value) && value > 0;

/**
 * Whole minutes of listening to show. This device banks every listening segment
 * as it plays (progressStore.listeningMsByDate), so a guest or an offline
 * listener sees their time. The cloud summary also counts other devices, but it
 * lags this one until queued events upload and the summary refreshes, so the
 * larger of the two is shown rather than letting a stale cloud zero win.
 */
export function totalListeningMinutes(
  listeningMsByDate: Record<string, number>,
  cloudMinutes: number | null | undefined
): number {
  return combineListeningMinutes(localListeningMinutes(listeningMsByDate), cloudMinutes);
}

/**
 * Whole minutes banked on this device. A store selector can return this instead of
 * the raw map: audio banks listening every 30 seconds, but the minute count only
 * changes about every other bank, so subscribers re-render at most that often.
 */
export function localListeningMinutes(listeningMsByDate: Record<string, number>): number {
  const localMs = Object.values(listeningMsByDate)
    .filter(isCountableMs)
    .reduce((sum, ms) => sum + ms, 0);
  return Math.floor(localMs / MINUTE_MS);
}

/** The larger of this device's minutes and the cloud summary's (see totalListeningMinutes). */
export function combineListeningMinutes(
  localMinutes: number,
  cloudMinutes: number | null | undefined
): number {
  const cloud = cloudMinutes != null && isCountableMs(cloudMinutes) ? Math.floor(cloudMinutes) : 0;
  return Math.max(localMinutes, cloud);
}
