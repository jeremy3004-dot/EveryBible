import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAPTER_GRID_COLUMNS,
  CHAPTER_GRID_HORIZONTAL_PADDING,
  CHAPTER_GRID_ROW_GAP,
  buildChapterGridRows,
  getChapterGridItemSize,
} from './chapterSelectorModel';

test('getChapterGridItemSize preserves the current five-column chapter grid math', () => {
  assert.equal(CHAPTER_GRID_COLUMNS, 5);
  assert.equal(CHAPTER_GRID_HORIZONTAL_PADDING, 72);
  assert.equal(CHAPTER_GRID_ROW_GAP, 8);
  assert.equal(getChapterGridItemSize(392), 64);
});

test('buildChapterGridRows keeps chapters grouped into fixed five-item rows', () => {
  assert.deepEqual(buildChapterGridRows(11), [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
    [11],
  ]);
});
