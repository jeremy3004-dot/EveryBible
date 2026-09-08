import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getBookCompletionTimes,
  getHomeReadingPeriodDayTotal,
  getHomeReadingPeriodRange,
  getHomeReadingStats,
  parseChapterKey,
  type HomeReadingActivity,
} from './homeReadingStatsModel';

// Wednesday 9 September 2026, 10:00 local.
const NOW = new Date(2026, 8, 9, 10, 0, 0);

const at = (year: number, month: number, day: number, hour = 12): number =>
  new Date(year, month - 1, day, hour).getTime();

const dateKey = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const emptyActivity = (): HomeReadingActivity => ({
  chaptersRead: {},
  chaptersListened: {},
  listeningMsByDate: {},
});

const chaptersOf = (bookId: string, count: number, timestamp: number): Record<string, number> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`${bookId}_${index + 1}`, timestamp])
  );

test('chapter keys parse only for real books and positive chapters', () => {
  assert.deepEqual(parseChapterKey('1SA_12'), { bookId: '1SA', chapter: 12 });
  assert.equal(parseChapterKey('ZZZ_1'), null);
  assert.equal(parseChapterKey('GEN_0'), null);
  assert.equal(parseChapterKey('GEN'), null);
});

test('the week range starts on Monday and the month range on the first', () => {
  const week = getHomeReadingPeriodRange('week', NOW);
  assert.equal(new Date(week.start).getTime(), at(2026, 9, 7, 0));
  assert.equal(new Date(week.end).getTime(), at(2026, 9, 14, 0));

  // A Sunday belongs to the week that began the previous Monday.
  const sundayWeek = getHomeReadingPeriodRange('week', new Date(2026, 8, 13, 23, 30));
  assert.equal(sundayWeek.start, at(2026, 9, 7, 0));
  assert.equal(sundayWeek.end, at(2026, 9, 14, 0));

  const month = getHomeReadingPeriodRange('month', NOW);
  assert.equal(month.start, at(2026, 9, 1, 0));
  assert.equal(month.end, at(2026, 10, 1, 0));

  const allTime = getHomeReadingPeriodRange('allTime', NOW);
  assert.equal(allTime.start, Number.NEGATIVE_INFINITY);
  assert.equal(allTime.end, Number.POSITIVE_INFINITY);
});

test('period counts include only the chapters covered inside their own boundaries', () => {
  const activity: HomeReadingActivity = {
    chaptersRead: {
      GEN_1: at(2026, 8, 20), // last month
      GEN_2: at(2026, 9, 3), // this month, before this week
      GEN_3: at(2026, 9, 7), // Monday of this week
      GEN_4: at(2026, 9, 9), // today
    },
    chaptersListened: {
      MRK_1: at(2026, 9, 8),
      MRK_2: at(2026, 8, 31), // last month
    },
    listeningMsByDate: {
      [dateKey(2026, 9, 8)]: 20 * 60_000,
      [dateKey(2026, 9, 3)]: 40 * 60_000,
      [dateKey(2026, 8, 31)]: 90 * 60_000,
    },
  };

  const week = getHomeReadingStats(activity, 'week', NOW);
  assert.equal(week.chaptersReadCount, 2);
  assert.equal(week.chaptersListenedCount, 1);
  assert.equal(week.listeningMinutes, 20);
  assert.equal(week.chaptersCovered, 3);
  assert.equal(week.activeDays, 3);

  const month = getHomeReadingStats(activity, 'month', NOW);
  assert.equal(month.chaptersReadCount, 3);
  assert.equal(month.chaptersListenedCount, 1);
  assert.equal(month.listeningMinutes, 60);
  assert.equal(month.chaptersCovered, 4);
  assert.equal(month.activeDays, 4);

  const allTime = getHomeReadingStats(activity, 'allTime', NOW);
  assert.equal(allTime.chaptersReadCount, 4);
  assert.equal(allTime.chaptersListenedCount, 2);
  assert.equal(allTime.listeningMinutes, 150);
  assert.equal(allTime.chaptersCovered, 6);
  assert.equal(allTime.firstActivityAt, at(2026, 8, 20));
});

test('a book counts as finished when reading and listening together cover every chapter', () => {
  // Jonah has 4 chapters: two read, two heard.
  const activity: HomeReadingActivity = {
    chaptersRead: { JON_1: at(2026, 9, 2), JON_2: at(2026, 9, 3) },
    chaptersListened: { JON_3: at(2026, 9, 4), JON_4: at(2026, 9, 8) },
    listeningMsByDate: {},
  };

  const completions = getBookCompletionTimes(activity);
  assert.deepEqual([...completions.keys()], ['JON']);
  assert.equal(completions.get('JON'), at(2026, 9, 8));

  // One chapter short is not finished.
  const partial: HomeReadingActivity = {
    ...activity,
    chaptersListened: { JON_3: at(2026, 9, 4) },
  };
  assert.equal(getBookCompletionTimes(partial).size, 0);
});

test('a book is attributed to the period that covered its last missing chapter', () => {
  const activity: HomeReadingActivity = {
    // Ruth (4 chapters) was mostly read in August but only completed this week.
    chaptersRead: {
      RUT_1: at(2026, 8, 10),
      RUT_2: at(2026, 8, 11),
      RUT_3: at(2026, 8, 12),
      RUT_4: at(2026, 9, 8),
      // Philemon (1 chapter) was finished last month.
      ...chaptersOf('PHM', 1, at(2026, 8, 5)),
    },
    chaptersListened: {},
    listeningMsByDate: {},
  };

  assert.deepEqual(getHomeReadingStats(activity, 'week', NOW).booksFinished, ['RUT']);
  assert.deepEqual(getHomeReadingStats(activity, 'month', NOW).booksFinished, ['RUT']);
  // All time lists both, in canonical book order.
  assert.deepEqual(getHomeReadingStats(activity, 'allTime', NOW).booksFinished, ['RUT', 'PHM']);
});

test('an empty store yields a zeroed ledger rather than NaN or undefined', () => {
  for (const period of ['week', 'month', 'allTime'] as const) {
    const stats = getHomeReadingStats(emptyActivity(), period, NOW);
    assert.equal(stats.chaptersReadCount, 0);
    assert.equal(stats.chaptersListenedCount, 0);
    assert.equal(stats.listeningMinutes, 0);
    assert.deepEqual(stats.booksFinished, []);
    assert.equal(stats.chaptersCovered, 0);
    assert.equal(stats.activeDays, 0);
    assert.equal(stats.firstActivityAt, null);
  }
});

test('unknown books and malformed records never reach the ledger', () => {
  const activity = {
    chaptersRead: { ZZZ_1: at(2026, 9, 8), GEN_1: Number.NaN, EXO_2: at(2026, 9, 8) },
    chaptersListened: { GEN: at(2026, 9, 8) },
    listeningMsByDate: { notadate: 10_000, [dateKey(2026, 9, 8)]: -5 },
  } as unknown as HomeReadingActivity;

  const stats = getHomeReadingStats(activity, 'week', NOW);
  assert.equal(stats.chaptersReadCount, 1);
  assert.equal(stats.chaptersListenedCount, 0);
  assert.equal(stats.listeningMinutes, 0);
});

test('the day denominator is the whole week but only the elapsed part of a month', () => {
  assert.equal(getHomeReadingPeriodDayTotal('week', NOW), 7);
  assert.equal(getHomeReadingPeriodDayTotal('month', NOW), 9);
  assert.equal(getHomeReadingPeriodDayTotal('allTime', NOW), 0);
});
