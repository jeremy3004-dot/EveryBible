import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { mockMmkvStorage } from '../testing/mockModules';

// Its own file because the scope keeps module state: here nothing has switched
// the owner or reloaded a store yet, exactly as at app launch.
const mmkv = mockMmkvStorage(mock);

test('on a cold start a private store write lands in the guest bucket before any owner switch', async () => {
  const scope = await import('./privateDataScope');
  const useNotes = create<{ notes: string[] }>()(
    persist(() => ({ notes: [] as string[] }), {
      name: 'annotation-storage',
      storage: createJSONStorage(() => scope.privateDataStorage),
    })
  );
  scope.registerPrivateDataStore(useNotes, (account, guest) => ({
    notes: [...account.notes, ...guest.notes],
  }));

  useNotes.setState({ notes: ['first note'] });

  assert.deepEqual(JSON.parse(mmkv.store.get('annotation-storage') ?? 'null'), {
    state: { notes: ['first note'] },
    version: 0,
  });
});
