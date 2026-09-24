import test, { mock, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';
import type * as SyncStatusStore from './syncStatusStore';

const STORAGE_KEY = 'sync-status-storage';

// The store is persisted, so it hydrates from this in-memory MMKV the moment
// the module is first imported.
const mmkv = mockMmkvStorage(mock, {
  [STORAGE_KEY]: JSON.stringify({
    state: { lastSuccessfulSyncAtByUser: { 'user-a': '2026-09-20T08:00:00.000Z' } },
    version: 0,
  }),
});

let store: typeof SyncStatusStore;
let hydratedOnFirstImport: string | null;

const persisted = (): unknown => {
  const raw = mmkv.store.get(STORAGE_KEY);
  return raw ? JSON.parse(raw).state : undefined;
};

const rehydrateFrom = async (raw: string | null) => {
  if (raw === null) {
    mmkv.store.delete(STORAGE_KEY);
  } else {
    mmkv.store.set(STORAGE_KEY, raw);
  }
  await store.useSyncStatusStore.persist.rehydrate();
};

const lastSyncFor = (userId: string | null) =>
  store.selectLastSuccessfulSyncAt(userId)(store.useSyncStatusStore.getState());

before(async () => {
  store = await import('./syncStatusStore');
  hydratedOnFirstImport = lastSyncFor('user-a');
});

beforeEach(async () => {
  await rehydrateFrom(JSON.stringify({ state: { lastSuccessfulSyncAtByUser: {} }, version: 0 }));
});

test('an account’s last successful sync survives a relaunch', () => {
  assert.equal(hydratedOnFirstImport, '2026-09-20T08:00:00.000Z');
});

test('an account that has never synced on this device has no sync time', () => {
  assert.equal(lastSyncFor('user-a'), null);
});

test('a guest has no sync time, even after an account synced', () => {
  store.useSyncStatusStore.getState().recordSuccessfulSync('user-a', '2026-09-24T10:00:00.000Z');

  assert.equal(lastSyncFor(null), null);
});

test('recording a sync stamps only that account and writes it through to storage', () => {
  store.useSyncStatusStore.getState().recordSuccessfulSync('user-a', '2026-09-24T10:00:00.000Z');

  assert.equal(lastSyncFor('user-a'), '2026-09-24T10:00:00.000Z');
  assert.equal(lastSyncFor('user-b'), null, 'account B never sees account A’s sync time');
  assert.deepEqual(persisted(), {
    lastSuccessfulSyncAtByUser: { 'user-a': '2026-09-24T10:00:00.000Z' },
  });
});

test('each account keeps its own time when both sync on the same device', () => {
  const { recordSuccessfulSync } = store.useSyncStatusStore.getState();
  recordSuccessfulSync('user-a', '2026-09-24T10:00:00.000Z');
  recordSuccessfulSync('user-b', '2026-09-24T11:00:00.000Z');
  recordSuccessfulSync('user-a', '2026-09-24T12:00:00.000Z');

  assert.equal(lastSyncFor('user-a'), '2026-09-24T12:00:00.000Z');
  assert.equal(lastSyncFor('user-b'), '2026-09-24T11:00:00.000Z');
});

test('recording without a time stamps the current wall clock', (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-24T09:30:00.000Z') });

  store.useSyncStatusStore.getState().recordSuccessfulSync('user-a');

  assert.equal(lastSyncFor('user-a'), '2026-09-24T09:30:00.000Z');
});

test('a corrupted blob hydrates as never synced instead of crashing the screen', async () => {
  await rehydrateFrom(
    JSON.stringify({
      state: { lastSuccessfulSyncAtByUser: { 'user-a': 42, 'user-b': '2026-09-24T11:00:00.000Z' } },
      version: 0,
    })
  );
  assert.equal(lastSyncFor('user-a'), null);
  assert.equal(lastSyncFor('user-b'), '2026-09-24T11:00:00.000Z');

  await rehydrateFrom(
    JSON.stringify({ state: { lastSuccessfulSyncAtByUser: 'nope' }, version: 0 })
  );
  assert.equal(lastSyncFor('user-b'), null);
});

test('an inherited property name is not mistaken for an account’s sync time', () => {
  assert.equal(lastSyncFor('constructor'), null);
  assert.equal(lastSyncFor('__proto__'), null);
});
