import { bibleBooks, getBookById } from '../../constants/books';

/**
 * Pure period maths for the Home reading ledger.
 *
 * Everything here is a plain function over the persisted progress maps so the
 * screen can memoise one call per period change, and so week/month boundaries,
 * union completion and "finished in this period" attribution stay unit-testable
 * without a renderer. No `Intl` and no locale-sensitive comparison lives in this
 * module — the screen formats the labels.
 */
export type HomeReadingPeriod = 'week' | 'month' | 'allTime';

export interface HomeReadingActivity {
  /** `{ "GEN_1": timestamp }` — chapters with a read record. */
  chaptersRead: Record<string, number>;
  /** `{ "GEN_1": timestamp }` — chapters played to the end. */
  chaptersListened: Record<string, number>;
  /** `{ "2026-09-08": milliseconds }` — completed listening time per local day. */
  listeningMsByDate: Record<string, number>;
}

export interface HomeReadingPeriodRange {
  /** Inclusive lower bound in epoch ms. `-Infinity` for all time. */
  start: number;
  /** Exclusive upper bound in epoch ms. `Infinity` for all time. */
  end: number;
}

export interface HomeReadingStats {
  period: HomeReadingPeriod;
  range: HomeReadingPeriodRange;
  /** Distinct chapters with a read record inside the period. */
  chaptersReadCount: number;
  /** Distinct chapters with a completed listen inside the period. */
  chaptersListenedCount: number;
  /** Completed listening time inside the period, rounded to whole minutes. */
  listeningMinutes: number;
  /** Book ids finished inside the period, in canonical order. */
  booksFinished: string[];
  /** Distinct chapters covered by reading or listening inside the period. */
  chaptersCovered: number;
  /** Local day keys with any coverage inside the period. */
  activeDays: number;
  /** Earliest coverage of any kind, ever. `null` when nothing is recorded. */
  firstActivityAt: number | null;
}

const MS_PER_MINUTE = 60_000;

const pad = (value: number): string => value.toString().padStart(2, '0');

const toLocalDateKey = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const isLocalDateKeyInRange = (dateKey: string, range: HomeReadingPeriodRange): boolean => {
  const [year, month, day] = dateKey.split('-').map((part) => Number.parseInt(part, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  // Midday avoids DST edges pulling a day key across its own boundary.
  const noon = new Date(year, month - 1, day, 12).getTime();
  return noon >= range.start && noon < range.end;
};

export interface ParsedChapterKey {
  bookId: string;
  chapter: number;
}

/** `"1SA_12"` -> `{ bookId: '1SA', chapter: 12 }`. Book ids carry no underscore. */
export const parseChapterKey = (key: string): ParsedChapterKey | null => {
  const separatorIndex = key.lastIndexOf('_');
  if (separatorIndex <= 0) {
    return null;
  }

  const bookId = key.slice(0, separatorIndex);
  const chapter = Number(key.slice(separatorIndex + 1));
  if (!Number.isInteger(chapter) || chapter <= 0 || !getBookById(bookId)) {
    return null;
  }

  return { bookId, chapter };
};

/**
 * Week runs Monday 00:00 to the following Monday; month runs the 1st to the 1st.
 * Both are local-calendar, matching how the streak counts a day.
 */
export const getHomeReadingPeriodRange = (
  period: HomeReadingPeriod,
  now: Date
): HomeReadingPeriodRange => {
  if (period === 'allTime') {
    return { start: Number.NEGATIVE_INFINITY, end: Number.POSITIVE_INFINITY };
  }

  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start: start.getTime(), end: end.getTime() };
  }

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // getDay() is Sunday-based; shift so Monday is the first column.
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: start.getTime(), end: end.getTime() };
};

const isInRange = (timestamp: number, range: HomeReadingPeriodRange): boolean =>
  Number.isFinite(timestamp) && timestamp >= range.start && timestamp < range.end;

const countInRange = (records: Record<string, number>, range: HomeReadingPeriodRange): number => {
  let count = 0;
  for (const [key, timestamp] of Object.entries(records)) {
    if (isInRange(timestamp, range) && parseChapterKey(key)) {
      count += 1;
    }
  }
  return count;
};

/**
 * Earliest moment each chapter was covered by either eye or ear. Reading and
 * listening are a union: a chapter read once and heard later was first covered
 * when it was read.
 */
export const getChapterCoverageTimes = (activity: HomeReadingActivity): Map<string, number> => {
  const coverage = new Map<string, number>();

  for (const records of [activity.chaptersRead, activity.chaptersListened]) {
    for (const [key, timestamp] of Object.entries(records ?? {})) {
      if (!Number.isFinite(timestamp) || timestamp <= 0 || !parseChapterKey(key)) {
        continue;
      }
      const existing = coverage.get(key);
      if (existing === undefined || timestamp < existing) {
        coverage.set(key, timestamp);
      }
    }
  }

  return coverage;
};

/**
 * Book id -> the moment its LAST outstanding chapter was covered. A book only
 * appears once every chapter has been read or listened to, and it is attributed
 * to the period that completed it, not to the period it was started in.
 */
export const getBookCompletionTimes = (activity: HomeReadingActivity): Map<string, number> => {
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

export const getHomeReadingStats = (
  activity: HomeReadingActivity,
  period: HomeReadingPeriod,
  now: Date
): HomeReadingStats => {
  const range = getHomeReadingPeriodRange(period, now);
  const chaptersRead = activity.chaptersRead ?? {};
  const chaptersListened = activity.chaptersListened ?? {};
  const listeningMsByDate = activity.listeningMsByDate ?? {};

  const coverage = getChapterCoverageTimes(activity);
  const activeDayKeys = new Set<string>();
  let chaptersCovered = 0;
  let firstActivityAt: number | null = null;

  for (const timestamp of coverage.values()) {
    if (firstActivityAt === null || timestamp < firstActivityAt) {
      firstActivityAt = timestamp;
    }
    if (isInRange(timestamp, range)) {
      chaptersCovered += 1;
      activeDayKeys.add(toLocalDateKey(timestamp));
    }
  }

  let listeningMs = 0;
  for (const [dateKey, ms] of Object.entries(listeningMsByDate)) {
    if (!Number.isFinite(ms) || ms <= 0) {
      continue;
    }
    if (period === 'allTime' || isLocalDateKeyInRange(dateKey, range)) {
      listeningMs += ms;
    }
  }

  const booksFinished = [...getBookCompletionTimes(activity).entries()]
    .filter(([, completedAt]) => isInRange(completedAt, range))
    .map(([bookId]) => bookId)
    .sort((left, right) => (BOOK_ORDER.get(left) ?? 0) - (BOOK_ORDER.get(right) ?? 0));

  return {
    period,
    range,
    chaptersReadCount: countInRange(chaptersRead, range),
    chaptersListenedCount: countInRange(chaptersListened, range),
    listeningMinutes: Math.round(listeningMs / MS_PER_MINUTE),
    booksFinished,
    chaptersCovered,
    activeDays: activeDayKeys.size,
    firstActivityAt,
  };
};

/**
 * Denominator for the footer's "X of Y days": a week always shows its full
 * seven, while a month shows only the days that have actually happened.
 */
export const getHomeReadingPeriodDayTotal = (period: HomeReadingPeriod, now: Date): number => {
  if (period === 'week') {
    return 7;
  }
  if (period === 'month') {
    return now.getDate();
  }
  return 0;
};
