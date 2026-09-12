import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReaderParagraphRenderSignature,
  buildReaderHighlightIndex,
  type ReaderParagraphAppearance,
} from './bibleReaderRenderModel';

const appearance = (): ReaderParagraphAppearance => ({
  premium: true,
  verseFontSize: 20,
  verseLineHeight: 30,
  verseNumberSize: 12,
  headingFontSize: 24,
  readingFontFamily: 'Lora-Regular',
  readingFontFamilyBold: 'Lora-Semibold',
  colors: {
    biblePrimaryText: '#eeeeee',
    bibleSecondaryText: '#bbbbbb',
    bibleAccent: '#dd7700',
    bibleFollowHighlight: '#333333',
    bibleFollowVerseNumber: '#dddddd',
  },
  selectedVerses: [1],
  annotations: [
    { type: 'highlight', verse_start: 1, verse_end: 2, color: '#ffaa00', deleted_at: null },
  ],
});

const signature = buildReaderParagraphRenderSignature;

test('unchanged paragraph appearance retains its render signature across cloned input', () => {
  const input = appearance();
  assert.equal(signature(input), signature(structuredClone(input)));
});

test('moving a selection without changing its size invalidates the paragraph', () => {
  const input = appearance();
  assert.notEqual(signature(input), signature({ ...input, selectedVerses: [2] }));
});

test('recoloring an existing highlight invalidates the paragraph', () => {
  const input = appearance();
  const changed = { ...input, annotations: [{ ...input.annotations[0], color: '#00aaff' }] };
  assert.notEqual(signature(input), signature(changed));
});

test('changing a highlight range invalidates the paragraph', () => {
  const input = appearance();
  const changed = { ...input, annotations: [{ ...input.annotations[0], verse_end: 3 }] };
  assert.notEqual(signature(input), signature(changed));
});

test('soft-deleting a highlight invalidates the paragraph without changing the annotation count', () => {
  const input = appearance();
  const changed = {
    ...input,
    annotations: [{ ...input.annotations[0], deleted_at: '2026-09-12' }],
  };
  assert.notEqual(signature(input), signature(changed));
});

test('loading the reading and heading fonts invalidates the paragraph', () => {
  const input = appearance();
  assert.notEqual(signature(input), signature({ ...input, readingFontFamily: undefined }));
  assert.notEqual(signature(input), signature({ ...input, readingFontFamilyBold: undefined }));
});

test('changing verse-number or follow-along colors invalidates the paragraph', () => {
  const input = appearance();
  for (const key of [
    'bibleSecondaryText',
    'bibleFollowHighlight',
    'bibleFollowVerseNumber',
  ] as const) {
    assert.notEqual(
      signature(input),
      signature({ ...input, colors: { ...input.colors, [key]: '#abcdef' } })
    );
  }
});

test('typography size and premium mode remain part of the paragraph appearance', () => {
  const input = appearance();
  assert.notEqual(signature(input), signature({ ...input, verseFontSize: 22 }));
  assert.notEqual(signature(input), signature({ ...input, premium: false }));
});

test('highlight lookup includes ranges and single verses but ignores notes and deleted entries', () => {
  const highlight = appearance().annotations[0];
  const single = { ...highlight, verse_start: 4, verse_end: null };
  const index = buildReaderHighlightIndex(
    [
      highlight,
      single,
      { ...highlight, type: 'note', verse_start: 3, verse_end: 3 },
      { ...highlight, verse_start: 5, verse_end: 5, deleted_at: '2026-09-12' },
    ],
    5
  );
  assert.deepEqual([...index.keys()], [1, 2, 4]);
  assert.equal(index.get(4), single);
});

test('overlapping highlights preserve the first match even when its color is empty', () => {
  const first = { ...appearance().annotations[0], color: null };
  const second = { ...first, color: '#0000ff' };
  const index = buildReaderHighlightIndex([first, second], 2);
  assert.equal(index.get(1), first);
  assert.equal(index.get(2), first);
});

test('highlight ranges are bounded by the displayed chapter', () => {
  const highlight = { ...appearance().annotations[0], verse_start: 0, verse_end: 999999 };
  assert.deepEqual([...buildReaderHighlightIndex([highlight], 3).keys()], [1, 2, 3]);
  assert.equal(buildReaderHighlightIndex([highlight], 0).size, 0);
});

test('repeated verse lookups do not rescan annotations', () => {
  let rangeReads = 0;
  const annotations = Array.from({ length: 100 }, (_, index) => ({
    ...appearance().annotations[0],
    get verse_start() {
      rangeReads += 1;
      return index + 1;
    },
    verse_end: index + 1,
  }));
  const index = buildReaderHighlightIndex(annotations, 176);
  const readsAfterIndexing = rangeReads;
  for (let update = 0; update < 10; update += 1) {
    for (let verse = 1; verse <= 176; verse += 1) index.get(verse);
  }
  assert.equal(readsAfterIndexing, 100);
  assert.equal(rangeReads, readsAfterIndexing);
});
