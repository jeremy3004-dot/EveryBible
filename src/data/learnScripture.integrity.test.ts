import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, URL } from 'node:url';

import { gatherFoundations } from './gatherFoundations';
import { gatherWisdomCategories, WISDOM_LESSON_TITLE_KEYS } from './gatherWisdom';
import { fourFieldsCourses } from './fourFieldsCourses';
import { parsePassageReference } from '../services/bible/referenceParser';
import type { BibleReference } from '../types/gather';

/**
 * Every Gather and Four Fields lesson points at scripture. A reference that
 * parses but names a chapter or verse the shipped Bible does not carry renders
 * as an empty Story section, so each one is checked against the bundled BSB
 * database itself rather than against the book table's chapter counts.
 */

const loadBsbVerses = () => {
  const db = new DatabaseSync(
    fileURLToPath(new URL('../../assets/databases/bible-bsb-v2.db', import.meta.url)),
    { readOnly: true }
  );
  try {
    const rows = db
      .prepare("SELECT book_id, chapter, verse FROM verses WHERE translation_id = 'bsb'")
      .all() as Array<{ book_id: string; chapter: number; verse: number }>;
    const verses = new Set(rows.map((row) => `${row.book_id}:${row.chapter}:${row.verse}`));
    const chapters = new Set(rows.map((row) => `${row.book_id}:${row.chapter}`));
    return { verses, chapters };
  } finally {
    db.close();
  }
};

const bsb = loadBsbVerses();

const assertStructuredReferenceResolves = (where: string, reference: BibleReference) => {
  assert.ok(
    bsb.chapters.has(`${reference.bookId}:${reference.chapter}`),
    `${where}: ${reference.bookId} ${reference.chapter} is not in the bundled BSB`
  );
  if (reference.startVerse != null) {
    assert.ok(
      bsb.verses.has(`${reference.bookId}:${reference.chapter}:${reference.startVerse}`),
      `${where}: start verse ${reference.startVerse} does not exist`
    );
  }
  if (reference.endVerse != null) {
    assert.ok(reference.startVerse != null, `${where}: end verse without a start verse`);
    assert.ok(reference.endVerse >= reference.startVerse, `${where}: range runs backwards`);
    assert.ok(
      bsb.verses.has(`${reference.bookId}:${reference.chapter}:${reference.endVerse}`),
      `${where}: end verse ${reference.endVerse} does not exist`
    );
  }
};

test('the bundled BSB carries all 1,189 chapters, so the checks below are meaningful', () => {
  assert.equal(bsb.chapters.size, 1189);
});

test('every Foundations lesson reference resolves to a real chapter and verse in the BSB', () => {
  for (const foundation of gatherFoundations) {
    for (const lesson of foundation.lessons) {
      assert.ok(lesson.references.length > 0, `${lesson.id} has no scripture`);
      lesson.references.forEach((reference, index) =>
        assertStructuredReferenceResolves(`${lesson.id}#${index}`, reference)
      );
    }
  }
});

test('every Wisdom lesson reference resolves to a real chapter and verse in the BSB', () => {
  for (const wisdom of gatherWisdomCategories.flatMap((category) => category.wisdoms)) {
    for (const lesson of wisdom.lessons) {
      assert.ok(lesson.references.length > 0, `${lesson.id} has no scripture`);
      lesson.references.forEach((reference, index) =>
        assertStructuredReferenceResolves(`${lesson.id}#${index}`, reference)
      );
    }
  }
});

test('each Wisdom topic declares exactly as many lessons as it ships', () => {
  // GatherScreen counts progress against lessonCount while the topic screen
  // lists `lessons`; if they disagree a topic can never read as finished.
  for (const wisdom of gatherWisdomCategories.flatMap((category) => category.wisdoms)) {
    assert.equal(wisdom.lessonCount, wisdom.lessons.length, `${wisdom.id} lessonCount drifted`);
  }
});

test('every Wisdom lesson has a translation key, so no title renders in English only', () => {
  const lessonIds = gatherWisdomCategories
    .flatMap((category) => category.wisdoms)
    .flatMap((wisdom) => wisdom.lessons.map((lesson) => lesson.id));
  assert.deepEqual(
    lessonIds.filter((id) => !WISDOM_LESSON_TITLE_KEYS[id]),
    [],
    'wisdom lessons without a title key'
  );
});

