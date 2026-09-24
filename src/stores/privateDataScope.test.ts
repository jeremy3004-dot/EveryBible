import test, { before, beforeEach, mock, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { mockMmkvStorage } from '../testing/mockModules';

// One mock configuration per file. The scope module only needs MMKV; the real
// private stores are covered by privateDataAccounts.test.ts. Here two small
// persisted stores stand in for them so every storage transition is visible.
const mmkv = mockMmkvStorage(mock);

type Scope = typeof import('./privateDataScope');
let scope: Scope;

interface NotesState {
  notes: string[];
  addNote: (note: string) => void;
}

interface LessonsState {
  lessons: string[];
  completeLesson: (lesson: string) => void;
}

const union = (account: string[], guest: string[]) => [
  ...account,
  ...guest.filter((item) => !account.includes(item)),
];

// Real store names, so the existing-install migration treats them as the
// legacy keys it moves.
const NOTES = 'annotation-storage';
const LESSONS = 'gather-storage';

let useNotes: ReturnType<typeof createNotesStore>;
let useLessons: ReturnType<typeof createLessonsStore> | null = null;
let loadStoresCalls = 0;

function createNotesStore() {
  const store = create<NotesState>()(
    persist(
      (set) => ({
        notes: [],
        addNote: (note) => set((state) => ({ notes: [...state.notes, note] })),
      }),
      { name: NOTES, storage: createJSONStorage(() => scope.privateDataStorage) }
    )
  );
  scope.registerPrivateDataStore(store, (account, guest) => ({
    notes: union(account.notes, guest.notes),
  }));
  return store;
}

function createLessonsStore() {
  const store = create<LessonsState>()(
    persist(
      (set) => ({
        lessons: [],
        completeLesson: (lesson) => set((state) => ({ lessons: [...state.lessons, lesson] })),
      }),
      { name: LESSONS, storage: createJSONStorage(() => scope.privateDataStorage) }
    )
  );
  scope.registerPrivateDataStore(store, (account, guest) => ({
    lessons: union(account.lessons, guest.lessons),
  }));
  return store;
}

// Mirrors authStore: the lessons store is loaded lazily, and a guest adoption
// must load it first so its guest bucket is merged too.
const switchOwner = (owner: string | null) =>
  scope.switchPrivateDataOwner(owner, {
    loadStores: () => {
      loadStoresCalls += 1;
      useLessons ??= createLessonsStore();
    },
  });

const blob = (state: Record<string, unknown>, version = 0) => JSON.stringify({ state, version });
const stored = (key: string) => {
  const raw = mmkv.store.get(key);
  return raw === undefined ? undefined : (JSON.parse(raw).state as Record<string, unknown>);
};
const userKey = (name: string, uid: string) => scope.privateDataStorageKey(name, uid);
const marker = () => JSON.parse(mmkv.store.get(scope.PRIVATE_DATA_OWNER_KEY) ?? 'null');
const authStorage = (lastSyncedUserId: string | null) =>
  JSON.stringify({ state: { preferences: {}, lastSyncedUserId }, version: 3 });

// Simulates a cold start: the owner is re-resolved from disk and every loaded
// store re-reads its bucket, exactly as a fresh process would.
const relaunch = () => scope.restartPrivateDataScopeForTests();

// An install from before account scoping: device-wide keys, no owner marker.
const seedInstallFromBeforeScoping = (lastSyncedUserId: string | null) => {
  mmkv.store.delete(scope.PRIVATE_DATA_OWNER_KEY);
  mmkv.store.set('auth-storage', authStorage(lastSyncedUserId));
};

before(async () => {
  scope = await import('./privateDataScope');
  useNotes = createNotesStore();
});

beforeEach(() => {
  mmkv.store.clear();
  loadStoresCalls = 0;
  relaunch();
});

test('a fresh signed-out install keeps private data in the guest bucket', () => {
  useNotes.getState().addNote('guest note');

  assert.deepEqual(stored(NOTES), { notes: ['guest note'] });
  assert.deepEqual(marker(), { owner: null });
  assert.equal(scope.getPrivateDataOwner(), null);
});

test('the first sign-in adopts the guest data into the account and empties the guest bucket', () => {
  useNotes.getState().addNote('guest note');

  switchOwner('user-a');

  assert.deepEqual(useNotes.getState().notes, ['guest note']);
  assert.deepEqual(stored(userKey(NOTES, 'user-a')), { notes: ['guest note'] });
  assert.equal(mmkv.store.has(NOTES), false);
  assert.deepEqual(marker(), { owner: 'user-a' });
});

test('adoption merges guest data into data the account already had on this device', () => {
  mmkv.store.set(userKey(NOTES, 'user-a'), blob({ notes: ['a note'] }));
  useNotes.getState().addNote('guest note');

  switchOwner('user-a');

  assert.deepEqual(useNotes.getState().notes, ['a note', 'guest note']);
  assert.deepEqual(stored(userKey(NOTES, 'user-a')), { notes: ['a note', 'guest note'] });
});

test('adoption loads lazily-imported private stores so their guest data is adopted too', () => {
  mmkv.store.set(LESSONS, blob({ lessons: ['guest lesson'] }));
  relaunch();

  switchOwner('user-a');

  assert.equal(loadStoresCalls, 1);
  assert.deepEqual(useLessons?.getState().lessons, ['guest lesson']);
  assert.deepEqual(stored(userKey(LESSONS, 'user-a')), { lessons: ['guest lesson'] });
  assert.equal(mmkv.store.has(LESSONS), false);
});

test('signing out hides the account data and shows the guest bucket; nothing is deleted', () => {
  switchOwner('user-a');
  useNotes.getState().addNote('private to a');

  switchOwner(null);

  assert.deepEqual(useNotes.getState().notes, []);
  assert.deepEqual(stored(userKey(NOTES, 'user-a')), { notes: ['private to a'] });
  assert.deepEqual(marker(), { owner: null });

  useNotes.getState().addNote('signed-out note');
  assert.deepEqual(stored(NOTES), { notes: ['signed-out note'] });
  assert.deepEqual(stored(userKey(NOTES, 'user-a')), { notes: ['private to a'] });
});

test('another account never sees the first account data, and it returns for the first account', () => {
  switchOwner('user-a');
  useNotes.getState().addNote('private to a');
  switchOwner(null);

  switchOwner('user-b');
  assert.deepEqual(useNotes.getState().notes, []);
  useNotes.getState().addNote('private to b');

  switchOwner(null);
  switchOwner('user-a');
  assert.deepEqual(useNotes.getState().notes, ['private to a']);

  switchOwner(null);
  switchOwner('user-b');
  assert.deepEqual(useNotes.getState().notes, ['private to b']);
});

test('a direct account swap without a sign-out does not adopt anything', () => {
  switchOwner('user-a');
  useNotes.getState().addNote('private to a');
  loadStoresCalls = 0;

  switchOwner('user-b');

  assert.equal(loadStoresCalls, 0);
  assert.deepEqual(useNotes.getState().notes, []);
  assert.equal(stored(userKey(NOTES, 'user-b')), undefined);
  assert.deepEqual(stored(userKey(NOTES, 'user-a')), { notes: ['private to a'] });
});

test('switching to the current owner is a no-op', () => {
  switchOwner('user-a');
  useNotes.getState().addNote('private to a');
  loadStoresCalls = 0;

  switchOwner('user-a');

  assert.equal(loadStoresCalls, 0);
  assert.deepEqual(useNotes.getState().notes, ['private to a']);
});

test('a relaunch without any auth change keeps showing the persisted owner data', () => {
  switchOwner('user-a');
  useNotes.getState().addNote('private to a');

  relaunch();

  assert.equal(scope.getPrivateDataOwner(), 'user-a');
  assert.deepEqual(useNotes.getState().notes, ['private to a']);
});

test('a relaunch reads only the active owner bucket', () => {
  mmkv.store.set(scope.PRIVATE_DATA_OWNER_KEY, JSON.stringify({ owner: 'user-a' }));
  mmkv.store.set(userKey(NOTES, 'user-a'), blob({ notes: ['a'] }));
  mmkv.store.set(userKey(NOTES, 'user-b'), blob({ notes: ['b'] }));
  mmkv.store.set(NOTES, blob({ notes: ['guest'] }));
  const reads: string[] = [];
  const getString = mmkv.mmkvInstance.getString;
  mmkv.mmkvInstance.getString = (key: string) => {
    reads.push(key);
    return getString(key);
  };

  try {
    relaunch();
  } finally {
    mmkv.mmkvInstance.getString = getString;
  }

  assert.deepEqual(useNotes.getState().notes, ['a']);
  assert.equal(reads.includes(userKey(NOTES, 'user-b')), false);
  assert.equal(reads.includes(NOTES), false);
});

test('an existing install moves device data to the signed-in account', () => {
  seedInstallFromBeforeScoping('user-a');
  mmkv.store.set(NOTES, blob({ notes: ['old note'] }));
  mmkv.store.set(LESSONS, blob({ lessons: ['old lesson'] }));

  relaunch();

  assert.equal(scope.getPrivateDataOwner(), 'user-a');
  assert.deepEqual(useNotes.getState().notes, ['old note']);
  assert.deepEqual(stored(userKey(NOTES, 'user-a')), { notes: ['old note'] });
  assert.deepEqual(stored(userKey(LESSONS, 'user-a')), { lessons: ['old lesson'] });
  assert.equal(mmkv.store.has(NOTES), false);
  assert.equal(mmkv.store.has(LESSONS), false);
  assert.deepEqual(marker(), { owner: 'user-a' });
});

test('the existing-install migration is idempotent across relaunches', () => {
  seedInstallFromBeforeScoping('user-a');
  mmkv.store.set(NOTES, blob({ notes: ['old note'] }));
  relaunch();

  relaunch();
  relaunch();

  assert.deepEqual(useNotes.getState().notes, ['old note']);
  assert.deepEqual(stored(userKey(NOTES, 'user-a')), { notes: ['old note'] });
  assert.equal(mmkv.store.has(NOTES), false);
});

test('an existing signed-out install keeps its data as the guest bucket', () => {
  seedInstallFromBeforeScoping(null);
  mmkv.store.set(NOTES, blob({ notes: ['old note'] }));

  relaunch();

  assert.equal(scope.getPrivateDataOwner(), null);
  assert.deepEqual(useNotes.getState().notes, ['old note']);
  assert.deepEqual(stored(NOTES), { notes: ['old note'] });
  assert.deepEqual(marker(), { owner: null });
});

test('an existing install with unreadable auth storage is treated as signed out', () => {
  seedInstallFromBeforeScoping(null);
  mmkv.store.set('auth-storage', '{not json');
  mmkv.store.set(NOTES, blob({ notes: ['old note'] }));

  relaunch();

  assert.equal(scope.getPrivateDataOwner(), null);
  assert.deepEqual(useNotes.getState().notes, ['old note']);
});

test('a migration killed after copying but before deleting finishes without duplicating', () => {
  // State a kill leaves behind: the account copy is written, the device key is
  // still there, and the owner marker was never written.
  seedInstallFromBeforeScoping('user-a');
  mmkv.store.set(NOTES, blob({ notes: ['old note'] }));
  mmkv.store.set(userKey(NOTES, 'user-a'), blob({ notes: ['old note'] }));

  relaunch();

  assert.deepEqual(useNotes.getState().notes, ['old note']);
  assert.equal(mmkv.store.has(NOTES), false);
  assert.deepEqual(marker(), { owner: 'user-a' });
});

test('a migration killed halfway through the stores finishes the rest on the next launch', () => {
  seedInstallFromBeforeScoping('user-a');
  // NOTES already moved; LESSONS not yet.
  mmkv.store.set(userKey(NOTES, 'user-a'), blob({ notes: ['old note'] }));
  mmkv.store.set(LESSONS, blob({ lessons: ['old lesson'] }));

  relaunch();

  assert.deepEqual(stored(userKey(LESSONS, 'user-a')), { lessons: ['old lesson'] });
  assert.equal(mmkv.store.has(LESSONS), false);
  assert.deepEqual(useNotes.getState().notes, ['old note']);
});

test('a migration never overwrites an account bucket that differs from the device copy', () => {
  seedInstallFromBeforeScoping('user-a');
  mmkv.store.set(NOTES, blob({ notes: ['device note'] }));
  mmkv.store.set(userKey(NOTES, 'user-a'), blob({ notes: ['account note'] }));

  relaunch();

  assert.deepEqual(useNotes.getState().notes, ['account note']);
  // The device copy is kept as guest data instead of being thrown away.
  assert.deepEqual(stored(NOTES), { notes: ['device note'] });
});

test('an adoption killed before the owner was saved re-adopts on the next sign-in without duplicates', () => {
  // Kill after the account bucket got the merged copy but before the marker
  // moved: the guest bucket and the old owner are still on disk.
  mmkv.store.set(scope.PRIVATE_DATA_OWNER_KEY, JSON.stringify({ owner: null }));
  mmkv.store.set(NOTES, blob({ notes: ['guest note'] }));
  mmkv.store.set(userKey(NOTES, 'user-a'), blob({ notes: ['a note', 'guest note'] }));
  relaunch();
  assert.deepEqual(useNotes.getState().notes, ['guest note']);

  switchOwner('user-a');

  assert.deepEqual(useNotes.getState().notes, ['a note', 'guest note']);
  assert.equal(mmkv.store.has(NOTES), false);
});

/**
 * Runs a guest adoption into `uid` and kills the app at the first owner-marker
 * write after the account bucket took the merged notes, then relaunches.
 */
const adoptionKilledAfterMerge = (t: TestContext, uid: string) => {
  const write = mmkv.mmkvInstance.set;
  let accountWritten = false;
  const kill = t.mock.method(mmkv.mmkvInstance, 'set', (key: string, value: string) => {
    if (accountWritten && key === scope.PRIVATE_DATA_OWNER_KEY) throw new Error('killed');
    write(key, value);
    if (key === userKey(NOTES, uid)) accountWritten = true;
  });
  assert.throws(() => switchOwner(uid), /killed/);
  kill.mock.restore();
  relaunch();
};

test('an adoption killed after merging never also hands the guest notes to the next account', (t) => {
  useNotes.getState().addNote('guest note');
  adoptionKilledAfterMerge(t, 'user-a');
  assert.deepEqual(stored(userKey(NOTES, 'user-a')), { notes: ['guest note'] });

  switchOwner('user-b');

  assert.deepEqual(useNotes.getState().notes, []);
  assert.equal(stored(userKey(NOTES, 'user-b')), undefined);
  assert.equal(mmkv.store.has(NOTES), false, 'the adoption into user-a was finished');
  assert.deepEqual(stored(userKey(NOTES, 'user-a')), { notes: ['guest note'] });
  switchOwner(null);
  assert.deepEqual(useNotes.getState().notes, []);
  switchOwner('user-a');
  assert.deepEqual(useNotes.getState().notes, ['guest note']);
});

test('an adoption killed after merging is finished once when the same account signs in again', (t) => {
  useNotes.getState().addNote('guest note');
  adoptionKilledAfterMerge(t, 'user-a');
  // Until then nothing changed for the signed-out reader.
  assert.equal(scope.getPrivateDataOwner(), null);
  assert.deepEqual(useNotes.getState().notes, ['guest note']);

  switchOwner('user-a');

  assert.deepEqual(useNotes.getState().notes, ['guest note']);
  assert.equal(mmkv.store.has(NOTES), false);
  assert.deepEqual(marker(), { owner: 'user-a' });
});

test('an adoption killed after the owner was saved clears the adopted guest bucket on launch', () => {
  mmkv.store.set(
    scope.PRIVATE_DATA_OWNER_KEY,
    JSON.stringify({ owner: 'user-a', clearGuest: true })
  );
  mmkv.store.set(NOTES, blob({ notes: ['guest note'] }));
  mmkv.store.set(userKey(NOTES, 'user-a'), blob({ notes: ['guest note'] }));

  relaunch();

  assert.deepEqual(useNotes.getState().notes, ['guest note']);
  assert.equal(mmkv.store.has(NOTES), false);
  assert.deepEqual(marker(), { owner: 'user-a' });

  // Signing out now shows an empty guest bucket, not the adopted notes again.
  switchOwner(null);
  assert.deepEqual(useNotes.getState().notes, []);
});

for (const [label, rawMarker] of [
  ['a non-string owner', '{"owner":42}'],
  ['an empty owner', '{"owner":""}'],
  ['unparseable JSON', '{owner'],
] as const) {
  test(`a malformed owner marker (${label}) falls back to the auth storage owner`, () => {
    seedInstallFromBeforeScoping('user-a');
    // Seeded after the helper, which deletes the marker key.
    mmkv.store.set(scope.PRIVATE_DATA_OWNER_KEY, rawMarker);
    mmkv.store.set(userKey(NOTES, 'user-a'), blob({ notes: ['a'] }));

    relaunch();

    assert.equal(scope.getPrivateDataOwner(), 'user-a');
    assert.deepEqual(useNotes.getState().notes, ['a']);
    assert.deepEqual(marker(), { owner: 'user-a' });
  });
}

test('an existing install whose auth storage has no usable account id stays signed out', () => {
  for (const lastSyncedUserId of ['', 42, undefined]) {
    mmkv.store.clear();
    mmkv.store.set('auth-storage', JSON.stringify({ state: { lastSyncedUserId }, version: 3 }));
    mmkv.store.set(NOTES, blob({ notes: ['device note'] }));

    relaunch();

    assert.equal(scope.getPrivateDataOwner(), null);
    assert.deepEqual(useNotes.getState().notes, ['device note']);
    assert.deepEqual(stored(NOTES), { notes: ['device note'] });
    assert.deepEqual(marker(), { owner: null });
  }
});

test("deleting an account's private data leaves other accounts and the guest bucket", () => {
  switchOwner('user-a');
  useNotes.getState().addNote('private to a');
  switchOwner('user-b');
  useNotes.getState().addNote('private to b');
  switchOwner(null);
  useNotes.getState().addNote('guest note');

  scope.deletePrivateDataOf('user-a');

  assert.equal(stored(userKey(NOTES, 'user-a')), undefined);
  assert.deepEqual(stored(userKey(NOTES, 'user-b')), { notes: ['private to b'] });
  assert.deepEqual(stored(NOTES), { notes: ['guest note'] });
  assert.deepEqual(useNotes.getState().notes, ['guest note']);
});

test('deleting the showing account switches to the guest bucket so nothing writes it back', () => {
  switchOwner('user-a');
  useNotes.getState().addNote('private to a');

  scope.deletePrivateDataOf('user-a');
  useNotes.getState().addNote('signed-out note');

  assert.equal(scope.getPrivateDataOwner(), null);
  assert.equal(stored(userKey(NOTES, 'user-a')), undefined);
  assert.deepEqual(stored(NOTES), { notes: ['signed-out note'] });
});

test("clearing a private store's storage removes only the active owner's bucket", async () => {
  switchOwner(null);
  useNotes.getState().addNote('guest note');
  switchOwner('user-b');
  switchOwner('user-a');
  useNotes.getState().addNote('private to a');

  await useNotes.persist.clearStorage();

  assert.equal(stored(userKey(NOTES, 'user-a')), undefined);
  assert.deepEqual(stored(userKey(NOTES, 'user-b')), { notes: ['guest note'] });
});

test('a persist write that would not change the bucket does not rewrite MMKV', (t) => {
  switchOwner('user-a');
  useNotes.getState().addNote('once');
  const set = t.mock.method(mmkv.mmkvInstance, 'set');

  // Replaces the state with an equal value: persist serialises the same blob.
  useNotes.setState({ notes: ['once'] });

  assert.equal(set.mock.callCount(), 0);
  useNotes.getState().addNote('twice');
  assert.deepEqual(
    set.mock.calls.map((call) => call.arguments[0]),
    [userKey(NOTES, 'user-a')]
  );
});

// ─── Native failures ──────────────────────────────────────────────────────────

// A JSI call that throws for one key, as a damaged or full MMKV file does.
const failReadsOf = (t: TestContext, key: string) => {
  const read = mmkv.mmkvInstance.getString;
  return t.mock.method(mmkv.mmkvInstance, 'getString', (candidate: string) => {
    if (candidate === key) throw new Error('MMKV: failed to read');
    return read(candidate);
  });
};
const failWritesOf = (t: TestContext, key: string) => {
  const write = mmkv.mmkvInstance.set;
  return t.mock.method(mmkv.mmkvInstance, 'set', (candidate: string, value: string) => {
    if (candidate === key) throw new Error('MMKV: no space left on device');
    write(candidate, value);
  });
};

test('a private store action still succeeds when MMKV cannot write, keeping the change in memory', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  useNotes.getState().addNote('saved');
  const fault = failWritesOf(t, NOTES);

  // Zustand persists inside set(), so a throw here escaped from the press handler.
  assert.doesNotThrow(() => useNotes.getState().addNote('unsaved'));
  assert.deepEqual(useNotes.getState().notes, ['saved', 'unsaved']);
  assert.deepEqual(stored(NOTES), { notes: ['saved'] });
  assert.ok(warn.mock.callCount() > 0, 'the failed write is reported, not silently dropped');

  fault.mock.restore();
  useNotes.getState().addNote('later');
  assert.deepEqual(stored(NOTES), { notes: ['saved', 'unsaved', 'later'] });
});

