import type { SyncIdentityBoundary } from './syncIdentity';

export interface SyncCycleResult {
  success: boolean;
  error?: string;
  merged?: boolean;
}

export interface SyncCycleSubsyncOperations {
  progress: (identity: SyncIdentityBoundary) => Promise<SyncCycleResult>;
  readingPlans: (identity: SyncIdentityBoundary) => Promise<SyncCycleResult>;
  preferences: (identity: SyncIdentityBoundary) => Promise<SyncCycleResult>;
}

export interface SyncCycleSubsyncResult {
  identity: SyncIdentityBoundary | null;
  results: SyncCycleResult[];
}

export type SyncCycleRetry = (run: () => Promise<SyncCycleResult>) => Promise<SyncCycleResult>;

/** Serialize each account's writes, retaining at most one requested follow-up. */
export function createSyncOperationQueue() {
  type Run = () => Promise<SyncCycleResult>;
  type Pending = {
    run: Run;
    promise: Promise<SyncCycleResult>;
    resolve: (result: SyncCycleResult) => void;
    reject: (error: unknown) => void;
  };
  const entries = new Map<string, { pending?: Pending }>();

  const start = (key: string, entry: { pending?: Pending }, run: Run): Promise<SyncCycleResult> =>
    Promise.resolve()
      .then(run)
      .finally(() => {
        const pending = entry.pending;
        if (!pending) {
          entries.delete(key);
          return;
        }
        entry.pending = undefined;
        void start(key, entry, pending.run).then(pending.resolve, pending.reject);
      });

  return (key: string, run: Run): Promise<SyncCycleResult> => {
    const entry = entries.get(key);
    if (entry) {
      if (!entry.pending) {
        let resolve!: Pending['resolve'];
        let reject!: Pending['reject'];
        const promise = new Promise<SyncCycleResult>((done, fail) => {
          resolve = done;
          reject = fail;
        });
        entry.pending = { run, promise, resolve, reject };
      } else {
        entry.pending.run = run;
      }
      return entry.pending.promise;
    }
    const next = {};
    entries.set(key, next);
    return start(key, next, run);
  };
}

const normalizeSyncCycleError = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown sync error';

/**
 * Captures one remote-validated identity and passes that opaque capability to
 * every sub-sync and retry. Standalone callers capture in their public method;
 * a syncAll cycle must not revalidate the same session for each branch.
 */
export const runSyncCycleSubsyncs = async (
  captureIdentity: () => Promise<SyncIdentityBoundary | null>,
  operations: SyncCycleSubsyncOperations,
  retry: SyncCycleRetry,
  onIdentityCaptured?: (identity: SyncIdentityBoundary) => void
): Promise<SyncCycleSubsyncResult> => {
  const identity = await captureIdentity();
  if (!identity) {
    return { identity: null, results: [] };
  }

  onIdentityCaptured?.(identity);
  const runSubsync = async (
    operation: (identity: SyncIdentityBoundary) => Promise<SyncCycleResult>
  ): Promise<SyncCycleResult> => {
    const runOperation = async (): Promise<SyncCycleResult> => {
      try {
        return await operation(identity);
      } catch (error) {
        return { success: false, error: normalizeSyncCycleError(error) };
      }
    };

    try {
      return await retry(runOperation);
    } catch (error) {
      return { success: false, error: normalizeSyncCycleError(error) };
    }
  };

  // Each branch normalizes its own throw into a result, so Promise.all waits
  // for every sibling before syncAll's finally block releases cycle-scoped
  // profile state.
  const results = await Promise.all([
    runSubsync(operations.progress),
    runSubsync(operations.readingPlans),
    runSubsync(operations.preferences),
  ]);

  return { identity, results };
};
