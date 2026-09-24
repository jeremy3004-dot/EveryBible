import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage, mockModule, sourcePath } from '../testing/mockModules';

// One mock configuration per file.
const mmkv = mockMmkvStorage(mock);

// progressStore lazily `import()`s the sync service inside its debounce, and
// synchronously `require()`s authStore to read the signed-in identity. Both are
// replaced by recorders so the sync trigger can be observed without loading the
// real auth/sync graphs. Local helper: `syncCalls` + the mutable `authState`
// stand in for a shared "recorder" fake we do not have yet.
const syncCalls: Array<[string | undefined, number | undefined]> = [];
let syncFailure: Error | null = null;
mockModule(mock, sourcePath('services/sync/index.ts'), {
  syncProgress: (userId: string | undefined, generation: number | undefined) => {
    syncCalls.push([userId, generation]);
    return syncFailure ? Promise.reject(syncFailure) : Promise.resolve({ success: true });
  },
});

let authState: { user: { uid: string } | null; authGeneration: number | undefined } = {
  user: { uid: 'user-1' },
  authGeneration: 3,
};
let authStoreThrows = false;
mockModule(mock, sourcePath('stores/authStore.ts'), {
  useAuthStore: {
    getState: () => {
      if (authStoreThrows) {
        throw new Error('auth store not initialized');
      }
      return authState;
    },
  },
});

let useProgressStore: typeof import('./progressStore').useProgressStore;

before(async () => {
  ({ useProgressStore } = await import('./progressStore'));
});

// Wait for the loader operation scheduled by the fake timer before asserting.
const flushSync = async () => {
  await import('../services/sync');
  await new Promise((resolve) => setImmediate(resolve));
};

const state = () => useProgressStore.getState();
const readPersisted = () => JSON.parse(mmkv.store.get('progress-storage') ?? '{}');

const seedStorage = (persistedState: unknown) => {
  mmkv.store.set('progress-storage', JSON.stringify({ state: persistedState, version: 0 }));
};

/** Local midnight of a Y/M/D, so tests read as calendar days, not epoch numbers. */
const localNoon = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12, 0, 0, 0).getTime();

beforeEach(() => {
  state().resetForSignOut();
  useProgressStore.setState(useProgressStore.getInitialState(), true);
  mmkv.store.clear();
  syncCalls.length = 0;
  syncFailure = null;
  authState = { user: { uid: 'user-1' }, authGeneration: 3 };
  authStoreThrows = false;
});

// ---------------------------------------------------------------------------
// markChapterRead
// ---------------------------------------------------------------------------

test('marking a chapter read records it under a bookId_chapter key with the current time', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });

  state().markChapterRead('GEN', 1);

  assert.deepEqual(state().chaptersRead, { GEN_1: localNoon(2026, 9, 8) });
});

test('marking a chapter read persists it to MMKV', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });

  state().markChapterRead('GEN', 1);

  assert.deepEqual(readPersisted().state.chaptersRead, { GEN_1: localNoon(2026, 9, 8) });
});

test('only the five ledgers hydration restores are persisted, not the computed getters', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });

  state().markChapterRead('GEN', 1);

  assert.deepEqual(Object.keys(readPersisted().state).sort(), [
    'chaptersListened',
    'chaptersRead',
    'lastReadDate',
    'listeningMsByDate',
    'streakDays',
  ]);
});

test('a mutation that leaves the persisted ledgers unchanged does not rewrite storage', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  state().markChapterRead('GEN', 1);
  const writes = t.mock.method(mmkv.zustandStorage, 'setItem');

  state().updateStreak();
  useProgressStore.setState({});
  assert.equal(writes.mock.callCount(), 0);

  state().markChapterRead('GEN', 2);
  assert.equal(writes.mock.callCount(), 1);
});

test('after the stored ledger is cleared, the next unchanged mutation writes it back', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  state().markChapterRead('GEN', 1);

  await useProgressStore.persist.clearStorage();
  assert.equal(mmkv.store.has('progress-storage'), false);

  // The in-memory ledger still holds GEN 1; the write-skip cache must not
  // treat the cleared storage as already holding it.
  useProgressStore.setState({});
  assert.deepEqual(Object.keys(readPersisted().state.chaptersRead), ['GEN_1']);
});

