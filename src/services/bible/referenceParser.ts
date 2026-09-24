import { bcv_parser } from 'bible-passage-reference-parser/esm/bcv_parser.js';
import * as langEn from 'bible-passage-reference-parser/esm/lang/en.js';
import * as langEs from 'bible-passage-reference-parser/esm/lang/es.js';
import * as langHi from 'bible-passage-reference-parser/esm/lang/hi.js';
import * as langNe from 'bible-passage-reference-parser/esm/lang/ne.js';
import { getBookById } from '../../constants/books';

export interface PassageReferenceTarget {
  bookId: string;
  chapter: number;
  focusVerse?: number;
  label: string;
}

/**
 * Locale codes for which a dedicated bible-passage-reference-parser grammar is available.
 * Unsupported locales fall through to English.
 */
export type ReferenceParserLocale = 'en' | 'es' | 'hi' | 'ne';

const OSIS_SEGMENT_PATTERN = /^([1-3]?[A-Za-z]+)(?:\.(\d+))?(?:\.(\d+))?$/;

// The grammars only read ASCII digits, but Hindi, Nepali, Bengali, Arabic and Urdu keyboards
// type their own numerals and Chinese/Japanese IMEs type full-width ones, so "यूहन्ना ३:१६" or
// "John ３：１６" was treated as a word search. Each block is ten contiguous code points from its
// zero; every replacement is one UTF-16 unit, so match indices still line up with the query.
const NATIVE_DIGIT_ZEROS = [
  0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0e50,
  0x0ed0, 0x1040, 0x17e0, 0xff10,
];
const NATIVE_DIGIT_OR_COLON_PATTERN =
  /[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F\u09E6-\u09EF\u0A66-\u0A6F\u0AE6-\u0AEF\u0B66-\u0B6F\u0BE6-\u0BEF\u0C66-\u0C6F\u0CE6-\u0CEF\u0D66-\u0D6F\u0E50-\u0E59\u0ED0-\u0ED9\u1040-\u1049\u17E0-\u17E9\uFF10-\uFF19\uFF1A]/g;

const toAsciiDigitOrColon = (character: string): string => {
  const code = character.charCodeAt(0);
  if (code === 0xff1a) {
    return ':';
  }
  const zero = NATIVE_DIGIT_ZEROS.find((start) => code >= start && code < start + 10);
  return zero === undefined ? character : String(code - zero);
};

// A reference copied from a sentence keeps its full stop ("John 3:16.", "约翰福音3:16。").
const TRAILING_SENTENCE_PUNCTUATION_PATTERN = /[.。．!?！？;；]+$/;

const trimReferenceQuery = (query: string): string =>
  query.trim().replace(TRAILING_SENTENCE_PUNCTUATION_PATTERN, '').trimEnd();

const normalizeReferenceNumerals = (query: string): string =>
  query.replace(NATIVE_DIGIT_OR_COLON_PATTERN, toAsciiDigitOrColon);

/** One parser instance per supported locale, lazily built on first access. */
const parserCache = new Map<ReferenceParserLocale, bcv_parser>();

const LANG_MODULES: Record<ReferenceParserLocale, typeof langEn> = {
  en: langEn,
  es: langEs,
  hi: langHi,
  ne: langNe,
};

const getParser = (locale: ReferenceParserLocale): bcv_parser => {
  let parser = parserCache.get(locale);
  if (!parser) {
    parser = new bcv_parser(LANG_MODULES[locale]);
    parserCache.set(locale, parser);
  }
  return parser;
};

const OSIS_TO_BOOK_ID: Record<string, string> = {
  Gen: 'GEN',
  Exod: 'EXO',
  Lev: 'LEV',
  Num: 'NUM',
  Deut: 'DEU',
  Josh: 'JOS',
  Judg: 'JDG',
  Ruth: 'RUT',
  '1Sam': '1SA',
  '2Sam': '2SA',
  '1Kgs': '1KI',
  '2Kgs': '2KI',
  '1Chr': '1CH',
  '2Chr': '2CH',
  Ezra: 'EZR',
  Neh: 'NEH',
  Esth: 'EST',
  Job: 'JOB',
  Ps: 'PSA',
  Prov: 'PRO',
  Eccl: 'ECC',
  Song: 'SNG',
  Isa: 'ISA',
  Jer: 'JER',
  Lam: 'LAM',
  Ezek: 'EZK',
  Dan: 'DAN',
  Hos: 'HOS',
  Joel: 'JOL',
  Amos: 'AMO',
  Obad: 'OBA',
  Jonah: 'JON',
  Mic: 'MIC',
  Nah: 'NAM',
  Hab: 'HAB',
  Zeph: 'ZEP',
  Hag: 'HAG',
  Zech: 'ZEC',
  Mal: 'MAL',
  Matt: 'MAT',
  Mark: 'MRK',
  Luke: 'LUK',
  John: 'JHN',
  Acts: 'ACT',
  Rom: 'ROM',
  '1Cor': '1CO',
  '2Cor': '2CO',
  Gal: 'GAL',
  Eph: 'EPH',
  Phil: 'PHP',
  Col: 'COL',
  '1Thess': '1TH',
  '2Thess': '2TH',
  '1Tim': '1TI',
  '2Tim': '2TI',
  Titus: 'TIT',
  Phlm: 'PHM',
  Heb: 'HEB',
  Jas: 'JAS',
  '1Pet': '1PE',
  '2Pet': '2PE',
  '1John': '1JN',
  '2John': '2JN',
  '3John': '3JN',
  Jude: 'JUD',
  Rev: 'REV',
};

