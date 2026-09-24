import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockModule } from '../testing/mockModules';
import { ASYNC_STORAGE_MIGRATION_COMPLETED_KEY } from './migrateFromAsyncStorage';

// The real migrateFromAsyncStorage with MMKV and AsyncStorage replaced. (That a completed
// migration returns before AsyncStorage is even required is a startup import-graph
// property, guarded in migrateFromAsyncStorage.test.ts.)
const mmkv = mockMmkvStorage(mock);
const asyncStore = new Map<string, string>([['auth-storage', '{"user":null}']]);
const asyncReads: string[] = [];
// The code reads `require(...).default`; a CommonJS require of this mock yields its
// default export, so that object carries `default` itself as well.
const asyncStorage: { getItem: (key: string) => Promise<string | null>; default?: unknown } = {
  getItem: async (key: string) => {
    asyncReads.push(key);
    return asyncStore.get(key) ?? null;
  },
};
asyncStorage.default = asyncStorage;
mockModule(mock, '@react-native-async-storage/async-storage', { default: asyncStorage });

test('the first launch copies AsyncStorage data into MMKV and marks the migration done', async () => {
  const { migrateFromAsyncStorage } = await import('./migrateFromAsyncStorage');
  mmkv.store.clear();
  asyncReads.length = 0;

  await migrateFromAsyncStorage();

  assert.ok(asyncReads.includes('auth-storage'));
  assert.equal(mmkv.store.get('auth-storage'), '{"user":null}');
  assert.equal(mmkv.store.get(ASYNC_STORAGE_MIGRATION_COMPLETED_KEY), '1');
});

test('a completed migration reads nothing from AsyncStorage and writes nothing to MMKV', async () => {
  const { migrateFromAsyncStorage } = await import('./migrateFromAsyncStorage');
  mmkv.store.clear();
  mmkv.store.set(ASYNC_STORAGE_MIGRATION_COMPLETED_KEY, '1');
  const before = new Map(mmkv.store);
  asyncReads.length = 0;

  await migrateFromAsyncStorage();

  assert.deepEqual(asyncReads, []);
  assert.deepEqual(mmkv.store, before);
});

test('a key whose AsyncStorage read fails is copied on the next launch, not abandoned', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { migrateFromAsyncStorage } = await import('./migrateFromAsyncStorage');
  mmkv.store.clear();
  asyncStore.set('bible-storage', '{"state":{"currentBook":"JHN"}}');
  const getItem = t.mock.method(asyncStorage, 'getItem', async (key: string) => {
    if (key === 'bible-storage') throw new Error('AsyncStorage: database is locked');
    return asyncStore.get(key) ?? null;
  });

  await migrateFromAsyncStorage();

  assert.equal(mmkv.store.get('auth-storage'), '{"user":null}', 'the readable keys still move');
  assert.equal(mmkv.store.has('bible-storage'), false);
  assert.notEqual(
    mmkv.store.get(ASYNC_STORAGE_MIGRATION_COMPLETED_KEY),
    '1',
    'marking the migration done here would strand the reading position in AsyncStorage forever'
  );

  getItem.mock.restore();
  await migrateFromAsyncStorage();

  assert.equal(mmkv.store.get('bible-storage'), '{"state":{"currentBook":"JHN"}}');
  assert.equal(mmkv.store.get('auth-storage'), '{"user":null}');
  assert.equal(mmkv.store.get(ASYNC_STORAGE_MIGRATION_COMPLETED_KEY), '1');
  asyncStore.delete('bible-storage');
});

test('a key MMKV refuses to store is retried on the next launch', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { migrateFromAsyncStorage } = await import('./migrateFromAsyncStorage');
  mmkv.store.clear();
  const set = t.mock.method(mmkv.mmkvInstance, 'set', (key: string, value: string) => {
    if (key === 'auth-storage') throw new Error('MMKV: no space left on device');
    mmkv.store.set(key, String(value));
  });

  await migrateFromAsyncStorage();

  assert.equal(mmkv.store.has('auth-storage'), false);
  assert.notEqual(mmkv.store.get(ASYNC_STORAGE_MIGRATION_COMPLETED_KEY), '1');

  set.mock.restore();
  await migrateFromAsyncStorage();

  assert.equal(mmkv.store.get('auth-storage'), '{"user":null}');
  assert.equal(mmkv.store.get(ASYNC_STORAGE_MIGRATION_COMPLETED_KEY), '1');
});
