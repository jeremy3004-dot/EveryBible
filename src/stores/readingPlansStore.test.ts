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

function completePlan(store: any, planId: string, totalDays: number) {
  for (let day = 1; day <= totalDays; day += 1) {
    store.getState().markDayComplete(planId, day, totalDays);
  }
}

test('reading plans store persists enrolled, saved, and completed state', async () => {
  const mod = await import('./readingPlansStore');

  const storage = createMemoryStorage();
  const store = mod.createReadingPlansStore(storage);

  store.getState().savePlan('psalms-30-days');
  store.getState().enrollPlan('psalms-30-days');
  completePlan(store, 'psalms-30-days', 30);

  assert.deepEqual(store.getState().savedPlanIds, ['psalms-30-days']);
  assert.deepEqual(store.getState().enrolledPlanIds, ['psalms-30-days']);
  assert.deepEqual(store.getState().completedPlanIds, ['psalms-30-days']);
  assert.equal(store.getState().progressByPlanId['psalms-30-days'].is_completed, true);

  const restored = mod.createReadingPlansStore(storage);
  assert.deepEqual(restored.getState().savedPlanIds, ['psalms-30-days']);
  assert.deepEqual(restored.getState().enrolledPlanIds, ['psalms-30-days']);
});

test('unenrolling a reading plan clears it from active and completed state without touching saved plans', async () => {
  const mod = await import('./readingPlansStore');

  const storage = createMemoryStorage();
  const store = mod.createReadingPlansStore(storage);

  store.getState().savePlan('sermon-on-the-mount-7-days');
  store.getState().enrollPlan('sermon-on-the-mount-7-days');
  completePlan(store, 'sermon-on-the-mount-7-days', 7);
  store.getState().unenrollPlan('sermon-on-the-mount-7-days');

  assert.deepEqual(store.getState().savedPlanIds, ['sermon-on-the-mount-7-days']);
  assert.deepEqual(store.getState().enrolledPlanIds, []);
  assert.deepEqual(store.getState().completedPlanIds, []);
  assert.equal(store.getState().getProgress('sermon-on-the-mount-7-days'), null);

  const restored = mod.createReadingPlansStore(storage);
  assert.deepEqual(restored.getState().savedPlanIds, ['sermon-on-the-mount-7-days']);
  assert.deepEqual(restored.getState().enrolledPlanIds, []);
  assert.deepEqual(restored.getState().completedPlanIds, []);
});
