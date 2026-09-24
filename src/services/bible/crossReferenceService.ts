/**
 * Cross-Reference Service
 *
 * Provides lookup of related Bible verses based on cross-reference data sourced
 * from OpenBible.info (https://www.openbible.info/labs/cross-references/), originally
 * curated by the scrollmapper/bible_databases project (500k+ cross-references).
 *
 * TODO: Import the full 500k cross-reference dataset from OpenBible.info into the
 * bundled SQLite database (bible-bsb-v2.db) as a `cross_references` table, then
 * replace the SAMPLE_CROSS_REFERENCES constant and lookup logic below with a query
 * against that table via expo-sqlite. The table schema should mirror the CSV columns:
 *   from_book TEXT, from_chapter INTEGER, from_verse INTEGER,
 *   to_book TEXT, to_chapter INTEGER, to_verse INTEGER, votes INTEGER
 * with an index on (from_book, from_chapter, from_verse).
 *
 * The bookId values here use the same 3-letter uppercase codes (e.g. 'JHN', 'ROM')
 * that are used throughout the rest of the codebase (see src/constants/books.ts).
 */

export interface CrossReference {
  fromBook: string;
  fromChapter: number;
  fromVerse: number;
  toBook: string;
  toChapter: number;
  toVerse: number;
  votes: number;
}

// ---------------------------------------------------------------------------
// Sample dataset — 28 well-known cross-references to power the stub
// ---------------------------------------------------------------------------

