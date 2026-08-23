export const STALE_SYNC_ERROR = 'Authenticated user changed during sync';

export interface SyncIdentityBoundary {
  readonly expectedUserId: string;
  readonly expectedGeneration?: number;
  isCurrent(): Promise<boolean>;
  runIfCurrent<T>(operation: () => T | Promise<T>): Promise<{ applied: boolean; value?: T }>;
}

export interface SyncCycleCache<T> {
  getOrCreate(key: string, factory: () => Promise<T>): Promise<T>;
  clear(key: string): void;
}

/**
 * Binds every continuation in one sync cycle to the uid and optional auth
 * generation captured at its start. Remote identity is validated by callers
 * exactly once before this local boundary is created; later checks only read
 * synchronous local auth state and the generation.
 */
export function createSyncIdentityBoundary(
  expectedUserId: string,
  getCurrentUserId: () => string | null,
  expectedGeneration?: number,
  getCurrentGeneration?: () => number
): SyncIdentityBoundary {
  const isCurrent = async (): Promise<boolean> => {
    if (getCurrentUserId() !== expectedUserId) {
      return false;
    }

    return getCurrentGeneration && expectedGeneration !== undefined
      ? getCurrentGeneration() === expectedGeneration
      : true;
  };

  return {
    expectedUserId,
    expectedGeneration,
    isCurrent,
    runIfCurrent: async <T>(operation: () => T | Promise<T>) => {
      if (!(await isCurrent())) {
        return { applied: false };
      }

      return { applied: true, value: await operation() };
    },
  };
}

export function createSyncCycleCache<T>(): SyncCycleCache<T> {
  const entries = new Map<string, Promise<T>>();

  return {
    getOrCreate: (key, factory) => {
      const existing = entries.get(key);
      if (existing) {
        return existing;
      }

      const pending = factory();
      entries.set(key, pending);
      void pending.catch(() => {
        if (entries.get(key) === pending) {
          entries.delete(key);
        }
      });
      return pending;
    },
    clear: (key) => {
      entries.delete(key);
    },
  };
}
