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

test('normalizeVerseFormattingQuotes merges a punctuation-only line (Psalm 4:2)', () => {
  const formatting = {
    mode: 'poetry' as const,
    lines: [
      { text: 'How long, O men, will my honor be maligned?' },
      { text: 'How long will you love vanity and seek after lies', indentLevel: 1 },
      { text: '?', indentLevel: 1 },
    ],
  };
  const text =
    'How long, O men, will my honor be maligned? How long will you love vanity and seek after lies ? Selah';
  const fixed = reconcileVerseFormattingWithText(
    normalizeClosingQuoteSpacing(text),
    normalizeVerseFormattingQuotes(formatting)
  );
  assert.deepEqual(
    fixed?.lines.map((line) => line.text),
    [
      'How long, O men, will my honor be maligned?',
      'How long will you love vanity and seek after lies?',
      'Selah',
    ]
  );
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

test('normalizeVerseFormatting skips a null line and keeps the rest', () => {
  assert.deepEqual(normalizeVerseFormatting({ mode: 'lines', lines: [null, { text: 'kept' }] }), {
    mode: 'lines',
    lines: [{ text: 'kept' }],
  });
});

test('normalizeVerseFormatting rejects an object without a lines array', () => {
  assert.equal(normalizeVerseFormatting({ mode: 'poetry' }), undefined);
  assert.equal(normalizeVerseFormatting({ mode: 'poetry', lines: 'not a list' }), undefined);
});

test('normalizeVerseFormatting keeps a prose flag and adds none to other lines', () => {
  assert.deepEqual(
    normalizeVerseFormatting({
      mode: 'poetry',
      lines: [
        { text: 'lead-in', prose: true },
        { text: 'verse line', prose: false },
      ],
    }),
    { mode: 'poetry', lines: [{ text: 'lead-in', prose: true }, { text: 'verse line' }] }
  );
});

test('normalizeVerseFormatting drops an indent that is not a finite number', () => {
  assert.deepEqual(
    normalizeVerseFormatting({ mode: 'poetry', lines: [{ text: 'a', indentLevel: Infinity }] }),
    { mode: 'poetry', lines: [{ text: 'a' }] }
  );
});

// The reader parses the stored JSON of every verse on every chapter load; the cache
// reuses one parsed object per string, and stays bounded across a whole Bible read.
const formattingJson = (id: string) => JSON.stringify({ mode: 'lines', lines: [{ text: id }] });

test('the same stored formatting string parses to the same object every time', () => {
  const raw = formattingJson('cache identity');

  assert.equal(normalizeVerseFormatting(raw), normalizeVerseFormatting(raw));
});

test('the formatting cache keeps the 256 most recently used strings', () => {
  const raws = Array.from({ length: 257 }, (_, index) => formattingJson(`lru ${index}`));
  const first = raws.slice(0, 256).map((raw) => normalizeVerseFormatting(raw));
  assert.equal(normalizeVerseFormatting(raws[0]), first[0], 'all 256 still cached');

  // raws[0] was just used again, so the 257th string evicts raws[1], the least recent.
  normalizeVerseFormatting(raws[256]);

  assert.equal(normalizeVerseFormatting(raws[0]), first[0]);
  const reparsed = normalizeVerseFormatting(raws[1]);
  assert.notEqual(reparsed, first[1]);
  assert.deepEqual(reparsed, first[1]);
});

test('reconcileVerseFormattingWithText returns formatting unchanged without lines or text', () => {
  const empty = { mode: 'poetry' as const, lines: [] };
  const formatting = normalizeVerseFormatting({ mode: 'poetry', lines: [{ text: 'a line' }] });

  assert.equal(reconcileVerseFormattingWithText('Some verse text.', empty), empty);
  assert.equal(reconcileVerseFormattingWithText(null as unknown as string, formatting), formatting);
});

test('reconcileVerseFormattingWithText finds a one-word line whose mark has a stray space', () => {
  const text = 'How long will you love vanity and seek after lies ? Selah';
  const formatting = normalizeVerseFormatting({
    mode: 'poetry',
    lines: [{ text: 'How long will you love vanity and seek after' }, { text: 'lies?' }],
  });

  assert.deepEqual(reconcileVerseFormattingWithText(text, formatting), {
    mode: 'poetry',
    lines: [
      { text: 'How long will you love vanity and seek after' },
      { text: 'lies?' },
      { text: 'Selah', prose: true },
    ],
  });
});

test('reconcileVerseFormattingWithText reinstates one-character runs around the lines', () => {
  const text = 'O give thanks to the LORD, for He is good. A';
  const formatting = normalizeVerseFormatting({
    mode: 'poetry',
    lines: [{ text: 'give thanks to the LORD, for He is good.' }],
  });

  assert.deepEqual(reconcileVerseFormattingWithText(text, formatting), {
    mode: 'poetry',
    lines: [
      { text: 'O', prose: true },
      { text: 'give thanks to the LORD, for He is good.' },
      { text: 'A', prose: true },
    ],
  });
});

test('normalizeVerseFormattingQuotes fixes a stray quote space inside a line with nothing to fold', () => {
  const formatting = { mode: 'lines' as const, lines: [{ text: 'you must be born again. ”' }] };

  assert.deepEqual(normalizeVerseFormattingQuotes(formatting), {
    mode: 'lines',
    lines: [{ text: 'you must be born again.”' }],
  });
});
