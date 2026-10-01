import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncOperationQueue, runSyncCycleSubsyncs } from './syncCycle';
import type { SyncCycleResult } from './syncCycle';
import { createSyncIdentityBoundary } from './syncIdentity';

/** A run the test finishes by hand, so the queue stays busy until it does. */
const heldRun = (log: string[], name: string) => {
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let finish!: (result: SyncCycleResult) => void;
  const outcome = new Promise<SyncCycleResult>((resolve) => {
    finish = resolve;
  });
  return {
    run: () => {
      log.push(name);
      markStarted();
      return outcome;
    },
    started,
    finish: (result: SyncCycleResult) => finish(result),
  };
};

// ---------------------------------------------------------------------------
// createSyncOperationQueue
// ---------------------------------------------------------------------------

test('a burst of syncs for a busy account collapses into one follow-up that runs the latest request', async () => {
  const queue = createSyncOperationQueue();
  const log: string[] = [];
  const first = heldRun(log, 'first');

  const firstResult = queue('user-a', first.run);
  await first.started;
  const secondResult = queue('user-a', async () => {
    log.push('second');
    return { success: false, error: 'superseded request ran' };
  });
  const thirdResult = queue('user-a', async () => {
    log.push('third');
    return { success: true, merged: true };
  });
  assert.deepEqual(log, ['first'], 'nothing else runs while the account is busy');

  first.finish({ success: true });

  assert.deepEqual(await firstResult, { success: true });
  assert.deepEqual(await Promise.all([secondResult, thirdResult]), [
    { success: true, merged: true },
    { success: true, merged: true },
  ]);
  assert.deepEqual(log, ['first', 'third']);
});

test('a follow-up that throws rejects its callers and leaves the account free for the next sync', async () => {
  const queue = createSyncOperationQueue();
  const log: string[] = [];
  const first = heldRun(log, 'first');

  const firstResult = queue('user-a', first.run);
  await first.started;
  const followUp = queue('user-a', async () => {
    throw new Error('profile lookup failed');
  });
  first.finish({ success: true });

  assert.deepEqual(await firstResult, { success: true });
  await assert.rejects(followUp, { message: 'profile lookup failed' });
  assert.deepEqual(await queue('user-a', async () => ({ success: true, merged: false })), {
    success: true,
    merged: false,
  });
});

// ---------------------------------------------------------------------------
// runSyncCycleSubsyncs
// ---------------------------------------------------------------------------

const identity = createSyncIdentityBoundary('user-a', () => 'user-a');

test('a branch that throws something other than an Error still reports a readable failure', async () => {
  const cycle = await runSyncCycleSubsyncs(
    async () => identity,
    {
      progress: async () => {
        throw 'progress endpoint offline';
      },
      readingPlans: async () => {
        throw { status: 503 };
      },
      preferences: async () => ({ success: true }),
    },
    (run) => run()
  );

  assert.deepEqual(cycle.results, [
    { success: false, error: 'progress endpoint offline' },
    { success: false, error: 'Unknown sync error' },
    { success: true },
  ]);
});

test('a retry wrapper that throws fails each branch instead of the whole cycle', async () => {
  const cycle = await runSyncCycleSubsyncs(
    async () => identity,
    {
      progress: async () => ({ success: true }),
      readingPlans: async () => ({ success: true }),
      preferences: async () => ({ success: true }),
    },
    async () => {
      throw new Error('retry budget exhausted');
    }
  );

  assert.equal(cycle.identity, identity);
  assert.deepEqual(cycle.results, [
    { success: false, error: 'retry budget exhausted' },
    { success: false, error: 'retry budget exhausted' },
    { success: false, error: 'retry budget exhausted' },
  ]);
});
