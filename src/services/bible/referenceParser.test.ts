import test from 'node:test';
import assert from 'node:assert/strict';
import { bibleBooks } from '../../constants/books';
import { ar } from '../../i18n/locales/ar';
import { de } from '../../i18n/locales/de';
import { fr } from '../../i18n/locales/fr';
import { ko } from '../../i18n/locales/ko';
import { zh } from '../../i18n/locales/zh';
import {
  parsePassageReference,
  parsePassageReferenceLocale,
  isSupportedParserLocale,
  type LocalizedBookName,
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

test('opens chapter 1 of a single-chapter book typed with its chapter number', () => {
  // The grammar reads "Jude 1" as the whole book, so these fell through to a word search.
  for (const [query, bookId, label] of [
    ['Jude 1', 'JUD', 'Jude 1'],
    ['Obadiah 1', 'OBA', 'Obadiah 1'],
    ['Philemon 1', 'PHM', 'Philemon 1'],
    ['2 John 1', '2JN', '2 John 1'],
    ['3 John 1', '3JN', '3 John 1'],
  ] as const) {
    assert.deepEqual(parsePassageReference(query), {
      bookId,
      chapter: 1,
      focusVerse: undefined,
      label,
    });
  }
});

test('reads a single-chapter book number as a verse, as the printed references do', () => {
  assert.deepEqual(parsePassageReference('Jude 5'), {
    bookId: 'JUD',
    chapter: 1,
    focusVerse: 5,
    label: 'Jude 1:5',
  });
  assert.deepEqual(parsePassageReference('Jude 1:3'), {
    bookId: 'JUD',
    chapter: 1,
    focusVerse: 3,
    label: 'Jude 1:3',
  });
});

test('still rejects a bare single-chapter book name', () => {
  assert.equal(parsePassageReference('Jude'), null);
  assert.equal(parsePassageReference('Obadiah'), null);
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

// ---------------------------------------------------------------------------
// Native-script and full-width digits
// ---------------------------------------------------------------------------

test('reads a Devanagari-numeral reference typed on a Hindi or Nepali keyboard', () => {
  const expected = { bookId: 'JHN', chapter: 3, focusVerse: 16, label: 'John 3:16' };
  assert.deepEqual(parsePassageReferenceLocale('यूहन्ना ३:१६', 'hi'), expected);
  assert.deepEqual(parsePassageReferenceLocale('यूहन्ना ३:१६', 'ne'), expected);
});

test('reads Bengali, Arabic-Indic and full-width digits and a full-width colon', () => {
  const expected = { bookId: 'JHN', chapter: 3, focusVerse: 16, label: 'John 3:16' };
  assert.deepEqual(parsePassageReferenceLocale('John ৩:১৬', 'bn'), expected);
  assert.deepEqual(parsePassageReferenceLocale('John ٣:١٦', 'ar'), expected);
  assert.deepEqual(parsePassageReferenceLocale('John ۳:۱۶', 'ur'), expected);
  assert.deepEqual(parsePassageReferenceLocale('John ３：１６', 'zh'), expected);
});

test('a single-chapter book typed with a native numeral opens its one chapter', () => {
  assert.deepEqual(parsePassageReferenceLocale('Jude १', 'hi'), {
    bookId: 'JUD',
    chapter: 1,
    focusVerse: undefined,
    label: 'Jude 1',
  });
});

// ---------------------------------------------------------------------------
// Book names in the interface language (no dedicated grammar)
// ---------------------------------------------------------------------------

const interfaceBookNames = (books: Record<string, string>): LocalizedBookName[] =>
  bibleBooks.map((book) => ({ bookId: book.id, name: books[book.id] ?? book.name }));

const frNames = interfaceBookNames(fr.bible.books);

test('reads a reference written with the book names the interface shows', () => {
  assert.deepEqual(parsePassageReferenceLocale('Jean 3:16', 'fr', frNames), {
    bookId: 'JHN',
    chapter: 3,
    focusVerse: 16,
    label: 'John 3:16',
  });
  assert.deepEqual(
    parsePassageReferenceLocale('Johannes 3', 'de', interfaceBookNames(de.bible.books)),
    { bookId: 'JHN', chapter: 3, focusVerse: undefined, label: 'John 3' }
  );
  assert.deepEqual(
    parsePassageReferenceLocale('约翰福音3:16', 'zh', interfaceBookNames(zh.bible.books)),
    { bookId: 'JHN', chapter: 3, focusVerse: 16, label: 'John 3:16' }
  );
  assert.deepEqual(
    parsePassageReferenceLocale('요한복음 3:16', 'ko', interfaceBookNames(ko.bible.books)),
    { bookId: 'JHN', chapter: 3, focusVerse: 16, label: 'John 3:16' }
  );
  assert.deepEqual(
    parsePassageReferenceLocale('يوحنا ٣:١٦', 'ar', interfaceBookNames(ar.bible.books)),
    { bookId: 'JHN', chapter: 3, focusVerse: 16, label: 'John 3:16' }
  );
});

test('an interface book name matches regardless of case and prefers the longest name', () => {
  assert.equal(parsePassageReferenceLocale('jean 3:16', 'fr', frNames)?.bookId, 'JHN');
  assert.equal(parsePassageReferenceLocale('1 Jean 4:8', 'fr', frNames)?.bookId, '1JN');
  assert.deepEqual(parsePassageReferenceLocale('Cantique des cantiques 2', 'fr', frNames), {
    bookId: 'SNG',
    chapter: 2,
    focusVerse: undefined,
    label: 'Song of Solomon 2',
  });
  assert.deepEqual(parsePassageReferenceLocale('Jean 3:16-18', 'fr', frNames)?.focusVerse, 16);
});

test('an interface book name without a valid chapter stays a word search', () => {
  assert.equal(parsePassageReferenceLocale('Jean', 'fr', frNames), null);
  assert.equal(parsePassageReferenceLocale('Jean 22', 'fr', frNames), null);
  assert.equal(parsePassageReferenceLocale('Jean 0', 'fr', frNames), null);
  assert.equal(parsePassageReferenceLocale('Jean 3:', 'fr', frNames), null);
  assert.equal(parsePassageReferenceLocale('Jeanne 3', 'fr', frNames), null);
  assert.equal(parsePassageReferenceLocale('Jean baptiste', 'fr', frNames), null);
});

test('a single-chapter book named in the interface language reads a lone number as a verse', () => {
  assert.deepEqual(parsePassageReferenceLocale('Jude 1', 'fr', frNames), {
    bookId: 'JUD',
    chapter: 1,
    focusVerse: undefined,
    label: 'Jude 1',
  });
  assert.deepEqual(parsePassageReferenceLocale('Jude 5', 'fr', frNames), {
    bookId: 'JUD',
    chapter: 1,
    focusVerse: 5,
    label: 'Jude 1:5',
  });
});
