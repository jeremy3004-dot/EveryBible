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
const parseWithParser = (
  query: string,
  parser: bcv_parser,
): PassageReferenceTarget | null => {
  const normalizedQuery = query.trim();
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
  if (!parsedToken || !parsedToken[2]) {
    return null;
  }

  const [, osisBookId, chapterValue, verseValue] = parsedToken;
  const bookId = OSIS_TO_BOOK_ID[osisBookId];
  const chapter = Number(chapterValue);
  const focusVerse = verseValue ? Number(verseValue) : undefined;
  const book = bookId ? getBookById(bookId) : undefined;

  if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) {
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
 * as a secondary fallback so that English references still work regardless of UI language.
 */
export const parsePassageReferenceLocale = (
  query: string,
  locale: string,
): PassageReferenceTarget | null => {
  const parserLocale: ReferenceParserLocale = isSupportedParserLocale(locale) ? locale : 'en';

  // Try the locale-specific parser first.
  const result = parseWithParser(query, getParser(parserLocale));
  if (result) {
    return result;
  }

  // If the locale parser didn't match and it wasn't already English, try English as fallback.
  if (parserLocale !== 'en') {
    return parseWithParser(query, getParser('en'));
  }

  return null;
};