test('re-reading a chapter overwrites its timestamp rather than adding a key', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  state().markChapterRead('GEN', 1);

  t.mock.timers.setTime(localNoon(2026, 9, 9));
  state().markChapterRead('GEN', 1);

  assert.deepEqual(state().chaptersRead, { GEN_1: localNoon(2026, 9, 9) });
});

test('isChapterRead reflects only chapters that were marked', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  state().markChapterRead('GEN', 1);

  assert.equal(state().isChapterRead('GEN', 1), true);
  assert.equal(state().isChapterRead('GEN', 2), false);
  assert.equal(state().isChapterRead('JHN', 1), false);
});

// ---------------------------------------------------------------------------
// streaks
// ---------------------------------------------------------------------------

test('the first ever read starts a one-day streak dated today in local time', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });

  state().markChapterRead('GEN', 1);

  assert.equal(state().streakDays, 1);
  assert.equal(state().lastReadDate, '2026-09-08');
});

test('a second read on the same day does not advance the streak', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  state().markChapterRead('GEN', 1);

  state().markChapterRead('GEN', 2);

  assert.equal(state().streakDays, 1);
});

test('reading on the next calendar day continues the streak', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  state().markChapterRead('GEN', 1);

  t.mock.timers.setTime(localNoon(2026, 9, 9));
  state().markChapterRead('GEN', 2);

  assert.equal(state().streakDays, 2);
  assert.equal(state().lastReadDate, '2026-09-09');
});

test('skipping a single day breaks the streak', (t) => {
  // Read on the 8th, nothing on the 9th, read again on the 10th.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  state().markChapterRead('GEN', 1);

  t.mock.timers.setTime(localNoon(2026, 9, 10));
  state().markChapterRead('GEN', 2);

  assert.equal(state().streakDays, 1);
  assert.equal(state().lastReadDate, '2026-09-10');
});

test('a UTC-dated lastReadDate from before the local-day fix continues when a chapter was read yesterday', (t) => {
  // Builds before the fix stored the UTC date, which can trail the reader's own
  // calendar by a day. The chapter ledger's timestamps are exact, so a read that
  // fell on the local yesterday still proves the streak is unbroken.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 10) });
  useProgressStore.setState({
    streakDays: 7,
    lastReadDate: '2026-09-08',
    chaptersRead: { GEN_1: localNoon(2026, 9, 9) },
  });

  state().updateStreak();

  assert.equal(state().streakDays, 8);
  assert.equal(state().lastReadDate, '2026-09-10');
});

test('a three-day gap resets the streak to one', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 11) });
  useProgressStore.setState({ streakDays: 7, lastReadDate: '2026-09-08' });

  state().updateStreak();

  assert.equal(state().streakDays, 1);
  assert.equal(state().lastReadDate, '2026-09-11');
});

test('a streak continues across a month boundary', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 10, 1) });
  useProgressStore.setState({ streakDays: 4, lastReadDate: '2026-09-30' });

  state().updateStreak();

  assert.equal(state().streakDays, 5);
  assert.equal(state().lastReadDate, '2026-10-01');
});

test('a streak continues across a year boundary', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2027, 1, 1) });
  useProgressStore.setState({ streakDays: 30, lastReadDate: '2026-12-31' });

  state().updateStreak();

  assert.equal(state().streakDays, 31);
  assert.equal(state().lastReadDate, '2027-01-01');
});

test('the day key is the local calendar day, not the UTC day', (t) => {
  // 23:30 local on 2026-09-08. In any timezone east of UTC this is already the
  // 9th in UTC; the streak must still be dated by the reader's own calendar.
  t.mock.timers.enable({
    apis: ['Date', 'setTimeout'],
    now: new Date(2026, 8, 8, 23, 30, 0, 0).getTime(),
  });

  state().updateStreak();

  assert.equal(state().lastReadDate, '2026-09-08');
});

test('updateStreak is a no-op once today is already recorded', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  useProgressStore.setState({ streakDays: 5, lastReadDate: '2026-09-08' });

  state().updateStreak();

  assert.equal(state().streakDays, 5);
});

