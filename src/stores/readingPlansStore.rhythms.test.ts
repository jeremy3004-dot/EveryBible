import test from 'node:test';
import assert from 'node:assert/strict';
import type { StateStorage } from 'zustand/middleware';

// Reading-plan rhythms and plan bookkeeping edge cases. The store takes its
// storage as an argument, so no module mocks are needed.

type StoreModule = typeof import('./readingPlansStore');

function createMemoryStorage(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  const storage: StateStorage = {
    setItem: (name, value) => {
      store.set(name, value);
    },
    getItem: (name) => store.get(name) ?? null,
    removeItem: (name) => {
      store.delete(name);
    },
  };
  return { storage, store };
}

const loadStore = async (seed?: Record<string, string>) => {
  const mod: StoreModule = await import('./readingPlansStore');
  const memory = createMemoryStorage(seed);
  return { mod, store: mod.createReadingPlansStore(memory.storage), memory };
};

const planItem = (id: string, planId: string) => ({ id, type: 'plan' as const, planId });

const passageItem = (
  id: string,
  bookId: string,
  startChapter: number,
  endChapter: number,
  title = ''
) => ({ id, type: 'passage' as const, title, bookId, startChapter, endChapter });

const describeItems = (items: { type: string; planId?: string; title?: string }[] | undefined) =>
  items?.map((item) => (item.type === 'plan' ? item.planId : item.title));

test('a rhythm with no usable items is refused and nothing is stored', async () => {
  const { mod, store } = await loadStore();

  for (const input of [
    {},
    { items: [] },
    { planIds: ['  ', ''] },
    { items: [planItem('x', ' ')] },
  ]) {
    assert.deepEqual(store.getState().createRhythm(input), {
      success: false,
      rhythm: undefined,
      error: mod.RHYTHM_MUTATION_ERROR_CODES.emptyItems,
    });
  }
  assert.deepEqual(store.getState().rhythmOrder, []);
  assert.deepEqual(store.getState().rhythmsById, {});
});

test('a rhythm built from plan ids trims and de-duplicates them', async () => {
  const { store } = await loadStore();

  const result = store.getState().createRhythm({ planIds: [' plan-a ', 'plan-b', 'plan-a', ''] });

  assert.equal(result.success, true);
  assert.deepEqual(describeItems(result.rhythm?.items), ['plan-a', 'plan-b']);
  assert.equal(new Set(result.rhythm?.items.map((item) => item.id)).size, 2);
});

test('rhythm items drop duplicates, blank books and repeated item ids, and clamp passage chapters', async () => {
  const { store } = await loadStore();

  const result = store.getState().createRhythm({
    items: [
      planItem('item-a', 'plan-a'),
      planItem('item-a2', 'plan-a'),
      planItem('item-a', 'plan-b'),
      passageItem('item-blank', '  ', 1, 2),
      passageItem('item-psa', ' PSA ', 23.9, 23),
      passageItem('item-gen', 'GEN', 0, 3),
      passageItem('item-psa', 'JHN', 1, 1),
      passageItem('', 'ROM', 8, 8, ' Romans 8 '),
      null as unknown as ReturnType<typeof planItem>,
    ],
  });

  assert.equal(result.success, true);
  const items = result.rhythm?.items ?? [];
  assert.deepEqual(
    items.map(({ id: _id, ...rest }) => rest),
    [
      { type: 'plan', planId: 'plan-a' },
      {
        type: 'passage',
        title: 'PSA 23',
        bookId: 'PSA',
        startChapter: 23,
        endChapter: 23,
      },
      { type: 'passage', title: 'GEN 1-3', bookId: 'GEN', startChapter: 1, endChapter: 3 },
      { type: 'passage', title: 'Romans 8', bookId: 'ROM', startChapter: 8, endChapter: 8 },
    ]
  );
  assert.deepEqual(
    items.slice(0, 3).map((item) => item.id),
    ['item-a', 'item-psa', 'item-gen']
  );
  assert.match(items[3]?.id ?? '', /^reading-plan-rhythm-item-/);
});

