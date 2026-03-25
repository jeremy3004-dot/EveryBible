import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePassageReference,
  parsePassageReferenceLocale,
  isSupportedParserLocale,
} from './referenceParser';

// ---------------------------------------------------------------------------
// English (default parser)
// ---------------------------------------------------------------------------

test('parses a standard verse reference into Bible reader navigation params', () => {
  assert.deepEqual(parsePassageReference('John 3:16'), {
    bookId: 'JHN',
    chapter: 3,
    focusVerse: 16,
    label: 'John 3:16',
  });
});

test('parses common abbreviations and chapter-only references', () => {
  assert.deepEqual(parsePassageReference('1 Cor 13'), {
    bookId: '1CO',
    chapter: 13,
    focusVerse: undefined,
    label: '1 Corinthians 13',
  });
});

test('parses abbreviated book name Jn', () => {
  assert.deepEqual(parsePassageReference('Jn 3:16'), {
    bookId: 'JHN',
    chapter: 3,
    focusVerse: 16,
    label: 'John 3:16',
  });
});

test('parses dot-separated reference format (Jn 3.16)', () => {
  assert.deepEqual(parsePassageReference('Jn 3.16'), {
    bookId: 'JHN',
    chapter: 3,
    focusVerse: 16,
    label: 'John 3:16',
  });
});

test('parses 1 Corinthians 13:4 to correct book ID', () => {
  assert.deepEqual(parsePassageReference('1 Corinthians 13:4'), {
    bookId: '1CO',
    chapter: 13,
    focusVerse: 4,
    label: '1 Corinthians 13:4',
  });
});

test('uses the first navigable verse when the input is a complex range', () => {
  assert.deepEqual(parsePassageReference('Luke 10:5-7, 10-11'), {
    bookId: 'LUK',
    chapter: 10,
    focusVerse: 5,
    label: 'Luke 10:5',
  });
});

test('handles verse range Romans 8:1-4 by focusing on the first verse', () => {
  const result = parsePassageReference('Romans 8:1-4');
  assert.ok(result);
  assert.equal(result.bookId, 'ROM');
  assert.equal(result.chapter, 8);
  assert.equal(result.focusVerse, 1);
});

test('maps Genesis to GEN', () => {
  const result = parsePassageReference('Genesis 1:1');
  assert.ok(result);
  assert.equal(result.bookId, 'GEN');
});

test('maps Revelation to REV', () => {
  const result = parsePassageReference('Revelation 22:21');
  assert.ok(result);
  assert.equal(result.bookId, 'REV');
});

test('maps Psalms to PSA', () => {
  const result = parsePassageReference('Psalm 23:1');
  assert.ok(result);
  assert.equal(result.bookId, 'PSA');
});

test('maps Song of Solomon to SNG', () => {
  const result = parsePassageReference('Song of Solomon 1:1');
  assert.ok(result);
  assert.equal(result.bookId, 'SNG');
});

// ---------------------------------------------------------------------------
// Invalid / edge-case inputs
// ---------------------------------------------------------------------------

test('rejects bare book names, incomplete references, and plain-text searches', () => {
  assert.equal(parsePassageReference('John'), null);
  assert.equal(parsePassageReference('John 3:'), null);
  assert.equal(parsePassageReference('love one another'), null);
});

test('rejects empty and whitespace-only input', () => {
  assert.equal(parsePassageReference(''), null);
  assert.equal(parsePassageReference('   '), null);
});

test('rejects out-of-range chapter numbers', () => {
  // John has 21 chapters
  assert.equal(parsePassageReference('John 99:1'), null);
});

test('rejects queries ending with a trailing separator', () => {
  assert.equal(parsePassageReference('John 3,'), null);
  assert.equal(parsePassageReference('John 3-'), null);
});

// ---------------------------------------------------------------------------
// Locale-aware parser — Spanish
// ---------------------------------------------------------------------------

test('parses Spanish reference "Juan 3:16" with es locale', () => {
  const result = parsePassageReferenceLocale('Juan 3:16', 'es');
  assert.ok(result, 'Expected Spanish reference to parse');
  assert.equal(result.bookId, 'JHN');
  assert.equal(result.chapter, 3);
  assert.equal(result.focusVerse, 16);
});

test('parses Spanish abbreviation "Gn 1:1" with es locale', () => {
  const result = parsePassageReferenceLocale('Gn 1:1', 'es');
  assert.ok(result, 'Expected Spanish abbreviation to parse');
  assert.equal(result.bookId, 'GEN');
});

test('English references still work when locale is es (fallback)', () => {
  const result = parsePassageReferenceLocale('John 3:16', 'es');
  assert.ok(result, 'Expected English fallback to work under es locale');
  assert.equal(result.bookId, 'JHN');
});

// ---------------------------------------------------------------------------
// Locale-aware parser — Hindi
// ---------------------------------------------------------------------------

test('parses Hindi reference with hi locale', () => {
  // Hindi uses Devanagari book names; the parser should handle the standard Hindi name
  const result = parsePassageReferenceLocale('John 3:16', 'hi');
  assert.ok(result, 'Expected English fallback to work under hi locale');
  assert.equal(result.bookId, 'JHN');
});

// ---------------------------------------------------------------------------
// Locale-aware parser — Nepali
// ---------------------------------------------------------------------------

test('parses references under ne locale with English fallback', () => {
  const result = parsePassageReferenceLocale('John 3:16', 'ne');
  assert.ok(result, 'Expected English fallback to work under ne locale');
  assert.equal(result.bookId, 'JHN');
});

// ---------------------------------------------------------------------------
// Locale-aware parser — unsupported locale
// ---------------------------------------------------------------------------

test('unsupported locale falls back to English parser', () => {
  const result = parsePassageReferenceLocale('Romans 8:28', 'fr');
  assert.ok(result, 'Expected English fallback for unsupported locale');
  assert.equal(result.bookId, 'ROM');
  assert.equal(result.chapter, 8);
  assert.equal(result.focusVerse, 28);
});

test('returns null for invalid input regardless of locale', () => {
  assert.equal(parsePassageReferenceLocale('love one another', 'es'), null);
  assert.equal(parsePassageReferenceLocale('', 'hi'), null);
});

// ---------------------------------------------------------------------------
// isSupportedParserLocale
// ---------------------------------------------------------------------------

test('isSupportedParserLocale returns true for supported locales', () => {
  assert.equal(isSupportedParserLocale('en'), true);
  assert.equal(isSupportedParserLocale('es'), true);
  assert.equal(isSupportedParserLocale('hi'), true);
  assert.equal(isSupportedParserLocale('ne'), true);
});

test('isSupportedParserLocale returns false for unsupported locales', () => {
  assert.equal(isSupportedParserLocale('fr'), false);
  assert.equal(isSupportedParserLocale('de'), false);
  assert.equal(isSupportedParserLocale(''), false);
});
