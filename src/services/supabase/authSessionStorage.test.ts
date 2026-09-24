import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSessionStorage, isAuthSessionStorageUnreadable } from './authSessionStorage';

// The adapter's failure state (reported once, last read failed) is per process, as
// the keychain is, so the tests below run in order against one shared history.

const keychainFailure = Object.assign(new Error('Keychain unavailable'), {
  code: 'ERR_KEY_CHAIN',
});

function createKeychain() {
  const store = new Map<string, string>();
  const state = { failing: false };
  const guard = () => {
    if (state.failing) throw keychainFailure;
  };
  return {
    store,
    state,
    secureStore: {
      getItemAsync: async (key: string) => {
        guard();
        return store.get(key) ?? null;
      },
      setItemAsync: async (key: string, value: string) => {
        guard();
        store.set(key, value);
      },
      deleteItemAsync: async (key: string) => {
        guard();
        store.delete(key);
      },
    },
  };
}

const reports: unknown[] = [];
const keychain = createKeychain();
const storage = createAuthSessionStorage(keychain.secureStore, (error) => reports.push(error));

test('a working keychain stores, reads and deletes the session', async () => {
  await storage.setItem('session', 'token-1');
  assert.equal(await storage.getItem('session'), 'token-1');
  await storage.removeItem('session');

  assert.equal(await storage.getItem('session'), null);
  assert.equal(keychain.store.has('session'), false);
  assert.equal(isAuthSessionStorageUnreadable(), false);
  assert.deepEqual(reports, []);
});

test('an unreadable keychain answers no session and is reported once', async () => {
  keychain.store.set('session', 'token-1');
  keychain.state.failing = true;

  assert.equal(await storage.getItem('session'), null);
  assert.equal(await storage.getItem('session'), null);

  assert.equal(isAuthSessionStorageUnreadable(), true);
  assert.deepEqual(reports, [keychainFailure]);
});

test('writes and deletes the keychain refuses resolve without another report', async () => {
  await assert.doesNotReject(storage.setItem('other', 'value'));
  await assert.doesNotReject(storage.removeItem('other'));

  assert.deepEqual(reports, [keychainFailure]);
});

test('a session the keychain would not store stays readable for this launch', async () => {
  await storage.setItem('session', 'token-2');

  assert.equal(await storage.getItem('session'), 'token-2');
  assert.equal(isAuthSessionStorageUnreadable(), false);
});

test('a session the keychain would not delete is not read back after sign-out', async () => {
  await storage.removeItem('session');

  assert.equal(await storage.getItem('session'), null);
  // The keychain still holds the old token; the removal is remembered instead.
  assert.equal(keychain.store.get('session'), 'token-1');
});

test('a value held in memory reaches the keychain once it answers again', async () => {
  await storage.setItem('session', 'token-3');
  keychain.state.failing = false;

  assert.equal(await storage.getItem('session'), 'token-3');
  assert.equal(keychain.store.get('session'), 'token-3');

  // Flushed: the next read goes back to the keychain.
  keychain.store.set('session', 'token-4');
  assert.equal(await storage.getItem('session'), 'token-4');
});

test('a removal held in memory reaches the keychain once it answers again', async () => {
  keychain.state.failing = true;
  await storage.removeItem('session');
  keychain.state.failing = false;

  assert.equal(await storage.getItem('session'), null);
  assert.equal(keychain.store.has('session'), false);
});
