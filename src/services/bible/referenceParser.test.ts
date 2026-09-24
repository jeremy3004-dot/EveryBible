import test from 'node:test';
import assert from 'node:assert/strict';
import { bibleBooks } from '../../constants/books';
import { localeLoaders } from '../../i18n/localeLoaders';
import { ar } from '../../i18n/locales/ar';
import { de } from '../../i18n/locales/de';
import { fr } from '../../i18n/locales/fr';
import { ja } from '../../i18n/locales/ja';
import { ko } from '../../i18n/locales/ko';
import { ne } from '../../i18n/locales/ne';
import { pt } from '../../i18n/locales/pt';
import { tr } from '../../i18n/locales/tr';
import { vi } from '../../i18n/locales/vi';
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

test('reads the chapter-and-verse counters Chinese, Japanese and Korean references use', () => {
  const john316 = { bookId: 'JHN', chapter: 3, focusVerse: 16, label: 'John 3:16' };
  const zhNames = interfaceBookNames(zh.bible.books);
  const koNames = interfaceBookNames(ko.bible.books);
  const jaNames = interfaceBookNames(ja.bible.books);

  assert.deepEqual(parsePassageReferenceLocale('约翰福音3章16节', 'zh', zhNames), john316);
  assert.deepEqual(parsePassageReferenceLocale('约翰福音 3章', 'zh', zhNames), {
    bookId: 'JHN',
    chapter: 3,
    focusVerse: undefined,
    label: 'John 3',
  });
  assert.deepEqual(parsePassageReferenceLocale('ヨハネの福音書3章16節', 'ja', jaNames), john316);
  assert.deepEqual(parsePassageReferenceLocale('요한복음 3장 16절', 'ko', koNames), john316);
  assert.equal(parsePassageReferenceLocale('시편 23편', 'ko', koNames)?.chapter, 23);
  assert.equal(parsePassageReferenceLocale('约翰福音 3节', 'zh', zhNames), null);
});

test('a reference typed with interface book names is checked against the verse counts', () => {
  const enNames = bibleBooks.map((book) => ({ bookId: book.id, name: book.name }));
  // John 3 has 36 verses.
  assert.equal(parsePassageReferenceLocale('John 3:99', 'en', enNames), null);
  assert.equal(parsePassageReferenceLocale('Jean 3:99', 'fr', frNames), null);
  assert.equal(parsePassageReferenceLocale('Jean 3:36', 'fr', frNames)?.focusVerse, 36);
});

test('Nepali interface book names the Nepali grammar does not know still open the passage', () => {
  // The app calls Psalms भजनसङ्ग्रह and Acts प्रेरितका काम; the grammar knew neither.
  const neNames = interfaceBookNames(ne.bible.books);
  assert.deepEqual(parsePassageReferenceLocale('भजनसङ्ग्रह २३', 'ne', neNames), {
    bookId: 'PSA',
    chapter: 23,
    focusVerse: undefined,
    label: 'Psalms 23',
  });
  assert.equal(parsePassageReferenceLocale('प्रेरितका काम 2:4', 'ne', neNames)?.bookId, 'ACT');
  assert.equal(parsePassageReferenceLocale('एफेसी 2:8', 'ne', neNames)?.bookId, 'EPH');
});

test('every interface language opens every book by the name the app shows for it', async () => {
  for (const [code, load] of Object.entries(localeLoaders)) {
    const resource = (await load()) as { bible: { books: Record<string, string> } };
    const names = interfaceBookNames(resource.bible.books);
    for (const { bookId, name } of names) {
      const book = bibleBooks.find((candidate) => candidate.id === bookId);
      const first = parsePassageReferenceLocale(`${name} 1:1`, code, names);
      const last = parsePassageReferenceLocale(`${name} ${book?.chapters}`, code, names);
      assert.equal(first?.bookId, bookId, `${code}: ${name} 1:1`);
      assert.equal(last?.bookId, bookId, `${code}: ${name} ${book?.chapters}`);
    }
  }
});

