import test from 'node:test';
import assert from 'node:assert/strict';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { createUnchangedStateStorage } from './unchangedStateStorage';

type Slice = { items?: string[]; flag: boolean };

function makeBase(result: void | Promise<void> = undefined) {
  const writes: StorageValue<Slice>[] = [];
  const base: PersistStorage<Slice> = {
    getItem: () => null,
    setItem: (_name, value) => {
      writes.push(value);
      return result;
    },
    removeItem: () => undefined,
  };
  return { base, writes };
}

test('skips a slice whose fields are all identical to the last saved one', () => {
  const { base, writes } = makeBase();
  const storage = createUnchangedStateStorage(base);
  const items = ['a'];
  storage.setItem('k', { state: { items, flag: false }, version: 1 });
  storage.setItem('k', { state: { items, flag: false }, version: 1 });
  assert.equal(writes.length, 1);
});

test('writes when a field changes, a field appears or disappears, or the version changes', () => {
  const { base, writes } = makeBase();
  const storage = createUnchangedStateStorage(base);
  const items = ['a'];
  storage.setItem('k', { state: { items, flag: false }, version: 1 });
  storage.setItem('k', { state: { items, flag: true }, version: 1 });
  storage.setItem('k', { state: { flag: true }, version: 1 });
  storage.setItem('k', { state: { items, flag: true }, version: 1 });
  storage.setItem('k', { state: { items, flag: true }, version: 2 });
  assert.equal(writes.length, 5);
});

test('a read or removal forgets the remembered slice so the next identical set writes', () => {
  const { base, writes } = makeBase();
  const storage = createUnchangedStateStorage(base);
  const state = { flag: false };
  storage.setItem('k', { state, version: 0 });
  storage.getItem('k');
  storage.setItem('k', { state, version: 0 });
  storage.removeItem('k');
  storage.setItem('k', { state, version: 0 });
  assert.equal(writes.length, 3);
});

test('an async adapter never suppresses a later identical write', async () => {
  const { base, writes } = makeBase(Promise.resolve());
  const storage = createUnchangedStateStorage(base);
  const state = { flag: false };
  await storage.setItem('k', { state, version: 0 });
  await storage.setItem('k', { state, version: 0 });
  assert.equal(writes.length, 2);
});