test('updating a missing rhythm, or emptying one, is refused without changes', async () => {
  const { mod, store } = await loadStore();
  const created = store.getState().createRhythm({ title: 'Mine', planIds: ['plan-a'] });
  const rhythmId = created.rhythm?.id ?? '';
  const before = store.getState().rhythmsById;

  assert.equal(
    store.getState().updateRhythm('no-such-rhythm', { title: 'x' }).error,
    mod.RHYTHM_MUTATION_ERROR_CODES.notFound
  );
  assert.equal(
    store.getState().updateRhythm(rhythmId, { planIds: [] }).error,
    mod.RHYTHM_MUTATION_ERROR_CODES.emptyItems
  );
  assert.equal(store.getState().rhythmsById, before);
});

test('updating only the title keeps the items and slot', async () => {
  const { store } = await loadStore();
  const created = store.getState().createRhythm({
    title: 'Before',
    slot: 'evening',
    planIds: ['plan-a'],
  });

  const updated = store.getState().updateRhythm(created.rhythm?.id ?? '', { title: ' After ' });

  assert.equal(updated.success, true);
  assert.equal(updated.rhythm?.title, 'After');
  assert.equal(updated.rhythm?.slot, 'evening');
  assert.deepEqual(updated.rhythm?.items, created.rhythm?.items);
});

test('updating only the items or slot keeps the custom title', async () => {
  const { store } = await loadStore();
  const created = store.getState().createRhythm({
    title: 'Dawn',
    slot: 'morning',
    planIds: ['plan-a'],
  });
  const rhythmId = created.rhythm?.id ?? '';

  const withItems = store.getState().updateRhythm(rhythmId, { planIds: ['plan-b'] });
  const withSlot = store.getState().updateRhythm(rhythmId, { slot: 'evening' });

  assert.equal(withItems.rhythm?.title, 'Dawn');
  assert.equal(withSlot.rhythm?.title, 'Dawn');
  assert.equal(store.getState().getRhythm(rhythmId)?.title, 'Dawn');
});

test('an explicitly blank title still falls back to the slot title', async () => {
  const { store } = await loadStore();
  const created = store.getState().createRhythm({
    title: 'Dawn',
    slot: 'morning',
    planIds: ['plan-a'],
  });

  const updated = store.getState().updateRhythm(created.rhythm?.id ?? '', { title: '  ' });

  assert.equal(updated.rhythm?.title, 'Morning Rhythm');
});

test('an untitled rhythm is numbered once every slot title is taken', async () => {
  const { store } = await loadStore();
  for (const [index, title] of [
    'Morning Rhythm',
    'afternoon rhythm',
    'Evening Rhythm',
    'Rhythm 1',
  ].entries()) {
    store.getState().createRhythm({ title, planIds: [`plan-${index}`] });
  }

  const untitled = store.getState().createRhythm({ title: '', planIds: ['plan-new'] });

  assert.equal(untitled.rhythm?.title, 'Rhythm 2');
});

test('deleting a rhythm removes it from the order; deleting an unknown one changes nothing', async () => {
  const { store } = await loadStore();
  const first = store.getState().createRhythm({ title: 'A', planIds: ['plan-a'] }).rhythm;
  const second = store.getState().createRhythm({ title: 'B', planIds: ['plan-b'] }).rhythm;

  store.getState().deleteRhythm(first?.id ?? '');
  assert.deepEqual(store.getState().rhythmOrder, [second?.id]);
  assert.equal(store.getState().getRhythm(first?.id ?? ''), null);
  assert.equal(store.getState().getRhythmForPlan('plan-a'), null);

  const stateBefore = store.getState();
  store.getState().deleteRhythm('no-such-rhythm');
  assert.equal(store.getState(), stateBefore);
});

