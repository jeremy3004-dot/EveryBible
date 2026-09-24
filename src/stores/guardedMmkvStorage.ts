/**
 * Failure guards shared by the Zustand adapters that persist into MMKV.
 *
 * A native MMKV call can throw (a damaged or full file). Zustand calls setItem synchronously
 * inside every set(), so a throw there would escape from whatever action ran it, which is a
 * fatal error in a press handler. Storage failures degrade to "not persisted" instead.
 *
 * A store whose read failed hydrated from its defaults, so its next write would replace
 * everything the user had saved. Writes for that store are skipped until a later read of it
 * succeeds, which keeps the saved blob for a launch whose read works.
 *
 * Kept apart from mmkvStorage.ts because many tests replace that module with a mock that
 * exports only the MMKV instance; this one takes the instance as an argument.
 */

interface StringStore {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
}

export interface GuardedStringStorage {
  getItem: (name: string) => string | null;
  /** Returns false when the value was not persisted (unread store, or a failed write). */
  setItem: (name: string, value: string) => boolean;
}

/**
 * `keyOf` maps a store name to the MMKV key it reads and writes now. It runs inside the
 * guards, so a failure to resolve the key is handled like a failed read or write.
 */
export function createGuardedStringStorage(
  instance: StringStore,
  keyOf: (name: string) => string = (name) => name
): GuardedStringStorage {
  const unreadableNames = new Set<string>();

  return {
    getItem: (name) => {
      try {
        const value = instance.getString(keyOf(name));
        unreadableNames.delete(name);
        return value ?? null;
      } catch (error) {
        unreadableNames.add(name);
        console.warn(`[MMKV] Failed to read "${name}"; starting from defaults:`, error);
        return null;
      }
    },
    setItem: (name, value) => {
      if (unreadableNames.has(name)) {
        return false;
      }

      try {
        const key = keyOf(name);
        let unchanged = false;
        try {
          unchanged = instance.getString(key) === value;
        } catch {
          // The unchanged-payload check is only an optimisation; fall through to the write.
        }
        if (!unchanged) {
          instance.set(key, value);
        }
        return true;
      } catch (error) {
        console.warn(`[MMKV] Failed to persist "${name}"; the change is kept in memory:`, error);
        return false;
      }
    },
  };
}
