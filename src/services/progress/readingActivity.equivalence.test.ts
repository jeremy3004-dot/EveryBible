import test from 'node:test';
import assert from 'node:assert/strict';
import { bibleBooks } from '../../constants/books';
import {
  formatLocalDateKey,
  getDailyChapterCounts,
  listeningChapterEquivalent,
  parseLocalDateKey,
  summarizeReadingActivity,
  type DailyActivityLedgers,
  type ReadingActivityDaySummary,
  type ReadingActivitySummary,
} from './readingActivity';

// The pre-optimisation implementations, kept verbatim as the reference. getDailyChapterCounts
// used to build the full day summaries just to read their key counts, and the summaries
// deduplicated chapter keys with an array includes() scan.
function legacyGroupChaptersByDay(
  ledgers: DailyActivityLedgers
): Record<string, ReadingActivityDaySummary> {
  const daysByDateKey: Record<string, ReadingActivityDaySummary> = {};
  const add = (ledger: Record<string, number>) => {
    for (const [chapterKey, timestamp] of Object.entries(ledger)) {
      if (!Number.isFinite(timestamp)) {
        continue;
      }
      const dateKey = formatLocalDateKey(new Date(timestamp));
      const existing = daysByDateKey[dateKey];
      if (existing) {
        if (!existing.chapterKeys.includes(chapterKey)) {
          existing.chapterKeys.push(chapterKey);
        }
        existing.firstReadAt = Math.min(existing.firstReadAt, timestamp);
        existing.lastReadAt = Math.max(existing.lastReadAt, timestamp);
      } else {
        daysByDateKey[dateKey] = {
          dateKey,
          chapterCount: 0,
          firstReadAt: timestamp,
          lastReadAt: timestamp,
          chapterKeys: [chapterKey],
        };
      }
    }
  };
  add(ledgers.chaptersRead);
  add(ledgers.chaptersListened ?? {});
  return daysByDateKey;
}

function legacyGetDailyChapterCounts(ledgers: DailyActivityLedgers): Map<string, number> {
  const counts = new Map<string, number>();
  const raise = (dateKey: string, count: number) => {
    if (count > (counts.get(dateKey) ?? 0)) counts.set(dateKey, count);
  };
  for (const day of Object.values(legacyGroupChaptersByDay(ledgers))) {
    raise(day.dateKey, day.chapterKeys.length);
  }
  for (const [dateKey, count] of Object.entries(ledgers.chaptersByDate ?? {})) {
    raise(dateKey, count);
  }
  for (const [dateKey, ms] of Object.entries(ledgers.listeningMsByDate ?? {})) {
    raise(dateKey, listeningChapterEquivalent(ms));
  }
  return counts;
}

function legacySummarizeReadingActivity(ledgers: DailyActivityLedgers): ReadingActivitySummary {
  const daysByDateKey = legacyGroupChaptersByDay(ledgers);
  legacyGetDailyChapterCounts(ledgers).forEach((count, dateKey) => {
    const day = daysByDateKey[dateKey];
    if (day) {
      day.chapterCount = Math.max(count, day.chapterKeys.length);
      return;
    }
    const noon = parseLocalDateKey(dateKey);
    noon.setHours(12, 0, 0, 0);
    if (Number.isNaN(noon.getTime())) return;
    daysByDateKey[dateKey] = {
      dateKey,
      chapterCount: count,
      firstReadAt: noon.getTime(),
      lastReadAt: noon.getTime(),
      chapterKeys: [],
    };
  });
  let mostRecentDateKey: string | null = null;
  for (const dateKey of Object.keys(daysByDateKey)) {
    if (mostRecentDateKey === null || dateKey > mostRecentDateKey) {
      mostRecentDateKey = dateKey;
    }
  }
  return {
    daysByDateKey,
    totalReadDays: Object.keys(daysByDateKey).length,
    totalChapterReads: new Set([
      ...Object.keys(ledgers.chaptersRead),
      ...Object.keys(ledgers.chaptersListened ?? {}),
    ]).size,
    mostRecentDateKey,
  };
}

// Every chapter of the Bible, in canonical order: the real key set a finished reader holds.
const ALL_CHAPTER_KEYS = bibleBooks.flatMap((book) =>
  Array.from({ length: book.chapters }, (_, index) => `${book.id}_${index + 1}`)
);

const DAY_MS = 86_400_000;
const NOW = new Date(2026, 9, 1, 12).getTime();

