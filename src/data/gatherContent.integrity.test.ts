import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FOUNDATION_DESC_KEYS,
  FOUNDATION_LESSON_TITLE_KEYS,
  FOUNDATION_TITLE_KEYS,
  gatherFoundations,
} from './gatherFoundations';
import {
  gatherWisdomCategories,
  WISDOM_CATEGORY_NAME_KEYS,
  WISDOM_LESSON_TITLE_KEYS,
  WISDOM_TITLE_KEYS,
} from './gatherWisdom';
import { getBookById } from '../constants/books';
import { en } from '../i18n/locales/en';
import { formatBibleReferenceLabel } from '../services/gather/gatherReferenceLabel';

/**
 * Cross-cutting invariants for the Gather content tables that the per-file tests do not
 * pin: every title/description key must resolve (a missing key renders the raw key in the
 * UI), ids must not collide across Foundations and Wisdom, and counts/numbering must agree.
 * Locale parity for every English key is already enforced by src/i18n/locales/coverage.test.ts.
 */

const lookupTranslation = (key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      en
    );

const wisdoms = gatherWisdomCategories.flatMap((category) => category.wisdoms);
const wisdomLessons = wisdoms.flatMap((wisdom) => wisdom.lessons);
const foundationLessons = gatherFoundations.flatMap((foundation) => foundation.lessons);

test('every Gather title, description and lesson key resolves to English text', () => {
  const keys = [
    ...Object.values(FOUNDATION_TITLE_KEYS),
    ...Object.values(FOUNDATION_DESC_KEYS),
    ...Object.values(FOUNDATION_LESSON_TITLE_KEYS),
    ...Object.values(WISDOM_CATEGORY_NAME_KEYS),
    ...Object.values(WISDOM_TITLE_KEYS),
    ...Object.values(WISDOM_LESSON_TITLE_KEYS),
  ];
  assert.ok(keys.length > 200);
  const missing = keys.filter((key) => {
    const value = lookupTranslation(key);
    return typeof value !== 'string' || value.trim() === '';
  });
  assert.deepEqual(missing, [], 'keys that would render raw in the UI');
});

test('every wisdom category and topic has a translation key', () => {
  for (const category of gatherWisdomCategories) {
    assert.ok(WISDOM_CATEGORY_NAME_KEYS[category.id], `${category.id} has no name key`);
  }
  for (const wisdom of wisdoms) {
    assert.ok(WISDOM_TITLE_KEYS[wisdom.id], `${wisdom.id} has no title key`);
  }
});

test('the key tables name only ids that exist', () => {
  assert.deepEqual(
    Object.keys(WISDOM_CATEGORY_NAME_KEYS).sort(),
    gatherWisdomCategories.map((category) => category.id).sort()
  );
  const wisdomIds = new Set(wisdoms.map((wisdom) => wisdom.id));
  for (const id of Object.keys(WISDOM_TITLE_KEYS)) {
    assert.ok(wisdomIds.has(id), `WISDOM_TITLE_KEYS names unknown topic ${id}`);
  }
  assert.deepEqual(
    Object.keys(WISDOM_LESSON_TITLE_KEYS).sort(),
    wisdomLessons.map((lesson) => lesson.id).sort()
  );
});

test('ids are unique across foundations, wisdom topics, categories and lessons', () => {
  const ids = [
    ...gatherFoundations.map((foundation) => foundation.id),
    ...gatherWisdomCategories.map((category) => category.id),
    ...wisdoms.map((wisdom) => wisdom.id),
    ...foundationLessons.map((lesson) => lesson.id),
    ...wisdomLessons.map((lesson) => lesson.id),
  ];
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
});

test('lesson ids encode their parent and position, so progress keys cannot cross topics', () => {
  for (const foundation of gatherFoundations) {
    for (const lesson of foundation.lessons) {
      const expected = `f${foundation.number}-${String(lesson.number).padStart(2, '0')}`;
      assert.equal(lesson.id, expected, `${foundation.id} lesson id`);
    }
  }
  for (const wisdom of wisdoms) {
    const slug = wisdom.id.replace(/^topic-/, '');
    for (const lesson of wisdom.lessons) {
      const expected = `t-${slug}-${String(lesson.number).padStart(2, '0')}`;
      assert.equal(lesson.id, expected, `${wisdom.id} lesson id`);
    }
  }
});

test('wisdom lessons are numbered 1..n within their topic', () => {
  for (const wisdom of wisdoms) {
    assert.deepEqual(
      wisdom.lessons.map((lesson) => lesson.number),
      wisdom.lessons.map((_lesson, index) => index + 1),
      `${wisdom.id} lesson numbers`
    );
  }
});

/** "John 3:1-21; Acts 2" -> "3:1-21;2": drops book names, keeps every chapter and verse number. */
const verseTail = (label: string): string =>
  label
    .split(';')
    .map((part) => part.trim().replace(/^(?:\d\s)?\D+?\s(?=\d)/, ''))
    .join(';');

test('lesson references name known books, ordered verses, and match their label', () => {
  for (const lesson of [...foundationLessons, ...wisdomLessons]) {
    for (const reference of lesson.references) {
      assert.ok(getBookById(reference.bookId), `${lesson.id}: unknown book ${reference.bookId}`);
      assert.ok(reference.chapter >= 1, `${lesson.id}: bad chapter`);
      if (reference.startVerse != null && reference.endVerse != null) {
        assert.ok(reference.endVerse > reference.startVerse, `${lesson.id}: range not ordered`);
      }
    }
    // The UI shows the label computed from `references`; the stored label must not disagree.
    // Only the chapter/verse part is compared: the stored label says "Psalm", the book table "Psalms".
    assert.equal(
      verseTail(formatBibleReferenceLabel(lesson.references)),
      verseTail(lesson.referenceLabel),
      `${lesson.id}: referenceLabel disagrees with references`
    );
  }
});