const getFirstOsisToken = (osis: string): string | null => {
  const [firstReference] = osis.split(',');
  if (!firstReference) {
    return null;
  }

  const [firstRangeStart] = firstReference.split('-');
  return firstRangeStart ?? null;
};

/**
 * Returns true when the given string maps to a supported parser locale.
 * Useful for narrowing an arbitrary language code before passing it to the parser.
 */
export const isSupportedParserLocale = (code: string): code is ReferenceParserLocale =>
  code === 'en' || code === 'es' || code === 'hi' || code === 'ne';

/**
 * Attempt to parse a natural-language Bible reference using the specified locale parser.
 * Falls back to the English parser when the locale is not directly supported.
 */
const parseWithParser = (query: string, parser: bcv_parser): PassageReferenceTarget | null => {
  const normalizedQuery = normalizeReferenceNumerals(trimReferenceQuery(query));
  if (normalizedQuery.length === 0 || /[:,-]\s*$/.test(normalizedQuery)) {
    return null;
  }

  const parserResult = parser.parse(normalizedQuery);
  const [match] = parserResult.osis_and_indices();

  if (!match || match.indices[0] !== 0 || match.indices[1] !== normalizedQuery.length) {
    return null;
  }

  const firstOsisToken = getFirstOsisToken(match.osis);
  if (!firstOsisToken) {
    return null;
  }

  const parsedToken = firstOsisToken.match(OSIS_SEGMENT_PATTERN);
  if (!parsedToken) {
    return null;
  }

  const [, osisBookId = '', chapterValue, verseValue] = parsedToken;
  const bookId = OSIS_TO_BOOK_ID[osisBookId];
  const book = bookId ? getBookById(bookId) : undefined;
  // The grammar reports "Jude 1" as the whole book (OSIS "Jude"). A bare book name stays a
  // word search, but a single-chapter book typed with a number means its one chapter.
  const isSingleChapterBookWithNumber =
    !chapterValue && book?.chapters === 1 && /\p{Nd}$/u.test(normalizedQuery);
  if (!chapterValue && !isSingleChapterBookWithNumber) {
    return null;
  }

  const chapter = chapterValue ? Number(chapterValue) : 1;
  const focusVerse = verseValue ? Number(verseValue) : undefined;

  if (!bookId || !book || !Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) {
    return null;
  }

  const label = focusVerse ? `${book.name} ${chapter}:${focusVerse}` : `${book.name} ${chapter}`;

  return {
    bookId,
    chapter,
    focusVerse,
    label,
  };
};

/** A book's name as the interface shows it (`bible.books.<id>` in the current locale). */
export interface LocalizedBookName {
  bookId: string;
  name: string;
}

type PreparedBookName = { bookId: string; names: string[] };

// After the book name: a chapter, an optional verse (after ":", "." or a space, as the English
// grammar reads "john 3 16"), and an optional range end, which is ignored like the grammar's
// ranges are. Digits are already ASCII (normalizeReferenceNumerals).
// Chinese, Japanese and Korean write "3章16节", "3章16節" and "3장 16절" (a psalm is 편/篇).
const LOCALIZED_REFERENCE_NUMBERS_PATTERN =
  /^\s*(\d{1,3})(?:\s*[章장篇편](?:\s*(\d{1,3})\s*[节節절]?)?|(?:\s*[:.]\s*|\s+)(\d{1,3}))?(?:\s*[-–—~～]\s*\d{1,3}(?:\s*[:.]\s*\d{1,3})?\s*[章장篇편节節절]?)?\s*$/;
const WHITESPACE_RUN_PATTERN = /\s+/g;

const MAX_NAMED_REFERENCE_LENGTH = 80;

const preparedBookNamesCache = new WeakMap<readonly LocalizedBookName[], PreparedBookName[]>();

