/**
 * Map-backed mock of the react-native-mmkv MMKV class.
 * Used in Node test runner environment where native modules cannot be loaded.
 * Implements the MMKV v2 API surface used by mmkvStorage.ts.
 */
export function createMockMMKV() {
  const store = new Map<string, string>();

  return {
    getString(key: string): string | undefined {
      return store.get(key);
    },
    set(key: string, value: string): void {
      store.set(key, value);
    },
    delete(key: string): void {
      store.delete(key);
    },
    getAllKeys(): string[] {
      return Array.from(store.keys());
    },
    clearAll(): void {
      store.clear();
    },
  };
}

export type MockMMKV = ReturnType<typeof createMockMMKV>;