test('moving an item or plan past either end, or in an unknown rhythm, leaves the rhythm unchanged', async () => {
  const { store } = await loadStore();
  const rhythm = store.getState().createRhythm({
    title: 'A',
    items: [planItem('item-a', 'plan-a'), planItem('item-b', 'plan-b')],
  }).rhythm;
  const rhythmId = rhythm?.id ?? '';
  const stateBefore = store.getState();

  store.getState().moveRhythmItem(rhythmId, 'item-a', 'up');
  store.getState().moveRhythmItem(rhythmId, 'item-b', 'down');
  store.getState().moveRhythmItem(rhythmId, 'no-such-item', 'down');
  store.getState().moveRhythmItem('no-such-rhythm', 'item-a', 'down');
  store.getState().moveRhythmPlan(rhythmId, 'plan-a', 'up');
  store.getState().moveRhythmPlan(rhythmId, 'plan-b', 'down');
  store.getState().moveRhythmPlan(rhythmId, 'no-such-plan', 'down');
  store.getState().moveRhythmPlan('no-such-rhythm', 'plan-a', 'down');
  assert.equal(store.getState(), stateBefore);

  store.getState().moveRhythmItem(rhythmId, 'item-a', 'down');
  assert.deepEqual(describeItems(store.getState().getRhythm(rhythmId)?.items), [
    'plan-b',
    'plan-a',
  ]);
  store.getState().moveRhythmPlan(rhythmId, 'plan-a', 'up');
  assert.deepEqual(describeItems(store.getState().getRhythm(rhythmId)?.items), [
    'plan-a',
    'plan-b',
  ]);
});

test('leaving a plan removes it from its rhythm and drops a rhythm left empty', async () => {
  const { store } = await loadStore();
  const mixed = store.getState().createRhythm({
    title: 'Mixed',
    items: [planItem('item-a', 'plan-a'), passageItem('item-psa', 'PSA', 1, 1)],
  }).rhythm;
  const onlyPlan = store.getState().createRhythm({ title: 'Solo', planIds: ['plan-b'] }).rhythm;
  const untouched = store.getState().createRhythm({ title: 'Other', planIds: ['plan-c'] }).rhythm;
  store.getState().enrollPlan('plan-a');
  store.getState().enrollPlan('plan-b');

  store.getState().unenrollPlan('plan-a');
  store.getState().endPlanLeftElsewhere('plan-b', new Date().toISOString());

  assert.deepEqual(describeItems(store.getState().getRhythm(mixed?.id ?? '')?.items), ['PSA 1']);
  assert.equal(store.getState().getRhythm(onlyPlan?.id ?? ''), null);
  assert.equal(store.getState().getRhythm(untouched?.id ?? ''), untouched);
  assert.deepEqual(store.getState().rhythmOrder, [mixed?.id, untouched?.id]);
  assert.deepEqual(store.getState().enrolledPlanIds, []);
  assert.deepEqual(store.getState().pendingUnenrollPlanIds, ['plan-a']);
});

test('invalid resume positions are ignored and clearing one day keeps the others', async () => {
  const { store } = await loadStore();
  store.getState().setPlanDayResume('plan-a', 1, 'GEN', 3);
  store.getState().setPlanDayResume('plan-a', 2, 'EXO', 4);

  store.getState().setPlanDayResume('plan-a', 3, '', 1);
  store.getState().setPlanDayResume('plan-a', 3, 'LEV', 0);
  store.getState().setPlanDayResume('plan-a', 3, 'LEV', 1.5);
  store.getState().clearPlanDayResume('plan-a', 1);

  assert.deepEqual(store.getState().planDayResumeByKey, {
    'plan-a:2': { bookId: 'EXO', chapter: 4 },
  });
  assert.equal(store.getState().getPlanDayResume('plan-a', 1), null);
  assert.deepEqual(store.getState().getPlanDayResume('plan-a', 2), { bookId: 'EXO', chapter: 4 });
  assert.equal(store.getState().getPlanDayResume('plan-a', 3), null);
});

