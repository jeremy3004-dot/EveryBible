import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStoryPassageView,
  keepReferenceTogether,
  limitStoryPassageView,
  resolveStoryStatus,
} from './lessonPassageModel';

test('limiting a story keeps its first verses across blocks and leaves a short story untouched', () => {
  const block = (key: string, count: number) => ({
    key,
    heading: null,
    verses: verses('GEN', 1, count),
  });
  const view = {
    blocks: [block('a', 5), block('b', 5)],
    verseCount: 10,
    translationNames: ['BSB'],
  };

  assert.equal(limitStoryPassageView(view, 10), view);
  const limited = limitStoryPassageView(view, 7);
  assert.deepEqual(
    limited.blocks.map((item) => [item.key, item.verses.length]),
    [
      ['a', 5],
      ['b', 2],
    ]
  );
  assert.equal(limited.verseCount, 7);
  assert.equal(limitStoryPassageView(view, 5).blocks.length, 1);
});

test('a reference keeps its book and chapter together, whatever the book name', () => {
  assert.equal(keepReferenceTogether('Genesis 1'), 'Genesis 1');
  assert.equal(keepReferenceTogether('1 Samuel 3:1–10'), '1 Samuel 3:1–10');
  assert.equal(keepReferenceTogether('Song of Songs 2'), 'Song of Songs 2');
});
import type { PassageBlock } from '../../services/gather/gatherBibleService';
import type { Verse } from '../../types';

const verses = (bookId: string, chapter: number, count: number): Verse[] =>
  Array.from({ length: count }, (_, index) => ({
    id: chapter * 1000 + index + 1,
    bookId,
    chapter,
    verse: index + 1,
    text: `${bookId} ${chapter}:${index + 1}`,
  }));

const names: Record<string, string> = {
  bsb: 'Berean Standard Bible',
  'nt-only': 'Hindi New Testament',
};
const translationName = (id: string) => names[id] ?? id;

test('a lesson whose every block came back empty has no passage to show', () => {
  // Previously one empty block rendered as a blank Story section: the empty
  // state only fired when there were no blocks at all.
  const blocks: PassageBlock[] = [{ label: 'Genesis 1', verses: [], translationId: 'nt-only' }];

  assert.equal(buildStoryPassageView(blocks, 'nt-only', translationName), null);
  assert.equal(buildStoryPassageView([], 'nt-only', translationName), null);
});

test('a single block in the reading translation needs no heading', () => {
  const view = buildStoryPassageView(
    [{ label: 'John 3', verses: verses('JHN', 3, 36), translationId: 'nt-only' }],
    'nt-only',
    translationName
  );

  assert.deepEqual(
    view?.blocks.map((block) => block.heading),
    [null]
  );
  assert.equal(view?.verseCount, 36);
  assert.deepEqual(view?.translationNames, ['Hindi New Testament']);
});

test('a block read from the fallback translation is labelled with that translation', () => {
  const view = buildStoryPassageView(
    [{ label: 'Genesis 1', verses: verses('GEN', 1, 31), translationId: 'bsb' }],
    'nt-only',
    translationName
  );

  assert.deepEqual(
    view?.blocks.map((block) => block.heading),
    ['Genesis 1 · Berean Standard Bible']
  );
  assert.deepEqual(view?.translationNames, ['Berean Standard Bible']);
});

test('several blocks are headed by reference, and empty ones are left out of the count', () => {
  const view = buildStoryPassageView(
    [
      { label: 'Genesis 1:1-2', verses: verses('GEN', 1, 2), translationId: 'bsb' },
      { label: 'John 3:16-17', verses: verses('JHN', 3, 2), translationId: 'nt-only' },
      { label: 'Acts 99', verses: [], translationId: 'nt-only' },
    ],
    'nt-only',
    translationName
  );

  assert.deepEqual(
    view?.blocks.map((block) => block.heading),
    ['Genesis 1:1-2 · Berean Standard Bible', 'John 3:16-17']
  );
  assert.equal(view?.verseCount, 4);
  assert.deepEqual(view?.translationNames, ['Berean Standard Bible', 'Hindi New Testament']);
});

test('a passage that failed to load is an error with a retry, not an empty passage', () => {
  // Both used to show "No passage text available" with no way to try again.
  assert.equal(resolveStoryStatus({ isLoading: false, loadFailed: true, view: null }), 'error');
  assert.equal(resolveStoryStatus({ isLoading: false, loadFailed: false, view: null }), 'empty');
});

test('a retry in progress shows loading, and loaded verses show the passage', () => {
  const view = buildStoryPassageView(
    [{ label: 'Genesis 1', verses: verses('GEN', 1, 1), translationId: 'bsb' }],
    'bsb',
    translationName
  );

  assert.equal(resolveStoryStatus({ isLoading: true, loadFailed: true, view: null }), 'loading');
  assert.equal(resolveStoryStatus({ isLoading: false, loadFailed: false, view }), 'ready');
});
