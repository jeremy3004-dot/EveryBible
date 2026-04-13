import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeVerseFormatting,
  serializeVerseFormatting,
} from './verseFormatting';

test('normalizeVerseFormatting accepts structured poetry lines', () => {
  assert.deepEqual(
    normalizeVerseFormatting({
      mode: 'poetry',
      lines: [
        { text: 'So God created man in His own image;', indentLevel: 0 },
        { text: 'in the image of God He created him;', indentLevel: 1 },
      ],
    }),
    {
      mode: 'poetry',
      lines: [
        { text: 'So God created man in His own image;' },
        { text: 'in the image of God He created him;', indentLevel: 1 },
      ],
    }
  );
});

test('normalizeVerseFormatting parses serialized JSON and drops invalid lines', () => {
  assert.deepEqual(
    normalizeVerseFormatting(
      '{"mode":"poetry","lines":[{"text":"Line one","indentLevel":0},{"text":"  "},{"indentLevel":2},{"text":"Line two","indentLevel":2.8}]}'
    ),
    {
      mode: 'poetry',
      lines: [
        { text: 'Line one' },
        { text: 'Line two', indentLevel: 2 },
      ],
    }
  );
});

test('serializeVerseFormatting returns null for unusable input', () => {
  assert.equal(serializeVerseFormatting({ mode: 'poetry', lines: [] }), null);
  assert.equal(serializeVerseFormatting('not json'), null);
});

test('serializeVerseFormatting returns stable JSON for normalized formatting', () => {
  assert.equal(
    serializeVerseFormatting({
      mode: 'poetry',
      lines: [
        { text: 'Line one', indentLevel: 0 },
        { text: 'Line two', indentLevel: 1 },
      ],
    }),
    '{"mode":"poetry","lines":[{"text":"Line one"},{"text":"Line two","indentLevel":1}]}'
  );
});
