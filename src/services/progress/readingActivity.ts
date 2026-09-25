export interface ReadingActivityDaySummary {
  dateKey: string;
  chapterCount: number;
  firstReadAt: number;
  lastReadAt: number;
  chapterKeys: string[];
}

interface ReadingActivityCalendarCell {
  dateKey: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  hasActivity: boolean;
  chapterCount: number;
}

export interface ReadingActivitySummary {
  daysByDateKey: Record<string, ReadingActivityDaySummary>;
  totalReadDays: number;
  totalChapterReads: number;
  mostRecentDateKey: string | null;
}

export interface ReadingActivityMonthView {
  monthKey: string;
  monthLabel: string;
  weeks: ReadingActivityCalendarCell[][];
  selectedDateKey: string | null;
  selectedDay: ReadingActivityDaySummary | null;
  totalReadDays: number;
  totalChapterReads: number;
  monthReadDays: number;
  monthChapterReads: number;
}

const pad = (value: number): string => value.toString().padStart(2, '0');

export const formatLocalDateKey = (date: Date): string => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const parseLocalDateKey = (dateKey: string): Date => {
  // A missing part behaves like an unparsable one: the result is an Invalid Date.
  const [year = NaN, month = NaN, day = NaN] = dateKey
    .split('-')
    .map((part) => Number.parseInt(part, 10));
  return new Date(year, month - 1, day);
};

const formatMonthKey = (date: Date): string => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
};

const getStartOfMonthGrid = (date: Date): Date => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setDate(start.getDate() - start.getDay());
  return start;
};

const getMonthLabel = (date: Date): string => {
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

/**
 * Everything the progress store records about time in the Word. Reading and
 * listening are one activity: a chapter heard counts the same as a chapter read,
 * on the calendar, the Home heatmap and the streak alike.
 */
export interface DailyActivityLedgers {
  /** `{ "GEN_1": timestamp }` — each chapter's latest read. */
  chaptersRead: Record<string, number>;
  /** `{ "GEN_1": timestamp }` — each chapter's latest completed listen. */
  chaptersListened?: Record<string, number>;
  /** `{ "2026-09-08": 3 }` — distinct chapters read or heard per local day. */
  chaptersByDate?: Record<string, number>;
  /** `{ "2026-09-08": milliseconds }` — listening time per local day. */
  listeningMsByDate?: Record<string, number>;
}

/**
 * A chapter's audio runs about four minutes, so listening time converts to
 * chapters at that rate; a stray tap under a minute is not a day in the Word.
 */
export const LISTENING_MS_PER_CHAPTER = 4 * 60_000;
export const MIN_LISTENING_MS = 60_000;

export const listeningChapterEquivalent = (ms: number | undefined): number =>
  ms !== undefined && Number.isFinite(ms) && ms >= MIN_LISTENING_MS
    ? Math.max(1, Math.round(ms / LISTENING_MS_PER_CHAPTER))
    : 0;

/**
 * Chapters per local day, reading and listening together. The day tally is exact
 * from the build that added it; chapter timestamps fill in earlier days (a lower
 * bound, since a reread moves a chapter's timestamp forward) and anything synced
 * from another device; listening time covers audio stopped before a chapter's
 * end. Each source undercounts in its own way, so a day takes the largest of the
 * three rather than their sum, which would count one chapter twice.
 */
export const getDailyChapterCounts = (ledgers: DailyActivityLedgers): Map<string, number> => {
  const counts = new Map<string, number>();
  const raise = (dateKey: string, count: number) => {
    if (count > (counts.get(dateKey) ?? 0)) counts.set(dateKey, count);
  };
  for (const day of Object.values(groupChaptersByDay(ledgers))) {
    raise(day.dateKey, day.chapterKeys.length);
  }
  for (const [dateKey, count] of Object.entries(ledgers.chaptersByDate ?? {})) {
    raise(dateKey, count);
  }
  for (const [dateKey, ms] of Object.entries(ledgers.listeningMsByDate ?? {})) {
    raise(dateKey, listeningChapterEquivalent(ms));
  }
  return counts;
};

/** Distinct chapters read or heard on each local day, with the first and last touch. */
const groupChaptersByDay = (
  ledgers: DailyActivityLedgers
): Record<string, ReadingActivityDaySummary> => {
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
};

/**
 * Read-or-heard activity by local day. A plain `chaptersRead` map is accepted
 * for callers that only have reading.
 */
export const summarizeReadingActivity = (
  input: DailyActivityLedgers | Record<string, number>
): ReadingActivitySummary => {
  const ledgers: DailyActivityLedgers = isLedgers(input) ? input : { chaptersRead: input };
  const daysByDateKey = groupChaptersByDay(ledgers);

  // A day known only from the tally or listening time (a chapter reread since,
  // or audio stopped early) has no chapter keys; it still counts, pinned to
  // local noon so "most recent day" ordering has a time to sort by.
  getDailyChapterCounts(ledgers).forEach((count, dateKey) => {
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
};

function isLedgers(
  input: DailyActivityLedgers | Record<string, number>
): input is DailyActivityLedgers {
  return typeof (input as DailyActivityLedgers).chaptersRead === 'object';
}

export const buildReadingActivityMonthView = (
  chaptersRead: Record<string, number>,
  viewDate: Date,
  selectedDateKey: string | null = null
): ReadingActivityMonthView => {
  const summary = summarizeReadingActivity(chaptersRead);
  const monthKey = formatMonthKey(viewDate);
  const todayKey = formatLocalDateKey(new Date());
  const gridStart = getStartOfMonthGrid(viewDate);
  const cells: ReadingActivityCalendarCell[] = [];
  let monthReadDays = 0;
  let monthChapterReads = 0;

  for (let index = 0; index < 42; index += 1) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + index);
    const cellDateKey = formatLocalDateKey(cellDate);
    const daySummary = summary.daysByDateKey[cellDateKey] ?? null;
    const inMonth =
      cellDate.getMonth() === viewDate.getMonth() &&
      cellDate.getFullYear() === viewDate.getFullYear();

    if (inMonth && daySummary) {
      monthReadDays += 1;
      monthChapterReads += daySummary.chapterCount;
    }

    cells.push({
      dateKey: cellDateKey,
      day: cellDate.getDate(),
      inMonth,
      isToday: cellDateKey === todayKey,
      isSelected: selectedDateKey === cellDateKey,
      hasActivity: daySummary !== null,
      chapterCount: daySummary?.chapterCount ?? 0,
    });
  }

  const selectedDay = selectedDateKey ? (summary.daysByDateKey[selectedDateKey] ?? null) : null;

  return {
    monthKey,
    monthLabel: getMonthLabel(viewDate),
    weeks: Array.from({ length: 6 }, (_, weekIndex) =>
      cells.slice(weekIndex * 7, weekIndex * 7 + 7)
    ),
    selectedDateKey,
    selectedDay,
    totalReadDays: summary.totalReadDays,
    totalChapterReads: summary.totalChapterReads,
    monthReadDays,
    monthChapterReads,
  };
};
