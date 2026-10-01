import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOrthodoxEaster,
  getSeason,
  getWesternEaster,
  isSeasonInWindow,
  type SeasonalScheduleMode,
} from './churchCalendar';

const key = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const seasonOn = (mode: SeasonalScheduleMode, today: Date) => {
  const { start, dayCount } = getSeason(mode, today);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + dayCount - 1);
  return [key(start), key(end)];
};

test('Western Easter matches the published dates, including the earliest and latest', () => {
  for (const [year, date] of [
    [2008, '2008-03-23'],
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
    [2029, '2029-04-01'],
    [2030, '2030-04-21'],
    [2038, '2038-04-25'],
  ] as const) {
    assert.equal(key(getWesternEaster(year)), date, String(year));
  }
});

test('Orthodox Pascha matches the published dates on the Gregorian calendar', () => {
  for (const [year, date] of [
    [2024, '2024-05-05'],
    [2025, '2025-04-20'],
    [2026, '2026-04-12'],
    [2027, '2027-05-02'],
    [2028, '2028-04-16'],
    [2029, '2029-04-08'],
    [2030, '2030-04-28'],
  ] as const) {
    assert.equal(key(getOrthodoxEaster(year)), date, String(year));
  }
});

test('the Easter cycle in 2027: Lent hands over to Holy Week, Easter to Pentecost', () => {
  const january = new Date(2027, 0, 15, 12);
  // Ash Wednesday 10 February to the eve of Palm Sunday.
  assert.deepEqual(seasonOn('calendar-lent', january), ['2027-02-10', '2027-03-20']);
  // Palm Sunday to Easter Day.
  assert.deepEqual(seasonOn('calendar-holy-week', january), ['2027-03-21', '2027-03-28']);
  // Easter Monday to the eve of Ascension Day.
  assert.deepEqual(seasonOn('calendar-easter', january), ['2027-03-29', '2027-05-05']);
  // Ascension Day to Pentecost.
  assert.deepEqual(seasonOn('calendar-pentecost', january), ['2027-05-06', '2027-05-16']);
  // Orthodox Palm Sunday to Pascha.
  assert.deepEqual(seasonOn('calendar-orthodox-holy-week', january), ['2027-04-25', '2027-05-02']);
});

test('fixed-date seasons and the second Sunday of November', () => {
  const october = new Date(2026, 9, 1, 12);
  assert.deepEqual(seasonOn('calendar-all-saints', october), ['2026-11-01', '2026-11-07']);
  assert.deepEqual(seasonOn('calendar-persecuted-church', october), ['2026-11-08', '2026-11-14']);
  assert.deepEqual(seasonOn('calendar-hard-christmas', october), ['2026-12-18', '2026-12-24']);
  assert.deepEqual(seasonOn('calendar-new-year', october), ['2027-01-01', '2027-01-07']);
  assert.deepEqual(seasonOn('calendar-epiphany', october), ['2027-01-06', '2027-01-12']);
  // Translation week ended yesterday, so the next one is a year away.
  assert.deepEqual(seasonOn('calendar-translation-week', october), ['2027-09-24', '2027-09-30']);
  // 1 November 2027 is a Monday, so the second Sunday is the 14th.
  assert.deepEqual(seasonOn('calendar-persecuted-church', new Date(2027, 5, 1)), [
    '2027-11-14',
    '2027-11-20',
  ]);
});

test('a season runs to its last day, then looks to next year', () => {
  assert.deepEqual(seasonOn('calendar-new-year', new Date(2027, 0, 7, 23, 50)), [
    '2027-01-01',
    '2027-01-07',
  ]);
  assert.deepEqual(seasonOn('calendar-new-year', new Date(2027, 0, 8, 0, 10)), [
    '2028-01-01',
    '2028-01-07',
  ]);
  // Christmas runs over New Year, so on 3 January the season began last year.
  assert.deepEqual(seasonOn('calendar-christmas', new Date(2027, 0, 3)), [
    '2026-12-25',
    '2027-01-05',
  ]);
});

test('a seasonal plan is offered from its lead-in until its last day, then hidden', () => {
  // Lent 2027 opens 10 February and is offered three weeks ahead.
  assert.equal(isSeasonInWindow('calendar-lent', new Date(2027, 0, 19, 12)), false);
  assert.equal(isSeasonInWindow('calendar-lent', new Date(2027, 0, 20, 12)), true);
  assert.equal(isSeasonInWindow('calendar-lent', new Date(2027, 2, 20, 23)), true);
  assert.equal(isSeasonInWindow('calendar-lent', new Date(2027, 2, 21, 1)), false);
  // Advent 2026 opens 29 November and is offered four weeks ahead.
  assert.equal(isSeasonInWindow('calendar-advent', new Date(2026, 9, 31, 12)), false);
  assert.equal(isSeasonInWindow('calendar-advent', new Date(2026, 10, 1, 12)), true);
  assert.equal(isSeasonInWindow('calendar-advent', new Date(2026, 11, 25, 12)), false);
});

test('Orthodox Holy Week steps aside in years when Pascha falls on Western Easter', () => {
  // 2028: both on 16 April.
  assert.equal(isSeasonInWindow('calendar-orthodox-holy-week', new Date(2028, 3, 12)), false);
  assert.equal(isSeasonInWindow('calendar-holy-week', new Date(2028, 3, 12)), true);
  // 2027: Pascha is 2 May, five weeks after Western Easter.
  assert.equal(isSeasonInWindow('calendar-orthodox-holy-week', new Date(2027, 3, 27)), true);
});

test('every season has a run every year, never empty or overlapping itself', () => {
  const modes: SeasonalScheduleMode[] = [
    'calendar-advent',
    'calendar-christmas',
    'calendar-new-year',
    'calendar-epiphany',
    'calendar-lent',
    'calendar-holy-week',
    'calendar-orthodox-holy-week',
    'calendar-easter',
    'calendar-pentecost',
    'calendar-translation-week',
    'calendar-all-saints',
    'calendar-persecuted-church',
    'calendar-hard-christmas',
  ];
  for (const mode of modes) {
    for (
      let date = new Date(2024, 0, 1, 12);
      date.getFullYear() < 2041;
      date.setDate(date.getDate() + 3)
    ) {
      const { start, dayCount } = getSeason(mode, date);
      const last = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + dayCount - 1,
        23
      );
      assert.ok(dayCount > 0, mode);
      assert.ok(last >= date, `${mode} ${key(date)}`);
      const next = getSeason(mode, new Date(last.getTime() + 2 * 60 * 60 * 1000));
      assert.ok(next.start > last, `${mode} ${key(date)} runs into its next season`);
    }
  }
});
