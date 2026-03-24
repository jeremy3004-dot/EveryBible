import test from 'node:test';
import assert from 'node:assert/strict';
import { bibleBooks } from '../../constants/books';
import { buildBibleBrowserRows } from './browserRows';

test('buildBibleBrowserRows creates one continuous list with a single new testament divider', () => {
  const rows = buildBibleBrowserRows(bibleBooks);

  assert.equal(rows[0]?.type, 'books');
  assert.equal(rows.filter((row) => row.type === 'divider').length, 1);

  const dividerIndex = rows.findIndex((row) => row.type === 'divider');
  assert.notEqual(dividerIndex, -1);

  const divider = rows[dividerIndex];
  assert.equal(divider?.type, 'divider');
  assert.equal(divider?.testament, 'NT');

  const firstRow = rows[0];
  assert.equal(firstRow?.type, 'books');
  if (firstRow?.type === 'books') {
    assert.deepEqual(firstRow.books.map((book) => book.id), ['GEN']);
  }

  const rowBeforeDivider = rows[dividerIndex - 1];
  assert.equal(rowBeforeDivider?.type, 'books');
  if (rowBeforeDivider?.type === 'books') {
    assert.deepEqual(rowBeforeDivider.books.map((book) => book.id), ['MAL']);
  }

  const rowAfterDivider = rows[dividerIndex + 1];
  assert.equal(rowAfterDivider?.type, 'books');
  if (rowAfterDivider?.type === 'books') {
    assert.deepEqual(rowAfterDivider.books.map((book) => book.id), ['MAT']);
  }
});

test('buildBibleBrowserRows preserves the final single book row when a testament has an odd count', () => {
  const rows = buildBibleBrowserRows(bibleBooks);
  const lastRow = rows.at(-1);

  assert.equal(lastRow?.type, 'books');
  if (lastRow?.type === 'books') {
    assert.deepEqual(lastRow.books.map((book) => book.id), ['REV']);
  }
});
