import test from 'node:test';
import assert from 'node:assert/strict';

test('bundled reading plans expose the bundled plans in sort order', async () => {
  const mod = await import('./readingPlans.generated');

  assert.equal(mod.readingPlans.length, 23);
  assert.deepEqual(
    mod.readingPlans.map((plan) => plan.slug),
    [
      'bible-in-1-year',
      'new-testament-90-days',
      'psalms-30-days',
      'gospels-60-days',
      'proverbs-31-days',
      'kathisma-weekly',
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
    ]
  );

  assert.ok(mod.readingPlans.every((plan) => typeof plan.coverKey === 'string'));
  assert.equal(mod.readingPlansById.get('bible-in-1-year')?.coverKey, 'lakeLandscape');
  assert.equal(
    mod.readingPlansById.get('proverbs-31-days')?.scheduleMode,
    'calendar-day-of-month'
  );
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
        chapterEnd: 16,
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
        chapterEnd: 45,
      },
    ]
  );
});
