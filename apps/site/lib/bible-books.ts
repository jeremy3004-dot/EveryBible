/**
 * The 66 books and their public URLs: /bible, /bible/<book>, /bible/<book>/<chapter>.
 * Shared by the reading pages and the plan pages so a plan's day links straight
 * to the chapter it reads. Kept dependency-free and in canonical order; ids are
 * the USFM codes the app uses (src/constants/books.ts).
 */

export type Testament = 'OT' | 'NT';

export interface SiteBibleBook {
  id: string;
  name: string;
  slug: string;
  testament: Testament;
  chapters: number;
}

export const BIBLE_PATH = '/bible';

const BOOKS: readonly (readonly [id: string, name: string, chapters: number])[] = [
  ['GEN', 'Genesis', 50],
  ['EXO', 'Exodus', 40],
  ['LEV', 'Leviticus', 27],
  ['NUM', 'Numbers', 36],
  ['DEU', 'Deuteronomy', 34],
  ['JOS', 'Joshua', 24],
  ['JDG', 'Judges', 21],
  ['RUT', 'Ruth', 4],
  ['1SA', '1 Samuel', 31],
  ['2SA', '2 Samuel', 24],
  ['1KI', '1 Kings', 22],
  ['2KI', '2 Kings', 25],
  ['1CH', '1 Chronicles', 29],
  ['2CH', '2 Chronicles', 36],
  ['EZR', 'Ezra', 10],
  ['NEH', 'Nehemiah', 13],
  ['EST', 'Esther', 10],
  ['JOB', 'Job', 42],
  ['PSA', 'Psalms', 150],
  ['PRO', 'Proverbs', 31],
  ['ECC', 'Ecclesiastes', 12],
  ['SNG', 'Song of Songs', 8],
  ['ISA', 'Isaiah', 66],
  ['JER', 'Jeremiah', 52],
  ['LAM', 'Lamentations', 5],
  ['EZK', 'Ezekiel', 48],
  ['DAN', 'Daniel', 12],
  ['HOS', 'Hosea', 14],
  ['JOL', 'Joel', 3],
  ['AMO', 'Amos', 9],
  ['OBA', 'Obadiah', 1],
  ['JON', 'Jonah', 4],
  ['MIC', 'Micah', 7],
  ['NAM', 'Nahum', 3],
  ['HAB', 'Habakkuk', 3],
  ['ZEP', 'Zephaniah', 3],
  ['HAG', 'Haggai', 2],
  ['ZEC', 'Zechariah', 14],
  ['MAL', 'Malachi', 4],
  ['MAT', 'Matthew', 28],
  ['MRK', 'Mark', 16],
  ['LUK', 'Luke', 24],
  ['JHN', 'John', 21],
  ['ACT', 'Acts', 28],
  ['ROM', 'Romans', 16],
  ['1CO', '1 Corinthians', 16],
  ['2CO', '2 Corinthians', 13],
  ['GAL', 'Galatians', 6],
  ['EPH', 'Ephesians', 6],
  ['PHP', 'Philippians', 4],
  ['COL', 'Colossians', 4],
  ['1TH', '1 Thessalonians', 5],
  ['2TH', '2 Thessalonians', 3],
  ['1TI', '1 Timothy', 6],
  ['2TI', '2 Timothy', 4],
  ['TIT', 'Titus', 3],
  ['PHM', 'Philemon', 1],
  ['HEB', 'Hebrews', 13],
  ['JAS', 'James', 5],
  ['1PE', '1 Peter', 5],
  ['2PE', '2 Peter', 3],
  ['1JN', '1 John', 5],
  ['2JN', '2 John', 1],
  ['3JN', '3 John', 1],
  ['JUD', 'Jude', 1],
  ['REV', 'Revelation', 22],
];

const FIRST_NT_INDEX = 39;

export const SITE_BIBLE_BOOKS: readonly SiteBibleBook[] = BOOKS.map(([id, name, chapters], i) => ({
  id,
  name,
  slug: name.toLowerCase().replace(/ /g, '-'),
  testament: i < FIRST_NT_INDEX ? 'OT' : 'NT',
  chapters,
}));

const byId = new Map(SITE_BIBLE_BOOKS.map((book) => [book.id, book]));
const bySlug = new Map(SITE_BIBLE_BOOKS.map((book) => [book.slug, book]));

export function bibleBookById(id: string): SiteBibleBook | undefined {
  return byId.get(id.toUpperCase());
}

export function bibleBookBySlug(slug: string): SiteBibleBook | undefined {
  return bySlug.get(slug);
}

export function bibleBookPath(book: Pick<SiteBibleBook, 'slug'>): `/${string}` {
  return `${BIBLE_PATH}/${book.slug}`;
}

/** `/bible/john/3`, or `/bible/john/3#v16` when a verse is given. */
export function bibleChapterPath(
  book: Pick<SiteBibleBook, 'slug'>,
  chapter: number,
  verse?: number
): `/${string}` {
  return `${BIBLE_PATH}/${book.slug}/${chapter}${verse ? `#v${verse}` : ''}`;
}

/** Parses a chapter route segment; only canonical integers inside the book count. */
export function parseChapterParam(book: SiteBibleBook, value: string): number | null {
  if (!/^[1-9][0-9]{0,2}$/.test(value)) return null;
  const chapter = Number(value);
  return chapter <= book.chapters ? chapter : null;
}
