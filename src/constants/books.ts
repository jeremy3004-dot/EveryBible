export type Testament = 'OT' | 'NT';

export interface BibleBook {
  id: string;
  name: string;
  abbreviation: string;
  testament: Testament;
  chapters: number;
  order: number;
}

export const bibleBooks: BibleBook[] = [
  // Old Testament
  { id: 'GEN', name: 'Genesis', abbreviation: 'Gen', testament: 'OT', chapters: 50, order: 1 },
  { id: 'EXO', name: 'Exodus', abbreviation: 'Exod', testament: 'OT', chapters: 40, order: 2 },
  { id: 'LEV', name: 'Leviticus', abbreviation: 'Lev', testament: 'OT', chapters: 27, order: 3 },
  { id: 'NUM', name: 'Numbers', abbreviation: 'Num', testament: 'OT', chapters: 36, order: 4 },
  { id: 'DEU', name: 'Deuteronomy', abbreviation: 'Deut', testament: 'OT', chapters: 34, order: 5 },
  { id: 'JOS', name: 'Joshua', abbreviation: 'Josh', testament: 'OT', chapters: 24, order: 6 },
  { id: 'JDG', name: 'Judges', abbreviation: 'Judg', testament: 'OT', chapters: 21, order: 7 },
  { id: 'RUT', name: 'Ruth', abbreviation: 'Ruth', testament: 'OT', chapters: 4, order: 8 },
  { id: '1SA', name: '1 Samuel', abbreviation: '1 Sam', testament: 'OT', chapters: 31, order: 9 },
  { id: '2SA', name: '2 Samuel', abbreviation: '2 Sam', testament: 'OT', chapters: 24, order: 10 },
  { id: '1KI', name: '1 Kings', abbreviation: '1 Kgs', testament: 'OT', chapters: 22, order: 11 },
  { id: '2KI', name: '2 Kings', abbreviation: '2 Kgs', testament: 'OT', chapters: 25, order: 12 },
  {
    id: '1CH',
    name: '1 Chronicles',
    abbreviation: '1 Chr',
    testament: 'OT',
    chapters: 29,
    order: 13,
  },
  {
    id: '2CH',
    name: '2 Chronicles',
    abbreviation: '2 Chr',
    testament: 'OT',
    chapters: 36,
    order: 14,
  },
  { id: 'EZR', name: 'Ezra', abbreviation: 'Ezra', testament: 'OT', chapters: 10, order: 15 },
  { id: 'NEH', name: 'Nehemiah', abbreviation: 'Neh', testament: 'OT', chapters: 13, order: 16 },
  { id: 'EST', name: 'Esther', abbreviation: 'Esth', testament: 'OT', chapters: 10, order: 17 },
  { id: 'JOB', name: 'Job', abbreviation: 'Job', testament: 'OT', chapters: 42, order: 18 },
  { id: 'PSA', name: 'Psalms', abbreviation: 'Ps', testament: 'OT', chapters: 150, order: 19 },
  { id: 'PRO', name: 'Proverbs', abbreviation: 'Prov', testament: 'OT', chapters: 31, order: 20 },
  {
    id: 'ECC',
    name: 'Ecclesiastes',
    abbreviation: 'Eccl',
    testament: 'OT',
    chapters: 12,
    order: 21,
  },
  {
    id: 'SNG',
    name: 'Song of Solomon',
    abbreviation: 'Song',
    testament: 'OT',
    chapters: 8,
    order: 22,
  },
  { id: 'ISA', name: 'Isaiah', abbreviation: 'Isa', testament: 'OT', chapters: 66, order: 23 },
  { id: 'JER', name: 'Jeremiah', abbreviation: 'Jer', testament: 'OT', chapters: 52, order: 24 },
  { id: 'LAM', name: 'Lamentations', abbreviation: 'Lam', testament: 'OT', chapters: 5, order: 25 },
  { id: 'EZK', name: 'Ezekiel', abbreviation: 'Ezek', testament: 'OT', chapters: 48, order: 26 },
  { id: 'DAN', name: 'Daniel', abbreviation: 'Dan', testament: 'OT', chapters: 12, order: 27 },
  { id: 'HOS', name: 'Hosea', abbreviation: 'Hos', testament: 'OT', chapters: 14, order: 28 },
  { id: 'JOL', name: 'Joel', abbreviation: 'Joel', testament: 'OT', chapters: 3, order: 29 },
  { id: 'AMO', name: 'Amos', abbreviation: 'Amos', testament: 'OT', chapters: 9, order: 30 },
  { id: 'OBA', name: 'Obadiah', abbreviation: 'Obad', testament: 'OT', chapters: 1, order: 31 },
  { id: 'JON', name: 'Jonah', abbreviation: 'Jonah', testament: 'OT', chapters: 4, order: 32 },
  { id: 'MIC', name: 'Micah', abbreviation: 'Mic', testament: 'OT', chapters: 7, order: 33 },
  { id: 'NAM', name: 'Nahum', abbreviation: 'Nah', testament: 'OT', chapters: 3, order: 34 },
  { id: 'HAB', name: 'Habakkuk', abbreviation: 'Hab', testament: 'OT', chapters: 3, order: 35 },
  { id: 'ZEP', name: 'Zephaniah', abbreviation: 'Zeph', testament: 'OT', chapters: 3, order: 36 },
  { id: 'HAG', name: 'Haggai', abbreviation: 'Hag', testament: 'OT', chapters: 2, order: 37 },
  { id: 'ZEC', name: 'Zechariah', abbreviation: 'Zech', testament: 'OT', chapters: 14, order: 38 },
  { id: 'MAL', name: 'Malachi', abbreviation: 'Mal', testament: 'OT', chapters: 4, order: 39 },

  // New Testament
  { id: 'MAT', name: 'Matthew', abbreviation: 'Matt', testament: 'NT', chapters: 28, order: 40 },
  { id: 'MRK', name: 'Mark', abbreviation: 'Mark', testament: 'NT', chapters: 16, order: 41 },
  { id: 'LUK', name: 'Luke', abbreviation: 'Luke', testament: 'NT', chapters: 24, order: 42 },
  { id: 'JHN', name: 'John', abbreviation: 'John', testament: 'NT', chapters: 21, order: 43 },
  { id: 'ACT', name: 'Acts', abbreviation: 'Acts', testament: 'NT', chapters: 28, order: 44 },
  { id: 'ROM', name: 'Romans', abbreviation: 'Rom', testament: 'NT', chapters: 16, order: 45 },
  {
    id: '1CO',
    name: '1 Corinthians',
    abbreviation: '1 Cor',
    testament: 'NT',
    chapters: 16,
    order: 46,
  },
  {
    id: '2CO',
    name: '2 Corinthians',
    abbreviation: '2 Cor',
    testament: 'NT',
    chapters: 13,
    order: 47,
  },
  { id: 'GAL', name: 'Galatians', abbreviation: 'Gal', testament: 'NT', chapters: 6, order: 48 },
  { id: 'EPH', name: 'Ephesians', abbreviation: 'Eph', testament: 'NT', chapters: 6, order: 49 },
  { id: 'PHP', name: 'Philippians', abbreviation: 'Phil', testament: 'NT', chapters: 4, order: 50 },
  { id: 'COL', name: 'Colossians', abbreviation: 'Col', testament: 'NT', chapters: 4, order: 51 },
  {
    id: '1TH',
    name: '1 Thessalonians',
    abbreviation: '1 Thess',
    testament: 'NT',
    chapters: 5,
    order: 52,
  },
  {
    id: '2TH',
    name: '2 Thessalonians',
    abbreviation: '2 Thess',
    testament: 'NT',
    chapters: 3,
    order: 53,
  },
  { id: '1TI', name: '1 Timothy', abbreviation: '1 Tim', testament: 'NT', chapters: 6, order: 54 },
  { id: '2TI', name: '2 Timothy', abbreviation: '2 Tim', testament: 'NT', chapters: 4, order: 55 },
  { id: 'TIT', name: 'Titus', abbreviation: 'Titus', testament: 'NT', chapters: 3, order: 56 },
  { id: 'PHM', name: 'Philemon', abbreviation: 'Phlm', testament: 'NT', chapters: 1, order: 57 },
  { id: 'HEB', name: 'Hebrews', abbreviation: 'Heb', testament: 'NT', chapters: 13, order: 58 },
  { id: 'JAS', name: 'James', abbreviation: 'Jas', testament: 'NT', chapters: 5, order: 59 },
  { id: '1PE', name: '1 Peter', abbreviation: '1 Pet', testament: 'NT', chapters: 5, order: 60 },
  { id: '2PE', name: '2 Peter', abbreviation: '2 Pet', testament: 'NT', chapters: 3, order: 61 },
  { id: '1JN', name: '1 John', abbreviation: '1 John', testament: 'NT', chapters: 5, order: 62 },
  { id: '2JN', name: '2 John', abbreviation: '2 John', testament: 'NT', chapters: 1, order: 63 },
  { id: '3JN', name: '3 John', abbreviation: '3 John', testament: 'NT', chapters: 1, order: 64 },
  { id: 'JUD', name: 'Jude', abbreviation: 'Jude', testament: 'NT', chapters: 1, order: 65 },
  { id: 'REV', name: 'Revelation', abbreviation: 'Rev', testament: 'NT', chapters: 22, order: 66 },
];

export const getBookById = (id: string): BibleBook | undefined =>
  bibleBooks.find((book) => book.id === id);

export const getBooksByTestament = (testament: Testament): BibleBook[] =>
  bibleBooks.filter((book) => book.testament === testament);

export const oldTestamentBooks = getBooksByTestament('OT');
export const newTestamentBooks = getBooksByTestament('NT');
