import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gatherFoundations,
  FOUNDATION_TITLE_KEYS,
  FOUNDATION_DESC_KEYS,
  FOUNDATION_LESSON_TITLE_KEYS,
  FELLOWSHIP_QUESTIONS,
  APPLICATION_QUESTIONS,
} from './gatherFoundations';
import type { GatherFoundation, GatherLesson } from '../types/gather';

// ---------------------------------------------------------------------------
// S22-T01: Foundation list integrity
// ---------------------------------------------------------------------------

test('exports exactly 7 foundations with sequential IDs foundation-1 through foundation-7', () => {
  assert.equal(gatherFoundations.length, 7);

  const expectedIds = [
    'foundation-1',
    'foundation-2',
    'foundation-3',
    'foundation-4',
    'foundation-5',
    'foundation-6',
    'foundation-7',
  ];
  assert.deepEqual(
    gatherFoundations.map((f) => f.id),
    expectedIds
  );
});

test('each foundation has sequential number 1-7 matching its position', () => {
  gatherFoundations.forEach((f, index) => {
    assert.equal(f.number, index + 1, `foundation ${f.id} should have number ${index + 1}`);
  });
});

test('every foundation has a title, description, and iconName', () => {
  for (const f of gatherFoundations) {
    assert.ok(f.title.length > 0, `${f.id} must have a non-empty title`);
    assert.ok(f.description.length > 0, `${f.id} must have a non-empty description`);
    assert.ok(f.iconName.length > 0, `${f.id} must have a non-empty iconName`);
  }
});

test('every foundation has an iconImage key for the icon registry', () => {
  for (const f of gatherFoundations) {
    assert.ok(f.iconImage, `${f.id} should have an iconImage key`);
    assert.equal(f.iconImage, f.id, `${f.id} iconImage should match its own id`);
  }
});

// ---------------------------------------------------------------------------
// S22-T01: i18n key maps cover every foundation
// ---------------------------------------------------------------------------

test('FOUNDATION_TITLE_KEYS has an entry for every foundation ID', () => {
  for (const f of gatherFoundations) {
    assert.ok(f.id in FOUNDATION_TITLE_KEYS, `FOUNDATION_TITLE_KEYS missing entry for ${f.id}`);
    assert.ok(
      FOUNDATION_TITLE_KEYS[f.id].startsWith('gather.'),
      `title key for ${f.id} should be in gather.* namespace`
    );
  }
});

test('FOUNDATION_DESC_KEYS has an entry for every foundation ID', () => {
  for (const f of gatherFoundations) {
    assert.ok(f.id in FOUNDATION_DESC_KEYS, `FOUNDATION_DESC_KEYS missing entry for ${f.id}`);
    assert.ok(
      FOUNDATION_DESC_KEYS[f.id].startsWith('gather.'),
      `desc key for ${f.id} should be in gather.* namespace`
    );
  }
});

// ---------------------------------------------------------------------------
// S22-T02: Lesson data completeness
// ---------------------------------------------------------------------------

test('every foundation has at least 1 lesson', () => {
  for (const f of gatherFoundations) {
    assert.ok(f.lessons.length >= 1, `${f.id} must have at least 1 lesson`);
  }
});

test('every lesson has a unique ID, a number, a title, references, and a referenceLabel', () => {
  const allIds = new Set<string>();

  for (const f of gatherFoundations) {
    for (const lesson of f.lessons) {
      // Uniqueness
      assert.equal(allIds.has(lesson.id), false, `duplicate lesson ID: ${lesson.id}`);
      allIds.add(lesson.id);

      // Required fields
      assert.equal(typeof lesson.id, 'string');
      assert.ok(lesson.id.length > 0, 'lesson id must be non-empty');
      assert.equal(typeof lesson.number, 'number');
      assert.ok(lesson.number >= 1, `lesson ${lesson.id} number must be >= 1`);
      assert.equal(typeof lesson.title, 'string');
      assert.ok(lesson.title.length > 0, `lesson ${lesson.id} must have a title`);
      assert.ok(Array.isArray(lesson.references), `lesson ${lesson.id} must have references array`);
      assert.ok(
        lesson.references.length >= 1,
        `lesson ${lesson.id} must have at least 1 reference`
      );
      assert.equal(typeof lesson.referenceLabel, 'string');
      assert.ok(lesson.referenceLabel.length > 0, `lesson ${lesson.id} must have a referenceLabel`);
    }
  }
});

