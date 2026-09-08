import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { ReadingActivityDaySummary } from '../../services/progress/readingActivity';
import {
  buildReadingActivityGrid,
  buildWeekdayInitials,
  CALENDAR_COLUMN_COUNT,
  firstChapterOfDay,
  MONDAY_FIRST_WEEKDAY_INDEXES,
  mondayFirstColumn,
  shiftMonth,
  summarizeDayChapters,
} from './readingActivityCalendarModel';

const readScreen = () =>
  readFileSync(fileURLToPath(new URL('./ReadingActivityScreen.tsx', import.meta.url)), 'utf8');

const day = (dateKey: string, chapterCount: number): ReadingActivityDaySummary => ({
  dateKey,
  chapterCount,
  firstReadAt: 0,
  lastReadAt: 0,
  chapterKeys: [],
});

const septemberDays = (): Record<string, ReadingActivityDaySummary> =>
  Object.fromEntries(
    ['01', '02', '03', '04', '05', '06', '07'].map((date) => [
      `2026-09-${date}`,
      day(`2026-09-${date}`, 3),
    ])
  );

test('the reading calendar grid runs Monday-first', () => {
  assert.deepEqual([...MONDAY_FIRST_WEEKDAY_INDEXES], [1, 2, 3, 4, 5, 6, 0]);
  assert.equal(MONDAY_FIRST_WEEKDAY_INDEXES.length, CALENDAR_COLUMN_COUNT);

  // Sunday (getDay 0) is the LAST column, Monday (1) the first.
  assert.equal(mondayFirstColumn(1), 0);
  assert.equal(mondayFirstColumn(0), 6);
  assert.equal(mondayFirstColumn(6), 5);

  // 1 September 2026 is a Tuesday, so exactly one leading day (31 August)
  // precedes it in a Monday-first grid.
  const grid = buildReadingActivityGrid({
    daysByDateKey: {},
    viewDate: new Date(2026, 8, 1),
    selectedDateKey: null,
    today: new Date(2026, 8, 8),
  });

  assert.equal(grid.monthKey, '2026-09');
  assert.equal(grid.leadingCount, 1);
  assert.equal(grid.cells[0].dateKey, '2026-08-31');
  assert.equal(grid.cells[0].inMonth, false);
  assert.equal(grid.cells[1].dateKey, '2026-09-01');
  assert.equal(grid.cells[1].inMonth, true);

  // Leading days only. Trailing days of the next month are never drawn, so the
  // final row stops on the 30th and the grid is 1 + 30 cells over 5 rows.
  assert.equal(grid.cells.length, 31);
  assert.equal(grid.cells.at(-1)?.dateKey, '2026-09-30');
  assert.equal(grid.rowCount, 5);
});

test('cell state distinguishes read days, today, and inert days', () => {
  const grid = buildReadingActivityGrid({
    daysByDateKey: septemberDays(),
    viewDate: new Date(2026, 8, 1),
    selectedDateKey: '2026-09-06',
    today: new Date(2026, 8, 8),
  });

  const cellFor = (dateKey: string) => {
    const cell = grid.cells.find((candidate) => candidate.dateKey === dateKey);
    assert.ok(cell, `${dateKey} should be in the grid`);
    return cell!;
  };

  assert.equal(cellFor('2026-09-01').state, 'read');
  assert.equal(cellFor('2026-09-07').state, 'read');
  // Today has no reading yet, so it is outlined rather than filled.
  assert.equal(cellFor('2026-09-08').state, 'today');
  assert.equal(cellFor('2026-09-08').isToday, true);
  assert.equal(cellFor('2026-09-09').state, 'idle');

  // Selection is orthogonal to state — the selected day keeps its own fill and
  // gains the ring on top.
  assert.equal(cellFor('2026-09-06').state, 'read');
  assert.equal(cellFor('2026-09-06').isSelected, true);
  assert.equal(cellFor('2026-09-05').isSelected, false);

  // A read day that is also today stays filled rather than outlined.
  const readToday = buildReadingActivityGrid({
    daysByDateKey: { '2026-09-08': day('2026-09-08', 1) },
    viewDate: new Date(2026, 8, 1),
    selectedDateKey: null,
    today: new Date(2026, 8, 8),
  });
  assert.equal(readToday.cells.find((cell) => cell.dateKey === '2026-09-08')?.state, 'read');
});

