export const STALE_SYNC_ERROR = 'Authenticated user changed during sync';

/**
 * A server-side merge refusing the push with 42501: the request ran under a
 * session for another account than the payload's user_id (the account changed
 * while the push was in flight), or under no session at all
 * (migration 20260924051658). The push is dropped and the cycle reported stale,
 * so the account now signed in syncs, and re-reads, its own state. It is never
 * retried as a plain upsert.
 */
export const isMergeRefusedForAccount = (error: { code?: string } | null | undefined): boolean =>
  error?.code === '42501';

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
