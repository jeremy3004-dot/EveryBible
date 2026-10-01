import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bibleBookById,
  bibleBookBySlug,
  bibleChapterPath,
  parseChapterParam,
  SITE_BIBLE_BOOKS,
} from './bible-books';

test('66 books, 1,189 chapters, 39 in the Old Testament', () => {
  assert.equal(SITE_BIBLE_BOOKS.length, 66);
  assert.equal(
    SITE_BIBLE_BOOKS.reduce((sum, book) => sum + book.chapters, 0),
    1189
  );
  assert.equal(SITE_BIBLE_BOOKS.filter((book) => book.testament === 'OT').length, 39);
  assert.equal(bibleBookById('MAT')?.testament, 'NT');
});

test('slugs are unique lowercase words joined by hyphens', () => {
  const slugs = SITE_BIBLE_BOOKS.map((book) => book.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of slugs) assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.equal(bibleBookById('1co')?.slug, '1-corinthians');
  assert.equal(bibleBookById('SNG')?.slug, 'song-of-songs');
});

test('chapter paths round-trip through slug lookup', () => {
  const john = bibleBookBySlug('john');
  assert.ok(john);
  assert.equal(bibleChapterPath(john, 3), '/bible/john/3');
  assert.equal(bibleChapterPath(john, 3, 16), '/bible/john/3#v16');
});

test('only canonical in-range chapter numbers parse', () => {
  const jude = bibleBookById('JUD');
  const psalms = bibleBookById('PSA');
  assert.ok(jude && psalms);
  assert.equal(parseChapterParam(jude, '1'), 1);
  assert.equal(parseChapterParam(jude, '2'), null);
  assert.equal(parseChapterParam(psalms, '150'), 150);
  for (const bad of ['0', '01', '1.0', '-1', 'one', '', '1e2']) {
    assert.equal(parseChapterParam(psalms, bad), null, bad);
  }
});
