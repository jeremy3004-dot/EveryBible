import { mmkvInstance } from '../../stores/mmkvStorage';
import { appendCrashLogEntry, type CrashLogEntry } from './crashLogEntry';

export type { CrashLogEntry } from './crashLogEntry';
export { toCrashLogEntry } from './crashLogEntry';

/**
 * Local, on-device crash/error log. There is no remote crash-reporting SDK
 * wired up yet (Sentry/Crashlytics both need external account + credential
 * setup — see CLAUDE.md manual follow-ups). This gives at least on-device
 * visibility into Android production crashes via a support flow, and keeps
 * the door open to forward these entries to a real backend later.
 */
export const CRASH_LOG_STORAGE_KEY = 'diagnostics-crash-log';

export function getCrashLogs(): CrashLogEntry[] {
  try {
    const raw = mmkvInstance.getString(CRASH_LOG_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Synchronous by design — this may be called from a fatal-error handler
 * where there is no guarantee an async write completes before the app dies.
 */
export function recordCrashLog(entry: CrashLogEntry): void {
  try {
    const updated = appendCrashLogEntry(getCrashLogs(), entry);
    mmkvInstance.set(CRASH_LOG_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Never let crash logging itself throw — it runs inside error handlers.
  }
}

export function clearCrashLogs(): void {
  try {
    mmkvInstance.delete(CRASH_LOG_STORAGE_KEY);
  } catch {
    // Best-effort cleanup only.
  }
}
