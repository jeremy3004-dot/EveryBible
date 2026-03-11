import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_BIBLE_SEARCH_QUERY_LENGTH,
  formatBibleSearchReference,
  shouldRunBibleSearch,
} from './bibleSearchModel';

test('requires a trimmed query of at least the minimum length before search runs', () => {
  assert.equal(shouldRunBibleSearch(''), false);
  assert.equal(shouldRunBibleSearch(' a '), false);
  assert.equal(shouldRunBibleSearch('grace'), true);
  assert.equal(shouldRunBibleSearch(' ok '), true);
  assert.equal(MIN_BIBLE_SEARCH_QUERY_LENGTH, 2);
});

test('formats a readable scripture reference for search results', () => {
  assert.equal(
    formatBibleSearchReference(
      {
        bookId: 'JHN',
        chapter: 3,
        verse: 16,
      },
      (bookId) => (bookId === 'JHN' ? 'John' : undefined)
    ),
    'John 3:16'
  );
});

test('falls back to the raw book id when the book name is unavailable', () => {
  assert.equal(
    formatBibleSearchReference(
      {
        bookId: 'ROM',
        chapter: 8,
        verse: 28,
      },
      () => undefined
    ),
    'ROM 8:28'
  );
});
