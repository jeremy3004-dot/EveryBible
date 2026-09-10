import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAllOneFieldGoalLessons,
  getOneFieldGoalField,
  getOneFieldGoalLessonById,
  getTotalOneFieldGoalLessons,
  oneFieldOneGoalFields,
} from './oneFieldOneGoalCourses';
import type { OneFieldGoalFieldType } from './oneFieldOneGoalCourses';
import { bibleBooks } from '../constants/books';
import { parsePassageReference } from '../services/bible/referenceParser';

/**
 * "1 Field 1 Goal" is static curriculum data. These assertions pin the shape the
 * lesson renderer assumes: unique ids, contiguous ordering, each lesson filed
 * under the field it claims, and every scripture string resolvable to a real book.
 */

const EXPECTED_FIELD_IDS: OneFieldGoalFieldType[] = [
  'good-news',
  'making-disciples',
  'multiplication',
];

const allLessons = oneFieldOneGoalFields.flatMap((field) =>
  field.lessons.map((lesson) => ({ field, lesson }))
);

test('the catalog ships exactly the three declared fields, in curriculum order', () => {
  assert.deepEqual(
    oneFieldOneGoalFields.map((field) => field.id),
    EXPECTED_FIELD_IDS
  );
});

test('every lesson id is unique and namespaced to the 1f1g catalog', () => {
  const ids = allLessons.map(({ lesson }) => lesson.id);
  assert.deepEqual(ids, [...new Set(ids)]);
  for (const id of ids) {
    assert.ok(id.startsWith('1f1g-'), `${id} is not namespaced to this catalog`);
  }
});

test('each lesson is filed under the field that contains it and ordered 1..n', () => {
  for (const field of oneFieldOneGoalFields) {
    assert.deepEqual(
      field.lessons.map((lesson) => lesson.order),
      field.lessons.map((_lesson, index) => index + 1),
      `${field.id} lesson order is not contiguous`
    );
    for (const lesson of field.lessons) {
      assert.equal(lesson.field, field.id, `${lesson.id} claims field ${lesson.field}`);
    }
  }
});

test('every field carries a goal, completion criteria, a hex colour and a positive week estimate', () => {
  for (const field of oneFieldOneGoalFields) {
    assert.ok(field.name.trim().length > 0);
    assert.ok(field.goal.trim().length > 0, `${field.id} has no goal`);
    assert.ok(field.completionCriteria.length > 0, `${field.id} has no completion criteria`);
    assert.ok(
      field.completionCriteria.every((criterion) => criterion.trim().length > 0),
      `${field.id} has a blank completion criterion`
    );
    assert.match(field.color, /^#[0-9A-Fa-f]{6}$/);
    assert.ok(field.emoji.length > 0);
    assert.ok(field.estimatedWeeks > 0, `${field.id} has a non-positive week estimate`);
    assert.ok(field.lessons.length > 0, `${field.id} has no lessons`);
  }
});

test('every lesson carries a goal, checklist and the three content panels', () => {
  for (const { lesson } of allLessons) {
    assert.ok(lesson.title.trim().length > 0, `${lesson.id} has no title`);
    assert.ok(lesson.goal.trim().length > 0, `${lesson.id} has no goal`);
    assert.ok(lesson.checklistItems.length > 0, `${lesson.id} has no checklist`);
    assert.ok(
      lesson.checklistItems.every((item) => item.trim().length > 0),
      `${lesson.id} has a blank checklist item`
    );
    for (const panel of ['concept', 'practice', 'culturalBridge'] as const) {
      assert.ok(lesson.content[panel].trim().length > 0, `${lesson.id} has no ${panel} copy`);
    }
  }
});

test('every scripture string on a lesson parses and names a real Bible book', () => {
  const knownIds = new Set(bibleBooks.map((book) => book.id));
  for (const { lesson } of allLessons) {
    assert.ok(lesson.scripture.length > 0, `${lesson.id} lists no scripture`);
    for (const reference of lesson.scripture) {
      const parsed = parsePassageReference(reference);
      assert.ok(parsed, `${lesson.id}: "${reference}" does not parse as a Bible reference`);
      assert.ok(knownIds.has(parsed.bookId), `${lesson.id}: unknown book ${parsed.bookId}`);
    }
  }
});

test('section shape matches its type, and scripture sections carry a parseable reference', () => {
  const knownIds = new Set(bibleBooks.map((book) => book.id));
  for (const { lesson } of allLessons) {
    assert.ok(lesson.sections.length > 0, `${lesson.id} has no sections`);
    lesson.sections.forEach((section, index) => {
      const where = `${lesson.id}#${index}`;
      assert.ok(section.content.trim().length > 0, `${where} has empty content`);
      if (section.type === 'bullets') {
        assert.ok((section.items?.length ?? 0) > 0, `${where} is bullets with no items`);
      } else {
        assert.equal(section.items, undefined, `${where} is ${section.type} but carries items`);
      }
      if (section.type === 'scripture') {
        assert.ok(section.reference, `${where} is scripture with no reference`);
      }
      if (section.reference) {
        const parsed = parsePassageReference(section.reference);
        assert.ok(parsed, `${where}: "${section.reference}" does not parse`);
        assert.ok(knownIds.has(parsed.bookId), `${where}: unknown book ${parsed.bookId}`);
      }
    });
  }
});

test('getOneFieldGoalField resolves each declared field and nothing else', () => {
  for (const field of oneFieldOneGoalFields) {
    assert.equal(getOneFieldGoalField(field.id), field);
  }
  assert.equal(getOneFieldGoalField('not-a-field' as OneFieldGoalFieldType), undefined);
});

test('getAllOneFieldGoalLessons flattens the fields in order', () => {
  assert.deepEqual(
    getAllOneFieldGoalLessons(),
    allLessons.map(({ lesson }) => lesson)
  );
});

test('getTotalOneFieldGoalLessons counts the flattened catalog', () => {
  assert.equal(getTotalOneFieldGoalLessons(), getAllOneFieldGoalLessons().length);
});

test('getOneFieldGoalLessonById finds every lesson and returns undefined for an unknown id', () => {
  for (const { lesson } of allLessons) {
    assert.equal(getOneFieldGoalLessonById(lesson.id), lesson);
  }
  assert.equal(getOneFieldGoalLessonById('1f1g-does-not-exist'), undefined);
});
