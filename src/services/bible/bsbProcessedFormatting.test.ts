import test from 'node:test';
import assert from 'node:assert/strict';
import bsbData from '../../../data/bsb_processed.json';

type ProcessedVerse = {
  b: string;
  c: number;
  v: number;
  f?: {
    mode: 'poetry';
    lines: Array<{ text: string; indentLevel?: number }>;
  };
};

const verses = (bsbData as { verses: ProcessedVerse[] }).verses;

function getVerse(bookId: string, chapter: number, verse: number): ProcessedVerse {
  const match = verses.find((candidate) => (
    candidate.b === bookId && candidate.c === chapter && candidate.v === verse
  ));

  assert.ok(match, `Expected ${bookId} ${chapter}:${verse} to exist in bsb_processed.json`);
  return match;
}

test('epistle prose does not preserve editorial line breaks as stacked verse formatting', () => {
  assert.equal(getVerse('1PE', 1, 1).f, undefined);
  assert.equal(getVerse('1PE', 1, 2).f, undefined);
  assert.equal(getVerse('ROM', 1, 7).f, undefined);
});

test('psalm poetry still preserves structured line formatting', () => {
  assert.deepEqual(getVerse('PSA', 1, 1).f, {
    mode: 'poetry',
    lines: [
      { text: 'Blessed is the man' },
      { text: 'who does not walk in the counsel of the wicked,', indentLevel: 1 },
      { text: 'or set foot on the path of sinners,' },
      { text: 'or sit in the seat of mockers.', indentLevel: 1 },
    ],
  });
});