// Small seeded generator so the "random" ledgers are the same on every run.
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

function buildLedgers(pattern: string): DailyActivityLedgers {
  const random = seeded(pattern.length * 7919);
  const chaptersRead: Record<string, number> = {};
  const chaptersListened: Record<string, number> = {};
  const chaptersByDate: Record<string, number> = {};
  const listeningMsByDate: Record<string, number> = {};

  ALL_CHAPTER_KEYS.forEach((key, index) => {
    if (pattern === 'one-day') {
      chaptersRead[key] = NOW;
      chaptersListened[key] = NOW + 60_000;
    } else if (pattern === 'spread-year') {
      chaptersRead[key] = NOW - (index % 365) * DAY_MS - (index % 17) * 60_000;
      if (index % 4 === 0) chaptersListened[key] = chaptersRead[key]! + 3_600_000;
    } else if (pattern === 'random-with-bad-values') {
      const stamp = NOW - Math.floor(random() * 500 * DAY_MS);
      chaptersRead[key] = index % 97 === 0 ? Number.NaN : stamp;
      if (random() < 0.5) {
        chaptersListened[key] = index % 89 === 0 ? Number.POSITIVE_INFINITY : stamp + 1;
      }
    } else {
      // Local-midnight and DST-transition edges, where a day key is easiest to get wrong.
      const edges = [
        new Date(2026, 2, 8, 0, 0, 0).getTime(),
        new Date(2026, 2, 8, 23, 59, 59, 999).getTime(),
        new Date(2026, 10, 1, 0, 0, 0).getTime(),
        new Date(2026, 10, 1, 23, 59, 59, 999).getTime(),
        new Date(2026, 11, 31, 23, 59, 59, 999).getTime(),
        new Date(2027, 0, 1, 0, 0, 0).getTime(),
      ];
      chaptersRead[key] = edges[index % edges.length]!;
      if (index % 3 === 0) chaptersListened[key] = edges[(index + 1) % edges.length]!;
    }
  });

  for (let day = 0; day < 400; day += 1) {
    const dateKey = formatLocalDateKey(new Date(NOW - day * DAY_MS));
    if (day % 3 !== 0) chaptersByDate[dateKey] = 1 + (day % 7);
    listeningMsByDate[dateKey] = (day % 6) * 300_000;
  }
  // Days known only from the tally or listening time, with no chapter keys behind them.
  chaptersByDate['2020-02-29'] = 4;
  listeningMsByDate['2019-12-31'] = 20 * 60_000;

  return { chaptersRead, chaptersListened, chaptersByDate, listeningMsByDate };
}

const PATTERNS = ['one-day', 'spread-year', 'random-with-bad-values', 'dst-and-midnight-edges'];

for (const pattern of PATTERNS) {
  test(`getDailyChapterCounts matches the previous implementation, in order (${pattern}, all 1,189 chapters)`, () => {
    const ledgers = buildLedgers(pattern);
    assert.deepEqual(
      [...getDailyChapterCounts(ledgers).entries()],
      [...legacyGetDailyChapterCounts(ledgers).entries()]
    );
  });

  test(`summarizeReadingActivity matches the previous implementation (${pattern}, all 1,189 chapters)`, () => {
    const ledgers = buildLedgers(pattern);
    assert.deepEqual(summarizeReadingActivity(ledgers), legacySummarizeReadingActivity(ledgers));
  });
}

test('getDailyChapterCounts matches when only one ledger, or neither, has chapters', () => {
  const full = buildLedgers('spread-year');
  for (const ledgers of [
    { chaptersRead: full.chaptersRead },
    { chaptersRead: {}, chaptersListened: full.chaptersListened },
    { chaptersRead: {} },
    { chaptersRead: {}, chaptersByDate: full.chaptersByDate },
  ] satisfies DailyActivityLedgers[]) {
    assert.deepEqual(
      [...getDailyChapterCounts(ledgers).entries()],
      [...legacyGetDailyChapterCounts(ledgers).entries()]
    );
  }
});

test('a chapter in both ledgers on the same day is counted once', () => {
  const stamp = new Date(2026, 5, 1, 9).getTime();
  const counts = getDailyChapterCounts({
    chaptersRead: { GEN_1: stamp, GEN_2: stamp },
    chaptersListened: { GEN_1: stamp + 1_000, GEN_3: stamp },
  });
  assert.deepEqual([...counts.entries()], [['2026-06-01', 3]]);
});