test('a first read with no stored lastReadDate starts a fresh streak', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  useProgressStore.setState({ streakDays: 9, lastReadDate: null });

  state().updateStreak();

  assert.equal(state().streakDays, 1);
});

// ---------------------------------------------------------------------------
// period counts
// ---------------------------------------------------------------------------

test('the period counters only count chapters read inside each window', (t) => {
  // Wednesday 2026-09-09; the containing week starts Sunday 2026-09-06.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 9) });
  useProgressStore.setState({
    chaptersRead: {
      GEN_1: localNoon(2026, 9, 9),
      GEN_2: localNoon(2026, 9, 7),
      GEN_3: localNoon(2026, 9, 2),
      GEN_4: localNoon(2026, 3, 2),
      GEN_5: localNoon(2025, 12, 31),
    },
  });

  assert.deepEqual(
    {
      today: state().getTodayCount(),
      week: state().getWeekCount(),
      month: state().getMonthCount(),
      year: state().getYearCount(),
    },
    { today: 1, week: 2, month: 3, year: 4 }
  );
});

test('the year window opens on 1 January, not on the current day of the month', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 9) });
  useProgressStore.setState({
    chaptersRead: {
      GEN_1: localNoon(2026, 1, 2), // early January, inside this year
      GEN_2: localNoon(2025, 12, 31), // last year, outside
    },
  });

  assert.equal(state().getYearCount(), 1);
});

test('a chapter read at exactly local midnight counts toward today', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 9) });
  useProgressStore.setState({
    chaptersRead: { GEN_1: new Date(2026, 8, 9, 0, 0, 0, 0).getTime() },
  });

  assert.equal(state().getTodayCount(), 1);
});

test('every period counter is zero on a fresh install', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 9) });

  assert.deepEqual(
    [
      state().getTodayCount(),
      state().getWeekCount(),
      state().getMonthCount(),
      state().getYearCount(),
    ],
    [0, 0, 0, 0]
  );
});

// ---------------------------------------------------------------------------
// markChapterListened / recordListeningTime
// ---------------------------------------------------------------------------

test('a completed listen is recorded per chapter without banking any minutes', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });

  state().markChapterListened('GEN', 1);

  assert.deepEqual(state().chaptersListened, { GEN_1: localNoon(2026, 9, 8) });
  // The minutes were banked as they were heard; the finish must not add them twice.
  assert.deepEqual(state().listeningMsByDate, {});
});

test('listening time is banked by local day as it is heard', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });

  state().recordListeningTime(30_000);

  assert.deepEqual(state().listeningMsByDate, { '2026-09-08': 30_000 });
  assert.deepEqual(state().chaptersListened, {}, 'time alone does not mark a chapter heard');
});

test('listening time accumulates within the same local day', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });

  state().recordListeningTime(60_000);
  state().recordListeningTime(30_000);

  assert.deepEqual(state().listeningMsByDate, { '2026-09-08': 90_000 });
});

test('listening on a later day is banked under the new day', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  state().recordListeningTime(60_000);
  state().markChapterListened('GEN', 1);

  t.mock.timers.setTime(localNoon(2026, 9, 9));
  state().recordListeningTime(45_000);
  state().markChapterListened('GEN', 1);

  assert.deepEqual(state().listeningMsByDate, {
    '2026-09-08': 60_000,
    '2026-09-09': 45_000,
  });
  assert.deepEqual(state().chaptersListened, { GEN_1: localNoon(2026, 9, 9) });
});

test('a fractional listening time is rounded to whole milliseconds', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });

  state().recordListeningTime(1234.6);

  assert.deepEqual(state().listeningMsByDate, { '2026-09-08': 1235 });
});

test('a zero, negative or non-finite listening time leaves the ledger alone', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  const before = state().listeningMsByDate;

  state().recordListeningTime(0);
  state().recordListeningTime(-5000);
  state().recordListeningTime(Number.NaN);
  // A clock that jumps or a live stream must never poison the day's minute total.
  state().recordListeningTime(Number.POSITIVE_INFINITY);

  assert.deepEqual(state().listeningMsByDate, {});
  assert.equal(state().listeningMsByDate, before, 'no store write for nothing heard');
});