test('the legend counts read days against days elapsed in the month on screen', () => {
  const current = buildReadingActivityGrid({
    daysByDateKey: septemberDays(),
    viewDate: new Date(2026, 8, 1),
    selectedDateKey: null,
    today: new Date(2026, 8, 8),
  });
  assert.equal(current.readDays, 7);
  assert.equal(current.elapsedDays, 8);

  // A month already past counts every one of its days.
  const past = buildReadingActivityGrid({
    daysByDateKey: {},
    viewDate: new Date(2026, 7, 1),
    selectedDateKey: null,
    today: new Date(2026, 8, 8),
  });
  assert.equal(past.elapsedDays, 31);

  // A month that has not started yet counts none.
  const future = buildReadingActivityGrid({
    daysByDateKey: {},
    viewDate: new Date(2026, 9, 1),
    selectedDateKey: null,
    today: new Date(2026, 8, 8),
  });
  assert.equal(future.elapsedDays, 0);

  // Leading days from the previous month never inflate this month's count.
  const leadingRead = buildReadingActivityGrid({
    daysByDateKey: { '2026-08-31': day('2026-08-31', 4) },
    viewDate: new Date(2026, 8, 1),
    selectedDateKey: null,
    today: new Date(2026, 8, 8),
  });
  assert.equal(leadingRead.readDays, 0);
  assert.equal(leadingRead.cells[0].state, 'read');
});

test('month navigation lands on the first of the neighbouring month', () => {
  assert.equal(shiftMonth(new Date(2026, 8, 30), -1).getTime(), new Date(2026, 7, 1).getTime());
  assert.equal(shiftMonth(new Date(2026, 11, 15), 1).getTime(), new Date(2027, 0, 1).getTime());
});

test('weekday headers are single letters starting on Monday', () => {
  assert.deepEqual(buildWeekdayInitials('en'), ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  const french = buildWeekdayInitials('fr');
  assert.equal(french.length, CALENDAR_COLUMN_COUNT);
  // Localized, but still Monday-first and still one glyph per column.
  assert.equal(french[0], 'L');
  french.forEach((initial) => assert.ok(initial.length <= 2, `${initial} should be a narrow name`));
});

test('the selected day folds its chapters into one canonical reference', () => {
  const books: Record<string, { name: string; order: number }> = {
    PSA: { name: 'Psalms', order: 19 },
    PRO: { name: 'Proverbs', order: 20 },
    GEN: { name: 'Genesis', order: 1 },
  };
  const resolve = (bookId: string) => books[bookId] ?? { name: bookId, order: 999 };

  // Consecutive chapters collapse into a range; books come out in canon order
  // regardless of the order the chapters were read in.
  assert.equal(
    summarizeDayChapters(['PRO_27', 'PSA_21', 'PSA_22'], resolve),
    'Psalms 21–22, Proverbs 27'
  );
  assert.equal(summarizeDayChapters(['GEN_1'], resolve), 'Genesis 1');
  assert.equal(summarizeDayChapters(['PSA_1', 'PSA_2', 'PSA_5'], resolve), 'Psalms 1–2, 5');
  assert.equal(summarizeDayChapters([], resolve), '');
  // Malformed keys are skipped rather than rendered as NaN.
  assert.equal(summarizeDayChapters(['broken', 'GEN_x', 'GEN_3'], resolve), 'Genesis 3');
});

test('the selected-day card opens the first chapter of the same canonical order', () => {
  const books: Record<string, { name: string; order: number }> = {
    PSA: { name: 'Psalms', order: 19 },
    PRO: { name: 'Proverbs', order: 20 },
  };
  const resolve = (bookId: string) => books[bookId] ?? { name: bookId, order: 999 };

  assert.deepEqual(firstChapterOfDay(['PRO_27', 'PSA_22', 'PSA_21'], resolve), {
    bookId: 'PSA',
    chapter: 21,
  });
  // Nothing to open means no chevron and no press target.
  assert.equal(firstChapterOfDay([], resolve), null);
  assert.equal(firstChapterOfDay(['broken'], resolve), null);
});

test('the reading activity screen draws its own grid instead of react-native-calendars', () => {
  const screen = readScreen();

  assert.equal(
    /react-native-calendars/.test(screen),
    false,
    'the screen should no longer depend on the calendar widget'
  );
  assert.match(
    screen,
    /from '\.\/readingActivityCalendarModel'/,
    'the screen should render the shared Monday-first grid model'
  );
  assert.match(
    screen,
    /testID="reading-activity-calendar"/,
    'the grid keeps the stable calendar test ID'
  );
});
