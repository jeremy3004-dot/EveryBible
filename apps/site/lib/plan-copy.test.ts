import assert from 'node:assert/strict';
import test from 'node:test';

import { bibleBookBySlug, SITE_BIBLE_BOOKS } from './bible-books';
import {
  getPlanCopy,
  highlightLink,
  parseHighlightRefs,
  PLAN_COPY,
  type HighlightRef,
  type PlanHighlight,
} from './plan-copy';
import { dayLabel, getPlans } from './plan-pages';
import type { PlanReading, SitePlan } from './plan-snapshot';

const META_DESCRIPTION_MAX_LENGTH = 155;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

function allText(slug: string): string[] {
  const copy = PLAN_COPY[slug];
  return [
    ...copy.intro,
    ...copy.highlights.flatMap((item) => [item.label, item.days, item.refs]),
    ...(copy.metaDescription ? [copy.metaDescription] : []),
  ];
}

test('every plan has copy, and nothing is written for a plan that does not exist', () => {
  const slugs = getPlans().map((plan) => plan.slug);
  for (const slug of slugs) assert.ok(getPlanCopy(slug), `no copy for ${slug}`);
  assert.deepEqual(Object.keys(PLAN_COPY).sort(), [...slugs].sort());
  assert.equal(getPlanCopy('not-a-plan'), undefined);
});

test('introductions are two or three paragraphs of roughly 90 to 180 words', () => {
  for (const [slug, copy] of Object.entries(PLAN_COPY)) {
    assert.ok(copy.intro.length >= 2 && copy.intro.length <= 3, `${slug}: ${copy.intro.length}`);
    for (const paragraph of copy.intro) assert.ok(words(paragraph) >= 8, `${slug}: ${paragraph}`);
    const total = copy.intro.reduce((sum, paragraph) => sum + words(paragraph), 0);
    assert.ok(total >= 90 && total <= 180, `${slug} intro is ${total} words`);
  }
});

test('no two plans share a paragraph, and highlight labels differ within a plan', () => {
  const paragraphs = Object.values(PLAN_COPY).flatMap((copy) => copy.intro);
  assert.equal(new Set(paragraphs).size, paragraphs.length);
  for (const [slug, copy] of Object.entries(PLAN_COPY)) {
    const labels = copy.highlights.map((item) => item.label);
    assert.equal(new Set(labels).size, labels.length, slug);
  }
});

