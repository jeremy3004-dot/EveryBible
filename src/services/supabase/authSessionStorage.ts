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
 * first unlock, or an Android keystore fault. So no method here ever throws:
 *
 * - A failed read answers null (no session), so requests go out with the public key.
 * - A failed write keeps the value in memory for the rest of this launch, so a
 *   sign-in or token refresh still works, and later reads return it rather than the
 *   older keychain copy (whose refresh token the server may already have rotated).
 *   Each later read retries the write, so the keychain catches up once it answers.
 * - A failed delete remembers the removal for this launch, so a signed-out session
 *   is not read back from the keychain.
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
 * `reportFailure` must not throw. `options` go with every keychain call; the client
 * passes expo-secure-store's AFTER_FIRST_UNLOCK (its value comes from the native
 * module, so this import-free module cannot name it).
 */
export function createAuthSessionStorage(
  secureStore: SecureKeyValueStore,
  reportFailure: (error: unknown) => void,
  options: SecureStoreOptions = {}
): AuthSessionStorage {
  // A string is a value the keychain refused to store; null is a removal it refused.
  const pending = new Map<string, string | null>();
  // Keys saved this launch with the current accessibility; see the note at the top.
  const resaved = new Set<string>();

  const noteFailure = (error: unknown): void => {
    if (failureReported) return;
    failureReported = true;
    reportFailure(error);
  };

  const persist = async (key: string, value: string | null): Promise<boolean> => {
    try {
      if (value === null) {
        await secureStore.deleteItemAsync(key, options);
      } else {
        if (!resaved.has(key)) {
          await secureStore.deleteItemAsync(key, options);
        }
        await secureStore.setItemAsync(key, value, options);
        resaved.add(key);
      }
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

  return {
    getItem: async (key) => {
      if (pending.has(key)) {
        const value = pending.get(key) ?? null;
        await flushPending(key, value);
        lastReadFailed = false;
        return value;
      }
      try {
        const value = await secureStore.getItemAsync(key, options);
        lastReadFailed = false;
        return value;
      } catch (error) {
        lastReadFailed = true;
        noteFailure(error);
        return null;
      }
    },
    setItem: async (key, value) => {
      if (await persist(key, value)) {
        pending.delete(key);
      } else {
        pending.set(key, value);
      }
    },
    removeItem: async (key) => {
      if (await persist(key, null)) {
        pending.delete(key);
      } else {
        pending.set(key, null);
      }
    },
  };
}