test('listening never touches the read ledger, the streak, or the sync trigger', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });

  state().markChapterListened('GEN', 1);
  state().recordListeningTime(60_000);
  t.mock.timers.tick(5000);

  assert.deepEqual(state().chaptersRead, {});
  assert.equal(state().streakDays, 0);
  assert.deepEqual(syncCalls, []);
});

// ---------------------------------------------------------------------------
// applySyncedProgress
// ---------------------------------------------------------------------------

test('applying synced progress overwrites the read ledger, streak and last-read date', () => {
  state().applySyncedProgress({
    chaptersRead: { GEN_1: 100, GEN_2: 200 },
    streakDays: 4,
    lastReadDate: '2026-09-08',
  });

  assert.deepEqual(state().chaptersRead, { GEN_1: 100, GEN_2: 200 });
  assert.equal(state().streakDays, 4);
  assert.equal(state().lastReadDate, '2026-09-08');
});

test('applying identical synced progress leaves the state object untouched', () => {
  useProgressStore.setState({
    chaptersRead: { GEN_1: 100 },
    streakDays: 4,
    lastReadDate: '2026-09-08',
  });
  const before = state().chaptersRead;

  state().applySyncedProgress({
    chaptersRead: { GEN_1: 100 },
    streakDays: 4,
    lastReadDate: '2026-09-08',
  });

  assert.equal(state().chaptersRead, before);
});

test('a changed streak alone is enough to apply synced progress', () => {
  useProgressStore.setState({ chaptersRead: {}, streakDays: 1, lastReadDate: '2026-09-08' });

  state().applySyncedProgress({ chaptersRead: {}, streakDays: 9, lastReadDate: '2026-09-08' });

  assert.equal(state().streakDays, 9);
});

test('a changed last-read date alone is enough to apply synced progress', () => {
  useProgressStore.setState({ chaptersRead: {}, streakDays: 1, lastReadDate: '2026-09-08' });

  state().applySyncedProgress({ chaptersRead: {}, streakDays: 1, lastReadDate: '2026-09-09' });

  assert.equal(state().lastReadDate, '2026-09-09');
});

test('a differing chapter timestamp is enough to apply synced progress', () => {
  useProgressStore.setState({ chaptersRead: { GEN_1: 100 }, streakDays: 1, lastReadDate: null });

  state().applySyncedProgress({
    chaptersRead: { GEN_1: 999 },
    streakDays: 1,
    lastReadDate: null,
  });

  assert.deepEqual(state().chaptersRead, { GEN_1: 999 });
});

test('a synced ledger with a chapter removed shrinks the local ledger', () => {
  // The server dropping a chapter is only visible in the key count: every key it
  // still sends matches, so the per-entry comparison alone would call this a no-op.
  useProgressStore.setState({
    chaptersRead: { GEN_1: 100, GEN_2: 200 },
    streakDays: 4,
    lastReadDate: '2026-09-08',
  });

  state().applySyncedProgress({
    chaptersRead: { GEN_1: 100 },
    streakDays: 4,
    lastReadDate: '2026-09-08',
  });

  assert.deepEqual(state().chaptersRead, { GEN_1: 100 });
});

test('applying synced progress leaves the listening ledger alone', () => {
  useProgressStore.setState({
    chaptersListened: { GEN_1: 50 },
    listeningMsByDate: { '2026-09-08': 1000 },
  });

  state().applySyncedProgress({ chaptersRead: { GEN_2: 5 }, streakDays: 2, lastReadDate: null });

  assert.deepEqual(state().chaptersListened, { GEN_1: 50 });
  assert.deepEqual(state().listeningMsByDate, { '2026-09-08': 1000 });
});

// ---------------------------------------------------------------------------
// debounced sync trigger
// ---------------------------------------------------------------------------

test('marking a chapter read schedules a sync two seconds later with the signed-in identity', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });

  state().markChapterRead('GEN', 1);
  assert.deepEqual(syncCalls, []);

  t.mock.timers.tick(2000);
  await flushSync();

  assert.deepEqual(syncCalls, [['user-1', 3]]);
});

