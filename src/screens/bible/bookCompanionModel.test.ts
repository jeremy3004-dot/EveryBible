import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBookCompanionSections } from './bookCompanionModel';

test('buildBookCompanionSections returns ordered screen-ready modules for seeded books', () => {
  const sections = buildBookCompanionSections('GAL');

  assert.deepEqual(
    sections.map((section) => section.kind),
    ['passages', 'devotionals', 'plans', 'figures']
  );
  assert.equal(sections[0]?.layout, 'carousel');
  assert.equal(sections[1]?.layout, 'stack');
  assert.equal(sections[2]?.items[0]?.target.bookId, 'GAL');
  assert.equal(sections[2]?.items[0]?.target.chapter, 1);
  assert.equal(sections[3]?.items[0]?.meta, 'Apostle');
});

test('buildBookCompanionSections falls back to an empty list when a book has no seeded modules', () => {
  assert.deepEqual(buildBookCompanionSections('OBA'), []);
});
