import test from 'node:test';
import assert from 'node:assert/strict';
import type { ReadingPlanCoverKey, ReadingPlanEntry } from '../services/plans/types';

test('bundled reading plans expose the bundled plans in sort order', async () => {
  const mod = await import('./readingPlans.generated');

  assert.equal(mod.readingPlans.length, 42);
  assert.deepEqual(
    mod.readingPlans.map((plan) => plan.slug),
    [
      'bible-in-1-year',
      'new-testament-90-days',
      'psalms-30-days',
      'gospels-60-days',
      'proverbs-31-days',
      'kathisma-weekly',
      'common-prayer-psalter',
      'week-of-christ',
      'lords-prayer-week',
      'gospels-monthly',
      'genesis-to-revelation-chronological',
      'epistles-30-days',
      'sermon-on-the-mount-7-days',
      'bible-in-30-days',
      'bible-in-90-days',
      'nt-in-30-days',
      'gospels-30-days',
      'acts-28-days',
      'foundations-of-the-gospel',
      'prayer-intimacy-with-god',
      'identity-in-christ',
      'the-kingdom-of-god',
      'spiritual-warfare',
      'holiness-and-sanctification',
      'great-commission-and-mission',
      'faith-and-obedience',
      'hearing-gods-voice',
      'life-loss-7-days',
      'life-stress-7-days',
      'life-fear-7-days',
      'life-peace-7-days',
      'life-depression-7-days',
      'life-hope-7-days',
      'life-healing-7-days',
      'life-anger-7-days',
      'life-anxiety-7-days',
      'life-love-7-days',
      'life-patience-7-days',
      'life-doubt-7-days',
      'life-pride-7-days',
      'life-temptation-7-days',
      'life-family-7-days',
    ]
  );

  assert.ok(mod.readingPlans.every((plan) => typeof plan.coverKey === 'string'));
  assert.equal(mod.readingPlansById.get('bible-in-1-year')?.coverKey, 'lakeLandscape');
  assert.equal(mod.readingPlansById.get('proverbs-31-days')?.scheduleMode, 'calendar-day-of-month');
  assert.equal(mod.readingPlansById.get('kathisma-weekly')?.coverKey, 'kathisma');
  assert.equal(mod.readingPlansById.get('kathisma-weekly')?.scheduleMode, 'calendar-day-of-week');
  assert.equal(mod.readingPlansById.get('kathisma-weekly')?.format, 'multi-session');
  assert.equal(mod.readingPlanEntriesByPlanId['bible-in-1-year'].length, 365);
  assert.equal(mod.readingPlanEntriesByPlanId['sermon-on-the-mount-7-days'].length, 7);
  assert.equal(mod.readingPlanEntriesByPlanId['bible-in-30-days'].length, 94);
  assert.equal(mod.readingPlanEntriesByPlanId['acts-28-days'].length, 28);
  assert.equal(mod.readingPlanEntriesByPlanId['foundations-of-the-gospel'].length, 18);
  assert.equal(mod.readingPlanEntriesByPlanId['prayer-intimacy-with-god'].length, 12);
  assert.equal(mod.readingPlanEntriesByPlanId['identity-in-christ'].length, 8);
  assert.equal(mod.readingPlanEntriesByPlanId['kathisma-weekly'].length, 20);

  assert.deepEqual(
    mod.readingPlanEntriesByPlanId['kathisma-weekly']
      .filter((entry) => entry.day_number === 1)
      .map((entry) => ({
        session: entry.session_key,
        title: entry.session_title,
        chapterStart: entry.chapter_start,
        chapterEnd: entry.chapter_end,
      })),
    [
      {
        session: 'morning',
        title: 'Morning Kathismata',
        chapterStart: 9,
        chapterEnd: 17,
      },
      {
        session: 'morning',
        title: 'Morning Kathismata',
        chapterStart: 18,
        chapterEnd: 24,
      },
    ]
  );
  assert.deepEqual(
    mod.readingPlanEntriesByPlanId['kathisma-weekly']
      .filter((entry) => entry.day_number === 2)
      .map((entry) => ({
        session: entry.session_key,
        title: entry.session_title,
        chapterStart: entry.chapter_start,
        chapterEnd: entry.chapter_end,
      })),
    [
      {
        session: 'morning',
        title: 'Morning Kathismata',
        chapterStart: 25,
        chapterEnd: 32,
      },
      {
        session: 'morning',
        title: 'Morning Kathismata',
        chapterStart: 33,
        chapterEnd: 37,
      },
      {
        session: 'evening',
        title: 'Evening Kathismata',
        chapterStart: 38,
        chapterEnd: 46,
      },
    ]
  );
});

