import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_DESC_KEYS,
  FIELD_ORDER,
  FIELD_SUBTITLE_KEYS,
  FIELD_TITLE_KEYS,
  FOUR_FIELDS_LESSON_TITLE_KEYS,
  fieldInfo,
  fourFieldsCourses,
  getAllLessonsInOrder,
  getCoursesByField,
  getLessonsForField,
  getTotalLessonsCount,
} from './fourFieldsCourses';
import { bibleBooks, getBookById } from '../constants/books';
import { parsePassageReference } from '../services/bible/referenceParser';
import { en } from '../i18n/locales/en';
import type { FieldType } from '../types/course';

/**
 * fourFieldsCourses.ts is static content, so the failure mode is a bad row rather
 * than a bad branch: a duplicated lesson id, a lesson the title-key table forgot,
 * a scripture reference naming a book that does not exist. These assertions walk
 * the whole tree once per invariant.
 */

const lookupTranslation = (key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      en
    );

const allLessons = fourFieldsCourses.flatMap((course) =>
  course.lessons.map((lesson) => ({ course, lesson }))
);

/**
 * A handful of section references carry a human annotation after the passage
 * ("Acts 26:4-18 (summary)"). The passage itself must still resolve; the
 * annotation is stripped before parsing so the invariant covers the reference.
 */
const stripAnnotation = (reference: string): string => reference.replace(/\s*\([^)]*\)\s*$/, '');

const allReferences = (): { where: string; reference: string }[] => {
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
  return references;
};

test('every course id and lesson id is unique across the whole catalog', () => {
  const courseIds = fourFieldsCourses.map((course) => course.id);
  assert.deepEqual(courseIds, [...new Set(courseIds)]);

  const lessonIds = allLessons.map(({ lesson }) => lesson.id);
  assert.deepEqual(lessonIds, [...new Set(lessonIds)]);
});

test('every course declares a known field whose fieldOrder matches that field', () => {
  for (const course of fourFieldsCourses) {
    assert.ok(FIELD_ORDER.includes(course.field), `${course.id} has unknown field ${course.field}`);
    assert.equal(
      course.fieldOrder,
      fieldInfo[course.field].order,
      `${course.id} fieldOrder disagrees with fieldInfo`
    );
  }
});

test('fieldInfo covers every field in FIELD_ORDER with a 1-based contiguous order', () => {
  assert.deepEqual(Object.keys(fieldInfo).sort(), [...FIELD_ORDER].sort());
  assert.deepEqual(
    FIELD_ORDER.map((field) => fieldInfo[field].order),
    FIELD_ORDER.map((_field, index) => index + 1)
  );
  for (const field of FIELD_ORDER) {
    assert.equal(fieldInfo[field].id, field);
    assert.match(fieldInfo[field].color, /^#[0-9A-Fa-f]{6}$/);
    assert.ok(fieldInfo[field].icon.length > 0);
  }
});

test('lessons inside a course are ordered 1..n with no gaps', () => {
  for (const course of fourFieldsCourses) {
    assert.deepEqual(
      course.lessons.map((lesson) => lesson.order),
      course.lessons.map((_lesson, index) => index + 1),
      `${course.id} lesson order is not contiguous`
    );
  }
});

test('the lesson title-key table names exactly the lessons that exist', () => {
  assert.deepEqual(
    Object.keys(FOUR_FIELDS_LESSON_TITLE_KEYS).sort(),
    allLessons.map(({ lesson }) => lesson.id).sort()
  );
});

test('every i18n key referenced by the field and lesson tables resolves in English', () => {
  const keys = [
    ...Object.values(FIELD_TITLE_KEYS),
    ...Object.values(FIELD_SUBTITLE_KEYS),
    ...Object.values(FIELD_DESC_KEYS),
    ...Object.values(FOUR_FIELDS_LESSON_TITLE_KEYS),
  ];
  for (const key of keys) {
    assert.equal(typeof lookupTranslation(key), 'string', `missing English translation for ${key}`);
  }
});

test('every scripture reference parses and names a real Bible book', () => {
  const knownIds = new Set(bibleBooks.map((book) => book.id));
  for (const { where, reference } of allReferences()) {
    const parsed = parsePassageReference(stripAnnotation(reference));
    assert.ok(parsed, `${where}: "${reference}" does not parse as a Bible reference`);
    assert.ok(knownIds.has(parsed.bookId), `${where}: unknown book ${parsed.bookId}`);
    assert.ok(getBookById(parsed.bookId));
    assert.ok(parsed.chapter >= 1);
  }
});

test('every lesson carries a takeaway and non-empty sections', () => {
  for (const { lesson } of allLessons) {
    assert.ok(lesson.takeaway.trim().length > 0, `${lesson.id} has no takeaway`);
    assert.ok(lesson.sections.length > 0, `${lesson.id} has no sections`);
    assert.ok(lesson.title.trim().length > 0, `${lesson.id} has no title`);
  }
});

test('section shape matches its type: bullets carry items, scripture carries a reference', () => {
  for (const { lesson } of allLessons) {
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
    });
  }
});

test('getCoursesByField returns only that field, for every field', () => {
  for (const field of FIELD_ORDER) {
    const courses = getCoursesByField(field);
    assert.deepEqual(
      courses,
      fourFieldsCourses.filter((course) => course.field === field)
    );
    assert.ok(courses.every((course) => course.field === field));
  }
});

test('getAllLessonsInOrder walks the fields in FIELD_ORDER and covers every lesson exactly once', () => {
  const ordered = getAllLessonsInOrder();
  assert.equal(ordered.length, allLessons.length);
  assert.deepEqual(
    [...new Set(ordered.map(({ lesson }) => lesson.id))].length,
    ordered.length,
    'a lesson was emitted twice'
  );

  const fieldSequence = ordered.map(({ course }) => course.field);
  const firstIndexOfField = (field: FieldType) => fieldSequence.indexOf(field);
  const seen = FIELD_ORDER.filter((field) => firstIndexOfField(field) !== -1);
  assert.deepEqual(
    seen,
    [...seen].sort((left, right) => firstIndexOfField(left) - firstIndexOfField(right))
  );
});

test('lesson counters agree with the catalog they count', () => {
  assert.equal(getTotalLessonsCount(), allLessons.length);
  for (const field of FIELD_ORDER) {
    assert.equal(
      getLessonsForField(field),
      allLessons.filter(({ course }) => course.field === field).length
    );
  }
  assert.equal(
    FIELD_ORDER.reduce((total, field) => total + getLessonsForField(field), 0),
    getTotalLessonsCount()
  );
});
