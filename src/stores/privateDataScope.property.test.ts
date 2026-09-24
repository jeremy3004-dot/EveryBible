import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { mockMmkvStorage } from '../testing/mockModules';

// ---------------------------------------------------------------------------
// Model-based randomised test of account-scoped private data
// (privateDataScope.ts): arbitrary sequences of guest use, sign-in, sign-out,
// switching accounts, relaunches, Clear cache, account deletion and an app kill
// in the middle of a guest adoption, run against the real scope module (MMKV
// faked) and a plain model of who owns what.
//
// CI runs a fixed seed. To explore further locally:
//   FC_SEED=$RANDOM FC_RUNS=2000 node --test --experimental-test-module-mocks \
//     --import tsx src/stores/privateDataScope.property.test.ts
// ---------------------------------------------------------------------------

const FC_PARAMS = {
  seed: Number(process.env.FC_SEED ?? 20260924),
  numRuns: Number(process.env.FC_RUNS ?? 150),
};

const mmkv = mockMmkvStorage(mock);

type Scope = typeof import('./privateDataScope');
let scope: Scope;
let clearDeviceCaches: typeof import('./deviceCaches').clearDeviceCaches;

// Two real store names, so the pre-scoping migration treats them as legacy keys.
const NOTES = 'annotation-storage';
const LESSONS = 'gather-storage';

interface ListState {
  items: string[];
  add: (item: string) => void;
}

const union = (account: string[], guest: string[]) => [
  ...account,
  ...guest.filter((item) => !account.includes(item)),
];

const createListStore = (name: string) => {
  const store = create<ListState>()(
    persist(
      (set) => ({
        items: [],
        add: (item) => set((state) => ({ items: [...state.items, item] })),
      }),
      { name, storage: createJSONStorage(() => scope.privateDataStorage) }
    )
  );
  scope.registerPrivateDataStore(store, (account, guest) => ({
    items: union(account.items, guest.items),
  }));
  return store;
};

let notes: ReturnType<typeof createListStore>;
let lessons: ReturnType<typeof createListStore>;

before(async () => {
  scope = await import('./privateDataScope');
  ({ clearDeviceCaches } = await import('./deviceCaches'));
  notes = createListStore(NOTES);
  lessons = createListStore(LESSONS);
});

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

type Owner = string | null;
interface Bucket {
  notes: string[];
  lessons: string[];
}
interface Model {
  active: Owner;
  buckets: Map<Owner, Bucket>;
}

const empty = (): Bucket => ({ notes: [], lessons: [] });
const bucketOf = (model: Model, owner: Owner) => model.buckets.get(owner) ?? empty();

const ACCOUNTS = ['user-a', 'user-b', 'user-c'] as const;

type Op =
  | { kind: 'note' }
  | { kind: 'lesson' }
  | { kind: 'signIn'; uid: string }
  | { kind: 'signOut' }
  | { kind: 'relaunch' }
  | { kind: 'clearCache' }
  | { kind: 'deleteAccount' }
  | { kind: 'killDuringAdoption'; uid: string };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 3, arbitrary: fc.constant({ kind: 'note' as const }) },
  { weight: 2, arbitrary: fc.constant({ kind: 'lesson' as const }) },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant('signIn' as const),
      uid: fc.constantFrom(...ACCOUNTS),
    }),
  },
  { weight: 2, arbitrary: fc.constant({ kind: 'signOut' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'relaunch' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'clearCache' as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'deleteAccount' as const }) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('killDuringAdoption' as const),
      uid: fc.constantFrom(...ACCOUNTS),
    }),
  }
);

// An install from before account scoping: device-wide keys, no owner marker.
const legacyStartArb = fc.record({
  lastSyncedUserId: fc.constantFrom<Owner>(null, 'user-a'),
  notes: fc.uniqueArray(fc.constantFrom('legacy-1', 'legacy-2'), { maxLength: 2 }),
});

// ---------------------------------------------------------------------------
// Driving the real module
// ---------------------------------------------------------------------------

const readBucket = (owner: Owner): Bucket => {
  const read = (name: string) => {
    const raw = mmkv.store.get(scope.privateDataStorageKey(name, owner));
    return raw === undefined ? [] : ((JSON.parse(raw).state?.items as string[] | undefined) ?? []);
  };
  return { notes: read(NOTES), lessons: read(LESSONS) };
};

const relaunch = () => scope.restartPrivateDataScopeForTests();