test('completion actions on a plan the reader is not enrolled in are ignored', async () => {
  const { store } = await loadStore();
  store.getState().enrollPlan('plan-a');

  assert.equal(store.getState().markDayComplete('plan-x', 1, 7), null);
  assert.equal(store.getState().markRecurringDayComplete('plan-x', '2026-09-24', 1), null);
  assert.equal(store.getState().markRecurringDayComplete('plan-a', '  ', 1), null);
  assert.equal(
    store.getState().markSessionComplete('plan-a', 1, 'morning', {
      completionKey: ' ',
      dayCompletionKey: '1',
      totalDays: 7,
      isFinalSession: true,
      advanceDayOnCompletion: true,
    }),
    null
  );
  assert.deepEqual(store.getState().progressByPlanId['plan-a']?.completed_entries, {});
  assert.deepEqual(Object.keys(store.getState().progressByPlanId), ['plan-a']);
});

test('a pending leave is recorded once and keeps its original time', async () => {
  const { store } = await loadStore();

  store.getState().addPendingUnenroll('plan-a');
  const firstTime = store.getState().pendingUnenrollAtByPlanId['plan-a'];
  const stateAfterFirst = store.getState();
  store.getState().addPendingUnenroll('plan-a');

  assert.equal(store.getState(), stateAfterFirst);
  assert.deepEqual(store.getState().pendingUnenrollPlanIds, ['plan-a']);
  assert.equal(store.getState().pendingUnenrollAtByPlanId['plan-a'], firstTime);

  store.getState().addPendingUnenroll('plan-b');
  store.getState().clearPendingUnenrolls();
  assert.deepEqual(store.getState().pendingUnenrollPlanIds, []);
  assert.deepEqual(store.getState().pendingUnenrollAtByPlanId, {});
});

test('group plan assignments accumulate per group', async () => {
  const { store } = await loadStore();

  const first = store.getState().assignGroupPlan('group-1', 'plan-a');
  store.getState().assignGroupPlan('group-1', 'plan-b', 'leader-1');

  assert.equal(first.assigned_by, 'local-user');
  assert.deepEqual(
    store
      .getState()
      .getGroupPlans('group-1')
      .map((plan) => [plan.plan_id, plan.assigned_by]),
    [
      ['plan-a', 'local-user'],
      ['plan-b', 'leader-1'],
    ]
  );
  assert.deepEqual(store.getState().getGroupPlans('group-2'), []);
});

test('corrupt persisted rhythms, group plans and order are repaired on load', async () => {
  const persisted = {
    state: {
      rhythmsById: {
        'rhythm-legacy': {
          id: 'rhythm-legacy',
          title: 'Legacy',
          slot: 'midnight',
          planIds: ['plan-a', 'plan-a'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        'rhythm-broken': null,
      },
      rhythmOrder: ['rhythm-missing', 'rhythm-legacy', 'rhythm-legacy'],
      groupPlansByGroupId: {
        'group-1': [{ id: 'gp-1', group_id: 'group-1', plan_id: 'plan-a' }, null, 'junk'],
        'group-2': 'not-a-list',
      },
    },
    version: 0,
  };
  const { store } = await loadStore({ 'reading-plans-storage': JSON.stringify(persisted) });

  const legacy = store.getState().getRhythm('rhythm-legacy');
  assert.equal(legacy?.slot, undefined);
  assert.deepEqual(describeItems(legacy?.items), ['plan-a']);
  assert.equal(store.getState().getRhythm('rhythm-broken'), null);
  assert.deepEqual(store.getState().rhythmOrder, ['rhythm-legacy']);
  assert.deepEqual(
    store
      .getState()
      .getGroupPlans('group-1')
      .map((plan) => plan.id),
    ['gp-1']
  );
  assert.deepEqual(store.getState().getGroupPlans('group-2'), []);
});