test('an interface book name typed without its accents or with a plain apostrophe still opens', () => {
  const ptNames = interfaceBookNames(pt.bible.books);
  const viNames = interfaceBookNames(vi.bible.books);
  const trNames = interfaceBookNames(tr.bible.books);

  assert.equal(parsePassageReferenceLocale('Joao 3:16', 'pt', ptNames)?.bookId, 'JHN');
  assert.equal(parsePassageReferenceLocale('Genese 1', 'fr', frNames)?.bookId, 'GEN');
  assert.equal(parsePassageReferenceLocale('Esaie 53', 'fr', frNames)?.bookId, 'ISA');
  assert.equal(parsePassageReferenceLocale('Giang 3:16', 'vi', viNames)?.bookId, 'JHN');
  assert.equal(parsePassageReferenceLocale('E-sai 53', 'vi', viNames)?.bookId, 'ISA');
  assert.equal(parsePassageReferenceLocale('Giu-de 1', 'vi', viNames)?.bookId, 'JUD');
  assert.equal(parsePassageReferenceLocale("Mısır'dan Çıkış 20", 'tr', trNames)?.bookId, 'EXO');
});

test('an interface book name reads chapter and verse separated by a space, like English', () => {
  // The English grammar reads "john 3 16" as John 3:16; "Jean 3 16" was a word search.
  assert.equal(parsePassageReferenceLocale('Jean 3 16', 'fr', frNames)?.focusVerse, 16);
  assert.equal(
    parsePassageReferenceLocale('Johannes 3 16', 'de', interfaceBookNames(de.bible.books))
      ?.focusVerse,
    16
  );
});

test('a reference copied with its sentence-ending punctuation still opens', () => {
  const john316 = { bookId: 'JHN', chapter: 3, focusVerse: 16, label: 'John 3:16' };
  assert.deepEqual(parsePassageReferenceLocale('John 3:16.', 'en'), john316);
  assert.deepEqual(parsePassageReferenceLocale('Jean 3:16.', 'fr', frNames), john316);
  assert.deepEqual(
    parsePassageReferenceLocale('约翰福音3:16。', 'zh', interfaceBookNames(zh.bible.books)),
    john316
  );
});

test('a German numbered book opens with or without the period after its number', () => {
  const deNames = interfaceBookNames(de.bible.books);
  // The app shows "1. Korinther"; "1 Korinther 13" and "1Kor..." style input omit the period.
  assert.equal(parsePassageReferenceLocale('1 Korinther 13', 'de', deNames)?.bookId, '1CO');
  assert.equal(parsePassageReferenceLocale('1. Korinther 13', 'de', deNames)?.bookId, '1CO');
  assert.equal(parsePassageReferenceLocale('1Korinther 13', 'de', deNames)?.bookId, '1CO');
  assert.equal(parsePassageReferenceLocale('1 Johannes 4:8', 'de', deNames)?.bookId, '1JN');
  assert.equal(parsePassageReferenceLocale('Johannes 4:8', 'de', deNames)?.bookId, 'JHN');
  assert.equal(parsePassageReferenceLocale('1 Mose 1', 'de', deNames)?.bookId, 'GEN');
});

test('a Russian numbered book opens with a bare number', async () => {
  const { ru } = await import('../../i18n/locales/ru');
  const ruNames = interfaceBookNames(ru.bible.books);
  // The app shows "1-е Коринфянам"; people type "1 Коринфянам 13".
  assert.equal(parsePassageReferenceLocale('1 Коринфянам 13', 'ru', ruNames)?.bookId, '1CO');
  assert.equal(parsePassageReferenceLocale('1-е Коринфянам 13', 'ru', ruNames)?.bookId, '1CO');
  assert.equal(parsePassageReferenceLocale('2 Петра 1:3', 'ru', ruNames)?.bookId, '2PE');
});
