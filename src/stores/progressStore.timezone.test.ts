// Streak and period-window behaviour with the device clock pinned to a real
// timezone that observes daylight saving. The sibling progressStore.test.ts runs
// in whatever timezone the machine happens to be in, so it cannot prove that day
// boundaries follow the reader's calendar rather than UTC, nor that a 23- or
// 25-hour day still resolves to one calendar day. Pinning TZ here is safe
// because the test runner gives every file its own process.
process.env.TZ = 'America/New_York';

import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockModule, sourcePath } from '../testing/mockModules';

// One mock configuration per file: MMKV so the persisted store hydrates, plus
// silent stand-ins for the two modules progressStore reaches for when a read is
// recorded (the sync service it lazily imports, the auth store it requires).
mockMmkvStorage(mock);
mockModule(mock, sourcePath('services/sync/index.ts'), {
  syncProgress: async () => ({ success: true }),
});
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: { getState: () => ({ user: null, authGeneration: undefined }) },
});

let useProgressStore: typeof import('./progressStore').useProgressStore;

before(async () => {
  ({ useProgressStore } = await import('./progressStore'));
});

const state = () => useProgressStore.getState();

/** A local wall-clock instant in the pinned timezone. */
const eastern = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute, 0, 0).getTime();

beforeEach(() => {
  useProgressStore.setState(useProgressStore.getInitialState(), true);
});

test('the pinned timezone really is the one these expectations were written for', () => {
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, 'America/New_York');
});

// ---------------------------------------------------------------------------
// local day vs UTC day
// ---------------------------------------------------------------------------

test('a late-evening read is dated by the local calendar day, not the UTC one', (t) => {
  // 22:00 in New York is already 02:00 the next day in UTC.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: eastern(2026, 9, 8, 22) });

  state().markChapterRead('GEN', 1);

  assert.equal(state().lastReadDate, '2026-09-08');
});

test('a read just after local midnight opens the new local day', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: eastern(2026, 9, 8, 22) });
  state().markChapterRead('GEN', 1);

  t.mock.timers.setTime(eastern(2026, 9, 9, 0, 30));
  state().markChapterRead('GEN', 2);

  assert.equal(state().lastReadDate, '2026-09-09');
  assert.equal(state().streakDays, 2);
});

test('two reads on the same local evening are one streak day even across the UTC midnight', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: eastern(2026, 9, 8, 19, 30) });
  state().markChapterRead('GEN', 1);

  // Still 2026-09-08 locally, but 2026-09-09 in UTC.
  t.mock.timers.setTime(eastern(2026, 9, 8, 21, 30));
  state().markChapterRead('GEN', 2);

  assert.equal(state().streakDays, 1);
  assert.equal(state().lastReadDate, '2026-09-08');
});

// ---------------------------------------------------------------------------
// daylight saving transitions
// ---------------------------------------------------------------------------

test('a streak continues across the 23-hour spring-forward day', (t) => {
  // 2026-03-08 loses an hour at 02:00 Eastern.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: eastern(2026, 3, 8, 12) });
  useProgressStore.setState({ streakDays: 11, lastReadDate: '2026-03-07' });

  state().updateStreak();

  assert.equal(state().streakDays, 12);
  assert.equal(state().lastReadDate, '2026-03-08');
});

test('a streak continues out of the spring-forward day into the next one', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: eastern(2026, 3, 9, 8) });
  useProgressStore.setState({ streakDays: 12, lastReadDate: '2026-03-08' });

  state().updateStreak();

  assert.equal(state().streakDays, 13);
  assert.equal(state().lastReadDate, '2026-03-09');
});

test('a streak continues across the 25-hour fall-back day', (t) => {
  // 2026-11-01 repeats the 01:00 hour Eastern.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: eastern(2026, 11, 1, 12) });
  useProgressStore.setState({ streakDays: 3, lastReadDate: '2026-10-31' });

  state().updateStreak();

  assert.equal(state().streakDays, 4);
  assert.equal(state().lastReadDate, '2026-11-01');
});

test('a read in the repeated hour of the fall-back day is still the same streak day', (t) => {
  // 01:30 occurs twice on 2026-11-01; both instants are the same calendar day.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: eastern(2026, 11, 1, 1, 30) });
  state().markChapterRead('GEN', 1);
  const firstPass = state().streakDays;

  t.mock.timers.setTime(eastern(2026, 11, 1, 1, 30) + 60 * 60 * 1000);
  state().markChapterRead('GEN', 2);

  assert.deepEqual([firstPass, state().streakDays], [1, 1]);
});

test('a gap that spans the spring-forward day still resets the streak', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: eastern(2026, 3, 10, 12) });
  useProgressStore.setState({ streakDays: 20, lastReadDate: '2026-03-06' });

  state().updateStreak();

  assert.equal(state().streakDays, 1);
  assert.equal(state().lastReadDate, '2026-03-10');
});

// ---------------------------------------------------------------------------
// period windows around a DST boundary
// ---------------------------------------------------------------------------

test("today's window opens at local midnight on the day an hour is lost", (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: eastern(2026, 3, 8, 12) });
  useProgressStore.setState({
    chaptersRead: {
      GEN_1: eastern(2026, 3, 8, 0, 30), // just after local midnight, counts
      GEN_2: eastern(2026, 3, 7, 23, 30), // late the previous evening, does not
    },
  });

  assert.equal(state().getTodayCount(), 1);
});

test('the week window opens at local midnight on Sunday', (t) => {
  // Wednesday 2026-09-09; its week starts Sunday 2026-09-06.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: eastern(2026, 9, 9, 12) });
  useProgressStore.setState({
    chaptersRead: {
      GEN_1: new Date(2026, 8, 6, 0, 0, 0, 0).getTime(), // Sunday midnight, counts
      GEN_2: new Date(2026, 8, 5, 23, 59, 59, 999).getTime(), // Saturday, does not
    },
  });

  assert.equal(state().getWeekCount(), 1);
});

test('a week that contains the spring-forward day still starts on its own Sunday', (t) => {
  // Tuesday 2026-03-10; the week began Sunday 2026-03-08, the day an hour vanished.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: eastern(2026, 3, 10, 12) });
  useProgressStore.setState({
    chaptersRead: {
      GEN_1: eastern(2026, 3, 8, 12),
      GEN_2: eastern(2026, 3, 7, 12),
    },
  });

  assert.equal(state().getWeekCount(), 1);
});

test('the month window opens at local midnight on the first', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: eastern(2026, 11, 15, 12) });
  useProgressStore.setState({
    chaptersRead: {
      GEN_1: new Date(2026, 10, 1, 0, 0, 0, 0).getTime(),
      GEN_2: new Date(2026, 9, 31, 23, 59, 59, 999).getTime(),
    },
  });

  assert.equal(state().getMonthCount(), 1);
});

// ---------------------------------------------------------------------------
// listening ledger day keys
// ---------------------------------------------------------------------------

test('listening minutes are banked under the local day even late in the evening', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: eastern(2026, 9, 8, 22) });

  state().markChapterListened('GEN', 1, 60_000);

  assert.deepEqual(state().listeningMsByDate, { '2026-09-08': 60_000 });
});

test('a listen either side of local midnight is banked under two different days', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: eastern(2026, 9, 8, 23, 55) });
  state().markChapterListened('GEN', 1, 60_000);

  t.mock.timers.setTime(eastern(2026, 9, 9, 0, 5));
  state().markChapterListened('GEN', 2, 30_000);

  assert.deepEqual(state().listeningMsByDate, {
    '2026-09-08': 60_000,
    '2026-09-09': 30_000,
  });
});
