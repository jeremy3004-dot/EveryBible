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

test('a delayed session removal completes before a newer session write', async () => {
  const values = new Map<string, string>();
  let delayDelete = false;
  let finish!: () => void;
  let started!: () => void;
  const deletionStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const adapter = createAuthSessionStorage(
    {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => {
        values.set(key, value);
      },
      deleteItemAsync: async (key) => {
        if (delayDelete) {
          started();
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
        }
        values.delete(key);
      },
    },
    () => {}
  );
  await adapter.setItem('session', 'account-a');
  delayDelete = true;
  const removing = adapter.removeItem('session');
  await deletionStarted;
  let wroteNext = false;
  const writing = adapter.setItem('session', 'account-b').then(() => {
    wroteNext = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(wroteNext, false, 'the newer write must wait for the old deletion');
  finish();
  await Promise.all([removing, writing]);
  assert.equal(await adapter.getItem('session'), 'account-b');
});

test('a failed removal does not poison a later session write or read', async () => {
  const values = new Map<string, string>([['session', 'account-a']]);
  let failDelete = true;
  const adapter = createAuthSessionStorage(
    {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => {
        values.set(key, value);
      },
      deleteItemAsync: async (key) => {
        if (failDelete) throw new Error('delete failed');
        values.delete(key);
      },
    },
    () => {}
  );
  await adapter.removeItem('session');
  failDelete = false;
  const writing = adapter.setItem('session', 'account-b');
  const reading = adapter.getItem('session');
  await writing;
  assert.equal(await reading, 'account-b');
  assert.equal(await adapter.getItem('session'), 'account-b');
});

type AtomicStorage = ReturnType<typeof createAuthSessionStorage> & {
  updateItemIfCurrent: (
    key: string,
    update: (current: string | null) => string | undefined
  ) => Promise<boolean>;
};
const storedSession = (uid: string, token: string, avatar = 'old') =>
  JSON.stringify({
    access_token: token,
    refresh_token: `refresh-${token}`,
    user: { id: uid, avatar },
  });
const patchAAvatar = (current: string | null) => {
  const session = current ? JSON.parse(current) : null;
  return session?.user.id === 'a'
    ? JSON.stringify({ ...session, user: { ...session.user, avatar: 'new' } })
    : undefined;
};

test('atomic metadata patch skips B credentials saved ahead even when the application owner still says A', async () => {
  const native = createKeychain();
  const adapter = createAuthSessionStorage(native.secureStore, () => {}) as AtomicStorage;
  await adapter.setItem('session', storedSession('a', 'access-a'));
  const b = adapter.setItem('session', storedSession('b', 'access-b'));
  assert.equal(typeof adapter.updateItemIfCurrent, 'function');
  const updated = adapter.updateItemIfCurrent('session', patchAAvatar);
  await b;
  assert.equal(await updated, false);
  assert.equal(await adapter.getItem('session'), storedSession('b', 'access-b'));
});

test('atomic metadata patch preserves the latest same-account refreshed credentials', async () => {
  const native = createKeychain();
  const adapter = createAuthSessionStorage(native.secureStore, () => {}) as AtomicStorage;
  await adapter.setItem('session', storedSession('a', 'old-access'));
  const refresh = adapter.setItem('session', storedSession('a', 'fresh-access'));
  assert.equal(typeof adapter.updateItemIfCurrent, 'function');
  const updated = adapter.updateItemIfCurrent('session', patchAAvatar);
  await refresh;
  assert.equal(await updated, true);
  assert.equal(await adapter.getItem('session'), storedSession('a', 'fresh-access', 'new'));
});

test('a B save admitted during a native metadata write remains the final credential', async () => {
  const native = createKeychain();
  let delayWrite = false;
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((done) => (release = done));
  const ready = new Promise<void>((done) => (started = done));
  const adapter = createAuthSessionStorage(
    {
      ...native.secureStore,
      setItemAsync: async (key, value) => {
        if (delayWrite) {
          started();
          await gate;
        }
        native.store.set(key, value);
      },
    },
    () => {}
  ) as AtomicStorage;
  await adapter.setItem('session', storedSession('a', 'access-a'));
  delayWrite = true;
  assert.equal(typeof adapter.updateItemIfCurrent, 'function');
  const patch = adapter.updateItemIfCurrent('session', patchAAvatar);
  await ready;
  const b = adapter.setItem('session', storedSession('b', 'access-b'));
  release();
  await Promise.all([patch, b]);
  assert.equal(await adapter.getItem('session'), storedSession('b', 'access-b'));
});

test('atomic metadata patch cannot recreate a removed session', async () => {
  const native = createKeychain();
  const adapter = createAuthSessionStorage(native.secureStore, () => {}) as AtomicStorage;
  await adapter.setItem('session', storedSession('a', 'access-a'));
  const removal = adapter.removeItem('session');
  assert.equal(typeof adapter.updateItemIfCurrent, 'function');
  const patch = adapter.updateItemIfCurrent('session', patchAAvatar);
  await removal;
  assert.equal(await patch, false);
  assert.equal(await adapter.getItem('session'), null);
});

test('atomic metadata patch uses a pending refreshed value rather than the retained native copy', async () => {
  const native = createKeychain();
  const adapter = createAuthSessionStorage(native.secureStore, () => {}) as AtomicStorage;
  await adapter.setItem('session', storedSession('a', 'old-access'));
  native.state.failing = true;
  await adapter.setItem('session', storedSession('a', 'fresh-access'));
  assert.equal(await adapter.updateItemIfCurrent('session', patchAAvatar), true);
  native.state.failing = false;
  assert.equal(await adapter.getItem('session'), storedSession('a', 'fresh-access', 'new'));
});

test('a throwing metadata transform does not poison the next credential write', async () => {
  const native = createKeychain();
  const adapter = createAuthSessionStorage(native.secureStore, () => {}) as AtomicStorage;
  await adapter.setItem('session', storedSession('a', 'access-a'));
  await assert.rejects(
    adapter.updateItemIfCurrent('session', () => {
      throw new Error('bad transform');
    })
  );
  await adapter.setItem('session', storedSession('b', 'access-b'));
  assert.equal(await adapter.getItem('session'), storedSession('b', 'access-b'));
});
