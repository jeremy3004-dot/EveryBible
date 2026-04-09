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

function completePlan(
  store: {
    getState(): {
      markDayComplete(planId: string, dayNumber: number, totalDays: number): unknown;
    };
  },
  planId: string,
  totalDays: number
) {
  for (let day = 1; day <= totalDays; day += 1) {
    store.getState().markDayComplete(planId, day, totalDays);
  }
}

const makePlanItem = (id: string, planId: string) => ({
  id,
  type: 'plan' as const,
  planId,
});

const makePassageItem = (
  id: string,
  bookId: string,
  startChapter: number,
  endChapter: number,
  title = `${bookId} ${startChapter}-${endChapter}`
) => ({
  id,
  type: 'passage' as const,
  title,
  bookId,
  startChapter,
  endChapter,
});

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

test('reading plan rhythms generate collision-safe fallback names on create and update', async () => {
  const mod = await import('./readingPlansStore');

  const storage = createMemoryStorage();
  const store = mod.createReadingPlansStore(storage);

  const manualRhythm = store
    .getState()
    .createRhythm({ title: 'Rhythm 1', items: [makePlanItem('item-a', 'plan-a')] });
  const fallbackRhythm = store
    .getState()
    .createRhythm({ title: '   ', items: [makePlanItem('item-b', 'plan-b')] });
  const updateTarget = store
    .getState()
    .createRhythm({ title: 'Morning Read', items: [makePlanItem('item-c', 'plan-c')] });
  const updatedRhythm = store
    .getState()
    .updateRhythm(updateTarget.rhythm?.id ?? '', {
      title: '',
      items: [makePlanItem('item-c', 'plan-c')],
    });
  const eveningRhythm = store.getState().createRhythm({
    title: '',
    slot: 'evening',
    items: [makePlanItem('item-d', 'plan-d')],
  });

  assert.equal(manualRhythm.rhythm?.title, 'Rhythm 1');
  assert.equal(fallbackRhythm.rhythm?.title, 'Morning Rhythm');
  assert.equal(updatedRhythm.rhythm?.title, 'Afternoon Rhythm');
  assert.equal(eveningRhythm.rhythm?.title, 'Evening Rhythm');
  assert.equal(eveningRhythm.rhythm?.slot, 'evening');
});

test('reading plan rhythms enforce one-rhythm-per-plan and preserve ordering', async () => {
  const mod = await import('./readingPlansStore');

  const storage = createMemoryStorage();
  const store = mod.createReadingPlansStore(storage);

  const firstRhythm = store.getState().createRhythm({
    title: 'Morning',
    items: [makePlanItem('item-a', 'plan-a'), makePlanItem('item-b', 'plan-b')],
  });
  const secondRhythm = store.getState().createRhythm({
    title: 'Evening',
    items: [makePlanItem('item-b2', 'plan-b'), makePlanItem('item-c', 'plan-c')],
  });

  assert.equal(secondRhythm.success, false);
  assert.equal(secondRhythm.error, 'Plan already belongs to another rhythm');
  assert.deepEqual(
    store
      .getState()
      .getRhythm(firstRhythm.rhythm?.id ?? '')
      ?.items.map((item) => (item.type === 'plan' ? item.planId : item.title)),
    ['plan-a', 'plan-b']
  );
  assert.equal(store.getState().getRhythmForPlan('plan-b')?.id, firstRhythm.rhythm?.id);

  const thirdRhythm = store.getState().createRhythm({
    title: 'Evening',
    items: [makePlanItem('item-c3', 'plan-c')],
  });
  const movedPlanRhythm = store
    .getState()
    .updateRhythm(firstRhythm.rhythm?.id ?? '', { items: [makePlanItem('item-c4', 'plan-c')] });
  assert.equal(movedPlanRhythm.success, false);
  assert.equal(movedPlanRhythm.error, 'Plan already belongs to another rhythm');
  assert.deepEqual(
    store
      .getState()
      .getRhythm(thirdRhythm.rhythm?.id ?? '')
      ?.items.map((item) => (item.type === 'plan' ? item.planId : item.title)),
    ['plan-c']
  );

  store.getState().moveRhythmPlan(firstRhythm.rhythm?.id ?? '', 'plan-b', 'up');
  assert.deepEqual(
    store
      .getState()
      .getRhythm(firstRhythm.rhythm?.id ?? '')
      ?.items.map((item) => (item.type === 'plan' ? item.planId : item.title)),
    ['plan-b', 'plan-a']
  );

  store.getState().updateRhythm(firstRhythm.rhythm?.id ?? '', {
    items: [
      makePlanItem('item-b', 'plan-b'),
      makePassageItem('item-psa', 'PSA', 1, 2),
      makePlanItem('item-a', 'plan-a'),
    ],
  });
  store.getState().moveRhythmItem(firstRhythm.rhythm?.id ?? '', 'item-psa', 'down');
  assert.deepEqual(
    store
      .getState()
      .getRhythm(firstRhythm.rhythm?.id ?? '')
      ?.items.map((item) => (item.type === 'plan' ? item.planId : item.title)),
    ['plan-b', 'plan-a', 'PSA 1-2']
  );

  store.getState().reorderRhythms([thirdRhythm.rhythm?.id ?? '', firstRhythm.rhythm?.id ?? '']);
  assert.deepEqual(store.getState().rhythmOrder, [
    thirdRhythm.rhythm?.id ?? '',
    firstRhythm.rhythm?.id ?? '',
  ]);
});

