// Plan-day dates with the device clock pinned to a zone that is behind UTC and
// observes daylight saving. A plan day is a local calendar date, so an enrolment
// stamped in UTC must be read in the reader's zone. Pinning TZ here is safe
// because the test runner gives every file its own process.
process.env.TZ = 'America/New_York';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getActivePlanDayNumber,
  getPlanCompletionEntryKey,
  getPlanLedgerDayNumbers,
  getVisibleCompletedEntryCount,
  isJoinedPlanShownToday,
} from './readingPlanModel';
import type { ReadingPlan, ReadingPlanEntry } from './types';

const plan = (overrides: Partial<ReadingPlan>): ReadingPlan => ({
  id: 'plan-1',
  slug: 'plan-1',
  title_key: 'readingPlans.plan1.title',
  description_key: null,
  duration_days: 31,
  category: 'devotional',
  is_active: true,
  sort_order: 1,
  coverKey: 'desert',
  ...overrides,
});

const monthly = plan({ scheduleMode: 'calendar-day-of-month', duration_days: 31 });
const weekly = plan({ scheduleMode: 'calendar-day-of-week', duration_days: 7 });
const advent = plan({ scheduleMode: 'calendar-advent', duration_days: 28 });
const at = 'T08:00:00.000Z';

test('a recurring plan of unknown length shows today, one with a length stops at its last day', () => {
  const fifth = new Date(2026, 3, 5, 12);
  assert.equal(getActivePlanDayNumber({ ...monthly, duration_days: 0 }, null, fifth), 5);
  assert.equal(getActivePlanDayNumber({ ...monthly, duration_days: 1 }, null, fifth), 1);
  // A 30-day monthly plan on the 31st stays on its day 30.
  assert.equal(
    getActivePlanDayNumber({ ...monthly, duration_days: 30 }, null, new Date(2026, 2, 31, 12)),
    30
  );
  // Before Advent opens, its first day is the one waiting, length known or not.
  assert.equal(
    getActivePlanDayNumber({ ...advent, duration_days: 0 }, null, new Date(2026, 9, 1, 12)),
    1
  );
});

test('the ledger lists plan days in day order whatever order the entries came in', () => {
  const entries = [3, 31, 1, 30, 2].map(
    (day): ReadingPlanEntry => ({
      id: `day-${day}`,
      plan_id: monthly.id,
      day_number: day,
      book: 'PRO',
      chapter_start: day,
      chapter_end: null,
    })
  );

  assert.deepEqual(getPlanLedgerDayNumbers(monthly, entries, new Date(2026, 8, 10)), [1, 2, 3, 30]);
});

test("a recurring day ticked after midnight counts as last night's reading until 4 a.m.", () => {
  // Saturday's reading (day 7), ticked early on Sunday 27 September.
  assert.equal(getPlanCompletionEntryKey(weekly, 7, new Date(2026, 8, 27, 3, 59)), '2026-09-26');
  assert.equal(getPlanCompletionEntryKey(weekly, 7, new Date(2026, 8, 27, 4, 0)), '2026-10-03');
});

test('a recurring plan counts only completions filed under a real date in this cycle', () => {
  // A day-number key (from before the plan was dated) and dates that do not exist
  // on the calendar: 30 February would roll over to 2 March, month 13 to January.
  assert.equal(
    getVisibleCompletedEntryCount(
      monthly,
      { '2026-03-02': `2026-03-02${at}`, '2026-02-30': `2026-03-02${at}`, '5': `2026-03-05${at}` },
      new Date(2026, 2, 15, 12)
    ),
    1
  );
  assert.equal(
    getVisibleCompletedEntryCount(
      monthly,
      { '2027-01-15': `2027-01-15${at}`, '2026-13-15': `2027-01-15${at}` },
      new Date(2027, 0, 20, 12)
    ),
    1
  );
  assert.equal(
    getVisibleCompletedEntryCount(
      weekly,
      { '2026-04-13': `2026-04-13${at}`, '3': `2026-04-14${at}` },
      new Date(2026, 3, 15, 12)
    ),
    1
  );
  assert.equal(
    getVisibleCompletedEntryCount(
      advent,
      { '2026-11-29': `2026-11-29${at}`, '1': `2026-11-29${at}` },
      new Date(2026, 11, 1, 12)
    ),
    1
  );
});

test('a seasonal plan stops counting at the last day of its season', () => {
  // Advent 2026 runs 29 November to Christmas Eve; Christmas Day is not part of it.
  assert.equal(
    getVisibleCompletedEntryCount(
      advent,
      { '2026-12-24': `2026-12-24${at}`, '2026-12-25': `2026-12-25${at}` },
      new Date(2026, 11, 24, 21)
    ),
    1
  );
});

test('a seasonal plan joined on its last day steps aside after it; joined the day after, it stays', () => {
  // All Saints 2026 runs 1 to 7 November; on 1 December the next one is far off.
  const allSaints = plan({ scheduleMode: 'calendar-all-saints', duration_days: 7 });
  const december = new Date(2026, 11, 1, 12);

  // 02:30 UTC on 8 November is 21:30 on the 7th in New York: the season's last day.
  assert.equal(
    isJoinedPlanShownToday(allSaints, { started_at: '2026-11-08T02:30:00.000Z' }, december),
    false
  );
  // 05:30 UTC is 00:30 on the 8th: joined after the season had ended.
  assert.equal(
    isJoinedPlanShownToday(allSaints, { started_at: '2026-11-08T05:30:00.000Z' }, december),
    true
  );
});
