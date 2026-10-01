import assert from 'node:assert/strict';
import test from 'node:test';

import { bibleBookById } from './bible-books';
import {
  blockSpanLabel,
  buildPlansSitemap,
  dayBlocks,
  dayLabel,
  DESCRIPTION_MAX_LENGTH,
  getPlanBySlug,
  getPlans,
  groupPlans,
  planHeading,
  planLengthLabel,
  planMetaLabel,
  planPaceSentence,
  planPageDescription,
  planPageMetadata,
  planPageTitle,
  planScheduleSentence,
  planScopeSentence,
  plansHubDescription,
  PLANS_HUB_TITLE,
  readingLabel,
  readingPath,
  relatedPlans,
  shouldBlockDays,
  TITLE_MAX_LENGTH,
} from './plan-pages';
import type { PlanDay, PlanReading, SitePlan } from './plan-snapshot';

function plan(slug: string): SitePlan {
  const found = getPlanBySlug(slug);
  assert.ok(found, slug);
  return found;
}

const day = (number: number, ...readings: PlanReading[]): PlanDay => ({
  day: number,
  sessions: [{ label: null, readings }],
});

test('reading labels follow common citation style', () => {
  assert.equal(readingLabel({ book: 'GEN', chapter: 1, toChapter: 3 }), 'Genesis 1–3');
  assert.equal(readingLabel({ book: 'PSA', chapter: 23 }), 'Psalm 23');
  assert.equal(readingLabel({ book: 'PSA', chapter: 1, toChapter: 4 }), 'Psalms 1–4');
  assert.equal(readingLabel({ book: 'JHN', chapter: 3, verse: 16, toVerse: 21 }), 'John 3:16–21');
  assert.equal(readingLabel({ book: 'JHN', chapter: 3, verse: 16 }), 'John 3:16');
  assert.equal(readingLabel({ book: 'MAT', chapter: 5, toChapter: 7 }), 'Matthew 5–7');
  assert.equal(
    readingLabel({ book: 'PSA', chapter: 119, verse: 1, toVerse: 32 }),
    'Psalm 119:1–32'
  );
  assert.equal(
    readingLabel({ book: 'GEN', chapter: 1, toChapter: 2, verse: 1, toVerse: 3 }),
    'Genesis 1:1–2:3'
  );
  assert.equal(readingLabel({ book: 'JUD', chapter: 1 }), 'Jude');
  assert.equal(readingLabel({ book: '1CO', chapter: 13 }), '1 Corinthians 13');
});

test('readings link to their chapter, at the first verse of a passage', () => {
  assert.equal(readingPath({ book: 'GEN', chapter: 1, toChapter: 3 }), '/bible/genesis/1');
  assert.equal(
    readingPath({ book: 'JHN', chapter: 3, verse: 16, toVerse: 21 }),
    '/bible/john/3#v16'
  );
  assert.equal(readingPath({ book: 'SNG', chapter: 2 }), '/bible/song-of-songs/2');
});