test('rapid navigation debounces down to a single sync', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });

  state().markChapterRead('GEN', 1);
  t.mock.timers.tick(1500);
  state().markChapterRead('GEN', 2);
  t.mock.timers.tick(1500);
  state().markChapterRead('GEN', 3);
  t.mock.timers.tick(2000);
  await flushSync();

  assert.equal(syncCalls.length, 1);
});

test('a guest read never schedules a sync', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  authState = { user: null, authGeneration: undefined };

  state().markChapterRead('GEN', 1);
  t.mock.timers.tick(10_000);
  await flushSync();

  assert.deepEqual(syncCalls, []);
});

test('a guest read still cancels a sync already queued by a signed-in session', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  state().markChapterRead('GEN', 1);

  authState = { user: null, authGeneration: undefined };
  state().markChapterRead('GEN', 2);
  t.mock.timers.tick(10_000);
  await flushSync();

  assert.deepEqual(syncCalls, []);
});

test('an unavailable auth store degrades to no sync instead of throwing', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  authStoreThrows = true;

  state().markChapterRead('GEN', 1);
  t.mock.timers.tick(10_000);
  await flushSync();

  assert.deepEqual(state().chaptersRead, { GEN_1: localNoon(2026, 9, 8) });
  assert.deepEqual(syncCalls, []);
});

test('a rejected sync is swallowed so a background failure never surfaces', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  syncFailure = new Error('network down');

  state().markChapterRead('GEN', 1);
  t.mock.timers.tick(2000);
  await flushSync();
  await flushSync();

  assert.equal(syncCalls.length, 1);
});

test('the identity is captured when the read happens, not when the debounce fires', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });

  state().markChapterRead('GEN', 1);
  authState = { user: { uid: 'someone-else' }, authGeneration: 99 };
  t.mock.timers.tick(2000);
  await flushSync();

  assert.deepEqual(syncCalls, [['user-1', 3]]);
});

// ---------------------------------------------------------------------------
// resetForSignOut
// ---------------------------------------------------------------------------

test('resetForSignOut clears every ledger back to its initial value', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  state().markChapterRead('GEN', 1);
  state().markChapterListened('GEN', 1);
  state().recordListeningTime(60_000);

  state().resetForSignOut();

  assert.deepEqual(
    {
      chaptersRead: state().chaptersRead,
      chaptersListened: state().chaptersListened,
      listeningMsByDate: state().listeningMsByDate,
      streakDays: state().streakDays,
      lastReadDate: state().lastReadDate,
    },
    {
      chaptersRead: {},
      chaptersListened: {},
      listeningMsByDate: {},
      streakDays: 0,
      lastReadDate: null,
    }
  );
});

test('resetForSignOut wipes the persisted snapshot so the next account starts clean', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  state().markChapterRead('GEN', 1);

  state().resetForSignOut();

  assert.deepEqual(readPersisted().state.chaptersRead, {});
  assert.equal(readPersisted().state.streakDays, 0);
});

test('resetForSignOut cancels a sync that was already queued for the old account', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  state().markChapterRead('GEN', 1);

  state().resetForSignOut();
  t.mock.timers.tick(10_000);
  await flushSync();

  assert.deepEqual(syncCalls, []);
});

test('resetForSignOut with no queued sync is safe', () => {
  state().resetForSignOut();

  assert.deepEqual(state().chaptersRead, {});
});

// ---------------------------------------------------------------------------
// hydration through sanitizePersistedProgressState
// ---------------------------------------------------------------------------

test('a well-formed snapshot hydrates every ledger', async () => {
  seedStorage({
    chaptersRead: { GEN_1: 1000 },
    chaptersListened: { JHN_3: 2000 },
    listeningMsByDate: { '2026-09-08': 60_000 },
    streakDays: 6,
    lastReadDate: '2026-09-08',
  });

  await useProgressStore.persist.rehydrate();

  assert.deepEqual(state().chaptersRead, { GEN_1: 1000 });
  assert.deepEqual(state().chaptersListened, { JHN_3: 2000 });
  assert.deepEqual(state().listeningMsByDate, { '2026-09-08': 60_000 });
  assert.equal(state().streakDays, 6);
  assert.equal(state().lastReadDate, '2026-09-08');
});

