export interface ReadingActivityDaySummary {
  dateKey: string;
  chapterCount: number;
  firstReadAt: number;
  lastReadAt: number;
  chapterKeys: string[];
}

export interface ReadingActivityCalendarCell {
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
  const [year, month, day] = dateKey.split('-').map((part) => Number.parseInt(part, 10));
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

export const summarizeReadingActivity = (
  chaptersRead: Record<string, number>
): ReadingActivitySummary => {
  const daysByDateKey: Record<string, ReadingActivityDaySummary> = {};
  let mostRecentDateKey: string | null = null;
  let mostRecentTimestamp = -Infinity;

  for (const [chapterKey, timestamp] of Object.entries(chaptersRead)) {
    if (!Number.isFinite(timestamp)) {
      continue;
    }

    const date = new Date(timestamp);
    const dateKey = formatLocalDateKey(date);
    const existing = daysByDateKey[dateKey];

    if (existing) {
      existing.chapterCount += 1;
      existing.chapterKeys.push(chapterKey);
      existing.firstReadAt = Math.min(existing.firstReadAt, timestamp);
      existing.lastReadAt = Math.max(existing.lastReadAt, timestamp);
    } else {
      daysByDateKey[dateKey] = {
        dateKey,
        chapterCount: 1,
        firstReadAt: timestamp,
        lastReadAt: timestamp,
        chapterKeys: [chapterKey],
      };
    }

    if (timestamp > mostRecentTimestamp) {
      mostRecentTimestamp = timestamp;
      mostRecentDateKey = dateKey;
    }
  }

  return {
    daysByDateKey,
    totalReadDays: Object.keys(daysByDateKey).length,
    totalChapterReads: Object.keys(chaptersRead).length,
    mostRecentDateKey,
  };
};

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
    const inMonth = cellDate.getMonth() === viewDate.getMonth() && cellDate.getFullYear() === viewDate.getFullYear();

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

  const selectedDay = selectedDateKey ? summary.daysByDateKey[selectedDateKey] ?? null : null;

  return {
    monthKey,
    monthLabel: getMonthLabel(viewDate),
    weeks: Array.from({ length: 6 }, (_, weekIndex) => cells.slice(weekIndex * 7, weekIndex * 7 + 7)),
    selectedDateKey,
    selectedDay,
    totalReadDays: summary.totalReadDays,
    totalChapterReads: summary.totalChapterReads,
    monthReadDays,
    monthChapterReads,
  };
};