/**
 * Four Fields references are prose strings ("Acts 18:17-18, 21-22",
 * "Romans 3:23, 6:23", "Acts 26:4-18 (summary)"). The book comes from the app's
 * own parser; the chapter/verse tail is expanded here into every endpoint the
 * string names so each can be checked against the database.
 */
const expandProseReference = (
  reference: string
): { bookId: string; points: { chapter: number; verse?: number }[] } | null => {
  const passage = reference.replace(/\s*\([^)]*\)\s*$/, '');
  const parsed = parsePassageReference(passage);
  const tail = passage.match(/(\d+(?::\d+)?(?:-\d+(?::\d+)?)?(?:,\s*\d+(?::\d+)?(?:-\d+)?)*)$/);
  if (!parsed || !tail) {
    return null;
  }

  const points: { chapter: number; verse?: number }[] = [];
  let chapter = parsed.chapter;
  for (const part of tail[1].split(/,\s*/)) {
    const [start, end] = part.split('-');
    const readPoint = (token: string, chapterRef: boolean) => {
      if (token.includes(':')) {
        const [c, v] = token.split(':').map(Number);
        chapter = c;
        points.push({ chapter: c, verse: v });
      } else if (chapterRef) {
        chapter = Number(token);
        points.push({ chapter });
      } else {
        points.push({ chapter, verse: Number(token) });
      }
    };
    // A bare leading number is a chapter only when the whole reference names no verses.
    const bareChapter = !passage.includes(':');
    readPoint(start, bareChapter);
    if (end !== undefined) {
      readPoint(end, bareChapter);
    }
  }
  return { bookId: parsed.bookId, points };
};

test('every Four Fields course and lesson reference resolves to real verses in the BSB', () => {
  const references: { where: string; reference: string }[] = [];
  for (const course of fourFieldsCourses) {
    references.push({ where: `${course.id}.keyVerse`, reference: course.keyVerse.reference });
    for (const lesson of course.lessons) {
      if (lesson.keyVerse) {
        references.push({ where: `${lesson.id}.keyVerse`, reference: lesson.keyVerse.reference });
      }
      lesson.sections.forEach((section, index) => {
        if (section.reference) {
          references.push({ where: `${lesson.id}#${index}`, reference: section.reference });
        }
      });
    }
  }
  assert.ok(references.length > 0);

  for (const { where, reference } of references) {
    const expanded = expandProseReference(reference);
    assert.ok(expanded, `${where}: "${reference}" could not be expanded`);
    for (const point of expanded.points) {
      const key =
        point.verse === undefined
          ? `${expanded.bookId}:${point.chapter}`
          : `${expanded.bookId}:${point.chapter}:${point.verse}`;
      assert.ok(
        point.verse === undefined ? bsb.chapters.has(key) : bsb.verses.has(key),
        `${where}: "${reference}" names ${key}, which the bundled BSB does not carry`
      );
    }
  }
});

test('the prose-reference expander reads every shape the course data uses', () => {
  assert.deepEqual(expandProseReference('Acts 18:17-18, 21-22'), {
    bookId: 'ACT',
    points: [
      { chapter: 18, verse: 17 },
      { chapter: 18, verse: 18 },
      { chapter: 18, verse: 21 },
      { chapter: 18, verse: 22 },
    ],
  });
  assert.deepEqual(expandProseReference('Romans 3:23, 6:23'), {
    bookId: 'ROM',
    points: [
      { chapter: 3, verse: 23 },
      { chapter: 6, verse: 23 },
    ],
  });
  assert.deepEqual(expandProseReference('Acts 26:4-18 (summary)'), {
    bookId: 'ACT',
    points: [
      { chapter: 26, verse: 4 },
      { chapter: 26, verse: 18 },
    ],
  });
  assert.deepEqual(expandProseReference('Genesis 12'), {
    bookId: 'GEN',
    points: [{ chapter: 12 }],
  });
});

/**
 * Four Fields quotes scripture directly (key verses and `scripture` sections).
 * Modern translations such as the NIV require a copyright notice, so every
 * quotation must be the bundled BSB text for the reference it cites. Verses
 * inside one range are joined with a space; separate ranges ("Romans 3:23,
 * 6:23") are joined with an ellipsis.
 */
const BSB_RANGE_SEPARATOR = ' … ';