test('reading plan rhythms persist and restore alongside the rest of the store state', async () => {
  const mod = await import('./readingPlansStore');

  const storage = createMemoryStorage();
  const store = mod.createReadingPlansStore(storage);

  const firstRhythm = store.getState().createRhythm({
    title: 'Morning',
    items: [makePlanItem('item-a', 'plan-a')],
  });
  const secondRhythm = store.getState().createRhythm({
    title: '',
    slot: 'morning',
    items: [makePassageItem('item-psa', 'PSA', 23, 24)],
  });

  store
    .getState()
    .reorderRhythms([secondRhythm.rhythm?.id ?? '', firstRhythm.rhythm?.id ?? '']);

  const restored = mod.createReadingPlansStore(storage);
  assert.deepEqual(restored.getState().rhythmOrder, [
    secondRhythm.rhythm?.id ?? '',
    firstRhythm.rhythm?.id ?? '',
  ]);
  assert.equal(restored.getState().getRhythm(firstRhythm.rhythm?.id ?? '')?.title, 'Morning');
  assert.equal(restored.getState().getRhythm(secondRhythm.rhythm?.id ?? '')?.title, 'Morning Rhythm');
  assert.equal(restored.getState().getRhythm(secondRhythm.rhythm?.id ?? '')?.slot, 'morning');
  assert.equal(restored.getState().getRhythmForPlan('plan-a')?.id, firstRhythm.rhythm?.id ?? '');
  assert.equal(restored.getState().getRhythm(secondRhythm.rhythm?.id ?? '')?.items[0]?.type, 'passage');
});

test('unenrolling a reading plan clears it from active and completed state without touching saved plans', async () => {
  const mod = await import('./readingPlansStore');

  const storage = createMemoryStorage();
  const store = mod.createReadingPlansStore(storage);

  store.getState().savePlan('sermon-on-the-mount-7-days');
  store.getState().enrollPlan('sermon-on-the-mount-7-days');
  store.getState().setPlanDayResume('sermon-on-the-mount-7-days', 3, 'MAT', 7);
  completePlan(store, 'sermon-on-the-mount-7-days', 7);
  store.getState().unenrollPlan('sermon-on-the-mount-7-days');

  assert.deepEqual(store.getState().savedPlanIds, ['sermon-on-the-mount-7-days']);
  assert.deepEqual(store.getState().enrolledPlanIds, []);
  assert.deepEqual(store.getState().completedPlanIds, []);
  assert.equal(store.getState().getProgress('sermon-on-the-mount-7-days'), null);
  assert.equal(store.getState().getPlanDayResume('sermon-on-the-mount-7-days', 3), null);

  const restored = mod.createReadingPlansStore(storage);
  assert.deepEqual(restored.getState().savedPlanIds, ['sermon-on-the-mount-7-days']);
  assert.deepEqual(restored.getState().enrolledPlanIds, []);
  assert.deepEqual(restored.getState().completedPlanIds, []);
});

test('replacing remote progress clears stale local plans while preserving saved plans', async () => {
  const mod = await import('./readingPlansStore');

  const storage = createMemoryStorage();
  const store = mod.createReadingPlansStore(storage);

  store.getState().savePlan('psalms-30-days');
  store.getState().enrollPlan('stale-local-plan');
  store.getState().replaceProgress([
    {
      id: 'remote-plan-progress',
      user_id: 'user-1',
      plan_id: 'remote-plan',
      started_at: '2026-04-09T00:00:00Z',
      completed_entries: { '1': '2026-04-09T00:00:00Z' },
      current_day: 2,
      is_completed: false,
      completed_at: null,
      synced_at: '2026-04-09T00:00:00Z',
    },
  ]);

  assert.deepEqual(store.getState().savedPlanIds, ['psalms-30-days']);
  assert.deepEqual(store.getState().enrolledPlanIds, ['remote-plan']);
  assert.deepEqual(store.getState().completedPlanIds, []);
  assert.equal(store.getState().getProgress('stale-local-plan'), null);
  assert.equal(store.getState().getProgress('remote-plan')?.current_day, 2);
});

test('plan-day resume positions persist and can be restored across store reloads', async () => {
  const mod = await import('./readingPlansStore');

  const storage = createMemoryStorage();
  const store = mod.createReadingPlansStore(storage);

  store.getState().setPlanDayResume('bible-in-1-year', 12, 'GEN', 38);

  assert.deepEqual(store.getState().getPlanDayResume('bible-in-1-year', 12), {
    bookId: 'GEN',
    chapter: 38,
  });

  const restored = mod.createReadingPlansStore(storage);
  assert.deepEqual(restored.getState().getPlanDayResume('bible-in-1-year', 12), {
    bookId: 'GEN',
    chapter: 38,
  });
});
