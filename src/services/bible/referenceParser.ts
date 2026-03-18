import { bcv_parser } from 'bible-passage-reference-parser/esm/bcv_parser.js';
import * as englishReferenceParser from 'bible-passage-reference-parser/esm/lang/en.js';
import { getBookById } from '../../constants/books';

export interface PassageReferenceTarget {
  bookId: string;
  chapter: number;
  focusVerse?: number;
  label: string;
}

const OSIS_SEGMENT_PATTERN = /^([1-3]?[A-Za-z]+)(?:\.(\d+))?(?:\.(\d+))?$/;
const bibleReferenceParser = new bcv_parser(englishReferenceParser);

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

export const parsePassageReference = (query: string): PassageReferenceTarget | null => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0 || /[:,-]\s*$/.test(normalizedQuery)) {
    return null;
  }

  const parserResult = bibleReferenceParser.parse(normalizedQuery);
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
