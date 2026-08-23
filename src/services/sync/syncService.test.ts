import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncIdentityBoundary } from './syncIdentity';
import { runSyncCycleSubsyncs } from './syncCycle';

test('one sync cycle captures identity once and reuses it across branches and retries', async () => {
  let currentUserId: string | null = 'A';
  let authGeneration = 7;
  let captureCalls = 0;
  let progressCalls = 0;
  const seenIdentities: unknown[] = [];
  const identity = createSyncIdentityBoundary(
    'A',
    () => currentUserId,
    authGeneration,
    () => authGeneration
  );

  const cycle = await runSyncCycleSubsyncs(
    async () => {
      captureCalls += 1;
      return identity;
    },
    {
      progress: async (capturedIdentity) => {
        seenIdentities.push(capturedIdentity);
        progressCalls += 1;
        return progressCalls === 1
          ? { success: false, error: 'network timeout' }
          : { success: true };
      },
      readingPlans: async (capturedIdentity) => {
        seenIdentities.push(capturedIdentity);
        return { success: true };
      },
      preferences: async (capturedIdentity) => {
        seenIdentities.push(capturedIdentity);
        return { success: true };
      },
    },
    async (run) => {
      const first = await run();
      if (!first.success) {
        return run();
      }
      return first;
    }
  );

  assert.equal(captureCalls, 1);
  assert.equal(progressCalls, 2, 'the transient branch should retry without recapturing identity');
  assert.equal(cycle.identity, identity);
  assert.equal(
    cycle.results.every((result) => result.success),
    true
  );
  assert.equal(
    seenIdentities.every((capturedIdentity) => capturedIdentity === identity),
    true
  );
});

test('a thrown branch waits for deferred siblings before the cycle settles', async () => {
  let releaseReadingPlans!: () => void;
  let readingPlansStarted = false;
  let cycleSettled = false;
  const identity = createSyncIdentityBoundary(
    'A',
    () => 'A',
    3,
    () => 3
  );
  const deferredReadingPlans = new Promise<{ success: boolean }>((resolve) => {
    releaseReadingPlans = () => resolve({ success: true });
  });

  const cyclePromise = runSyncCycleSubsyncs(
    async () => identity,
    {
      progress: async () => {
        throw new Error('progress branch failed');
      },
      readingPlans: async () => {
        readingPlansStarted = true;
        return deferredReadingPlans;
      },
      preferences: async () => ({ success: true }),
    },
    async (run) => run()
  ).then((cycle) => {
    cycleSettled = true;
    return cycle;
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(readingPlansStarted, true);
  assert.equal(cycleSettled, false);

  releaseReadingPlans();
  const cycle = await cyclePromise;

  assert.deepEqual(cycle.results, [
    { success: false, error: 'progress branch failed' },
    { success: true },
    { success: true },
  ]);
  assert.equal(cycleSettled, true);
});