const loadBsbText = () => {
  const db = new DatabaseSync(
    fileURLToPath(new URL('../../assets/databases/bible-bsb-v2.db', import.meta.url)),
    { readOnly: true }
  );
  try {
    const rows = db
      .prepare("SELECT book_id, chapter, verse, text FROM verses WHERE translation_id = 'bsb'")
      .all() as Array<{ book_id: string; chapter: number; verse: number; text: string }>;
    return new Map(rows.map((row) => [`${row.book_id}:${row.chapter}:${row.verse}`, row.text]));
  } finally {
    db.close();
  }
};

const bsbText = loadBsbText();

/** The BSB wording for a quoted reference, or null when the reference is not a plain verse list. */
const bsbPassageText = (reference: string): string | null => {
  const parsed = parsePassageReference(reference);
  const tail = reference.match(/(\d+:\d+(?:-\d+)?(?:,\s*\d+(?::\d+)?(?:-\d+)?)*)$/);
  if (!parsed || !tail) {
    return null;
  }
  let chapter = parsed.chapter;
  const ranges: string[] = [];
  for (const part of tail[1].split(/,\s*/)) {
    const [startToken, endToken] = part.split('-');
    let start = Number(startToken);
    if (startToken.includes(':')) {
      [chapter, start] = startToken.split(':').map(Number);
    }
    const end = endToken === undefined ? start : Number(endToken);
    const startText = bsbText.get(`${parsed.bookId}:${chapter}:${start}`);
    const endText = bsbText.get(`${parsed.bookId}:${chapter}:${end}`);
    if (startText === undefined || endText === undefined) {
      return null;
    }
    // The BSB omits some verses inside a range (Acts 8:37); the quote skips them too.
    const verses: string[] = [];
    for (let verse = start; verse <= end; verse += 1) {
      const text = bsbText.get(`${parsed.bookId}:${chapter}:${verse}`);
      if (text !== undefined) {
        verses.push(text);
      }
    }
    ranges.push(verses.join(' '));
  }
  return ranges.join(BSB_RANGE_SEPARATOR);
};

test('the BSB passage reader joins verses within a range and separates ranges', () => {
  assert.equal(
    bsbPassageText('Romans 3:23, 6:23'),
    `${bsbText.get('ROM:3:23')}${BSB_RANGE_SEPARATOR}${bsbText.get('ROM:6:23')}`
  );
  assert.equal(
    bsbPassageText('Luke 10:5-7, 10-11'),
    [
      `${bsbText.get('LUK:10:5')} ${bsbText.get('LUK:10:6')} ${bsbText.get('LUK:10:7')}`,
      `${bsbText.get('LUK:10:10')} ${bsbText.get('LUK:10:11')}`,
    ].join(BSB_RANGE_SEPARATOR)
  );
  assert.equal(bsbText.has('ACT:8:37'), false);
  assert.equal(
    bsbPassageText('Acts 8:36-38'),
    `${bsbText.get('ACT:8:36')} ${bsbText.get('ACT:8:38')}`
  );
  // An annotated reference ("(summary)") cannot be checked word for word, so it is rejected.
  assert.equal(bsbPassageText('Acts 26:4-18 (summary)'), null);
});

test('every Four Fields key verse and scripture section quotes the bundled BSB text exactly', () => {
  const quotes: { where: string; reference: string; text: string }[] = [];
  for (const course of fourFieldsCourses) {
    quotes.push({ where: `${course.id}.keyVerse`, ...course.keyVerse });
    for (const lesson of course.lessons) {
      if (lesson.keyVerse) {
        quotes.push({ where: `${lesson.id}.keyVerse`, ...lesson.keyVerse });
      }
      lesson.sections.forEach((section, index) => {
        if (section.type === 'scripture') {
          assert.ok(section.reference, `${lesson.id}#${index}: scripture section has no reference`);
          quotes.push({
            where: `${lesson.id}#${index}`,
            reference: section.reference,
            text: section.content,
          });
        }
      });
    }
  }
  assert.ok(quotes.length >= 29, 'expected every key verse to be checked');

  const mismatched = quotes
    .filter(({ reference, text }) => bsbPassageText(reference) !== text)
    .map(({ where, reference }) => `${where} (${reference})`);
  assert.deepEqual(mismatched, [], 'quotations that are not the BSB text for their reference');
});
