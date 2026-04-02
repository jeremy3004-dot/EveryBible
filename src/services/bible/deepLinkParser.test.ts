import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBibleDeepLink, buildBibleDeepLink } from './deepLinkParser';
import type { BibleDeepLinkTarget } from './deepLinkParser';
import { bibleBooks } from '../../constants/books';

// DEEP-01: parseBibleDeepLink — chapter + verse
test('parseBibleDeepLink returns correct result for /bible/john/3/16', () => {
  const result = parseBibleDeepLink('/bible/john/3/16');
  assert.deepEqual(result, { bookId: 'JHN', chapter: 3, verse: 16 } satisfies BibleDeepLinkTarget);
});

test('parseBibleDeepLink also accepts a path without the leading slash', () => {
  const result = parseBibleDeepLink('bible/john/3/16');
  assert.deepEqual(result, { bookId: 'JHN', chapter: 3, verse: 16 } satisfies BibleDeepLinkTarget);
});

// DEEP-02: parseBibleDeepLink — multi-word book slug (1corinthians)
test('parseBibleDeepLink returns correct result for /bible/1corinthians/13', () => {
  const result = parseBibleDeepLink('/bible/1corinthians/13');
  assert.deepEqual(result, { bookId: '1CO', chapter: 13, verse: undefined });
});

test('parseBibleDeepLink returns correct result for /bible/john/3 (no verse)', () => {
  const result = parseBibleDeepLink('/bible/john/3');
  assert.deepEqual(result, { bookId: 'JHN', chapter: 3, verse: undefined });
});

test('parseBibleDeepLink handles Song of Solomon slug', () => {
  const result = parseBibleDeepLink('/bible/songofsolomon/1/1');
  assert.deepEqual(result, { bookId: 'SNG', chapter: 1, verse: 1 });
});

// Psalm alias
test('parseBibleDeepLink resolves psalm alias to PSA', () => {
  const result = parseBibleDeepLink('/bible/psalm/23');
  assert.deepEqual(result, { bookId: 'PSA', chapter: 23, verse: undefined });
});

// DEEP-03: unknown slug returns null
test('parseBibleDeepLink returns null for unknown book slug', () => {
  assert.equal(parseBibleDeepLink('/bible/unknown/3/16'), null);
});

// Invalid chapter numbers
test('parseBibleDeepLink returns null for chapter 0', () => {
  assert.equal(parseBibleDeepLink('/bible/john/0'), null);
});

test('parseBibleDeepLink returns null for negative chapter', () => {
  // Negative chapter won't match the \d+ regex — returns null
  assert.equal(parseBibleDeepLink('/bible/john/-1'), null);
});

// Non-bible path
test('parseBibleDeepLink returns null for non-bible path', () => {
  assert.equal(parseBibleDeepLink('/other/path'), null);
});

// DEEP-06: Slug collision — john vs 1john/2john/3john
test('parseBibleDeepLink resolves john to JHN', () => {
  assert.equal(parseBibleDeepLink('/bible/john/1')?.bookId, 'JHN');
});

test('parseBibleDeepLink resolves 1john to 1JN', () => {
  assert.equal(parseBibleDeepLink('/bible/1john/1')?.bookId, '1JN');
});

test('parseBibleDeepLink resolves 2john to 2JN', () => {
  assert.equal(parseBibleDeepLink('/bible/2john/1')?.bookId, '2JN');
});

test('parseBibleDeepLink resolves 3john to 3JN', () => {
  assert.equal(parseBibleDeepLink('/bible/3john/1')?.bookId, '3JN');
});

// DEEP-04: buildBibleDeepLink — chapter + verse
test('buildBibleDeepLink returns correct URL for JHN 3:16', () => {
  assert.equal(buildBibleDeepLink('JHN', 3, 16), 'com.everybible.app://bible/john/3/16');
});

// DEEP-05: buildBibleDeepLink — chapter only
test('buildBibleDeepLink returns correct URL for JHN 3 (no verse)', () => {
  assert.equal(buildBibleDeepLink('JHN', 3), 'com.everybible.app://bible/john/3');
});

test('buildBibleDeepLink returns correct URL for 1CO 13', () => {
  assert.equal(buildBibleDeepLink('1CO', 13), 'com.everybible.app://bible/1corinthians/13');
});

test('buildBibleDeepLink returns empty string for unknown bookId', () => {
  assert.equal(buildBibleDeepLink('INVALID', 1), '');
});

// Round-trip: all 66 books must survive buildBibleDeepLink -> parseBibleDeepLink
test('round-trip: buildBibleDeepLink -> parseBibleDeepLink for all 66 books', () => {
  for (const book of bibleBooks) {
    const url = buildBibleDeepLink(book.id, 1);
    assert.notEqual(
      url,
      '',
      `buildBibleDeepLink returned empty for book ${book.id} (${book.name})`
    );

    // Extract path portion after the scheme
    const path = url.replace('com.everybible.app:/', '');
    const parsed = parseBibleDeepLink(path);
    assert.notEqual(
      parsed,
      null,
      `parseBibleDeepLink returned null for ${book.id} (${book.name}), url=${url}, path=${path}`
    );
    assert.equal(
      parsed?.bookId,
      book.id,
      `bookId mismatch for ${book.name}: expected ${book.id}, got ${parsed?.bookId}`
    );
    assert.equal(parsed?.chapter, 1, `chapter mismatch for ${book.name}`);
  }
});
