import {
  formatLocalDateKey,
  type ReadingActivityDaySummary,
} from '../../services/progress/readingActivity';

// The reading calendar is drawn as a plain 7-column grid rather than a calendar
// widget, so the shape of that grid is modelled here: pure, dependency-free
// functions the screen renders and the test locks.

export const CALENDAR_COLUMN_COUNT = 7;

/**
 * Monday-first column order, expressed as `Date#getDay()` indexes. The design
 * runs M T W T F S S; JavaScript weeks start on Sunday, so every day-of-week
 * lookup has to be rotated through this table.
 */
export const MONDAY_FIRST_WEEKDAY_INDEXES = [1, 2, 3, 4, 5, 6, 0] as const;

/** How far into the Monday-first row a given `Date#getDay()` value sits. */
export const mondayFirstColumn = (weekday: number): number => (weekday + 6) % 7;

export type ReadingActivityCellState = 'read' | 'today' | 'idle';

export interface ReadingActivityGridCell {
  dateKey: string;
  day: number;
  /** False for the trailing days of the previous month, which render dimmed. */
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  chapterCount: number;
  state: ReadingActivityCellState;
}

export interface ReadingActivityGrid {
  /** `YYYY-MM` for the month on screen. */
  monthKey: string;
  /** Leading days from the previous month, then every day of this month. */
  cells: ReadingActivityGridCell[];
  leadingCount: number;
  rowCount: number;
  /** Days of this month with at least one chapter read. */
  readDays: number;
  /**
   * Days of this month that have already happened — the denominator in
   * "7 of 8 days". Today counts; a future month counts nothing.
   */
  elapsedDays: number;
}

export interface ReadingActivityGridInput {
  daysByDateKey: Record<string, ReadingActivityDaySummary>;
  viewDate: Date;
  selectedDateKey: string | null;
  today?: Date;
}

const pad = (value: number): string => value.toString().padStart(2, '0');

const daysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate();

export function buildReadingActivityGrid({
  daysByDateKey,
  viewDate,
  selectedDateKey,
  today = new Date(),
}: ReadingActivityGridInput): ReadingActivityGrid {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const todayKey = formatLocalDateKey(today);
  const leadingCount = mondayFirstColumn(new Date(year, month, 1).getDay());
  const totalDays = daysInMonth(year, month);

  const cells: ReadingActivityGridCell[] = [];
  let readDays = 0;

  const push = (date: Date, inMonth: boolean) => {
    const dateKey = formatLocalDateKey(date);
    const chapterCount = daysByDateKey[dateKey]?.chapterCount ?? 0;
    const isToday = dateKey === todayKey;

    if (inMonth && chapterCount > 0) {
      readDays += 1;
    }

    cells.push({
      dateKey,
      day: date.getDate(),
      inMonth,
      isToday,
      isSelected: selectedDateKey === dateKey,
      chapterCount,
      state: chapterCount > 0 ? 'read' : isToday ? 'today' : 'idle',
    });
  };

  for (let offset = leadingCount; offset > 0; offset -= 1) {
    push(new Date(year, month, 1 - offset), false);
  }
  for (let day = 1; day <= totalDays; day += 1) {
    push(new Date(year, month, day), true);
  }

  // Trailing days of the next month are deliberately not drawn: the design ends
  // the grid on the last day of the month, leaving the final row short.
  const monthsFromToday = (year - today.getFullYear()) * 12 + (month - today.getMonth());
  const elapsedDays =
    monthsFromToday < 0
      ? totalDays
      : monthsFromToday > 0
        ? 0
        : Math.min(today.getDate(), totalDays);

  return {
    monthKey: `${year}-${pad(month + 1)}`,
    cells,
    leadingCount,
    rowCount: Math.ceil(cells.length / CALENDAR_COLUMN_COUNT),
    readDays,
    elapsedDays,
  };
}

/** Step one month back or forward from the month currently on screen. */
export function shiftMonth(viewDate: Date, delta: number): Date {
  return new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1);
}

/**
 * Monday-first single-letter weekday headers. `Intl` narrow weekdays give
 * exactly the M T W T F S S the design shows, localized; 2024-01-01 is a Monday.
 */
export function buildWeekdayInitials(language: string): string[] {
  try {
    const formatter = new Intl.DateTimeFormat(language, { weekday: 'narrow', timeZone: 'UTC' });
    return Array.from({ length: CALENDAR_COLUMN_COUNT }, (_, index) =>
      formatter.format(new Date(Date.UTC(2024, 0, 1 + index)))
    );
  } catch {
    return ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  }
}

export interface ReadingActivityBook {
  name: string;
  order: number;
}

const CHAPTER_RANGE_SEPARATOR = '–';

export interface ReadingActivityChapterRef {
  bookId: string;
  chapter: number;
}

/**
 * Groups a day's progress keys ("PRO_27", "PSA_21") by book, in canonical book
 * order with chapters ascending. Malformed keys are dropped rather than
 * rendered as NaN.
 */
function groupDayChapters(
  chapterKeys: readonly string[],
  resolveBook: (bookId: string) => ReadingActivityBook
): Array<{ bookId: string; book: ReadingActivityBook; chapters: number[] }> {
  const byBook = new Map<string, number[]>();

  for (const chapterKey of chapterKeys) {
    const separator = chapterKey.lastIndexOf('_');
    if (separator <= 0) continue;
    const bookId = chapterKey.slice(0, separator);
    const chapter = Number.parseInt(chapterKey.slice(separator + 1), 10);
    if (!Number.isFinite(chapter)) continue;
    const chapters = byBook.get(bookId);
    if (chapters) {
      chapters.push(chapter);
    } else {
      byBook.set(bookId, [chapter]);
    }
  }

  return [...byBook.entries()]
    .map(([bookId, chapters]) => ({
      bookId,
      book: resolveBook(bookId),
      chapters: [...new Set(chapters)].sort((left, right) => left - right),
    }))
    .sort((left, right) => left.book.order - right.book.order);
}

/**
 * Collapses a day's chapter keys ("PRO_27", "PSA_21", "PSA_22") into the
 * one-line reference the selected-day card shows: "Psalms 21–22, Proverbs 27".
 * Books come out in canonical order, chapters ascending, consecutive runs
 * folded into a range.
 */
export function summarizeDayChapters(
  chapterKeys: readonly string[],
  resolveBook: (bookId: string) => ReadingActivityBook
): string {
  return groupDayChapters(chapterKeys, resolveBook)
    .map(({ chapters, book }) => `${book.name} ${formatChapterRuns(chapters)}`)
    .join(', ');
}

/**
 * The chapter the selected-day card opens: the first reference in the same
 * canonical order the summary reads in.
 */
export function firstChapterOfDay(
  chapterKeys: readonly string[],
  resolveBook: (bookId: string) => ReadingActivityBook
): ReadingActivityChapterRef | null {
  const first = groupDayChapters(chapterKeys, resolveBook)[0];
  return first ? { bookId: first.bookId, chapter: first.chapters[0] } : null;
}

function formatChapterRuns(sorted: number[]): string {
  const runs: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (let index = 1; index <= sorted.length; index += 1) {
    const chapter = sorted[index];
    if (chapter === previous + 1) {
      previous = chapter;
      continue;
    }
    runs.push(start === previous ? `${start}` : `${start}${CHAPTER_RANGE_SEPARATOR}${previous}`);
    start = chapter;
    previous = chapter;
  }

  return runs.join(', ');
}