// Accents and apostrophes are optional in what people type: "Joao", "Genese", "Giang" and
// "Mısır'dan" are João, Genèse, Giăng and Mısır’dan. Only the Latin/Greek/Cyrillic combining
// block is removed, so Devanagari, Arabic or kana marks stay part of the name.
const LATIN_COMBINING_MARKS_PATTERN = /[\u0300-\u036f]/g;
const APOSTROPHE_VARIANTS_PATTERN = /[’ʼ]/g;

const foldForNameMatch = (text: string): string =>
  text
    .normalize('NFD')
    .replace(LATIN_COMBINING_MARKS_PATTERN, '')
    .normalize('NFC')
    .replace(WHITESPACE_RUN_PATTERN, ' ')
    .replace(APOSTROPHE_VARIANTS_PATTERN, "'")
    .toLowerCase()
    .replace(/đ/g, 'd');

// Folded once per list, longest first so "1 Jean" wins over "Jean". A hyphenated name
// (Vietnamese "Ê-sai") also matches with a space or with nothing in place of each hyphen, and
// any name matches without its spaces ("1Jean 4:8").
const prepareBookNames = (bookNames: readonly LocalizedBookName[]): PreparedBookName[] => {
  let prepared = preparedBookNamesCache.get(bookNames);
  if (!prepared) {
    prepared = bookNames
      .map(({ bookId, name }) => {
        const folded = foldForNameMatch(name.trim());
        const spaced = folded.replace(/-/g, ' ');
        return {
          bookId,
          names: [...new Set([folded, spaced, folded.replace(/[\s-]/g, '')])],
        };
      })
      .filter((entry) => entry.names[0] !== '')
      .sort((left, right) => (right.names[0]?.length ?? 0) - (left.names[0]?.length ?? 0));
    preparedBookNamesCache.set(bookNames, prepared);
  }
  return prepared;
};

// The grammars cover four languages; everywhere else the app already shows every book's name
// in the interface language, so "Jean 3:16" or "约翰福音3:16" is read against those names.
const parseWithBookNames = (
  query: string,
  bookNames: readonly LocalizedBookName[]
): PassageReferenceTarget | null => {
  // The longest book name with a chapter, verse and range fits well within this; a pasted
  // paragraph is not normalised on every keystroke.
  if (query.length > MAX_NAMED_REFERENCE_LENGTH) {
    return null;
  }
  const normalizedQuery = foldForNameMatch(normalizeReferenceNumerals(trimReferenceQuery(query)));
  if (normalizedQuery.length === 0) {
    return null;
  }

  for (const { bookId, names } of prepareBookNames(bookNames)) {
    const name = names.find((candidate) => normalizedQuery.startsWith(candidate));
    if (name === undefined) {
      continue;
    }
    const numbers = normalizedQuery.slice(name.length).match(LOCALIZED_REFERENCE_NUMBERS_PATTERN);
    const book = getBookById(bookId);
    if (!numbers || !book) {
      continue;
    }

    const first = Number(numbers[1]);
    const verseDigits = numbers[2] ?? numbers[3];
    // Restated with the English name, the English grammar checks the chapter and verse against
    // the book's real counts (John 3 has 36 verses) and reads a lone number after a one-chapter
    // book as a verse, exactly as for a reference typed in English.
    const englishReference =
      verseDigits === undefined
        ? `${book.name} ${first}`
        : `${book.name} ${first}:${Number(verseDigits)}`;
    return parseWithParser(englishReference, getParser('en'));
  }

  return null;
};

/**
 * Parse a Bible reference using the English parser (default, backward-compatible).
 */
export const parsePassageReference = (query: string): PassageReferenceTarget | null => {
  return parseWithParser(query, getParser('en'));
};

/**
 * Parse a Bible reference using a locale-specific parser, falling back to English
 * if the locale has no dedicated grammar.
 *
 * When the locale-specific parser does not find a match, the English parser is tried
 * as a secondary fallback so that English references still work regardless of UI language,
 * and then `bookNames`, the book names the interface shows, which the grammars do not cover
 * for 17 languages and only partly for Nepali.
 */
export const parsePassageReferenceLocale = (
  query: string,
  locale: string,
  bookNames?: readonly LocalizedBookName[]
): PassageReferenceTarget | null => {
  const parserLocale: ReferenceParserLocale = isSupportedParserLocale(locale) ? locale : 'en';

  // Try the locale-specific parser first.
  const result = parseWithParser(query, getParser(parserLocale));
  if (result) {
    return result;
  }

  // If the locale parser didn't match and it wasn't already English, try English as fallback.
  if (parserLocale !== 'en') {
    const englishResult = parseWithParser(query, getParser('en'));
    if (englishResult) {
      return englishResult;
    }
  }

  return bookNames ? parseWithBookNames(query, bookNames) : null;
};
