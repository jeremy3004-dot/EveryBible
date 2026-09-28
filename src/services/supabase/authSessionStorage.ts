/**
 * The storage supabase-js keeps the auth session in, backed by the OS keychain
 * (expo-secure-store). Import-free, so session restore can ask whether the keychain
 * was readable without loading the client or a native module.
 *
 * supabase-js reads this storage before every request, anonymous ones included
 * (it looks for a session JWT to send), and inside background work it never
 * awaits, such as the INITIAL_SESSION emit. A throwing read therefore failed every
 * catalog request and raised unhandled rejections whenever the keychain refused:
 * an unsigned iOS build (ERR_KEY_CHAIN on every call), a read before the device's
 * first unlock, or an Android keystore fault. Standard Supabase storage methods
 * never throw:
 *
 * - A failed read answers null (no session), so requests go out with the public key.
 * - A failed write keeps the value in memory for the rest of this launch, so a
 *   sign-in or token refresh still works, and later reads return it rather than the
 *   older keychain copy (whose refresh token the server may already have rotated).
 *   Each later read retries the write, so the keychain catches up once it answers.
 * - A failed delete remembers the removal in a nonsecret durable intent, so the session
 *   is not read back from the keychain even after restart. Native deletion is
 *   retried on reads; the intent retires only after a read confirms absence.
 *   App sign-out uses removeItemDurably, which rejects if intent admission fails.
 *
 * The first failure is reported; later ones in the same launch are not.
 *
 * The session is kept readable after the device's first unlock, not only while it is
 * unlocked: background audio keeps the app running with the phone locked, and a token
 * refresh or request then read the keychain and got "User interaction is not allowed"
 * (seen in the diagnostics report of build 460). An item keeps the accessibility it was
 * added with, since expo-secure-store's update only replaces the value, so the first
 * save of each key in a launch deletes and re-adds it; a session saved by an older build
 * moves over at its next token refresh.
 */

/** The subset of expo-secure-store's options this storage passes. */
export interface SecureStoreOptions {
  keychainAccessible?: number;
}

export interface SecureKeyValueStore {
  getItemAsync: (key: string, options?: SecureStoreOptions) => Promise<string | null>;
  setItemAsync: (key: string, value: string, options?: SecureStoreOptions) => Promise<void>;
  deleteItemAsync: (key: string, options?: SecureStoreOptions) => Promise<void>;
}

export interface AuthSessionStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  removeItemDurably?: (key: string) => Promise<void>;
  /** Serialized with session writes/removals; undefined leaves the current value unchanged. */
  updateItemIfCurrent?: (
    key: string,
    update: (current: string | null) => string | undefined
  ) => Promise<boolean>;
}

/** Nonsecret durable intent, separate from the credential it masks. */
export interface AuthSessionRemovalIntents {
  has: (key: string) => boolean;
  mark: (key: string) => void;
  clear: (key: string) => void;
}

/** App sign-out did not establish a durable local removal. */
export class AuthSessionRemovalNotAdmittedError extends Error {
  constructor() {
    super('Could not safely end the session on this device');
    this.name = 'AuthSessionRemovalNotAdmittedError';
  }
}

// One keychain per process, so its health is process state too.
let lastReadFailed = false;
let failureReported = false;

/**
 * True while the most recent keychain read failed and nothing written this launch
 * stood in for it. A missing session then means "could not check", not "signed out".
 */
export function isAuthSessionStorageUnreadable(): boolean {
  return lastReadFailed;
}

/**
 * `reportFailure` is best effort. `options` go with every keychain call; the client
 * passes expo-secure-store's AFTER_FIRST_UNLOCK (its value comes from the native
 * module, so this import-free module cannot name it).
 */
