import type { TFunction } from 'i18next';
import { getBookById, getTranslatedBookName } from '../../../constants/books';
import { formatListeningTime } from '../../../i18n/interfaceFormatting';
import {
  formatLocalDateKey,
  parseLocalDateKey,
  type ReadingActivityDaySummary,
} from '../../../services/progress/readingActivity';
import {
  firstChapterOfDay,
  summarizeDayChapters,
  type ReadingActivityBook,
  type ReadingActivityChapterRef,
  type ReadingActivityGridCell,
} from '../readingActivityCalendarModel';

// What the reading-activity screen says about the month and the chosen day,
// kept free of React: the grid's shape lives in readingActivityCalendarModel.

const MINUTE_MS = 60_000;

/** With no day chosen, a month opens on its most recently read day, if any. */
export function getMonthSelectionKey(
  viewDate: Date,
  daysByDateKey: Record<string, { dateKey: string; lastReadAt: number }>
): string | null {
  const monthKey = formatLocalDateKey(viewDate).slice(0, 7);
  const monthDays = Object.values(daysByDateKey)
    .filter((day) => day.dateKey.startsWith(monthKey))
    .sort((a, b) => b.lastReadAt - a.lastReadAt);

  return monthDays[0]?.dateKey ?? null;
}

export const formatMonthTitle = (viewDate: Date, language: string): string =>
  viewDate.toLocaleDateString(language, { month: 'long', year: 'numeric' });

/** "Tuesday, September 22": each cell's name, and the day card's eyebrow. */
export const createDayLabelFormatter = (language: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long' });

const formatTime = (timestamp: number, language: string): string =>
  new Date(timestamp).toLocaleTimeString(language, { hour: 'numeric', minute: '2-digit' });

/** Every cell's full-date name, from one formatter in one pass. */
export function buildCellLabels(
  cells: readonly ReadingActivityGridCell[],
  formatter: Intl.DateTimeFormat
): Map<string, string> {
  return new Map(
    cells.map((cell) => [cell.dateKey, formatter.format(parseLocalDateKey(cell.dateKey))])
  );
}

/**
 * A cell's fill is its only visual cue, so a screen reader hears the state as the
 * cell's value: "Read", "Today", both, or nothing for an idle day.
 */
export function describeCellState(
  cell: Pick<ReadingActivityGridCell, 'state' | 'isToday'>,
  t: TFunction
): string | undefined {
  return (
    [
      cell.state === 'read' ? t('readingActivity.legendRead') : null,
      cell.isToday ? t('readingActivity.legendToday') : null,
    ]
      .filter(Boolean)
      .join(', ') || undefined
  );
}

export interface SelectedDayCopy {
  eyebrow: string;
  summary: string;
  /** "9:00 AM – 9:20 AM · 20 min", for a day read across a stretch of time. */
  window: string | null;
  /** How to start, when nothing was read that day. */
  hint: string | null;
  /** Replaces the card's children for a screen reader, so it carries the summary too. */
  accessibilityLabel: string | undefined;
  /** Where the card's chevron leads: the day's first chapter in canonical order. */
  chapter: ReadingActivityChapterRef | null;
}

export interface SelectedDayCopyInput {
  dateKey: string | null;
  day: ReadingActivityDaySummary | null;
  formatter: Intl.DateTimeFormat;
  language: string;
  t: TFunction;
}

export function buildSelectedDayCopy({
  dateKey,
  day,
  formatter,
  language,
  t,
}: SelectedDayCopyInput): SelectedDayCopy {
  const resolveBook = (bookId: string): ReadingActivityBook => ({
    name: getTranslatedBookName(bookId, t as (key: string) => string),
    order: getBookById(bookId)?.order ?? Number.MAX_SAFE_INTEGER,
  });
  const eyebrow = dateKey
    ? formatter.format(parseLocalDateKey(dateKey))
    : t('readingActivity.legendToday');
  const summary = day
    ? t('readingActivity.dayChapters', {
        count: day.chapterCount,
        books: summarizeDayChapters(day.chapterKeys, resolveBook),
      })
    : t('readingActivity.noReading');
  const sessionMinutes = day ? Math.round((day.lastReadAt - day.firstReadAt) / MINUTE_MS) : 0;
  const window =
    day && sessionMinutes > 0
      ? t('readingActivity.sessionWindow', {
          start: formatTime(day.firstReadAt, language),
          end: formatTime(day.lastReadAt, language),
          duration: formatListeningTime(sessionMinutes, t),
        })
      : null;

  return {
    eyebrow,
    summary,
    window,
    hint: day ? null : t('readingActivity.noReadingHint'),
    accessibilityLabel: dateKey ? [eyebrow, summary, window].filter(Boolean).join(', ') : undefined,
    chapter: day ? firstChapterOfDay(day.chapterKeys, resolveBook) : null,
  };
}
