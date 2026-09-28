import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAuthSessionStorage,
  isAuthSessionStorageUnreadable,
  type AuthSessionRemovalIntents,
} from './authSessionStorage';

function fixture() {
  const values = new Map<string, string>([['session', 'account-a']]);
  const markers = new Set<string>();
  const state = {
    refuseDelete: false,
    leaveValue: false,
    failRead: false,
    failWrite: false,
    failMark: false,
    failIntentRead: false,
    failClear: false,
  };
  const native = {
    getItemAsync: async (key: string) => {
      if (state.failRead) throw new Error('native read failed');
      return values.get(key) ?? null;
    },
    setItemAsync: async (key: string, value: string) => {
      if (state.failWrite) throw new Error('native write failed');
      values.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      if (state.refuseDelete) throw new Error('native delete failed');
      if (!state.leaveValue) values.delete(key);
    },
  };
  const intents: AuthSessionRemovalIntents = {
    has: (key) => {
      if (state.failIntentRead) throw new Error('intent read failed');
      return markers.has(key);
    },
    mark: (key) => {
      if (state.failMark) throw new Error('intent write failed');
      markers.add(key);
    },
    clear: (key) => {
      if (state.failClear) throw new Error('intent clear failed');
      markers.delete(key);
    },
  };
  const create = () => createAuthSessionStorage(native, () => {}, {}, intents);
  return { values, markers, state, intents, native, create };
}

test('diagnostic reporter failure cannot reject background storage or disclose session values', async () => {
  const errors: unknown[] = [];
  const unavailable = new Error('storage unavailable');
  const storage = createAuthSessionStorage(
    {
      getItemAsync: async () => {
        throw unavailable;
      },
      setItemAsync: async () => {
        throw unavailable;
      },
      deleteItemAsync: async () => {
        throw unavailable;
      },
    },
    (error) => {
      errors.push(error);
      throw new Error('reporter failed');
    }
  );
  await storage.setItem('session', 'private-session-value');
  assert.equal(await storage.getItem('session'), 'private-session-value');
  await storage.removeItem('session');
  assert.equal(await storage.getItem('session'), null);
  assert.deepEqual(errors, [unavailable]);
});

test('failed native removal is durably masked across fresh adapters and retried', async () => {
  const f = fixture();
  f.state.refuseDelete = true;
  await f.create().removeItemDurably!('session');
  assert.equal(f.markers.has('session'), true);
  assert.equal(await f.create().getItem('session'), null);
  assert.equal(f.values.get('session'), 'account-a');
  f.state.refuseDelete = false;
  assert.equal(await f.create().getItem('session'), null);
  assert.equal(f.values.has('session'), false);
  assert.equal(f.markers.has('session'), false);
});

for (const failure of ['leaveValue', 'failRead'] as const) {
  test(`resolved native deletion with ${failure} does not retire the intent`, async () => {
    const f = fixture();
    f.state[failure] = true;
    await f.create().removeItemDurably!('session');
    assert.equal(f.markers.has('session'), true);
    assert.equal(await f.create().getItem('session'), null);
    f.state[failure] = false;
    assert.equal(await f.create().getItem('session'), null);
    assert.equal(f.markers.size, 0);
  });
}

test('intent admission failure rejects explicit sign-out before native deletion', async () => {
  const f = fixture();
  f.state.failMark = true;
  await assert.rejects(f.create().removeItemDurably!('session'), {
    name: 'AuthSessionRemovalNotAdmittedError',
  });
  assert.equal(f.values.get('session'), 'account-a');
  assert.equal(f.markers.size, 0);
});

test('unreadable durable intents fail closed without reading a retained credential', async () => {
  const f = fixture();
  f.state.failIntentRead = true;
  assert.equal(await f.create().getItem('session'), null);
  assert.equal(isAuthSessionStorageUnreadable(), true);
  assert.equal(f.values.get('session'), 'account-a');
});

test('failed replacement retains masking, successful replacement safely supersedes it', async () => {
  const f = fixture();
  const storage = f.create();
  f.state.refuseDelete = true;
  await storage.removeItemDurably!('session');
  await storage.setItem('session', 'account-b');
  assert.equal(await storage.getItem('session'), 'account-b');
  assert.equal(await f.create().getItem('session'), null);
  assert.equal(f.values.get('session'), 'account-a');
  f.state.refuseDelete = false;
  await storage.setItem('session', 'account-b');
  assert.equal(f.markers.size, 0);
  assert.equal(await f.create().getItem('session'), 'account-b');
});

test('failed first replacement write masks an older credential across restart', async () => {
  const f = fixture();
  f.state.refuseDelete = true;
  await f.create().setItem('session', 'account-b');
  assert.equal(await f.create().getItem('session'), null);
  assert.equal(f.values.get('session'), 'account-a');
});

test('marker retirement failure remains masked and retries safely', async () => {
  const f = fixture();
  f.state.failClear = true;
  await f.create().removeItemDurably!('session');
  assert.equal(f.markers.has('session'), true);
  assert.equal(await f.create().getItem('session'), null);
  f.state.failClear = false;
  assert.equal(await f.create().getItem('session'), null);
  assert.equal(f.markers.size, 0);
});

test('ordinary Supabase background operations never reject on intent failure', async () => {
  const f = fixture();
  f.state.failMark = true;
  f.state.refuseDelete = true;
  const storage = f.create();
  await assert.doesNotReject(storage.setItem('session', 'account-b'));
  assert.equal(await storage.getItem('session'), 'account-b');
  await assert.doesNotReject(storage.removeItem('session'));
  assert.equal(await storage.getItem('session'), null);
  assert.equal(f.markers.size, 0, 'failed admission must not claim durable deletion');
});