test('every reading in the catalog links inside its book', () => {
  for (const item of getPlans())
    for (const planDay of item.days)
      for (const session of planDay.sessions)
        for (const reading of session.readings) {
          const book = bibleBookById(reading.book);
          assert.ok(book, reading.book);
          assert.ok((reading.toChapter ?? reading.chapter) <= book.chapters, item.id);
          assert.match(readingPath(reading), /^\/bible\/[a-z0-9-]+\/[1-9][0-9]*(#v[1-9][0-9]*)?$/);
        }
});

test('lengths say how recurring plans repeat instead of counting 31 days', () => {
  assert.equal(planLengthLabel(plan('bible-in-1-year')), '365 days');
  assert.equal(planLengthLabel(plan('life-anxiety-7-days')), '7 days');
  assert.equal(planLengthLabel(plan('proverbs-31-days')), 'Every month');
  assert.equal(planLengthLabel(plan('week-of-christ')), 'Every week');
  assert.equal(planMetaLabel(plan('kathisma-weekly')), 'Every week · Morning + Evening');
  assert.equal(planMetaLabel(plan('common-prayer-psalter')), 'Every month · Morning + Evening');
  assert.equal(planLengthLabel(plan('advent')), 'Every Advent');
  assert.equal(planLengthLabel(plan('twelve-days-of-christmas')), 'Every Christmas');
});

test('the Twelve Days are labelled by date; Advent counts days because its start moves', () => {
  const christmas = plan('twelve-days-of-christmas');
  assert.equal(dayLabel(christmas, 1), '25 December');
  assert.equal(dayLabel(christmas, 7), '31 December');
  assert.equal(dayLabel(christmas, 8), '1 January');
  assert.equal(dayLabel(christmas, 12), '5 January');
  assert.equal(dayLabel(plan('advent'), 22), 'Day 22');
  assert.match(planScheduleSentence(plan('advent')), /first Sunday of Advent/);
  assert.match(planScheduleSentence(christmas), /Christmas Day and ends on 5 January/);
});

test('weekly plans name the weekday, starting on Sunday', () => {
  assert.equal(dayLabel(plan('week-of-christ'), 1), 'Sunday');
  assert.equal(dayLabel(plan('week-of-christ'), 7), 'Saturday');
  assert.equal(dayLabel(plan('proverbs-31-days'), 14), 'Day 14');
  assert.equal(dayLabel(plan('bible-in-1-year'), 200), 'Day 200');
});

test('the catalog follows the app: Church year, Daily rhythms, Seasons of life, then categories', () => {
  const groups = groupPlans(getPlans());
  assert.deepEqual(
    groups.map((group) => group.label),
    [
      'Church year',
      'Daily rhythms',
      'Seasons of life',
      'Whole Bible',
      'Book study',
      'Topical',
      'Devotional',
    ]
  );
  assert.deepEqual(
    groups[0].plans.map((item) => item.slug),
    ['advent', 'twelve-days-of-christmas']
  );
  const rhythms = groups[1].plans.map((item) => item.slug);
  assert.deepEqual(rhythms, [
    'proverbs-31-days',
    'kathisma-weekly',
    'common-prayer-psalter',
    'week-of-christ',
    'lords-prayer-week',
    'gospels-monthly',
  ]);
  assert.equal(
    groups.reduce((sum, group) => sum + group.plans.length, 0),
    getPlans().length
  );
  // A recurring devotional plan is a rhythm, never listed twice.
  assert.ok(!groups[6].plans.some((item) => item.schedule !== 'sequential'));
});

test('related plans come from the same section, after this plan and wrapping round', () => {
  const last = plan('life-family-7-days');
  const related = relatedPlans(last);
  assert.equal(related.length, 4);
  assert.equal(related[0].slug, 'life-loss-7-days');
  assert.ok(related.every((item) => item.category === 'life-situation'));
  assert.ok(!related.some((item) => item.id === last.id));
});

test('summaries are counted from the schedule', () => {
  assert.equal(
    planScopeSentence(plan('bible-in-1-year')),
    'Every chapter of the Bible: 66 books, 1,189 chapters.'
  );
  assert.equal(planPaceSentence(plan('bible-in-1-year')), 'About 3 chapters a day.');
  assert.equal(
    planScopeSentence(plan('gospels-60-days')),
    'All of Matthew, Mark, Luke and John: 89 chapters.'
  );
  assert.equal(planPaceSentence(plan('acts-28-days')), '1 chapter a day.');
  assert.equal(
    planScopeSentence(plan('new-testament-90-days')),
    '27 whole books, Matthew to Revelation: 260 chapters.'
  );
  assert.equal(planScopeSentence(plan('common-prayer-psalter')), 'All of Psalms: 150 chapters.');
  assert.equal(
    planScopeSentence(plan('sermon-on-the-mount-7-days')),
    'Selected passages from Matthew.'
  );
  assert.equal(planPaceSentence(plan('sermon-on-the-mount-7-days')), null);
  assert.equal(planPaceSentence(plan('proverbs-31-days')), null);
  assert.match(planScopeSentence(plan('life-anxiety-7-days')), /^\d+ chapters from \d+ books/);
});

test('long plans fold into 30-day blocks labelled by where they start and end', () => {
  const year = plan('bible-in-1-year');
  assert.ok(shouldBlockDays(year));
  assert.ok(!shouldBlockDays(plan('proverbs-31-days')));
  const blocks = dayBlocks(year.days);
  assert.equal(blocks.length, 13);
  assert.deepEqual([blocks[0].first, blocks[0].last], [1, 30]);
  assert.deepEqual([blocks[12].first, blocks[12].last], [361, 365]);
  assert.equal(blockSpanLabel(blocks[0].days), 'Genesis 1 – Leviticus 18');

  const psalms = [
    day(1, { book: 'PSA', chapter: 1, toChapter: 5 }),
    day(2, { book: 'PSA', chapter: 6, toChapter: 10 }),
  ];
  assert.equal(blockSpanLabel(psalms), 'Psalms 1–10');
  assert.equal(blockSpanLabel([day(1, { book: 'PSA', chapter: 23 })]), 'Psalm 23');
  assert.equal(
    blockSpanLabel([day(1, { book: '3JN', chapter: 1 }), day(2, { book: 'JUD', chapter: 1 })]),
    '3 John – Jude'
  );
});

test('titles and descriptions fit search results and name the plan', () => {
  for (const item of getPlans()) {
    const title = planPageTitle(item);
    const description = planPageDescription(item);
    assert.ok(title.length <= TITLE_MAX_LENGTH, title);
    assert.ok(description.length <= DESCRIPTION_MAX_LENGTH, description);
    assert.ok(title.includes(planHeading(item)), title);
    assert.ok(description.startsWith(item.description), description);
  }
  assert.equal(
    planPageTitle(plan('life-anxiety-7-days')),
    'Bible Reading Plan for Anxiety — 7 Days | EveryBible'
  );
  assert.equal(
    planPageTitle(plan('bible-in-1-year')),
    'Bible in One Year — 365-Day Bible Reading Plan | EveryBible'
  );
  assert.equal(
    planPageTitle(plan('proverbs-31-days')),
    'Daily Proverbs Chapter — Monthly Reading Plan | EveryBible'
  );
  assert.equal(planPageTitle(plan('advent')), 'Advent Bible Reading Plan | EveryBible');
  for (const item of getPlans()) assert.doesNotMatch(planPageDescription(item), /\bAn free\b/);
  assert.ok(PLANS_HUB_TITLE.length <= TITLE_MAX_LENGTH);
  assert.ok(plansHubDescription().length <= DESCRIPTION_MAX_LENGTH);
});

test('plan pages share their cover and keep the canonical path', () => {
  const metadata = planPageMetadata(plan('life-anxiety-7-days'));
  assert.deepEqual(metadata.alternates, { canonical: '/plans/life-anxiety-7-days' });
  const images = metadata.openGraph?.images;
  assert.ok(Array.isArray(images));
  assert.deepEqual(images[0], {
    url: '/plans/covers/lifeAnxiety.webp',
    width: 800,
    height: 600,
    type: 'image/webp',
    alt: 'Cover artwork for Anxiety',
  });
});

test('the sitemap lists the catalog and every plan once', () => {
  const urls = buildPlansSitemap().map((entry) => entry.url);
  assert.equal(urls.length, getPlans().length + 1);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls[0], 'https://everybible.app/plans');
  assert.ok(urls.includes('https://everybible.app/plans/bible-in-1-year'));
});
