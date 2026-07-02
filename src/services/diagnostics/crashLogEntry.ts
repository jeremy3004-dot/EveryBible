/**
 * Pure crash-log-entry helpers, deliberately free of RN/MMKV imports so they
 * can be unit tested directly under the Node test runner (see
 * crashLogEntry.test.ts). MMKV-backed persistence lives in crashLogStore.ts.
 */
export interface CrashLogEntry {
  message: string;
  stack?: string;
  isFatal: boolean;
  timestamp: number;
}

export const MAX_CRASH_LOG_ENTRIES = 20;

/**
 * Keeps the most recent `max` entries, newest last.
 */
export function appendCrashLogEntry(
  existing: CrashLogEntry[],
  entry: CrashLogEntry,
  max = MAX_CRASH_LOG_ENTRIES
): CrashLogEntry[] {
  const next = [...existing, entry];
  return next.length > max ? next.slice(next.length - max) : next;
}

export function toCrashLogEntry(error: unknown, isFatal: boolean, timestamp: number): CrashLogEntry {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack, isFatal, timestamp };
  }
  return { message: String(error), isFatal, timestamp };
}
