import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBookCompanionSections } from './bookCompanionModel';

test('buildBookCompanionSections returns ordered screen-ready modules for seeded books', () => {
  const sections = buildBookCompanionSections('GAL');

  assert.deepEqual(
    sections.map((section) => section.kind),
    ['devotionals', 'plans']
  );
  assert.equal(sections[0]?.layout, 'stack');
  assert.equal(sections[1]?.layout, 'carousel');
  assert.equal(sections[1]?.items[0]?.target.bookId, 'GAL');
  assert.equal(sections[1]?.items[0]?.target.chapter, 1);
});

test('buildBookCompanionSections falls back to an empty list when a book has no seeded modules', () => {
  assert.deepEqual(buildBookCompanionSections('OBA'), []);
});

test('buildBookCompanionSections hides passages and biblical figure sections from seeded books', () => {
  const genesisSections = buildBookCompanionSections('GEN');

  assert.equal(genesisSections.length, 0);
  assert.equal(
    genesisSections.some((section) => section.kind === 'passages' || section.kind === 'figures'),
    false
  );
});
