import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncIdentityBoundary, createSyncCycleCache } from './syncIdentity';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

test('a stale continuation cannot apply local state or write a remote payload', async () => {
  let currentUserId: string | null = 'A';
  const deferredFetch = deferred<void>();
  const boundary = createSyncIdentityBoundary('A', () => currentUserId);
  let localApplyCount = 0;
  const remotePayloads: string[] = [];

  const localCommit = (async () => {
    await deferredFetch.promise;
    return boundary.runIfCurrent(() => {
      localApplyCount += 1;
    });
  })();

  currentUserId = 'B';
  deferredFetch.resolve();

  assert.equal((await localCommit).applied, false);
  assert.equal(localApplyCount, 0);

  const remoteWrite = await boundary.runIfCurrent(() => {
    remotePayloads.push('A-only-payload');
  });

  assert.equal(remoteWrite.applied, false);
  assert.deepEqual(remotePayloads, []);
});

test('same-user continuations apply local state and write the captured payload', async () => {
  let currentUserId: string | null = 'A';
  const boundary = createSyncIdentityBoundary('A', () => currentUserId);
  let localApplyCount = 0;
  const remotePayloads: string[] = [];

  assert.equal(
    (
      await boundary.runIfCurrent(() => {
        localApplyCount += 1;
      })
    ).applied,
    true
  );

  assert.equal(
    (
      await boundary.runIfCurrent(() => {
        remotePayloads.push('A-only-payload');
      })
    ).applied,
    true
  );

  assert.equal(localApplyCount, 1);
  assert.deepEqual(remotePayloads, ['A-only-payload']);

  currentUserId = 'B';
  assert.equal((await boundary.runIfCurrent(() => remotePayloads.push('stale'))).applied, false);
  assert.deepEqual(remotePayloads, ['A-only-payload']);
});

test('sync-cycle cache deduplicates one user, isolates users, and clears completed cycles', async () => {
  const cache = createSyncCycleCache<string>();
  let factoryCalls = 0;
  const firstA = cache.getOrCreate('A', async () => {
    factoryCalls += 1;
    return 'A-cycle-1';
  });
  const secondA = cache.getOrCreate('A', async () => {
    factoryCalls += 1;
    return 'A-cycle-should-not-run';
  });
  const firstB = cache.getOrCreate('B', async () => {
    factoryCalls += 1;
    return 'B-cycle-1';
  });

  assert.strictEqual(firstA, secondA);
  assert.equal(await firstA, 'A-cycle-1');
  assert.equal(await firstB, 'B-cycle-1');
  assert.equal(factoryCalls, 2);

  cache.clear('A');
  assert.equal(
    await cache.getOrCreate('A', async () => {
      factoryCalls += 1;
      return 'A-cycle-2';
    }),
    'A-cycle-2'
  );
  assert.equal(factoryCalls, 3);
});

test('a deferred stale continuation cannot start a new remote write after switching users', async () => {
  let currentUserId: string | null = 'A';
  const fetchedPayload = deferred<string>();
  const boundary = createSyncIdentityBoundary('A', () => currentUserId);
  const writes: string[] = [];

  const continuation = (async () => {
    const payload = await fetchedPayload.promise;
    return boundary.runIfCurrent(() => {
      writes.push(payload);
    });
  })();

  currentUserId = 'B';
  fetchedPayload.resolve('A-only-payload');

  assert.equal((await continuation).applied, false);
  assert.deepEqual(writes, []);
});

test('a captured plan snapshot cannot commit after a dependency/fetch continuation switches users', async () => {
  let currentUserId: string | null = 'A';
  const dependencyFetch = deferred<void>();
  const boundary = createSyncIdentityBoundary('A', () => currentUserId);
  const committedSnapshots: string[][] = [];
  const capturedSnapshot = ['A-plan-row'];

  const continuation = (async () => {
    await dependencyFetch.promise;
    return boundary.runIfCurrent(() => {
      committedSnapshots.push(capturedSnapshot);
    });
  })();

  currentUserId = 'B';
  dependencyFetch.resolve();

  assert.equal((await continuation).applied, false);
  assert.deepEqual(committedSnapshots, []);
});

test('a same-uid continuation is stale after sign-out and sign-in creates a new auth generation', async () => {
  let currentUserId: string | null = 'A';
  let authGeneration = 1;
  const fetchedPayload = deferred<string>();
  const boundary = createSyncIdentityBoundary(
    'A',
    () => currentUserId,
    authGeneration,
    () => authGeneration
  );
  const writes: string[] = [];

  const continuation = (async () => {
    const payload = await fetchedPayload.promise;
    return boundary.runIfCurrent(() => {
      writes.push(payload);
    });
  })();

  currentUserId = null;
  authGeneration += 1;
  currentUserId = 'A';
  authGeneration += 1;
  fetchedPayload.resolve('stale-A-payload');

  assert.equal((await continuation).applied, false);
  assert.deepEqual(writes, []);
});