test('lesson numbers are sequential within each foundation starting from 1', () => {
  for (const f of gatherFoundations) {
    f.lessons.forEach((lesson, index) => {
      assert.equal(
        lesson.number,
        index + 1,
        `${f.id} lesson ${lesson.id} should have number ${index + 1}`
      );
    });
  }
});

test('every lesson Bible reference has a bookId and chapter', () => {
  for (const f of gatherFoundations) {
    for (const lesson of f.lessons) {
      for (const ref of lesson.references) {
        assert.equal(typeof ref.bookId, 'string');
        assert.ok(ref.bookId.length > 0, `lesson ${lesson.id} ref must have bookId`);
        assert.equal(typeof ref.chapter, 'number');
        assert.ok(ref.chapter >= 1, `lesson ${lesson.id} ref chapter must be >= 1`);
      }
    }
  }
});

test('FOUNDATION_LESSON_TITLE_KEYS has an entry for every foundation lesson', () => {
  for (const f of gatherFoundations) {
    for (const lesson of f.lessons) {
      assert.ok(
        lesson.id in FOUNDATION_LESSON_TITLE_KEYS,
        `FOUNDATION_LESSON_TITLE_KEYS missing entry for ${lesson.id}`
      );
      assert.ok(
        FOUNDATION_LESSON_TITLE_KEYS[lesson.id].startsWith('gather.lessons.'),
        `lesson key for ${lesson.id} should be in gather.lessons.* namespace`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// S22-T03: Meeting questions format (DBS pattern)
// ---------------------------------------------------------------------------

test('FELLOWSHIP_QUESTIONS is a non-empty array of strings', () => {
  assert.ok(Array.isArray(FELLOWSHIP_QUESTIONS));
  assert.ok(FELLOWSHIP_QUESTIONS.length >= 3, 'should have at least 3 fellowship questions');
  for (const q of FELLOWSHIP_QUESTIONS) {
    assert.equal(typeof q, 'string');
    assert.ok(q.length > 10, 'each fellowship question should be a meaningful sentence');
  }
});

test('APPLICATION_QUESTIONS is a non-empty array of strings', () => {
  assert.ok(Array.isArray(APPLICATION_QUESTIONS));
  assert.ok(APPLICATION_QUESTIONS.length >= 3, 'should have at least 3 application questions');
  for (const q of APPLICATION_QUESTIONS) {
    assert.equal(typeof q, 'string');
    assert.ok(q.length > 10, 'each application question should be a meaningful sentence');
  }
});

test('fellowship questions follow DBS Look Back pattern', () => {
  // DBS Look Back starts with gratitude, stress/needs, community
  const joined = FELLOWSHIP_QUESTIONS.join(' ').toLowerCase();
  assert.ok(joined.includes('thankful'), 'fellowship should ask about thankfulness');
  assert.ok(
    joined.includes('stress') || joined.includes('need'),
    'fellowship should ask about stress or needs'
  );
});

test('application questions follow DBS Look Forward pattern', () => {
  // DBS Look Forward includes retelling, God's character, apply, share
  const joined = APPLICATION_QUESTIONS.join(' ').toLowerCase();
  assert.ok(joined.includes('retell') || joined.includes('own words'), 'should ask to retell');
  assert.ok(joined.includes('god'), 'should ask about what we learn about God');
  assert.ok(joined.includes('apply') || joined.includes('action'), 'should ask about application');
  assert.ok(joined.includes('share'), 'should ask about sharing');
});

// ---------------------------------------------------------------------------
// S22-T04: Zustand store contract (type-level verification)
// ---------------------------------------------------------------------------

test('GatherFoundation type enforces required fields', () => {
  // Compile-time contract: if this compiles, the type is correct
  const sample: GatherFoundation = {
    id: 'test-foundation',
    number: 1,
    title: 'Test',
    description: 'Test description',
    iconName: 'book-outline',
    lessons: [],
  };
  assert.equal(sample.id, 'test-foundation');
});

test('GatherLesson type enforces required fields', () => {
  const sample: GatherLesson = {
    id: 'test-lesson',
    number: 1,
    title: 'Test Lesson',
    references: [{ bookId: 'GEN', chapter: 1 }],
    referenceLabel: 'Genesis 1',
  };
  assert.equal(sample.id, 'test-lesson');
});

// ---------------------------------------------------------------------------
// S23: Content completeness — real discipleship content
// ---------------------------------------------------------------------------

test('foundations cover the Seven Foundations discipleship sequence', () => {
  const titles = gatherFoundations.map((f) => f.title);
  assert.deepEqual(titles, [
    'The Story of God',
    'The Life and Ministry of Jesus',
    'The Gospel Invitation',
    'Life as a Disciple',
    'Life as a Jesus Community',
    'Life as a Leader',
    'Sharing the Good News',
  ]);
});

test('foundations have substantive descriptions (not empty placeholders)', () => {
  for (const f of gatherFoundations) {
    assert.ok(
      f.description.length >= 15,
      `${f.id} description "${f.description}" is too short to be meaningful`
    );
  }
});

test('total lesson count across all foundations is at least 60', () => {
  const total = gatherFoundations.reduce((sum, f) => sum + f.lessons.length, 0);
  assert.ok(total >= 60, `expected at least 60 total lessons, got ${total}`);
});

test('each foundation has between 9 and 10 lessons', () => {
  for (const f of gatherFoundations) {
    assert.ok(
      f.lessons.length >= 9 && f.lessons.length <= 10,
      `${f.id} has ${f.lessons.length} lessons, expected 9-10`
    );
  }
});

test('Foundation 1 covers Old Testament through the birth of Jesus', () => {
  const f1 = gatherFoundations[0];
  const books = f1.lessons.map((l) => l.references[0].bookId);
  // Should include Genesis (creation), Exodus (Passover), and Luke (birth)
  assert.ok(books.includes('GEN'), 'F1 should reference Genesis');
  assert.ok(books.includes('EXO'), 'F1 should reference Exodus');
  assert.ok(books.includes('LUK'), 'F1 should reference Luke (birth of Jesus)');
});

test("Foundation 2 covers the gospels for Jesus' life and ministry", () => {
  const f2 = gatherFoundations[1];
  const books = new Set(f2.lessons.map((l) => l.references[0].bookId));
  // Should reference at least 2 different gospel books
  const gospelBooks = ['MAT', 'MRK', 'LUK', 'JHN'].filter((b) => books.has(b));
  assert.ok(
    gospelBooks.length >= 2,
    `F2 should reference at least 2 gospel books, found: ${gospelBooks.join(', ')}`
  );
});

test('Foundation 3 covers gospel response passages (John, Romans, Acts)', () => {
  const f3 = gatherFoundations[2];
  const books = new Set(f3.lessons.map((l) => l.references[0].bookId));
  assert.ok(
    books.has('JHN') || books.has('ROM') || books.has('ACT'),
    'F3 should reference John, Romans, or Acts for gospel response'
  );
});

test('every lesson referenceLabel is a human-readable Bible reference', () => {
  const pattern = /^[1-3]?\s?[A-Z][a-z]+\s+\d+/;
  for (const f of gatherFoundations) {
    for (const lesson of f.lessons) {
      assert.ok(
        pattern.test(lesson.referenceLabel),
        `${lesson.id} referenceLabel "${lesson.referenceLabel}" should be a human-readable reference like "Genesis 1"`
      );
    }
  }
});
