import test from 'node:test';
import assert from 'node:assert/strict';
import type { StateStorage } from 'zustand/middleware';

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
  const storeMod = await import('../../stores/readingPlansStore');
  const serviceMod = await import('./readingPlanService');

  const service = serviceMod.createReadingPlanService(storeMod.createReadingPlansStore(createMemoryStorage()));

  const plansResult = await service.listReadingPlans();
  assert.equal(plansResult.success, true);
  assert.equal(plansResult.data?.length, 22);
  assert.equal(plansResult.data?.[0]?.slug, 'bible-in-1-year');

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

  const service = serviceMod.createReadingPlanService(storeMod.createReadingPlansStore(createMemoryStorage()));

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
