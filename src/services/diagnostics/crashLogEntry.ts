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

const UNPRINTABLE = '[unprintable value]';

/**
 * Never throws: it runs inside the global error handler, where a throw would skip the
 * remote report and RN's own handler. `String(Object.create(null))`, a throwing
 * `toString` and a throwing `message` getter all become a placeholder.
 */
export function toCrashLogEntry(
  error: unknown,
  isFatal: boolean,
  timestamp: number
): CrashLogEntry {
  try {
    if (error instanceof Error) {
      const message = error.message;
      const stack = error.stack;
      return {
        message: typeof message === 'string' ? message : String(message),
        stack: typeof stack === 'string' ? stack : undefined,
        isFatal,
        timestamp,
      };
    }
    return { message: String(error), isFatal, timestamp };
  } catch {
    return { message: UNPRINTABLE, isFatal, timestamp };
  }
}

/**
 * Entry for a render error an ErrorBoundary caught. Not fatal (the boundary
 * kept the app alive), tagged with the boundary's scope so the Diagnostics
 * screen says which screen failed, with React's component stack appended.
 */
export function toRenderErrorCrashLogEntry(
  error: unknown,
  scope: string,
  componentStack: string | null | undefined,
  timestamp: number
): CrashLogEntry {
  const base = toCrashLogEntry(error, false, timestamp);
  const componentTrail = componentStack?.trim() ? `\nComponent stack:${componentStack}` : '';
  const stack = `${base.stack ?? base.message}${componentTrail}`;
  return { ...base, message: `[${scope}] ${base.message}`, stack };
}
