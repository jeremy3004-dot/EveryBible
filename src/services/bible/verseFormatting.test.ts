import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeClosingQuoteSpacing,
  normalizeVerseFormatting,
  normalizeVerseFormattingQuotes,
  reconcileVerseFormattingWithText,
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
      lines: [{ text: 'Line one' }, { text: 'Line two', indentLevel: 2 }],
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

test('reconcileVerseFormattingWithText restores a prose lead-in dropped from poetry lines', () => {
  // Hebrews 1:5 (BSB). The stored poetry lines hold only the quoted couplets, so the
  // renderer silently dropped "For to which of the angels did God ever say:" and "Or again:".
  const text =
    'For to which of the angels did God ever say: “You are My Son; today I have become Your Father” ? Or again: “I will be His Father, and He will be My Son” ?';
  const formatting = normalizeVerseFormatting({
    mode: 'poetry',
    lines: [
      { text: '“You are My Son;' },
      { text: 'today I have become Your Father”', indentLevel: 1 },
      { text: '?', indentLevel: 1 },
      { text: '“I will be His Father,' },
      { text: 'and He will be My Son”', indentLevel: 1 },
      { text: '?', indentLevel: 1 },
    ],
  });

  assert.deepEqual(reconcileVerseFormattingWithText(text, formatting), {
    mode: 'poetry',
    lines: [
      { text: 'For to which of the angels did God ever say:', prose: true },
      { text: '“You are My Son;' },
      { text: 'today I have become Your Father”', indentLevel: 1 },
      { text: '?', indentLevel: 1 },
      { text: 'Or again:', prose: true },
      { text: '“I will be His Father,' },
      { text: 'and He will be My Son”', indentLevel: 1 },
      { text: '?', indentLevel: 1 },
    ],
  });
});

test('reconcileVerseFormattingWithText leaves already-complete poetry untouched', () => {
  const text = 'He makes His angels winds, His servants flames of fire.';
  const formatting = normalizeVerseFormatting({
    mode: 'poetry',
    lines: [
      { text: 'He makes His angels winds,' },
      { text: 'His servants flames of fire.', indentLevel: 1 },
    ],
  });
  // Same object back: nothing was missing, so no rebuild and no wasted allocation.
  assert.equal(reconcileVerseFormattingWithText(text, formatting), formatting);
});

test('reconcileVerseFormattingWithText recovers a trailing prose tail', () => {
  const text = '“Cursed be Canaan!” So he said, and departed.';
  const formatting = normalizeVerseFormatting({
    mode: 'poetry',
    lines: [{ text: '“Cursed be Canaan!”' }],
  });
  assert.deepEqual(reconcileVerseFormattingWithText(text, formatting), {
    mode: 'poetry',
    lines: [{ text: '“Cursed be Canaan!”' }, { text: 'So he said, and departed.', prose: true }],
  });
});

test('reconcileVerseFormattingWithText tolerates whitespace differences between text and lines', () => {
  const text = 'Then Lamech said to his wives:\n  “Adah and Zillah,   hear my voice;';
  const formatting = normalizeVerseFormatting({
    mode: 'poetry',
    lines: [{ text: '“Adah and Zillah, hear my voice;' }],
  });
  const result = reconcileVerseFormattingWithText(text, formatting);
  assert.equal(result?.lines[0]?.text, 'Then Lamech said to his wives:');
  assert.equal(result?.lines[0].prose, true);
  assert.equal(result?.lines.length, 2);
});

test('reconcileVerseFormattingWithText bails out when a line is not present in the verse text', () => {
  const text = 'A completely different verse.';
  const formatting = normalizeVerseFormatting({
    mode: 'poetry',
    lines: [{ text: 'Not in the text at all' }],
  });
  // Never guess: if the lines do not line up, keep what was stored rather than mangle it.
  assert.equal(reconcileVerseFormattingWithText(text, formatting), formatting);
});

const JOHN_3_3 =
  'Jesus replied, “Truly, truly, I tell you, no one can see the kingdom of God unless he is born again. ”';

test('normalizeClosingQuoteSpacing removes the stray space before a closing quote', () => {
  assert.equal(
    normalizeClosingQuoteSpacing(JOHN_3_3),
    'Jesus replied, “Truly, truly, I tell you, no one can see the kingdom of God unless he is born again.”'
  );
  assert.equal(
    normalizeClosingQuoteSpacing(
      '“He was a hairy man, ” they answered, “with a leather belt around his waist.” “It was Elijah the Tishbite,” said the king.'
    ),
    '“He was a hairy man,” they answered, “with a leather belt around his waist.” “It was Elijah the Tishbite,” said the king.'
  );
});

test('normalizeClosingQuoteSpacing leaves nested quote pairs and clean text untouched', () => {
  const nested = 'He said, “Go and say, ‘Peace be with you.’ ”';
  assert.equal(normalizeClosingQuoteSpacing(nested), nested);
  const nestedOpen = '“‘Peace.’ ” ’ x';
  assert.equal(normalizeClosingQuoteSpacing(nestedOpen), nestedOpen);
  const clean = 'He said, “Come.” Then ‘go’ now.';
  assert.equal(normalizeClosingQuoteSpacing(clean), clean);
  // An opening quote after a space is not a closing quote.
  assert.equal(normalizeClosingQuoteSpacing('and ’Tis done'), 'and ’Tis done');
});

test('normalizeVerseFormattingQuotes merges a quote-only trailing line (Matthew 2:6)', () => {
  const formatting = {
    mode: 'poetry' as const,
    lines: [
      { text: '‘But you, Bethlehem, in the land of Judah,' },
      { text: 'are by no means least among the rulers of Judah,', indentLevel: 1 },
      { text: 'for out of you will come a ruler' },
      { text: 'who will be the shepherd of My people Israel.’', indentLevel: 1 },
      { text: '”', indentLevel: 1 },
    ],
  };
  const text =
    '‘But you, Bethlehem, in the land of Judah, are by no means least among the rulers of Judah, for out of you will come a ruler who will be the shepherd of My people Israel.’ ”';
  const fixed = reconcileVerseFormattingWithText(
    normalizeClosingQuoteSpacing(text),
    normalizeVerseFormattingQuotes(formatting)
  );
  assert.deepEqual(
    fixed?.lines.map((line) => line.text),
    [
      '‘But you, Bethlehem, in the land of Judah,',
      'are by no means least among the rulers of Judah,',
      'for out of you will come a ruler',
      'who will be the shepherd of My people Israel.’ ”',
    ]
  );
  assert.equal(fixed?.lines[3]?.indentLevel, 1);
});

test('normalizeVerseFormattingQuotes cleans spacing inside lines and returns clean input by identity', () => {
  const dirty = {
    mode: 'lines' as const,
    lines: [{ text: 'Go home, ”' }, { text: '’' }],
  };
  assert.deepEqual(normalizeVerseFormattingQuotes(dirty), {
    mode: 'lines',
    lines: [{ text: 'Go home,” ’' }],
  });
  const clean = { mode: 'poetry' as const, lines: [{ text: 'a’ ”' }, { text: 'b' }] };
  assert.equal(normalizeVerseFormattingQuotes(clean), clean);
  assert.equal(normalizeVerseFormattingQuotes(undefined), undefined);
});
