import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, URL } from 'node:url';
import { bibleBooks } from '../constants/books';
import { en } from '../i18n/locales/en';
import { localeLoaders } from '../i18n/localeLoaders';
import { getActivePlanDayNumber, isRecurringPlan } from '../services/plans/readingPlanModel';
import { assertDefined } from '../utils/assertDefined';
import { readingPlans, readingPlanEntriesByPlanId } from './readingPlans.generated';

const entriesFor = (planId: string) =>
  assertDefined(readingPlanEntriesByPlanId[planId], `the entries of ${planId}`);

test('every plan has every advertised day and each passage resolves in the shipped Bible', () => {
  const db = new DatabaseSync(
    fileURLToPath(new URL('../../assets/databases/bible-bsb-v2.db', import.meta.url)),
    { readOnly: true }
  );
  try {
    const rows = db
      .prepare("SELECT book_id, chapter, verse FROM verses WHERE translation_id = 'bsb'")
      .all() as Array<{ book_id: string; chapter: number; verse: number }>;
    const verses = new Set(rows.map((row) => `${row.book_id}:${row.chapter}:${row.verse}`));
    const chapterCounts = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.book_id}:${row.chapter}`;
      chapterCounts.set(key, Math.max(chapterCounts.get(key) ?? 0, row.verse));
    }
    assert.equal(chapterCounts.size, 1189);
    assert.equal(new Set(readingPlans.map((plan) => plan.id)).size, readingPlans.length);
    const ids = new Set<string>();
    for (const plan of readingPlans) {
      const entries = entriesFor(plan.id);
      assert.deepEqual(
        [...new Set(entries.map((entry) => entry.day_number))],
        Array.from({ length: plan.duration_days }, (_, index) => index + 1),
        plan.id
      );
      for (const entry of entries) {
        assert.equal(entry.plan_id, plan.id);
        assert.ok(!ids.has(entry.id), `duplicate entry ${entry.id}`);
        ids.add(entry.id);
        const end = entry.chapter_end ?? entry.chapter_start;
        assert.ok(
          Number.isInteger(entry.chapter_start) &&
            entry.chapter_start > 0 &&
            end >= entry.chapter_start,
          entry.id
        );
        for (let chapter = entry.chapter_start; chapter <= end; chapter++) {
          const count = chapterCounts.get(`${entry.book}:${chapter}`);
          assert.ok(count, `${entry.id}: missing chapter ${chapter}`);
          const startVerse = chapter === entry.chapter_start ? (entry.verse_start ?? 1) : 1;
          const endVerse = chapter === end ? (entry.verse_end ?? count) : count;
          assert.ok(startVerse > 0 && endVerse >= startVerse && endVerse <= count, entry.id);
          // Translations can omit verse numbers for textual reasons (e.g. BSB
          // Matthew 17:21). Check explicit boundaries and readable content,
          // rather than requiring every integer to exist in a whole chapter.
          assert.ok(
            Array.from(
              { length: endVerse - startVerse + 1 },
              (_, index) => startVerse + index
            ).some((verse) => verses.has(`${entry.book}:${chapter}:${verse}`)),
            `${entry.id}: empty passage`
          );
          if (chapter === entry.chapter_start && entry.verse_start != null) {
            assert.ok(verses.has(`${entry.book}:${chapter}:${entry.verse_start}`), entry.id);
          }
          if (chapter === end && entry.verse_end != null) {
            assert.ok(verses.has(`${entry.book}:${chapter}:${entry.verse_end}`), entry.id);
          }
        }
      }
    }
  } finally {
    db.close();
  }
});

const fullBible = bibleBooks.map((book) => book.id);
const newTestament = bibleBooks.filter((book) => book.testament === 'NT').map((book) => book.id);
const expectedBooks: Record<string, string[]> = {
  'bible-in-1-year': fullBible,
  'genesis-to-revelation-chronological': fullBible,
  'bible-in-30-days': fullBible,
  'bible-in-90-days': fullBible,
  'new-testament-90-days': newTestament,
  'nt-in-30-days': newTestament,
  'gospels-60-days': ['MAT', 'MRK', 'LUK', 'JHN'],
  'gospels-30-days': ['MAT', 'MRK', 'LUK', 'JHN'],
  'epistles-30-days': newTestament.filter(
    (id) => !['MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'REV'].includes(id)
  ),
  'psalms-30-days': ['PSA'],
  'kathisma-weekly': ['PSA'],
  'proverbs-31-days': ['PRO'],
  'acts-28-days': ['ACT'],
};

test('whole-Bible descriptions accurately describe the preserved book-by-book schedules', () => {
  assert.equal(
    en.readingPlans.bibleIn1Year.description,
    'Read through the entire Bible from Genesis to Revelation in 365 days.'
  );
  assert.equal(en.readingPlans.chronological.title, 'Whole Bible: Book by Book');
  assert.equal(
    en.readingPlans.chronological.description,
    'Read all 66 books in 365 days, beginning with Genesis, Job, and Exodus.'
  );
  assert.equal(en.readingPlans.categoryChronological, 'Whole Bible');
});

for (const [planId, bookIds] of Object.entries(expectedBooks)) {
  test(`${planId} includes all intended chapters exactly once`, () => {
    const expected = bookIds.flatMap((id) =>
      Array.from(
        { length: bibleBooks.find((book) => book.id === id)!.chapters },
        (_, index) => `${id}:${index + 1}`
      )
    );
    const actual = entriesFor(planId).flatMap((entry) =>
      Array.from(
        { length: (entry.chapter_end ?? entry.chapter_start) - entry.chapter_start + 1 },
        (_, index) => `${entry.book}:${entry.chapter_start + index}`
      )
    );
    assert.deepEqual(actual.sort(), expected.sort());
  });
}

test('Sermon on the Mount covers Matthew 5–7 exactly once at verse level', () => {
  const expected = [48, 34, 29].flatMap((count, index) =>
    Array.from({ length: count }, (_, verse) => `${index + 5}:${verse + 1}`)
  );
  const actual = entriesFor('sermon-on-the-mount-7-days').flatMap((entry) =>
    Array.from(
      { length: entry.verse_end! - entry.verse_start! + 1 },
      (_, index) => `${entry.chapter_start}:${entry.verse_start! + index}`
    )
  );
  assert.deepEqual(actual, expected);
});

test('all plans have localized titles, descriptions, and category labels in every shipped language', async () => {
  const locales = [
    ['en', en],
    ...(await Promise.all(
      Object.entries(localeLoaders).map(async ([code, load]) => [code, await load()] as const)
    )),
  ] as const;
  const get = (resource: unknown, key: string): unknown =>
    key
      .split('.')
      .reduce<unknown>(
        (value, part) =>
          value != null && typeof value === 'object'
            ? (value as Record<string, unknown>)[part]
            : undefined,
        resource
      );
  for (const [code, resource] of locales) {
    for (const plan of readingPlans) {
      for (const key of [plan.title_key, plan.description_key]) {
        assert.ok(
          key && typeof get(resource, key) === 'string' && (get(resource, key) as string).trim(),
          `${code}: ${key}`
        );
      }
    }
  }
});

test('recurring plans resolve a valid daily assignment across leap years and week/month boundaries', () => {
  for (const plan of readingPlans.filter(isRecurringPlan)) {
    for (
      let date = new Date(2024, 0, 1, 12);
      date.getFullYear() < 2026;
      date.setDate(date.getDate() + 1)
    ) {
      const day = getActivePlanDayNumber(plan, { current_day: 1 }, date);
      assert.ok(
        entriesFor(plan.id).some((entry) => entry.day_number === day),
        `${plan.id}: ${date}`
      );
      assert.equal(
        day,
        plan.scheduleMode === 'calendar-day-of-month' ? date.getDate() : date.getDay() + 1
      );
    }
  }
});
