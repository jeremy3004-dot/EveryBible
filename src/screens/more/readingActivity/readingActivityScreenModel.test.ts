import assert from 'node:assert/strict';
import test from 'node:test';
import type { TFunction } from 'i18next';
import type { ReadingActivityDaySummary } from '../../../services/progress/readingActivity';
import type { ReadingActivityGridCell } from '../readingActivityCalendarModel';
import {
  buildCellLabels,
  buildSelectedDayCopy,
  createDayLabelFormatter,
  describeCellState,
  formatMonthTitle,
  getMonthSelectionKey,
  totalListeningMinutes,
} from './readingActivityScreenModel';

// Day keys and times are local; pin the zone so the expectations hold anywhere.
process.env.TZ = 'UTC';

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as unknown as TFunction;

const at = (iso: string) => new Date(iso).getTime();
const day = (overrides: Partial<ReadingActivityDaySummary>): ReadingActivityDaySummary => ({
  dateKey: '2026-09-22',
  chapterCount: 1,
  firstReadAt: at('2026-09-22T09:00:00.000Z'),
  lastReadAt: at('2026-09-22T09:00:00.000Z'),
  chapterKeys: ['PSA_21'],
  ...overrides,
});
const formatter = createDayLabelFormatter('en');

test('a month opens on its most recently read day, and on nothing when unread', () => {
  const days = {
    '2026-08-30': day({ dateKey: '2026-08-30', lastReadAt: at('2026-08-30T10:00:00.000Z') }),
    '2026-09-03': day({ dateKey: '2026-09-03', lastReadAt: at('2026-09-03T21:00:00.000Z') }),
    '2026-09-12': day({ dateKey: '2026-09-12', lastReadAt: at('2026-09-12T06:00:00.000Z') }),
  };
  assert.equal(getMonthSelectionKey(new Date(2026, 8, 1), days), '2026-09-12');
  assert.equal(getMonthSelectionKey(new Date(2026, 7, 1), days), '2026-08-30');
  assert.equal(getMonthSelectionKey(new Date(2026, 9, 1), days), null);
});

test('the month title and cell names follow the interface language', () => {
  assert.equal(formatMonthTitle(new Date(2026, 8, 1), 'en'), 'September 2026');
  const cells = [{ dateKey: '2026-09-22' }, { dateKey: '2026-09-23' }] as ReadingActivityGridCell[];
  assert.deepEqual(
    [...buildCellLabels(cells, formatter)],
    [
      ['2026-09-22', 'Tuesday, September 22'],
      ['2026-09-23', 'Wednesday, September 23'],
    ]
  );
});

test('a cell’s state is spoken as read, today, both, or not at all', () => {
  assert.equal(
    describeCellState({ state: 'read', isToday: false }, t),
    'readingActivity.legendRead'
  );
  assert.equal(
    describeCellState({ state: 'today', isToday: true }, t),
    'readingActivity.legendToday'
  );
  assert.equal(
    describeCellState({ state: 'read', isToday: true }, t),
    'readingActivity.legendRead, readingActivity.legendToday'
  );
  assert.equal(describeCellState({ state: 'idle', isToday: false }, t), undefined);
});

test('a read day is summarised in canonical order with its reading window, and opens its first chapter', () => {
  const copy = buildSelectedDayCopy({
    dateKey: '2026-09-22',
    day: day({
      chapterCount: 3,
      chapterKeys: ['PSA_22', 'GEN_1', 'PSA_21'],
      lastReadAt: at('2026-09-22T09:20:00.000Z'),
    }),
    formatter,
    language: 'en',
    t,
  });

  assert.equal(copy.eyebrow, 'Tuesday, September 22');
  assert.equal(
    copy.summary,
    'readingActivity.dayChapters {"count":3,"books":"Genesis 1, Psalms 21–22"}'
  );
  assert.equal(
    copy.window,
    'readingActivity.sessionWindow {"start":"9:00 AM","end":"9:20 AM","duration":"interface.minutesShort {\\"count\\":20}"}'
  );
  assert.equal(copy.hint, null);
  assert.equal(copy.accessibilityLabel, [copy.eyebrow, copy.summary, copy.window].join(', '));
  assert.deepEqual(copy.chapter, { bookId: 'GEN', chapter: 1 });
});

test('a day read in one sitting has no window', () => {
  const copy = buildSelectedDayCopy({
    dateKey: '2026-09-22',
    day: day({}),
    formatter,
    language: 'en',
    t,
  });
  assert.equal(copy.window, null);
  assert.equal(copy.accessibilityLabel, [copy.eyebrow, copy.summary].join(', '));
});

test('an idle day says nothing was read, hints how to start, and leads nowhere', () => {
  const copy = buildSelectedDayCopy({
    dateKey: '2026-09-25',
    day: null,
    formatter,
    language: 'en',
    t,
  });
  assert.deepEqual(copy, {
    eyebrow: 'Friday, September 25',
    summary: 'readingActivity.noReading',
    window: null,
    hint: 'readingActivity.noReadingHint',
    accessibilityLabel: 'Friday, September 25, readingActivity.noReading',
    chapter: null,
  });
});

test('with no day chosen the card is headed Today and leaves its label to its children', () => {
  const copy = buildSelectedDayCopy({ dateKey: null, day: null, formatter, language: 'en', t });
  assert.equal(copy.eyebrow, 'readingActivity.legendToday');
  assert.equal(copy.accessibilityLabel, undefined);
});

test('listening minutes come from this device when there is no cloud total', () => {
  assert.equal(
    totalListeningMinutes({ '2026-09-23': 4 * 60_000, '2026-09-24': 6 * 60_000 + 59_000 }, null),
    10,
    'whole minutes, summed over every day'
  );
  assert.equal(totalListeningMinutes({}, null), 0);
});

test('a cloud total counts other devices, and this device covers a cloud summary that lags', () => {
  const local = { '2026-09-24': 12 * 60_000 };
  assert.equal(totalListeningMinutes(local, 95), 95);
  // Events still queued for upload, or not yet folded into the summary.
  assert.equal(totalListeningMinutes(local, 0), 12);
});

test('a corrupt day entry never poisons the listening total', () => {
  assert.equal(
    totalListeningMinutes(
      { a: Number.NaN, b: -60_000, c: Number.POSITIVE_INFINITY, d: 2 * 60_000 },
      Number.NaN
    ),
    2
  );
});