test('a private bucket that could not be read is not overwritten by the defaults', (t) => {
  t.mock.method(console, 'warn', () => {});
  mmkv.store.set(NOTES, blob({ notes: ['saved'] }));
  const fault = failReadsOf(t, NOTES);
  assert.doesNotThrow(() => relaunch());
  fault.mock.restore();
  assert.deepEqual(useNotes.getState().notes, []);

  useNotes.getState().addNote('after a failed read');

  assert.deepEqual(stored(NOTES), { notes: ['saved'] });
  relaunch();
  assert.deepEqual(useNotes.getState().notes, ['saved'], 'the next successful read restores it');
  useNotes.getState().addNote('new');
  assert.deepEqual(stored(NOTES), { notes: ['saved', 'new'] }, 'once read, writes resume');
});

test('a private store write still happens when the unchanged-payload check cannot read MMKV', (t) => {
  t.mock.method(console, 'warn', () => {});
  useNotes.getState().addNote('first');
  failReadsOf(t, NOTES);

  assert.doesNotThrow(() => useNotes.getState().addNote('second'));
  assert.deepEqual(JSON.parse(mmkv.store.get(NOTES) ?? '{}').state, {
    notes: ['first', 'second'],
  });
});

test('a sign-in whose account bucket cannot be written keeps the guest data on disk', (t) => {
  t.mock.method(console, 'warn', () => {});
  useNotes.getState().addNote('guest note');
  failWritesOf(t, userKey(NOTES, 'user-a'));

  assert.doesNotThrow(() => switchOwner('user-a'));

  assert.deepEqual(useNotes.getState().notes, ['guest note']);
  assert.deepEqual(stored(NOTES), { notes: ['guest note'] }, 'the only copy is not deleted');
});

test('a sign-in whose account bucket cannot be read keeps the guest data on disk', (t) => {
  t.mock.method(console, 'warn', () => {});
  mmkv.store.set(userKey(NOTES, 'user-a'), blob({ notes: ['a note'] }));
  useNotes.getState().addNote('guest note');
  failReadsOf(t, userKey(NOTES, 'user-a'));

  assert.doesNotThrow(() => switchOwner('user-a'));

  assert.deepEqual(stored(userKey(NOTES, 'user-a')), { notes: ['a note'] });
  assert.deepEqual(stored(NOTES), { notes: ['guest note'] }, 'the only copy is not deleted');
});

test('registering a store without a persist name is rejected', () => {
  const unnamed = Object.assign(
    create(() => ({ notes: [] as string[] })),
    {
      persist: { getOptions: () => ({}), rehydrate: () => {} },
    }
  );

  assert.throws(
    () => scope.registerPrivateDataStore(unnamed, (account) => account),
    /has no persist name/
  );
});
