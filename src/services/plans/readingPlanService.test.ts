import test from 'node:test';
import assert from 'node:assert/strict';
import type { StateStorage } from 'zustand/middleware';
import { createSyncIdentityBoundary } from '../sync/syncIdentity';
import { resolvePlanSyncIdentity, retryPlanTombstonesWithIdentity } from './readingPlanService';

function createMemoryStorage(): StateStorage {
  const store = new Map<string, string>();

  return {
    setItem: (name, value) => {
      store.set(name, value);
    },
    getItem: (name) => store.get(name) ?? null,
    removeItem: (name) => {
      store.delete(name);
    },
  };
}

test('reading plan service serves bundled plans and local plan entries', async () => {
  const bundledMod = await import('../../data/readingPlans.generated');
  const storeMod = await import('../../stores/readingPlansStore');
  const serviceMod = await import('./readingPlanService');

  const service = serviceMod.createReadingPlanService(
    storeMod.createReadingPlansStore(createMemoryStorage())
  );

  const plansResult = await service.listReadingPlans();
  assert.equal(plansResult.success, true);
  assert.equal(bundledMod.readingPlans.length, 23);
  assert.equal(plansResult.data?.length, bundledMod.readingPlans.length);
  assert.equal(plansResult.data?.[0]?.slug, 'bible-in-1-year');
  assert.equal(
    plansResult.data?.some((plan) => plan.slug === 'kathisma-weekly'),
    true
  );

  const entriesResult = await service.getPlanEntries('sermon-on-the-mount-7-days');
  assert.equal(entriesResult.success, true);
  assert.equal(entriesResult.data?.length, 7);
  assert.equal(entriesResult.data?.[0]?.day_number, 1);

  const timedPlansResult = await serviceMod.getTimedChallengePlans();
  assert.equal(timedPlansResult.success, true);
  assert.deepEqual(
    timedPlansResult.data?.map((plan) => plan.slug),
    [
      'psalms-30-days',
      'proverbs-31-days',
      'sermon-on-the-mount-7-days',
      'bible-in-30-days',
      'bible-in-90-days',
      'nt-in-30-days',
      'gospels-30-days',
      'acts-28-days',
    ]
  );

  const devotionalPlansResult = await serviceMod.getPlansByCategory('devotional');
  assert.equal(devotionalPlansResult.success, true);
  assert.deepEqual(
    devotionalPlansResult.data?.map((plan) => plan.slug),
    [
      'proverbs-31-days',
      'kathisma-weekly',
      'prayer-intimacy-with-god',
      'identity-in-christ',
      'holiness-and-sanctification',
      'faith-and-obedience',
      'hearing-gods-voice',
    ]
  );

  const topicalPlansResult = await serviceMod.getPlansByCategory('topical');
  assert.equal(topicalPlansResult.success, true);
  assert.deepEqual(
    topicalPlansResult.data?.map((plan) => plan.slug),
    [
      'sermon-on-the-mount-7-days',
      'foundations-of-the-gospel',
      'the-kingdom-of-god',
      'spiritual-warfare',
      'great-commission-and-mission',
    ]
  );
});

test('reading plan service marks local progress complete without auth', async () => {
  const storeMod = await import('../../stores/readingPlansStore');
  const serviceMod = await import('./readingPlanService');

  const service = serviceMod.createReadingPlanService(
    storeMod.createReadingPlansStore(createMemoryStorage())
  );

  const enrolledResult = await service.enrollInPlan('sermon-on-the-mount-7-days');
  assert.equal(enrolledResult.success, true);
  assert.equal(enrolledResult.data?.current_day, 1);

  let completedResult = await service.markDayComplete('sermon-on-the-mount-7-days', 1);
  for (let day = 2; day <= 7; day += 1) {
    completedResult = await service.markDayComplete('sermon-on-the-mount-7-days', day);
  }

  assert.equal(completedResult.success, true);
  assert.equal(completedResult.data?.is_completed, true);
  assert.equal(completedResult.data?.completed_entries['7'] !== undefined, true);
});

test('pending tombstones reuse one prevalidated identity across every delete', async () => {
  let captureCalls = 0;
  let currentUserId: string | null = 'A';
  let authGeneration = 11;
  const identity = createSyncIdentityBoundary(
    'A',
    () => currentUserId,
    authGeneration,
    () => authGeneration
  );
  const seen: Array<{ planId: string; identity: typeof identity }> = [];
  const captureIdentity = async () => {
    captureCalls += 1;
    return identity;
  };
  const capturedIdentity = await captureIdentity();

  const results = await retryPlanTombstonesWithIdentity(
    ['plan-a', 'plan-b', 'plan-c'],
    capturedIdentity,
    async (planId, capturedIdentity) => {
      seen.push({ planId, identity: capturedIdentity });
      return capturedIdentity.expectedUserId === 'A';
    }
  );

  assert.equal(captureCalls, 1);
  assert.deepEqual(results, [true, true, true]);
  assert.deepEqual(
    seen.map(({ planId }) => planId),
    ['plan-a', 'plan-b', 'plan-c']
  );
  assert.equal(
    seen.every(({ identity: capturedIdentity }) => capturedIdentity === identity),
    true
  );
});

test('plan pulls reuse a prevalidated identity without another remote capture', async () => {
  let captureCalls = 0;
  const identity = createSyncIdentityBoundary(
    'A',
    () => 'A',
    5,
    () => 5
  );
  const captureIdentity = async () => {
    captureCalls += 1;
    return identity;
  };

  const reused = await resolvePlanSyncIdentity('A', 5, identity, captureIdentity);
  assert.equal(reused, identity);
  assert.equal(captureCalls, 0);

  const standalone = await resolvePlanSyncIdentity('A', 5, undefined, captureIdentity);
  assert.equal(standalone, identity);
  assert.equal(captureCalls, 1);

  const mismatched = await resolvePlanSyncIdentity('B', 5, identity, captureIdentity);
  assert.equal(mismatched, null);
  assert.equal(captureCalls, 1);

  const mismatchedGeneration = await resolvePlanSyncIdentity('A', 6, identity, captureIdentity);
  assert.equal(mismatchedGeneration, null);
  assert.equal(captureCalls, 1);
});
