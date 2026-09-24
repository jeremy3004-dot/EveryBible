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

test('sync-cycle cache forgets a failed cycle so the next attempt runs again', async () => {
  const cache = createSyncCycleCache<string>();
  let attempts = 0;
  const failing = cache.getOrCreate('user-a', async () => {
    attempts += 1;
    throw new Error('offline');
  });

  // A caller joining while the cycle is still pending shares its failure.
  assert.equal(
    cache.getOrCreate('user-a', async () => 'unused'),
    failing
  );
  await assert.rejects(failing, /offline/);

  const retry = await cache.getOrCreate('user-a', async () => {
    attempts += 1;
    return 'synced';
  });
  assert.equal(retry, 'synced');
  assert.equal(attempts, 2);
});

test('a failed cycle that was already replaced does not evict its replacement', async () => {
  const cache = createSyncCycleCache<string>();
  let rejectFirst!: (error: Error) => void;
  const firstCycle = cache.getOrCreate(
    'user-a',
    () =>
      new Promise<string>((_resolve, reject) => {
        rejectFirst = reject;
      })
  );
  cache.clear('user-a');
  const replacement = cache.getOrCreate('user-a', async () => 'fresh');

  rejectFirst(new Error('late failure'));
  await assert.rejects(firstCycle, /late failure/);

  assert.equal(
    cache.getOrCreate('user-a', async () => 'should not run'),
    replacement
  );
  assert.equal(await replacement, 'fresh');
});
