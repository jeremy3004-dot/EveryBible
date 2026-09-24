import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../testing/mockModules';

// progressStore skips a write whose ledgers are unchanged since the last save, but only
// for a synchronous adapter (MMKV). This file swaps in an asynchronous one, so it needs
// its own mock configuration.
const writes: string[] = [];
mockModule(mock, sourcePath('stores/mmkvStorage.ts'), {
  mmkvInstance: {},
  zustandStorage: {
    getItem: () => null,
    setItem: async (_name: string, value: string) => {
      writes.push(value);
    },
    removeItem: async () => {},
  },
});
mockModule(mock, sourcePath('services/sync/index.ts'), {
  syncProgress: async () => ({ success: true }),
});
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: { getState: () => ({ user: null, authGeneration: 0 }) },
});

test('an asynchronous adapter is never told a write was already saved', async () => {
  const { useProgressStore } = await import('./progressStore');
  writes.length = 0;

  useProgressStore.setState({ streakDays: 2 });
  useProgressStore.setState({});
  useProgressStore.setState({});

  assert.equal(writes.length, 3, 'an unfinished async save must not suppress the next write');
});