test('the copy avoids marketing words and keeps the house style', () => {
  for (const slug of Object.keys(PLAN_COPY)) {
    for (const text of allText(slug)) {
      assert.doesNotMatch(text, /journey/i, `${slug}: ${text}`);
      assert.doesNotMatch(text, /transformative/i, `${slug}: ${text}`);
      assert.doesNotMatch(text, /\bdiv(e|es|ed|ing)\b/i, `${slug}: ${text}`);
      assert.doesNotMatch(text, /unlock/i, `${slug}: ${text}`);
      assert.doesNotMatch(text, /!/, `${slug}: ${text}`);
      // Typographic quotes and en dashes only, as in the app's own text.
      assert.doesNotMatch(text, /['"]|—|\s{2,}/, `${slug}: ${text}`);
    }
  }
});

test('meta descriptions fit a search result, name the app and are not repeated', () => {
  const metas = Object.entries(PLAN_COPY).flatMap(([slug, copy]) =>
    copy.metaDescription === undefined ? [] : [[slug, copy.metaDescription] as const]
  );
  assert.ok(metas.length > 0);
  for (const [slug, meta] of metas) {
    assert.ok(meta.length <= META_DESCRIPTION_MAX_LENGTH, `${slug}: ${meta.length}`);
    assert.ok(meta.length >= 80, `${slug}: ${meta.length}`);
    assert.match(meta, /EveryBible/, slug);
  }
  assert.equal(new Set(metas.map(([, meta]) => meta)).size, metas.length);
});

/* ── Highlight references ───────────────────────────────────────── */

test('references parse into passages and runs of books', () => {
  const [psalm, john, verses, run, whole] = parseHighlightRefs(
    'Psalm 23, 1 John 3–4, Matthew 5:1–12, Exodus – Deuteronomy, Jude'
  );
  assert.deepEqual(
    [psalm, john, verses].map((ref) => ref.kind === 'passage' && [ref.book.id, ref.chapter]),
    [
      ['PSA', 23],
      ['1JN', 3],
      ['MAT', 5],
    ]
  );
  assert.equal(john.kind === 'passage' && john.toChapter, 4);
  assert.equal(verses.kind === 'passage' && verses.verse, 1);
  assert.equal(verses.kind === 'passage' && verses.toVerse, 12);
  assert.equal(run.kind === 'books' && `${run.from.id} ${run.to.id}`, 'EXO DEU');
  assert.deepEqual(whole.kind === 'passage' && [whole.book.id, whole.chapter], ['JUD', undefined]);
  assert.throws(() => parseHighlightRefs('Hesitations 3'));
  assert.throws(() => parseHighlightRefs('John three'));
});

test('a highlight links its first reference to a chapter page', () => {
  assert.deepEqual(highlightLink('Psalm 23, John 10'), {
    first: 'Psalm 23',
    rest: 'John 10',
    path: '/bible/psalms/23',
  });
  assert.equal(highlightLink('Exodus – Deuteronomy').path, '/bible/exodus/1');
  assert.equal(highlightLink('Matthew 5:1–12').path, '/bible/matthew/5#v1');
  assert.equal(highlightLink('Jude').rest, '');
  for (const copy of Object.values(PLAN_COPY)) {
    for (const item of copy.highlights) {
      const { path } = highlightLink(item.refs);
      const [, , slug, chapter] = path.split(/[/#]/);
      const book = bibleBookBySlug(slug);
      assert.ok(book && Number(chapter) >= 1 && Number(chapter) <= book.chapters, path);
    }
  }
});

/* ── Highlights against the schedule ────────────────────────────── */

function dayNumber(plan: SitePlan, label: string): number {
  const found = plan.days.find((day) => dayLabel(plan, day.day) === label);
  assert.ok(found, `${plan.slug}: no day called “${label}”`);
  return found.day;
}

/** "Day 2" and "Days 31–90" count days; weekly and Twelve Days plans name them. */
function highlightDays(plan: SitePlan, days: string): [number, number] {
  const counted = /^Days? (\d+)(?:–(\d+))?$/.exec(days);
  if (counted) {
    assert.ok(plan.schedule !== 'weekly' && plan.schedule !== 'christmas', `${plan.slug}: ${days}`);
    const first = Number(counted[1]);
    const last = Number(counted[2] ?? counted[1]);
    assert.ok(first >= 1 && first <= last && last <= plan.days.length, `${plan.slug}: ${days}`);
    return [first, last];
  }
  const [from, to = from] = days.split(/\s*–\s*/);
  const range: [number, number] = [dayNumber(plan, from), dayNumber(plan, to)];
  assert.ok(range[0] <= range[1], `${plan.slug}: ${days}`);
  return range;
}

function readingsBetween(plan: SitePlan, first: number, last: number): PlanReading[] {
  return plan.days
    .filter((day) => day.day >= first && day.day <= last)
    .flatMap((day) => day.sessions.flatMap((session) => session.readings));
}

const bookIndex = (id: string) => SITE_BIBLE_BOOKS.findIndex((book) => book.id === id);

/** Whether a reading is part of what the reference names (any verse in the chapter counts). */
function readingBelongsTo(reading: PlanReading, ref: HighlightRef): boolean {
  if (ref.kind === 'books') {
    return (
      bookIndex(reading.book) >= bookIndex(ref.from.id) &&
      bookIndex(reading.book) <= bookIndex(ref.to.id)
    );
  }
  if (reading.book !== ref.book.id) return false;
  if (ref.chapter === undefined) return true;
  const last = reading.toChapter ?? reading.chapter;
  return reading.chapter <= (ref.toChapter ?? ref.chapter) && last >= ref.chapter;
}

/** Every chapter (and verse) the reference names is read within the readings. */
function referenceIsRead(readings: readonly PlanReading[], ref: HighlightRef): boolean {
  if (ref.kind === 'books') {
    return SITE_BIBLE_BOOKS.slice(bookIndex(ref.from.id), bookIndex(ref.to.id) + 1).every((book) =>
      readings.some((reading) => reading.book === book.id)
    );
  }
  if (ref.chapter === undefined) return readings.some((reading) => reading.book === ref.book.id);
  const chapters = Array.from(
    { length: (ref.toChapter ?? ref.chapter) - ref.chapter + 1 },
    (_, index) => ref.chapter! + index
  );
  return chapters.every((chapter) =>
    readings.some((reading) => {
      if (reading.book !== ref.book.id) return false;
      if (chapter < reading.chapter || chapter > (reading.toChapter ?? reading.chapter)) {
        return false;
      }
      if (ref.verse === undefined || reading.verse === undefined) return true;
      return (
        reading.verse <= ref.verse &&
        (reading.toVerse ?? reading.verse) >= (ref.toVerse ?? ref.verse)
      );
    })
  );
}

function checkHighlight(plan: SitePlan, item: PlanHighlight) {
  const where = `${plan.slug} / ${item.label} (${item.days}: ${item.refs})`;
  const [first, last] = highlightDays(plan, item.days);
  const refs = parseHighlightRefs(item.refs);
  const readings = readingsBetween(plan, first, last);
  for (const ref of refs) {
    assert.ok(referenceIsRead(readings, ref), `${where}: a reference is not read in those days`);
    if (ref.kind === 'passage' && ref.chapter !== undefined) {
      const chapters = ref.book.chapters;
      assert.ok((ref.toChapter ?? ref.chapter) <= chapters, `${where}: past the last chapter`);
    }
  }
  // The span is as tight as it says: its first and last days both read something it names.
  for (const edge of [first, last]) {
    const onThatDay = readingsBetween(plan, edge, edge);
    assert.ok(
      onThatDay.some((reading) => refs.some((ref) => readingBelongsTo(reading, ref))),
      `${where}: nothing on ${dayLabel(plan, edge)} is named`
    );
  }
}

test('every highlight names passages that are in the plan, on the days it gives', () => {
  for (const plan of getPlans()) {
    const copy = getPlanCopy(plan.slug)!;
    assert.ok(copy.highlights.length >= 3 && copy.highlights.length <= 5, plan.slug);
    for (const item of copy.highlights) checkHighlight(plan, item);
  }
});

test('highlights are given in schedule order', () => {
  for (const plan of getPlans()) {
    const starts = getPlanCopy(plan.slug)!.highlights.map(
      (item) => highlightDays(plan, item.days)[0]
    );
    assert.deepEqual(
      starts,
      [...starts].sort((a, b) => a - b),
      plan.slug
    );
  }
});

test('the checker rejects a highlight that is not in the schedule', () => {
  const psalms = getPlans().find((plan) => plan.slug === 'psalms-30-days')!;
  const good = { label: 'x', days: 'Day 5', refs: 'Psalm 23' };
  checkHighlight(psalms, good);
  assert.throws(() => checkHighlight(psalms, { ...good, days: 'Day 6' }));
  assert.throws(() => checkHighlight(psalms, { ...good, refs: 'Psalm 24, Psalm 31' }));
  assert.throws(() => checkHighlight(psalms, { ...good, refs: 'John 3' }));
  assert.throws(() => checkHighlight(psalms, { ...good, days: 'Days 5–7' }));
});
