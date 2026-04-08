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
  assert.equal(plansResult.data?.length, 8);
  assert.equal(plansResult.data?.[0]?.slug, 'bible-in-1-year');

  const entriesResult = await service.getPlanEntries('sermon-on-the-mount-7-days');
  assert.equal(entriesResult.success, true);
  assert.equal(entriesResult.data?.length, 7);
  assert.equal(entriesResult.data?.[0]?.day_number, 1);
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