function runScopeScenario(start: fc.Infer<typeof legacyStartArb>, ops: Op[]) {
  mmkv.store.clear();
  if (start.notes.length > 0) {
    mmkv.store.set(NOTES, JSON.stringify({ state: { items: start.notes }, version: 0 }));
  }
  mmkv.store.set(
    'auth-storage',
    JSON.stringify({ state: { lastSyncedUserId: start.lastSyncedUserId }, version: 3 })
  );
  relaunch();

  const model: Model = {
    active: start.lastSyncedUserId,
    buckets: new Map([[start.lastSyncedUserId, { notes: [...start.notes], lessons: [] }]]),
  };
  // Where each item was created: an account, or the guest (null).
  const createdBy = new Map<string, Owner>(
    start.notes.map((note) => [note, start.lastSyncedUserId])
  );
  let counter = 0;

  const adoptInModel = (uid: string) => {
    const guest = bucketOf(model, null);
    const account = bucketOf(model, uid);
    model.buckets.set(uid, {
      notes: union(account.notes, guest.notes),
      lessons: union(account.lessons, guest.lessons),
    });
    model.buckets.set(null, empty());
    model.active = uid;
  };

  const check = (step: string) => {
    // What the reader sees is the active owner's bucket.
    assert.equal(scope.getPrivateDataOwner(), model.active, `${step}: owner`);
    const visible = bucketOf(model, model.active);
    assert.deepEqual(notes.getState().items, visible.notes, `${step}: visible notes`);
    assert.deepEqual(lessons.getState().items, visible.lessons, `${step}: visible lessons`);
    // Every bucket on disk matches the model: nothing deleted, nothing leaked.
    for (const owner of [null, ...ACCOUNTS] as Owner[]) {
      assert.deepEqual(readBucket(owner), bucketOf(model, owner), `${step}: bucket ${owner}`);
    }
    // An account's own items are only ever in that account's bucket, and a guest
    // item is in at most one bucket.
    for (const [item, creator] of createdBy) {
      const holders = ([null, ...ACCOUNTS] as Owner[]).filter((owner) => {
        const bucket = readBucket(owner);
        return bucket.notes.includes(item) || bucket.lessons.includes(item);
      });
      if (creator !== null) {
        assert.ok(
          holders.every((owner) => owner === creator),
          `${step}: ${item} leaked`
        );
      } else {
        assert.ok(holders.length <= 1, `${step}: guest item ${item} copied into ${holders}`);
      }
    }
  };

  check('start');
  for (const [index, op] of ops.entries()) {
    const step = `#${index} ${JSON.stringify(op)}`;
    switch (op.kind) {
      case 'note':
      case 'lesson': {
        const item = `${model.active ?? 'guest'}-${op.kind}-${(counter += 1)}`;
        createdBy.set(item, model.active);
        (op.kind === 'note' ? notes : lessons).getState().add(item);
        const bucket = bucketOf(model, model.active);
        model.buckets.set(
          model.active,
          op.kind === 'note'
            ? { ...bucket, notes: [...bucket.notes, item] }
            : { ...bucket, lessons: [...bucket.lessons, item] }
        );
        break;
      }
      case 'signIn':
        scope.switchPrivateDataOwner(op.uid);
        if (model.active === null) {
          adoptInModel(op.uid);
        } else {
          model.active = op.uid;
        }
        break;
      case 'signOut':
        scope.switchPrivateDataOwner(null);
        model.active = null;
        break;
      case 'relaunch':
        relaunch();
        break;
      case 'clearCache':
        clearDeviceCaches();
        break;
      case 'deleteAccount': {
        // deleteAccountAndLocalData: sign out, then drop that account's buckets.
        const uid = model.active;
        if (uid === null) break;
        scope.switchPrivateDataOwner(null);
        scope.deletePrivateDataOf(uid);
        model.active = null;
        model.buckets.delete(uid);
        break;
      }
      case 'killDuringAdoption': {
        if (model.active !== null) break;
        // The app dies after the merged state is written and the marker says
        // "clear the guest bucket", but before the guest keys are deleted.
        const guestKeys = [NOTES, LESSONS].map((name) => scope.privateDataStorageKey(name, null));
        const guestBefore = new Map(guestKeys.map((key) => [key, mmkv.store.get(key)]));
        scope.switchPrivateDataOwner(op.uid);
        for (const [key, value] of guestBefore) {
          if (value !== undefined) mmkv.store.set(key, value);
        }
        mmkv.store.set(
          scope.PRIVATE_DATA_OWNER_KEY,
          JSON.stringify({ owner: op.uid, clearGuest: true })
        );
        relaunch();
        adoptInModel(op.uid);
        break;
      }
    }
    check(step);
  }
}

test('any sequence of guest use, sign-ins, sign-outs, relaunches, cache clears and deletions keeps each owner’s data its own', () => {
  fc.assert(
    fc.property(legacyStartArb, fc.array(opArb, { minLength: 6, maxLength: 30 }), (start, ops) => {
      runScopeScenario(start, ops);
    }),
    FC_PARAMS
  );
});