test('plan entries are grouped by plan id in collation order, then by day', async () => {
  const mod = await import('./readingPlans.generated');
  const planIds = [...new Set(mod.readingPlanEntries.map((entry) => entry.plan_id))];

  // The module sorts by code unit instead of localeCompare; that is only the same
  // order while every id is a lowercase ASCII slug.
  planIds.forEach((planId) => assert.match(planId, /^[a-z0-9-]+$/));
  assert.deepEqual(
    planIds,
    [...planIds].sort((left, right) => left.localeCompare(right))
  );
  assert.equal(planIds.length, mod.readingPlans.length);

  mod.readingPlanEntries.forEach((entry, index) => {
    const previous = mod.readingPlanEntries[index - 1];
    if (previous?.plan_id === entry.plan_id) {
      assert.ok(
        previous.day_number <= entry.day_number,
        `${entry.plan_id} day ${entry.day_number}`
      );
    }
  });
});

const summarize = (entries: ReadingPlanEntry[]) =>
  entries.map((entry) => {
    const verses = entry.verse_start != null ? `:${entry.verse_start}-${entry.verse_end}` : '';
    const end =
      entry.chapter_end != null && entry.chapter_end !== entry.chapter_start
        ? `-${entry.chapter_end}`
        : '';
    return `${entry.session_key ? `${entry.session_key} ` : ''}${entry.book} ${entry.chapter_start}${end}${verses}`;
  });

const entriesForDay = (entries: ReadingPlanEntry[], dayNumber: number) =>
  summarize(entries.filter((entry) => entry.day_number === dayNumber));

test('the new daily rhythms repeat on the calendar and carry their own covers', async () => {
  const mod = await import('./readingPlans.generated');
  const expected: Array<[string, string, number, string | undefined]> = [
    ['common-prayer-psalter', 'calendar-day-of-month', 31, 'multi-session'],
    ['week-of-christ', 'calendar-day-of-week', 7, undefined],
    ['lords-prayer-week', 'calendar-day-of-week', 7, undefined],
    ['gospels-monthly', 'calendar-day-of-month', 31, undefined],
  ];
  const coverKeys = new Set<ReadingPlanCoverKey>();

  for (const [id, scheduleMode, durationDays, format] of expected) {
    const plan = mod.readingPlansById.get(id);
    assert.ok(plan, id);
    assert.equal(plan.scheduleMode, scheduleMode, id);
    assert.equal(plan.duration_days, durationDays, id);
    assert.equal(plan.format, format, id);
    assert.equal(plan.category, 'devotional', id);
    coverKeys.add(plan.coverKey);
  }

  // Each rhythm gets a mark of its own, not a cover borrowed from another plan.
  const otherCovers = new Set(
    mod.readingPlans
      .filter((plan) => !expected.some(([id]) => id === plan.id))
      .map((plan) => plan.coverKey)
  );
  assert.equal(coverKeys.size, expected.length);
  coverKeys.forEach((key) => assert.ok(!otherCovers.has(key), key));
});

test('Week of Christ keeps the weekly remembrance of the early church, Sunday first', async () => {
  const mod = await import('./readingPlans.generated');
  const entries = mod.readingPlanEntriesByPlanId['week-of-christ'];

  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map((day) => entriesForDay(entries, day)),
    [
      ['JHN 20'], // Sunday: the Resurrection
      ['HEB 1'], // Monday: the angels
      ['MAT 3'], // Tuesday: John the Baptist
      ['MAT 26'], // Wednesday: the betrayal
      ['ACT 2'], // Thursday: the apostles
      ['JHN 19'], // Friday: the Cross
      ['1TH 4'], // Saturday: rest, and those who have fallen asleep
    ]
  );
});

test("Lord's Prayer Week prays the prayer daily, then dwells on one petition", async () => {
  const mod = await import('./readingPlans.generated');
  const entries = mod.readingPlanEntriesByPlanId['lords-prayer-week'];
  const prayer = 'MAT 6:9-13';

  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map((day) => entriesForDay(entries, day)),
    [
      [prayer, 'ROM 8'], // Our Father in heaven
      [prayer, 'ISA 6'], // hallowed be your name
      [prayer, 'MAT 13'], // your kingdom come
      [prayer, 'MAT 26:36-46'], // your will be done
      [prayer, 'JHN 6'], // our daily bread
      [prayer, 'MAT 18'], // forgive us our debts
      [prayer, 'MAT 4:1-11', 'EPH 6:10-20'], // lead us not into temptation, deliver us
    ]
  );
});

