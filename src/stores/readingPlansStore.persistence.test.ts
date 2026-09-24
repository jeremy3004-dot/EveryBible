/**
 * Byte-level identity of what the reading-plans store writes to storage.
 *
 * Every installed device carries a `reading-plans-storage` blob written by an earlier release,
 * and the next release reads it back through the same persist config. The literals below were
 * captured from the store before its actions were split into slice modules; any drift in the
 * persisted keys, their order, the partialize selection, the record shapes the actions build or
 * the merge/sanitize path fails here before it can reach a user's storage.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import type { StateStorage } from 'zustand/middleware';

const STORAGE_KEY = 'reading-plans-storage';
const START = Date.parse('2026-09-01T12:00:00.000Z');

function createMemoryStorage(seed: Record<string, string> = {}) {
  const entries = new Map<string, string>(Object.entries(seed));
  const storage: StateStorage = {
    setItem: (name, value) => {
      entries.set(name, value);
    },
    getItem: (name) => entries.get(name) ?? null,
    removeItem: (name) => {
      entries.delete(name);
    },
  };
  return { storage, entries };
}

mock.timers.enable({ apis: ['Date'], now: START });

const PERSISTED_BLOB =
  '{"state":{"enrolledPlanIds":["psalms-30-days","bible-in-1-year","sermon-on-the-mount-7-days","kathisma-weekly"],"savedPlanIds":["proverbs-31-days","gospels-30-days"],"completedPlanIds":["sermon-on-the-mount-7-days"],"progressByPlanId":{"psalms-30-days":{"id":"reading-plan-progress-psalms-30-days","plan_id":"psalms-30-days","started_at":"2026-09-01T12:00:00.000Z","completed_entries":{"1":"2026-09-01T12:00:01.000Z"},"completed_sessions":{},"current_day":2,"current_session":null,"is_completed":false,"completed_at":null,"synced_at":"2026-09-01T12:00:01.000Z"},"bible-in-1-year":{"id":"reading-plan-progress-bible-in-1-year","plan_id":"bible-in-1-year","started_at":"2026-09-01T12:00:02.000Z","completed_entries":{},"completed_sessions":{"1:morning":"2026-09-01T12:00:03.000Z"},"current_day":1,"current_session":"evening","is_completed":false,"completed_at":null,"synced_at":"2026-09-01T12:00:03.000Z"},"sermon-on-the-mount-7-days":{"id":"reading-plan-progress-sermon-on-the-mount-7-days","plan_id":"sermon-on-the-mount-7-days","started_at":"2026-09-01T12:00:04.000Z","completed_entries":{"1":"2026-09-01T12:00:05.000Z","2":"2026-09-01T12:00:06.000Z","3":"2026-09-01T12:00:07.000Z","4":"2026-09-01T12:00:08.000Z","5":"2026-09-01T12:00:09.000Z","6":"2026-09-01T12:00:10.000Z","7":"2026-09-01T12:00:11.000Z"},"completed_sessions":{},"current_day":8,"current_session":null,"is_completed":true,"completed_at":"2026-09-01T12:00:11.000Z","synced_at":"2026-09-01T12:00:11.000Z"},"kathisma-weekly":{"id":"reading-plan-progress-kathisma-weekly","plan_id":"kathisma-weekly","started_at":"2026-09-01T12:00:12.000Z","completed_entries":{"2026-09-01":"2026-09-01T12:00:13.000Z"},"completed_sessions":{},"current_day":3,"current_session":null,"is_completed":false,"completed_at":null,"synced_at":"2026-09-01T12:00:13.000Z"}},"planDayResumeByKey":{"psalms-30-days:2":{"bookId":"PSA","chapter":2}},"groupPlansByGroupId":{"group-1":[{"id":"group-plan-group-1-psalms-30-days-1788264014000","group_id":"group-1","plan_id":"psalms-30-days","assigned_by":"user-a","started_at":"2026-09-01T12:00:14.000Z"}]},"rhythmsById":{"reading-plan-rhythm-1788264015000-1":{"id":"reading-plan-rhythm-1788264015000-1","title":"Dawn","slot":"morning","items":[{"id":"item-plan","type":"plan","planId":"psalms-30-days"},{"id":"item-passage","type":"passage","title":"JHN 1-3","bookId":"JHN","startChapter":1,"endChapter":3}],"createdAt":"2026-09-01T12:00:15.000Z","updatedAt":"2026-09-01T12:00:19.000Z"},"reading-plan-rhythm-1788264016000-2":{"id":"reading-plan-rhythm-1788264016000-2","title":"Evening Rhythm","slot":"evening","items":[{"id":"reading-plan-rhythm-item-1788264016000-1","type":"plan","planId":"bible-in-1-year"}],"createdAt":"2026-09-01T12:00:16.000Z","updatedAt":"2026-09-01T12:00:16.000Z"}},"rhythmOrder":["reading-plan-rhythm-1788264016000-2","reading-plan-rhythm-1788264015000-1"],"pendingUnenrollPlanIds":["acts-28-days","nt-in-30-days"],"pendingUnenrollAtByPlanId":{"acts-28-days":"2026-09-01T12:00:19.000Z","nt-in-30-days":"2026-09-01T12:00:20.000Z"}},"version":0}';

// A blob from an older release, with corrupt and pre-migration shapes: a rhythm stored as
// planIds, a progress row without session fields, a null progress entry, an unparseable leave
// time, a rhythm order naming a deleted rhythm, and a non-list group entry.
const LEGACY_BLOB = JSON.stringify({
  state: {
    enrolledPlanIds: ['psalms-30-days', 42],
    savedPlanIds: 'not-a-list',
    completedPlanIds: [],
    progressByPlanId: {
      'psalms-30-days': {
        id: 'legacy-row',
        plan_id: 'psalms-30-days',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_entries: { '1': '2026-01-02T00:00:00.000Z' },
        current_day: 2,
        is_completed: false,
        completed_at: null,
        synced_at: '2026-01-02T00:00:00.000Z',
      },
      broken: null,
    },
    planDayResumeByKey: { 'psalms-30-days:2': { bookId: 'PSA', chapter: 2 }, bad: 7 },
    groupPlansByGroupId: { 'group-1': 'nope' },
    rhythmsById: {
      'legacy-rhythm': {
        id: 'legacy-rhythm',
        title: 'Old',
        slot: 'midnight',
        planIds: ['psalms-30-days', ' psalms-30-days ', ''],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      junk: 'x',
    },
    rhythmOrder: ['gone', 'legacy-rhythm'],
    pendingUnenrollPlanIds: ['acts-28-days'],
    pendingUnenrollAtByPlanId: { 'acts-28-days': 'yesterday', 'nt-in-30-days': 5 },
  },
  version: 0,
});
const REHYDRATED_LEGACY_BLOB =
  '{"state":{"enrolledPlanIds":["psalms-30-days"],"savedPlanIds":[],"completedPlanIds":[],"progressByPlanId":{"psalms-30-days":{"id":"legacy-row","plan_id":"psalms-30-days","started_at":"2026-01-01T00:00:00.000Z","completed_entries":{"1":"2026-01-02T00:00:00.000Z"},"current_day":2,"is_completed":false,"completed_at":null,"synced_at":"2026-01-02T00:00:00.000Z","completed_sessions":{},"current_session":null}},"planDayResumeByKey":{"psalms-30-days:2":{"bookId":"PSA","chapter":2}},"groupPlansByGroupId":{"group-1":[]},"rhythmsById":{"legacy-rhythm":{"id":"legacy-rhythm","title":"Old","planIds":["psalms-30-days"," psalms-30-days ",""],"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z","items":[{"id":"reading-plan-rhythm-item-1788264021000-2","type":"plan","planId":"psalms-30-days"}]}},"rhythmOrder":["legacy-rhythm"],"pendingUnenrollPlanIds":["acts-28-days"],"pendingUnenrollAtByPlanId":{}},"version":0}';

const tickSecond = () => mock.timers.tick(1_000);

test('the persisted blob for a representative state is byte-identical to the pre-split store', async () => {
  const { createReadingPlansStore } = await import('./readingPlansStore');
  const memory = createMemoryStorage();
  const store = createReadingPlansStore(memory.storage);
  const actions = () => store.getState();

  actions().enrollPlan('psalms-30-days');
  tickSecond();
  actions().markDayComplete('psalms-30-days', 1, 30);
  tickSecond();
  actions().enrollPlan('bible-in-1-year');
  tickSecond();
  actions().markSessionComplete('bible-in-1-year', 1, 'morning', {
    completionKey: '1:morning',
    dayCompletionKey: '1',
    totalDays: 365,
    isFinalSession: false,
    advanceDayOnCompletion: true,
    nextSessionKey: 'evening',
  });
  tickSecond();
  actions().enrollPlan('sermon-on-the-mount-7-days');
  for (let day = 1; day <= 7; day += 1) {
    tickSecond();
    actions().markDayComplete('sermon-on-the-mount-7-days', day, 7);
  }
  tickSecond();
  actions().enrollPlan('kathisma-weekly');
  tickSecond();
  actions().markRecurringDayComplete('kathisma-weekly', '2026-09-01', 3);
  actions().savePlan('proverbs-31-days');
  actions().savePlan('gospels-30-days');
  actions().savePlan('gospels-30-days');
  actions().setPlanDayResume('psalms-30-days', 2, 'PSA', 2);
  tickSecond();
  actions().assignGroupPlan('group-1', 'psalms-30-days', 'user-a');
  tickSecond();
  const dawn = actions().createRhythm({
    title: ' Dawn ',
    slot: 'morning',
    items: [
      { id: 'item-plan', type: 'plan', planId: 'psalms-30-days' },
      {
        id: 'item-passage',
        type: 'passage',
        title: ' ',
        bookId: 'JHN',
        startChapter: 1,
        endChapter: 3,
      },
    ],
  });
  tickSecond();
  const evening = actions().createRhythm({ slot: 'evening', planIds: ['bible-in-1-year'] });
  tickSecond();
  actions().enrollPlan('acts-28-days');
  assert.ok(dawn.rhythm && evening.rhythm);
  actions().updateRhythm(dawn.rhythm.id, {
    title: dawn.rhythm.title,
    items: [...dawn.rhythm.items, { id: 'item-acts', type: 'plan', planId: 'acts-28-days' }],
  });
  actions().reorderRhythms([evening.rhythm.id, dawn.rhythm.id]);
  tickSecond();
  actions().setPlanDayResume('acts-28-days', 1, 'ACT', 1);
  tickSecond();
  actions().unenrollPlan('acts-28-days');
  tickSecond();
  actions().addPendingUnenroll('nt-in-30-days');
  actions().addPendingUnenroll('nt-in-30-days');

  assert.equal(memory.entries.get(STORAGE_KEY), PERSISTED_BLOB);
});

test('hydrating a legacy blob writes back the same bytes as the pre-split store', async () => {
  const { createReadingPlansStore } = await import('./readingPlansStore');
  tickSecond();
  const memory = createMemoryStorage({ [STORAGE_KEY]: LEGACY_BLOB });
  const store = createReadingPlansStore(memory.storage);
  memory.entries.delete(STORAGE_KEY);

  store.setState({});

  assert.equal(memory.entries.get(STORAGE_KEY), REHYDRATED_LEGACY_BLOB);
});

test('the persist config keeps its storage name, default version and no migration', async () => {
  const { readingPlansStore } = await import('./readingPlansStore');
  const persistApi = (
    readingPlansStore as unknown as {
      persist: { getOptions: () => { name?: string; version?: number; migrate?: unknown } };
    }
  ).persist;
  const options = persistApi.getOptions();

  assert.deepEqual(
    { name: options.name, version: options.version, migrate: options.migrate },
    { name: STORAGE_KEY, version: 0, migrate: undefined }
  );
});