test('chapter keys naming an unknown book or a bad chapter are dropped on hydration', async () => {
  seedStorage({
    chaptersRead: {
      GEN_1: 1000,
      XYZ_1: 1000,
      GEN_0: 1000,
      GEN_notanumber: 1000,
      nounderscore: 1000,
    },
  });

  await useProgressStore.persist.rehydrate();

  assert.deepEqual(state().chaptersRead, { GEN_1: 1000 });
});

test('chapter timestamps that are not positive finite numbers are dropped on hydration', async () => {
  seedStorage({ chaptersRead: { GEN_1: 0, GEN_2: 'yesterday', GEN_3: 1000 } });

  await useProgressStore.persist.rehydrate();

  assert.deepEqual(state().chaptersRead, { GEN_3: 1000 });
});

test('a pre-upgrade snapshot without the listening ledgers hydrates them as empty', async () => {
  seedStorage({ chaptersRead: { GEN_1: 1000 }, streakDays: 2, lastReadDate: '2026-09-08' });

  await useProgressStore.persist.rehydrate();

  assert.deepEqual(state().chaptersListened, {});
  assert.deepEqual(state().listeningMsByDate, {});
});

test('listening-day keys that are not YYYY-MM-DD, or hold a bad duration, are dropped', async () => {
  seedStorage({
    listeningMsByDate: {
      '2026-09-08': 60_000,
      'last tuesday': 1000,
      '2026-9-8': 1000,
      '2026-09-09': 0,
      '2026-09-10': 'lots',
    },
  });

  await useProgressStore.persist.rehydrate();

  assert.deepEqual(state().listeningMsByDate, { '2026-09-08': 60_000 });
});

test('a negative or fractional streak is normalised on hydration', async () => {
  seedStorage({ streakDays: -4 });
  await useProgressStore.persist.rehydrate();
  assert.equal(state().streakDays, 0);

  seedStorage({ streakDays: 5.9 });
  await useProgressStore.persist.rehydrate();
  assert.equal(state().streakDays, 5);
});

test('an empty-string or non-string lastReadDate hydrates as null', async () => {
  seedStorage({ lastReadDate: '' });
  await useProgressStore.persist.rehydrate();
  assert.equal(state().lastReadDate, null);

  seedStorage({ lastReadDate: 20260908 });
  await useProgressStore.persist.rehydrate();
  assert.equal(state().lastReadDate, null);
});

test('a snapshot that is not an object hydrates to a clean initial state', async () => {
  seedStorage('corrupted');

  await useProgressStore.persist.rehydrate();

  assert.deepEqual(state().chaptersRead, {});
  assert.equal(state().streakDays, 0);
  assert.equal(state().lastReadDate, null);
});

test('hydration keeps the actions callable', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  seedStorage({ chaptersRead: { GEN_1: 1000 }, streakDays: 3, lastReadDate: '2026-09-07' });

  await useProgressStore.persist.rehydrate();
  state().markChapterRead('GEN', 2);

  assert.equal(state().streakDays, 4);
  assert.equal(state().isChapterRead('GEN', 1), true);
});

// ---------------------------------------------------------------------------
// streak edges that only a clock jump or a corrupted snapshot can produce
// ---------------------------------------------------------------------------

test('a lastReadDate in the future is treated as a broken streak and restarts at one', (t) => {
  // Reached by a device whose clock was wound back, or by a reader flying west
  // across the date line after logging a chapter.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  useProgressStore.setState({ streakDays: 12, lastReadDate: '2026-09-20' });

  state().updateStreak();

  assert.equal(state().streakDays, 1);
  assert.equal(state().lastReadDate, '2026-09-08');
});

test('a lastReadDate one day ahead, from flying west over the date line, keeps the streak', (t) => {
  // Read on the 9th in Tokyo, land in Honolulu where it is still the 8th: the
  // reader has not missed a day, so neither the count nor its date moves back.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  useProgressStore.setState({ streakDays: 12, lastReadDate: '2026-09-09' });

  state().updateStreak();

  assert.equal(state().streakDays, 12);
  assert.equal(state().lastReadDate, '2026-09-09');
});

