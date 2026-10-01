import test from 'node:test';
import assert from 'node:assert/strict';
import { bibleBooks, getBookById } from '../../constants/books';
import {
  getBookCompletionTimes,
  getChapterCoverageTimes,
  getHomeReadingPeriodRange,
  getHomeReadingStats,
  parseChapterKey,
  type HomeReadingActivity,
  type HomeReadingPeriod,
  type HomeReadingStats,
} from './homeReadingStatsModel';

// The pre-optimisation implementations, verbatim: getHomeReadingStats built the chapter
// coverage map, then getBookCompletionTimes built it a second time and re-parsed every key.
const legacyGetBookCompletionTimes = (activity: HomeReadingActivity): Map<string, number> => {
  const coverage = getChapterCoverageTimes(activity);
  const touchedBooks = new Set<string>();
  for (const key of coverage.keys()) {
    const parsed = parseChapterKey(key);
    if (parsed) {
      touchedBooks.add(parsed.bookId);
    }
  }
  const completions = new Map<string, number>();
  for (const bookId of touchedBooks) {
    const book = getBookById(bookId);
    if (!book) {
      continue;
    }
    let completedAt = Number.NEGATIVE_INFINITY;
    let complete = true;
    for (let chapter = 1; chapter <= book.chapters; chapter += 1) {
      const coveredAt = coverage.get(`${bookId}_${chapter}`);
      if (coveredAt === undefined) {
        complete = false;
        break;
      }
      completedAt = Math.max(completedAt, coveredAt);
    }
    if (complete) {
      completions.set(bookId, completedAt);
    }
  }
  return completions;
};

const BOOK_ORDER = new Map(bibleBooks.map((book) => [book.id, book.order]));
const toDayKey = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

const legacyGetHomeReadingStats = (
  activity: HomeReadingActivity,
  period: HomeReadingPeriod,
  now: Date
): HomeReadingStats => {
  const range = getHomeReadingPeriodRange(period, now);
  const coverage = getChapterCoverageTimes(activity);
  const activeDayKeys = new Set<string>();
  let chaptersCovered = 0;
  let firstActivityAt: number | null = null;
  for (const timestamp of coverage.values()) {
    if (firstActivityAt === null || timestamp < firstActivityAt) {
      firstActivityAt = timestamp;
    }
    if (Number.isFinite(timestamp) && timestamp >= range.start && timestamp < range.end) {
      chaptersCovered += 1;
      activeDayKeys.add(toDayKey(timestamp));
    }
  }
  const booksFinished = [...legacyGetBookCompletionTimes(activity).entries()]
    .filter(
      ([, completedAt]) =>
        Number.isFinite(completedAt) && completedAt >= range.start && completedAt < range.end
    )
    .map(([bookId]) => bookId)
    .sort((left, right) => (BOOK_ORDER.get(left) ?? 0) - (BOOK_ORDER.get(right) ?? 0));
  return {
    period,
    range,
    booksFinished,
    chaptersCovered,
    activeDays: activeDayKeys.size,
    firstActivityAt,
  };
};

const DAY_MS = 86_400_000;
const NOW = new Date(2026, 9, 1, 12);

const allKeys = bibleBooks.flatMap((book) =>
  Array.from({ length: book.chapters }, (_, index) => `${book.id}_${index + 1}`)
);

function ledger(
  select: (key: string, index: number) => number | undefined
): Record<string, number> {
  const result: Record<string, number> = {};
  allKeys.forEach((key, index) => {
    const value = select(key, index);
    if (value !== undefined) result[key] = value;
  });
  return result;
}

// Each case is a (read, listened) pair of ledgers over the real chapter set. Together they cover
// the whole Bible read in a year, partial books, listening-only books, junk keys and bad values.
const CASES: Record<string, HomeReadingActivity> = {
  'every chapter, spread over a year': {
    chaptersRead: ledger((_, i) => NOW.getTime() - (i % 365) * DAY_MS),
    chaptersListened: ledger((_, i) =>
      i % 4 === 0 ? NOW.getTime() - (i % 200) * DAY_MS : undefined
    ),
  },
  'every chapter on one day': {
    chaptersRead: ledger(() => NOW.getTime()),
    chaptersListened: ledger(() => NOW.getTime()),
  },
  'books split between reading and listening': {
    chaptersRead: ledger((key, i) => (i % 2 === 0 ? NOW.getTime() - i * 60_000 : undefined)),
    chaptersListened: ledger((key, i) => (i % 2 === 1 ? NOW.getTime() - i * 3_600_000 : undefined)),
  },
  'the New Testament only': {
    chaptersRead: ledger((key) =>
      getBookById(key.slice(0, key.lastIndexOf('_')))?.testament === 'NT'
        ? NOW.getTime() - 5 * DAY_MS
        : undefined
    ),
    chaptersListened: {},
  },
  'junk keys and bad timestamps': {
    chaptersRead: {
      ...ledger((_, i) => (i % 5 === 0 ? NOW.getTime() - i * DAY_MS : undefined)),
      NOPE_1: NOW.getTime(),
      GEN_0: NOW.getTime(),
      GEN_x: NOW.getTime(),
      _5: NOW.getTime(),
      GEN_1: Number.NaN,
      EXO_1: -5,
    },
    chaptersListened: { PSA_119: NOW.getTime(), PSA_999: NOW.getTime() },
  },
  'one finished book (Jude) among others': {
    chaptersRead: { JUD_1: NOW.getTime() - DAY_MS, GEN_1: NOW.getTime(), GEN_2: NOW.getTime() },
    chaptersListened: {},
  },
  empty: { chaptersRead: {}, chaptersListened: {} },
};

for (const [name, activity] of Object.entries(CASES)) {
  test(`getBookCompletionTimes is unchanged: ${name}`, () => {
    assert.deepEqual(
      [...getBookCompletionTimes(activity).entries()],
      [...legacyGetBookCompletionTimes(activity).entries()]
    );
  });

  for (const period of ['week', 'month', 'allTime'] as const) {
    test(`getHomeReadingStats is unchanged: ${name}, ${period}`, () => {
      assert.deepEqual(
        getHomeReadingStats(activity, period, NOW),
        legacyGetHomeReadingStats(activity, period, NOW)
      );
    });
  }
}

test('a coverage map built by the caller gives the same completion times', () => {
  const activity = CASES['every chapter, spread over a year']!;
  assert.deepEqual(
    [...getBookCompletionTimes(activity, getChapterCoverageTimes(activity)).entries()],
    [...legacyGetBookCompletionTimes(activity).entries()]
  );
});