const SAMPLE_CROSS_REFERENCES: CrossReference[] = [
  // John 3:16 → related passages
  {
    fromBook: 'JHN',
    fromChapter: 3,
    fromVerse: 16,
    toBook: 'ROM',
    toChapter: 5,
    toVerse: 8,
    votes: 92,
  },
  {
    fromBook: 'JHN',
    fromChapter: 3,
    fromVerse: 16,
    toBook: '1JN',
    toChapter: 4,
    toVerse: 9,
    votes: 88,
  },
  {
    fromBook: 'JHN',
    fromChapter: 3,
    fromVerse: 16,
    toBook: 'JHN',
    toChapter: 3,
    toVerse: 36,
    votes: 74,
  },
  {
    fromBook: 'JHN',
    fromChapter: 3,
    fromVerse: 16,
    toBook: 'ROM',
    toChapter: 6,
    toVerse: 23,
    votes: 71,
  },
  {
    fromBook: 'JHN',
    fromChapter: 3,
    fromVerse: 16,
    toBook: 'EPH',
    toChapter: 2,
    toVerse: 8,
    votes: 65,
  },
  {
    fromBook: 'JHN',
    fromChapter: 3,
    fromVerse: 16,
    toBook: 'GEN',
    toChapter: 22,
    toVerse: 2,
    votes: 53,
  },

  // Romans 3:23 → related passages
  {
    fromBook: 'ROM',
    fromChapter: 3,
    fromVerse: 23,
    toBook: 'ROM',
    toChapter: 6,
    toVerse: 23,
    votes: 105,
  },
  {
    fromBook: 'ROM',
    fromChapter: 3,
    fromVerse: 23,
    toBook: 'ROM',
    toChapter: 3,
    toVerse: 10,
    votes: 89,
  },
  {
    fromBook: 'ROM',
    fromChapter: 3,
    fromVerse: 23,
    toBook: 'ISA',
    toChapter: 53,
    toVerse: 6,
    votes: 76,
  },
  {
    fromBook: 'ROM',
    fromChapter: 3,
    fromVerse: 23,
    toBook: '1JN',
    toChapter: 1,
    toVerse: 8,
    votes: 68,
  },

  // Romans 6:23 → related passages
  {
    fromBook: 'ROM',
    fromChapter: 6,
    fromVerse: 23,
    toBook: 'ROM',
    toChapter: 3,
    toVerse: 23,
    votes: 97,
  },
  {
    fromBook: 'ROM',
    fromChapter: 6,
    fromVerse: 23,
    toBook: 'JHN',
    toChapter: 3,
    toVerse: 16,
    votes: 84,
  },
  {
    fromBook: 'ROM',
    fromChapter: 6,
    fromVerse: 23,
    toBook: 'EPH',
    toChapter: 2,
    toVerse: 8,
    votes: 72,
  },

  // Ephesians 2:8-9 → related passages
  {
    fromBook: 'EPH',
    fromChapter: 2,
    fromVerse: 8,
    toBook: 'ROM',
    toChapter: 3,
    toVerse: 28,
    votes: 83,
  },
  {
    fromBook: 'EPH',
    fromChapter: 2,
    fromVerse: 8,
    toBook: 'TIT',
    toChapter: 3,
    toVerse: 5,
    votes: 77,
  },
  {
    fromBook: 'EPH',
    fromChapter: 2,
    fromVerse: 8,
    toBook: 'JHN',
    toChapter: 3,
    toVerse: 16,
    votes: 69,
  },
  {
    fromBook: 'EPH',
    fromChapter: 2,
    fromVerse: 9,
    toBook: 'ROM',
    toChapter: 3,
    toVerse: 27,
    votes: 61,
  },
  {
    fromBook: 'EPH',
    fromChapter: 2,
    fromVerse: 9,
    toBook: 'EPH',
    toChapter: 2,
    toVerse: 8,
    votes: 58,
  },

  // Psalm 23:1 → related passages
  {
    fromBook: 'PSA',
    fromChapter: 23,
    fromVerse: 1,
    toBook: 'JHN',
    toChapter: 10,
    toVerse: 11,
    votes: 79,
  },
  {
    fromBook: 'PSA',
    fromChapter: 23,
    fromVerse: 1,
    toBook: 'ISA',
    toChapter: 40,
    toVerse: 11,
    votes: 67,
  },

  // Isaiah 53:6 → related passages
  {
    fromBook: 'ISA',
    fromChapter: 53,
    fromVerse: 6,
    toBook: 'ROM',
    toChapter: 3,
    toVerse: 23,
    votes: 81,
  },
  {
    fromBook: 'ISA',
    fromChapter: 53,
    fromVerse: 6,
    toBook: '1PE',
    toChapter: 2,
    toVerse: 25,
    votes: 73,
  },

  // Genesis 1:1 → related passages
  {
    fromBook: 'GEN',
    fromChapter: 1,
    fromVerse: 1,
    toBook: 'JHN',
    toChapter: 1,
    toVerse: 1,
    votes: 95,
  },
  {
    fromBook: 'GEN',
    fromChapter: 1,
    fromVerse: 1,
    toBook: 'HEB',
    toChapter: 11,
    toVerse: 3,
    votes: 72,
  },

  // Jeremiah 29:11 → related passages
  {
    fromBook: 'JER',
    fromChapter: 29,
    fromVerse: 11,
    toBook: 'ROM',
    toChapter: 8,
    toVerse: 28,
    votes: 88,
  },
  {
    fromBook: 'JER',
    fromChapter: 29,
    fromVerse: 11,
    toBook: 'PHP',
    toChapter: 4,
    toVerse: 6,
    votes: 64,
  },

  // Philippians 4:13 → related passages
  {
    fromBook: 'PHP',
    fromChapter: 4,
    fromVerse: 13,
    toBook: '2CO',
    toChapter: 12,
    toVerse: 9,
    votes: 85,
  },
  {
    fromBook: 'PHP',
    fromChapter: 4,
    fromVerse: 13,
    toBook: 'ISA',
    toChapter: 41,
    toVerse: 10,
    votes: 59,
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Returns all cross-references for a given verse, sorted by relevance (votes descending).
 * Returns an empty array when no cross-references are found.
 */
export function getCrossReferences(
  bookId: string,
  chapter: number,
  verse: number
): CrossReference[] {
  return SAMPLE_CROSS_REFERENCES.filter(
    (ref) => ref.fromBook === bookId && ref.fromChapter === chapter && ref.fromVerse === verse
  ).sort((a, b) => b.votes - a.votes);
}

/**
 * Returns the top N most relevant cross-references for a given verse.
 * Defaults to the top 5 if no limit is specified.
 * Returns an empty array when no cross-references are found.
 */
export function getTopCrossReferences(
  bookId: string,
  chapter: number,
  verse: number,
  limit: number = 5
): CrossReference[] {
  return getCrossReferences(bookId, chapter, verse).slice(0, limit);
}