test('after flying west the streak carries on from the day already logged', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  useProgressStore.setState({ streakDays: 12, lastReadDate: '2026-09-09' });
  state().updateStreak();

  t.mock.timers.setTime(localNoon(2026, 9, 10));
  state().updateStreak();

  assert.equal(state().streakDays, 13);
  assert.equal(state().lastReadDate, '2026-09-10');
});

// ---------------------------------------------------------------------------
// the streak a screen shows
// ---------------------------------------------------------------------------

test('the shown streak is the stored count while the last read was today or yesterday', async () => {
  const { selectCurrentStreakDays } = await import('./progressStore');
  const now = new Date(localNoon(2026, 9, 10));

  assert.deepEqual(
    ['2026-09-10', '2026-09-09'].map((lastReadDate) =>
      selectCurrentStreakDays({ streakDays: 6, lastReadDate }, now)
    ),
    [6, 6]
  );
});

test('the shown streak drops to zero once a whole day has passed without reading', async () => {
  // The stored count only changes on the next read, so a reader who stopped a
  // week ago must not keep seeing last week's streak.
  const { selectCurrentStreakDays } = await import('./progressStore');
  const now = new Date(localNoon(2026, 9, 10));

  assert.deepEqual(
    ['2026-09-08', '2026-08-01', null].map((lastReadDate) =>
      selectCurrentStreakDays({ streakDays: 6, lastReadDate }, now)
    ),
    [0, 0, 0]
  );
});

test('the shown streak survives a westward date-line crossing', async () => {
  const { selectCurrentStreakDays } = await import('./progressStore');

  assert.equal(
    selectCurrentStreakDays(
      { streakDays: 6, lastReadDate: '2026-09-11' },
      new Date(localNoon(2026, 9, 10))
    ),
    6
  );
});

test('a zero streak already dated today stays zero, because today is never re-counted', (t) => {
  // Only reachable from a snapshot whose streak was sanitized away while its
  // lastReadDate survived; documents that the guard is on the date, not the count.
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  useProgressStore.setState({ streakDays: 0, lastReadDate: '2026-09-08' });

  state().markChapterRead('GEN', 1);

  assert.equal(state().streakDays, 0);
});

test('a legacy UTC-dated streak resumes once, and a later real gap still breaks it', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 10) });
  useProgressStore.setState({
    streakDays: 5,
    lastReadDate: '2026-09-08',
    chaptersRead: { GEN_1: localNoon(2026, 9, 9) },
  });
  state().updateStreak();
  const resumed = state().streakDays;

  t.mock.timers.setTime(localNoon(2026, 9, 13));
  state().updateStreak();

  assert.deepEqual([resumed, state().streakDays], [6, 1]);
});

// ---------------------------------------------------------------------------
// what must not trigger a sync
// ---------------------------------------------------------------------------

test('applying synced progress never schedules another sync, so pulls cannot loop', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });

  state().applySyncedProgress({
    chaptersRead: { GEN_1: 100 },
    streakDays: 4,
    lastReadDate: '2026-09-08',
  });
  t.mock.timers.tick(10_000);
  await flushSync();

  assert.deepEqual(syncCalls, []);
});

test('re-reading a chapter already recorded today still schedules a sync', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  state().markChapterRead('GEN', 1);
  t.mock.timers.tick(2000);
  await flushSync();

  state().markChapterRead('GEN', 1);
  t.mock.timers.tick(2000);
  await flushSync();

  assert.equal(syncCalls.length, 2);
});

test('a sync queued before sign-out is not revived by the next reader', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: localNoon(2026, 9, 8) });
  state().markChapterRead('GEN', 1);
  state().resetForSignOut();

  authState = { user: { uid: 'user-2' }, authGeneration: 4 };
  state().markChapterRead('GEN', 2);
  t.mock.timers.tick(2000);
  await flushSync();

  assert.deepEqual(syncCalls, [['user-2', 4]]);
});
