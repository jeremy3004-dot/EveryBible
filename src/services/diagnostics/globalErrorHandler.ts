import { recordCrashLog, toCrashLogEntry } from './crashLogStore';

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;

interface ErrorUtilsGlobal {
  getGlobalHandler: () => ErrorHandler;
  setGlobalHandler: (handler: ErrorHandler) => void;
}

interface HermesPromiseRejectionTracker {
  enablePromiseRejectionTracker: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, error: unknown) => void;
  }) => void;
}

function getErrorUtils(): ErrorUtilsGlobal | undefined {
  return (globalThis as { ErrorUtils?: ErrorUtilsGlobal }).ErrorUtils;
}

function getHermesInternal(): HermesPromiseRejectionTracker | undefined {
  return (globalThis as { HermesInternal?: HermesPromiseRejectionTracker }).HermesInternal;
}

let installed = false;

/**
 * Registers process-wide handlers for uncaught JS errors and unhandled promise
 * rejections so Android production crashes leave a local trail (via crashLogStore)
 * instead of vanishing silently. Must run before React renders — call at module
 * scope, not inside a component or deferred runtime-effects hook.
 *
 * Chains to the original ErrorUtils handler rather than replacing it, so the
 * standard RN redbox/native-crash behavior is preserved.
 */
export function installGlobalErrorHandlers(): void {
  if (installed) {
    return;
  }
  installed = true;

  const errorUtils = getErrorUtils();
  if (errorUtils) {
    const originalHandler = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      recordCrashLog(toCrashLogEntry(error, Boolean(isFatal), Date.now()));
      originalHandler(error, isFatal);
    });
  }

  const hermesInternal = getHermesInternal();
  if (hermesInternal?.enablePromiseRejectionTracker) {
    hermesInternal.enablePromiseRejectionTracker({
      allRejections: true,
      onUnhandled: (_id, error) => {
        recordCrashLog(toCrashLogEntry(error, false, Date.now()));
        console.error('[GlobalErrorHandler] Unhandled promise rejection:', error);
      },
    });
  }
}
