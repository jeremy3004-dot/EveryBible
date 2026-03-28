/**
 * Unit tests for the migrateFromAsyncStorage helper.
 *
 * Tests the migration logic using injected dependencies (no native modules required).
 * AsyncStorage and MMKV are both native — we extract the core loop logic and
 * test it with plain function mocks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASYNC_STORAGE_MIGRATION_COMPLETED_KEY,
  STORE_KEYS,
  migrateStoreKeys,
  migrateStoreKeysIfNeeded,
} from './migrateFromAsyncStorage';

test('STORE_KEYS contains exactly 7 entries', () => {
  assert.equal(STORE_KEYS.length, 7);
});

test('STORE_KEYS contains all required store keys', () => {
  const expected = [
    'auth-storage',
    'bible-storage',
    'audio-storage',
    'progress-storage',
    'four-fields-storage',
    'gather-storage',
    'library-storage',
  ];
  const keysAsStrings = STORE_KEYS as readonly string[];
  for (const key of expected) {
    assert.ok(keysAsStrings.includes(key), `Missing key: ${key}`);
  }
});

test('copies AsyncStorage value to MMKV when MMKV key is absent', async () => {
  const mmkvStore = new Map<string, string>();
  const asyncStore = new Map<string, string>([['auth-storage', '{"user":null}']]);

  await migrateStoreKeys(
    ['auth-storage'],
    async (key) => asyncStore.get(key) ?? null,
    (key) => mmkvStore.get(key),
    (key, value) => mmkvStore.set(key, value)
  );

  assert.equal(mmkvStore.get('auth-storage'), '{"user":null}');
});

test('skips migration when MMKV key already exists', async () => {
  const mmkvStore = new Map<string, string>([['auth-storage', '{"existing":true}']]);
  const asyncStore = new Map<string, string>([['auth-storage', '{"newer":true}']]);

  await migrateStoreKeys(
    ['auth-storage'],
    async (key) => asyncStore.get(key) ?? null,
    (key) => mmkvStore.get(key),
    (key, value) => mmkvStore.set(key, value)
  );

  // Should NOT overwrite existing MMKV data
  assert.equal(mmkvStore.get('auth-storage'), '{"existing":true}');
});

test('continues to next key when AsyncStorage.getItem throws', async () => {
  const mmkvStore = new Map<string, string>();
  let callCount = 0;

  await migrateStoreKeys(
    ['auth-storage', 'bible-storage'],
    async (key) => {
      callCount++;
      if (key === 'auth-storage') throw new Error('AsyncStorage read error');
      return '{"bible":true}';
    },
    (key) => mmkvStore.get(key),
    (key, value) => mmkvStore.set(key, value)
  );

  // auth-storage threw but bible-storage should still be migrated
  assert.equal(mmkvStore.has('auth-storage'), false);
  assert.equal(mmkvStore.get('bible-storage'), '{"bible":true}');
  assert.equal(callCount, 2);
});

test('does not set MMKV when AsyncStorage value is null', async () => {
  const mmkvStore = new Map<string, string>();

  await migrateStoreKeys(
    ['audio-storage'],
    async (_key) => null,
    (key) => mmkvStore.get(key),
    (key, value) => mmkvStore.set(key, value)
  );

  assert.equal(mmkvStore.has('audio-storage'), false);
});

test('skips AsyncStorage reads after the one-time migration marker is set', async () => {
  const mmkvStore = new Map<string, string>([[ASYNC_STORAGE_MIGRATION_COMPLETED_KEY, '1']]);
  let asyncReadCount = 0;

  const didMigrate = await migrateStoreKeysIfNeeded(
    ['auth-storage', 'bible-storage'],
    async () => {
      asyncReadCount += 1;
      return '{"unexpected":true}';
    },
    (key) => mmkvStore.get(key),
    (key, value) => mmkvStore.set(key, value)
  );

  assert.equal(didMigrate, false);
  assert.equal(asyncReadCount, 0);
  assert.equal(mmkvStore.get('auth-storage'), undefined);
});

test('marks AsyncStorage migration complete after the first pass', async () => {
  const mmkvStore = new Map<string, string>();
  const asyncStore = new Map<string, string>([['auth-storage', '{"user":null}']]);

  const didMigrate = await migrateStoreKeysIfNeeded(
    ['auth-storage'],
    async (key) => asyncStore.get(key) ?? null,
    (key) => mmkvStore.get(key),
    (key, value) => mmkvStore.set(key, value)
  );

  assert.equal(didMigrate, true);
  assert.equal(mmkvStore.get('auth-storage'), '{"user":null}');
  assert.equal(mmkvStore.get(ASYNC_STORAGE_MIGRATION_COMPLETED_KEY), '1');
});
