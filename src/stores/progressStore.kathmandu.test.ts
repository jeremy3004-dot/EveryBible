// Streak day boundaries with the clock pinned to Kathmandu (UTC+5:45), where the
// local day starts 5h45m before the UTC one: an early-morning read is still the
// previous day in UTC. Each test file is its own process, so pinning TZ is safe.
process.env.TZ = 'Asia/Kathmandu';

import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockModule, sourcePath } from '../testing/mockModules';

mockMmkvStorage(mock);
mockModule(mock, sourcePath('services/sync/index.ts'), {
  syncProgress: async () => ({ success: true }),
});
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: { getState: () => ({ user: null, authGeneration: undefined }) },
});

let progress: typeof import('./progressStore');

before(async () => {
  progress = await import('./progressStore');
});

const state = () => progress.useProgressStore.getState();

/** A wall-clock instant in Kathmandu. */
const kathmandu = (month: number, day: number, hour: number, minute = 0) =>
  new Date(2026, month - 1, day, hour, minute, 0, 0).getTime();

beforeEach(() => {
  progress.useProgressStore.setState(progress.useProgressStore.getInitialState(), true);
});

test('the pinned timezone really is UTC+5:45', () => {
  // ICU may report the zone under its older "Asia/Katmandu" spelling, so check the offset.
  assert.equal(new Date(kathmandu(9, 9, 5)).getTimezoneOffset(), -345);
});

test('a 05:00 read is dated by the Kathmandu day even though UTC is still on yesterday', (t) => {
  // 05:00 on the 9th in Kathmandu is 23:15 on the 8th in UTC.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: kathmandu(9, 9, 5) });

  state().markChapterRead('GEN', 1);

  assert.equal(state().lastReadDate, '2026-09-09');
});

test('daily 05:00 reads build a streak one Kathmandu day at a time', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: kathmandu(9, 8, 5) });
  state().markChapterRead('GEN', 1);
  t.mock.timers.setTime(kathmandu(9, 9, 5));
  state().markChapterRead('GEN', 2);
  t.mock.timers.setTime(kathmandu(9, 10, 5));
  state().markChapterRead('GEN', 3);

  assert.deepEqual([state().streakDays, state().lastReadDate], [3, '2026-09-10']);
});

test('a UTC-dated lastReadDate from an old build continues after an early-morning read', (t) => {
  // The old build dated the 05:00 read on the 9th as the UTC day, the 8th.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: kathmandu(9, 10, 5) });
  progress.useProgressStore.setState({
    streakDays: 4,
    lastReadDate: '2026-09-08',
    chaptersRead: { GEN_1: kathmandu(9, 9, 5) },
  });

  state().markChapterRead('GEN', 2);

  assert.deepEqual([state().streakDays, state().lastReadDate], [5, '2026-09-10']);
});

test('the shown streak ends at Kathmandu midnight after a missed day, not at UTC midnight', () => {
  const shown = (now: number) =>
    progress.selectCurrentStreakDays({ streakDays: 4, lastReadDate: '2026-09-08' }, new Date(now));

  // 23:50 on the 9th is still "yesterday was a read day"; 00:10 on the 10th is not.
  assert.deepEqual([shown(kathmandu(9, 9, 23, 50)), shown(kathmandu(9, 10, 0, 10))], [4, 0]);
});