test('Gospels monthly reads all four Gospels in order, about three chapters a day', async () => {
  const mod = await import('./readingPlans.generated');
  const entries = mod.readingPlanEntriesByPlanId['gospels-monthly'];
  const chaptersOnDay = (day: number) =>
    entries
      .filter((entry) => entry.day_number === day)
      .reduce(
        (sum, entry) => sum + (entry.chapter_end ?? entry.chapter_start) - entry.chapter_start + 1,
        0
      );

  assert.deepEqual(entriesForDay(entries, 1), ['MAT 1-3']);
  assert.deepEqual(entriesForDay(entries, 31), ['JHN 20-21']);
  for (let day = 1; day <= 31; day++) {
    assert.ok([2, 3].includes(chaptersOnDay(day)), `day ${day}`);
  }
});

test('the Common Prayer Psalter follows the 1662 monthly table, repeating day 30 on the 31st', async () => {
  const mod = await import('./readingPlans.generated');
  const entries = mod.readingPlanEntriesByPlanId['common-prayer-psalter'];

  assert.deepEqual(entriesForDay(entries, 1), ['morning PSA 1-5', 'evening PSA 6-8']);
  assert.deepEqual(entriesForDay(entries, 3), ['morning PSA 15-17', 'evening PSA 18']);
  assert.deepEqual(entriesForDay(entries, 13), ['morning PSA 68', 'evening PSA 69-70']);
  assert.deepEqual(entriesForDay(entries, 24), ['morning PSA 116-118', 'evening PSA 119:1-32']);
  assert.deepEqual(entriesForDay(entries, 25), ['morning PSA 119:33-72', 'evening PSA 119:73-104']);
  assert.deepEqual(entriesForDay(entries, 26), [
    'morning PSA 119:105-144',
    'evening PSA 119:145-176',
  ]);
  assert.deepEqual(entriesForDay(entries, 30), ['morning PSA 144-146', 'evening PSA 147-150']);
  assert.deepEqual(entriesForDay(entries, 31), entriesForDay(entries, 30));

  // Days 1-30 read every psalm once, and Psalm 119 verse by verse without gaps.
  const monthEntries = entries.filter((entry) => entry.day_number <= 30);
  const psalms = monthEntries.flatMap((entry) =>
    entry.verse_start != null
      ? []
      : Array.from(
          { length: (entry.chapter_end ?? entry.chapter_start) - entry.chapter_start + 1 },
          (_, index) => entry.chapter_start + index
        )
  );
  const psalm119Verses = monthEntries
    .filter((entry) => entry.verse_start != null)
    .flatMap((entry) =>
      Array.from(
        { length: entry.verse_end! - entry.verse_start! + 1 },
        (_, index) => entry.verse_start! + index
      )
    );
  assert.deepEqual(
    [...psalms, 119].sort((a, b) => a - b),
    Array.from({ length: 150 }, (_, index) => index + 1)
  );
  assert.deepEqual(
    psalm119Verses,
    Array.from({ length: 176 }, (_, index) => index + 1)
  );
  assert.ok(
    entries.every((entry, index) => entries.findIndex((other) => other.id === entry.id) === index)
  );
});

test('Seasons of life plans are seven days of at least two whole chapters, each with its own cover', async () => {
  const mod = await import('./readingPlans.generated');
  const plans = mod.readingPlans.filter((plan) => plan.category === 'life-situation');

  assert.equal(plans.length, 15);
  assert.equal(new Set(plans.map((plan) => plan.coverKey)).size, 15);
  for (const plan of plans) {
    assert.equal(plan.duration_days, 7, plan.id);
    assert.equal(plan.scheduleMode, undefined, `${plan.id} runs from its start date`);
    const entries: ReadingPlanEntry[] = mod.readingPlanEntriesByPlanId[plan.id];
    for (let day = 1; day <= 7; day += 1) {
      const dayEntries = entries.filter((entry) => entry.day_number === day);
      const chapterCount = dayEntries.reduce(
        (sum, entry) => sum + (entry.chapter_end ?? entry.chapter_start) - entry.chapter_start + 1,
        0
      );
      assert.ok(chapterCount >= 2, `${plan.id} day ${day} has ${chapterCount} chapter(s)`);
      assert.ok(
        dayEntries.every((entry) => entry.verse_start == null && entry.verse_end == null),
        `${plan.id} day ${day} reads whole chapters only`
      );
    }
  }
});

test('back-to-back chapters of one book in a Seasons of life day read as one range', async () => {
  const mod = await import('./readingPlans.generated');
  const lossDay3 = mod.readingPlanEntriesByPlanId['life-loss-7-days'].filter(
    (entry: ReadingPlanEntry) => entry.day_number === 3
  );

  assert.deepEqual(
    lossDay3.map((entry: ReadingPlanEntry) => [entry.book, entry.chapter_start, entry.chapter_end]),
    [['RUT', 1, 2]]
  );
});
