import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncCoordinator, type SyncIdentity } from './syncCoordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

test('serializes a pull before a queued push and discards stale account jobs', async () => {
  const coordinator = createSyncCoordinator();
  const accountA: SyncIdentity = { userId: 'A', generation: 1 };
  const accountB: SyncIdentity = { userId: 'B', generation: 2 };
  const accountAPull = deferred<void>();
  const accountBPull = deferred<void>();
  const accountBPullStarted = deferred<void>();
  const events: string[] = [];
  const pullFromCloud = (identity: SyncIdentity, run: () => Promise<{ success: boolean }>) =>
    coordinator.enqueuePull(identity, run);
  const syncAll = (
    identity: SyncIdentity,
    run: () => Promise<void>,
    pull: () => Promise<{ success: boolean }> = async () => ({ success: true })
  ) => coordinator.enqueuePush(identity, run, pull);

  const activeAPull = pullFromCloud(accountA, async () => {
    events.push('pullFromCloud:A');
    await accountAPull.promise;
    return { success: true };
  });
  const staleAPush = syncAll(accountA, async () => {
    events.push('syncAll:A');
  });
  const bPullRun = async () => {
    events.push('pullFromCloud:B:start');
    accountBPullStarted.resolve();
    await accountBPull.promise;
    events.push('pullFromCloud:B:resolved');
    return { success: true };
  };
  const bPull = pullFromCloud(accountB, bPullRun);
  let bPushStarted = false;
  const bPush = syncAll(
    accountB,
    async () => {
      bPushStarted = true;
      events.push('syncAll:B');
    },
    bPullRun
  );

  await Promise.resolve();
  assert.deepEqual(events, ['pullFromCloud:A']);
  assert.equal(bPushStarted, false);

  accountAPull.resolve();
  await accountBPullStarted.promise;
  assert.equal(bPushStarted, false);
  accountBPull.resolve();
  await Promise.all([activeAPull, staleAPush, bPull, bPush]);

  assert.deepEqual(events, [
    'pullFromCloud:A',
    'pullFromCloud:B:start',
    'pullFromCloud:B:resolved',
    'syncAll:B',
  ]);
  assert.equal(bPushStarted, true);
});

test('failed pulls discard concurrent pushes and a later successful retry prepares the identity', async () => {
  const coordinator = createSyncCoordinator();
  const identity: SyncIdentity = { userId: 'B', generation: 2 };
  const failedPull = deferred<void>();
  const events: string[] = [];

  const pull = async () => {
    events.push('pull:failed:start');
    await failedPull.promise;
    events.push('pull:failed:resolved');
    return { success: false };
  };
  const push = async () => {
    events.push('push:unexpected');
  };
  const firstPush = coordinator.enqueuePush(identity, push, pull);
  const secondPush = coordinator.enqueuePush(identity, push, pull);

  await Promise.resolve();
  assert.deepEqual(events, ['pull:failed:start']);
  failedPull.resolve();
  await Promise.all([firstPush, secondPush]);
  assert.deepEqual(events, ['pull:failed:start', 'pull:failed:resolved']);

  const retryPush = coordinator.enqueuePush(
    identity,
    async () => {
      events.push('push:retry');
    },
    async () => {
      events.push('pull:retry');
      return { success: true };
    }
  );
  await retryPush;

  assert.deepEqual(events, [
    'pull:failed:start',
    'pull:failed:resolved',
    'pull:retry',
    'push:retry',
  ]);

  const nextIdentity: SyncIdentity = { userId: 'C', generation: 3 };
  await coordinator.enqueuePush(
    nextIdentity,
    async () => {
      events.push('push:next-account');
    },
    async () => {
      events.push('pull:next-account');
      return { success: true };
    }
  );
  assert.deepEqual(events, [
    'pull:failed:start',
    'pull:failed:resolved',
    'pull:retry',
    'push:retry',
    'pull:next-account',
    'push:next-account',
  ]);
});

test('push rejection stays catchable while the coordinator continues without an unhandled rejection', async () => {
  const coordinator = createSyncCoordinator();
  const preparedIdentity: SyncIdentity = { userId: 'B', generation: 2 };
  const nextIdentity: SyncIdentity = { userId: 'C', generation: 3 };
  const rejectedPushStarted = deferred<void>();
  const events: string[] = [];
  const unhandled: unknown[] = [];
  const onUnhandledRejection = (reason: unknown) => {
    unhandled.push(reason);
  };

  process.on('unhandledRejection', onUnhandledRejection);
  try {
    await coordinator.enqueuePull(preparedIdentity, async () => ({ success: true }));
    const rejectedPush = coordinator.enqueuePush(
      preparedIdentity,
      async () => {
        events.push('push:rejected');
        rejectedPushStarted.resolve();
        throw new Error('push failed');
      },
      async () => ({ success: true })
    );
    await rejectedPushStarted.promise;
    const nextPush = coordinator.enqueuePush(
      nextIdentity,
      async () => {
        events.push('push:next');
      },
      async () => {
        events.push('pull:next');
        return { success: true };
      }
    );

    await assert.rejects(rejectedPush, /push failed/);
    await nextPush;
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(events, ['push:rejected', 'pull:next', 'push:next']);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
});
