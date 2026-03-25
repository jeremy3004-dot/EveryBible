/**
 * Unit tests for the mmkvStorage Zustand StateStorage adapter.
 *
 * Since react-native-mmkv is a native module that cannot run in Node.js,
 * we test the adapter logic directly by constructing a zustandStorage-compatible
 * object using the Map-backed mock from mmkvMock.ts.
 *
 * This tests the adapter contract (getItem/setItem/removeItem) without
 * importing the real mmkvStorage.ts module (which would fail on native import).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockMMKV } from './__tests__/mmkvMock';
import type { StateStorage } from 'zustand/middleware';

function createZustandStorageFromMock(mmkv: ReturnType<typeof createMockMMKV>): StateStorage {
  return {
    setItem: (name, value) => {
      mmkv.set(name, value);
    },
    getItem: (name) => {
      const value = mmkv.getString(name);
      return value ?? null;
    },
    removeItem: (name) => {
      mmkv.delete(name);
    },
  };
}

test('getItem returns null for missing key', () => {
  const mmkv = createMockMMKV();
  const storage = createZustandStorageFromMock(mmkv);

  const result = storage.getItem('missing-key');
  assert.equal(result, null);
});

test('getItem returns null (not undefined) for absent key', () => {
  const mmkv = createMockMMKV();
  const storage = createZustandStorageFromMock(mmkv);

  const result = storage.getItem('never-set');
  assert.equal(result, null);
  assert.notEqual(result, undefined);
});

test('setItem then getItem returns stored value', () => {
  const mmkv = createMockMMKV();
  const storage = createZustandStorageFromMock(mmkv);

  storage.setItem('my-key', '{"test":true}');
  const result = storage.getItem('my-key');
  assert.equal(result, '{"test":true}');
});

test('removeItem then getItem returns null', () => {
  const mmkv = createMockMMKV();
  const storage = createZustandStorageFromMock(mmkv);

  storage.setItem('removable', 'somevalue');
  assert.equal(storage.getItem('removable'), 'somevalue');

  storage.removeItem('removable');
  assert.equal(storage.getItem('removable'), null);
});
