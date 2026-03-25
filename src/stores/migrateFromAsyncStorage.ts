/**
 * One-time AsyncStorage to MMKV data migration helper.
 *
 * Runs at app startup (before store initialization) to preserve existing user
 * data when upgrading from AsyncStorage-persisted stores to MMKV-persisted stores.
 *
 * Migration is idempotent: if MMKV already has data for a key, it is not overwritten.
 * Each key migration is wrapped in try/catch so a single failure does not block the rest.
 *
 * The core loop (migrateStoreKeys) accepts injected dependencies so it can be tested
 * in the Node test runner without loading native modules.
 */

export const STORE_KEYS = [
  'auth-storage',
  'bible-storage',
  'audio-storage',
  'progress-storage',
  'four-fields-storage',
  'gather-storage',
  'library-storage',
] as const;

/**
 * Core migration loop extracted for testability.
 * Accepts injected read/write functions so tests can pass plain Map-based mocks.
 */
export async function migrateStoreKeys(
  keys: readonly string[],
  getAsyncValue: (key: string) => Promise<string | null>,
  getMmkvValue: (key: string) => string | undefined,
  setMmkvValue: (key: string, value: string) => void
): Promise<void> {
  for (const key of keys) {
    // Skip if MMKV already has this key (already migrated or fresh user)
    if (getMmkvValue(key) !== undefined) {
      continue;
    }
    try {
      const value = await getAsyncValue(key);
      if (value != null) {
        setMmkvValue(key, value);
      }
    } catch (error) {
      // Best-effort migration — a single key failure must not block others
      console.warn(`[MMKV Migration] Failed to migrate key "${key}":`, error);
    }
  }
}

/**
 * Runs the one-time migration from AsyncStorage to MMKV for all 7 persisted store keys.
 * Call this at startup BEFORE stores are read from MMKV so the data is available.
 *
 * Native imports (AsyncStorage and mmkvInstance) are dynamically required here so that
 * this module's testable exports (STORE_KEYS, migrateStoreKeys) can be imported in the
 * Node test runner without triggering native module resolution.
 */
export async function migrateFromAsyncStorage(): Promise<void> {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  const { mmkvInstance } = require('./mmkvStorage') as typeof import('./mmkvStorage');

  await migrateStoreKeys(
    STORE_KEYS,
    (key) => AsyncStorage.getItem(key),
    (key) => mmkvInstance.getString(key),
    (key, value) => mmkvInstance.set(key, value)
  );
  console.log('[MMKV Migration] Complete');
}