export function createAuthSessionStorage(
  secureStore: SecureKeyValueStore,
  reportFailure: (error: unknown) => void,
  options: SecureStoreOptions = {},
  removalIntents?: AuthSessionRemovalIntents
): AuthSessionStorage {
  // A string is a value the keychain refused to store; null is a removal it refused.
  const pending = new Map<string, string | null>();
  // Keys saved this launch with the current accessibility; see the note at the top.
  const resaved = new Set<string>();
  // Sign-out runs outside auth-js's lock. A new session write must follow any
  // native deletion already in flight for that key, even if it completes late.
  const operations = new Map<string, Promise<unknown>>();
  const serialize = <T>(key: string, operation: () => Promise<T>): Promise<T> => {
    const previous = operations.get(key) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    operations.set(key, next);
    const release = () => {
      if (operations.get(key) === next) operations.delete(key);
    };
    void next.then(release, release);
    return next;
  };

  const noteFailure = (error: unknown): void => {
    if (failureReported) return;
    failureReported = true;
    try {
      reportFailure(error);
    } catch {
      // Diagnostics cannot change credential storage outcomes.
    }
  };

  const persist = async (key: string, value: string | null): Promise<boolean> => {
    if (removalIntents) {
      try {
        // Also mask an older credential if its replacement cannot be persisted.
        removalIntents.mark(key);
      } catch (error) {
        // Supabase background saves/removals must keep their memory fallback.
        noteFailure(error);
      }
    }
    try {
      if (value === null) {
        await secureStore.deleteItemAsync(key, options);
        // Expo's iOS deletion ignores SecItemDelete status; resolution alone is
        // insufficient proof that the retained credential is gone.
        if (removalIntents && (await secureStore.getItemAsync(key, options)) !== null) {
          throw new Error('Native session removal was not confirmed');
        }
      } else {
        if (!resaved.has(key)) {
          await secureStore.deleteItemAsync(key, options);
        }
        await secureStore.setItemAsync(key, value, options);
        resaved.add(key);
      }
      removalIntents?.clear(key);
      return true;
    } catch (error) {
      noteFailure(error);
      return false;
    }
  };

  const flushPending = async (key: string, value: string | null): Promise<void> => {
    if ((await persist(key, value)) && pending.get(key) === value) {
      pending.delete(key);
    }
  };

  // Shared by reads and atomic metadata updates inside the same per-key queue.
  const readCurrent = async (key: string): Promise<string | null> => {
    if (pending.has(key)) {
      const value = pending.get(key) ?? null;
      await flushPending(key, value);
      lastReadFailed = false;
      return value;
    }
    try {
      if (removalIntents?.has(key)) {
        pending.set(key, null);
        await flushPending(key, null);
        lastReadFailed = false;
        return null;
      }
      const value = await secureStore.getItemAsync(key, options);
      lastReadFailed = false;
      return value;
    } catch (error) {
      lastReadFailed = true;
      noteFailure(error);
      return null;
    }
  };

  return {
    ...(removalIntents
      ? {
          removeItemDurably: (key: string) =>
            serialize(key, async () => {
              try {
                removalIntents.mark(key);
              } catch (error) {
                noteFailure(error);
                throw new AuthSessionRemovalNotAdmittedError();
              }
              pending.set(key, null);
              await flushPending(key, null);
            }),
        }
      : {}),
    getItem: (key) => serialize(key, () => readCurrent(key)),
    updateItemIfCurrent: (key, update) =>
      serialize(key, async () => {
        const value = update(await readCurrent(key));
        if (value === undefined) return false;
        if (await persist(key, value)) {
          pending.delete(key);
        } else {
          pending.set(key, value);
        }
        return true;
      }),
    setItem: (key, value) =>
      serialize(key, async () => {
        if (await persist(key, value)) {
          pending.delete(key);
        } else {
          pending.set(key, value);
        }
      }),
    removeItem: (key) =>
      serialize(key, async () => {
        if (await persist(key, null)) {
          pending.delete(key);
        } else {
          pending.set(key, null);
        }
      }),
  };
}
