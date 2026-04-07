#!/usr/bin/env tsx
/**
 * generate-plan-entries.ts
 *
 * Generates the SQL seed file for reading_plan_entries covering all 8 plans.
 * The two 365-day plans are built programmatically; the shorter plans are
 * hand-coded arrays. The output is written to:
 *   supabase/migrations/20260407000200_seed_reading_plan_entries.sql
 *
 * Run with:  npx tsx scripts/generate-plan-entries.ts
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Entry {
  day: number;
  book: string;
  chapterStart: number;
  chapterEnd: number | null;
}

// ---------------------------------------------------------------------------
// Bible chapter counts (all 66 books, canonical order)
// ---------------------------------------------------------------------------

const CHAPTER_COUNTS: Record<string, number> = {
  GEN: 50, EXO: 40, LEV: 27, NUM: 36, DEU: 34,
  JOS: 24, JDG: 21, RUT: 4,  '1SA': 31, '2SA': 24,
  '1KI': 22, '2KI': 25, '1CH': 29, '2CH': 36, EZR: 10,
  NEH: 13, EST: 10, JOB: 42, PSA: 150, PRO: 31,
  ECC: 12, SNG: 8,  ISA: 66, JER: 52, LAM: 5,
  EZK: 48, DAN: 12, HOS: 14, JOL: 3,  AMO: 9,
  OBA: 1,  JON: 4,  MIC: 7,  NAH: 3,  HAB: 3,
  ZEP: 3,  HAG: 2,  ZEC: 14, MAL: 4,
  MAT: 28, MRK: 16, LUK: 24, JHN: 21, ACT: 28,
  ROM: 16, '1CO': 16, '2CO': 13, GAL: 6,  EPH: 6,
  PHP: 4,  COL: 4,  '1TH': 5, '2TH': 3, '1TI': 6,
  '2TI': 4, TIT: 3,  PHM: 1,  HEB: 13, JAS: 5,
  '1PE': 5, '2PE': 3, '1JN': 5, '2JN': 1, '3JN': 1,
  JUD: 1,  REV: 22,
};

// ---------------------------------------------------------------------------
// Helper: distribute chapters across days, one row per book-section
// Returns Entry[] with possibly multiple entries per day (when day spans books)
// ---------------------------------------------------------------------------

function distributeSequential(
  books: string[],
  totalDays: number,
): Entry[] {
  // Build flat list of [book, chapter] pairs
  const chapters: Array<{ book: string; chapter: number }> = [];
  for (const book of books) {
    const count = CHAPTER_COUNTS[book];
    if (!count) throw new Error(`Unknown book: ${book}`);
    for (let c = 1; c <= count; c++) {
      chapters.push({ book, chapter: c });
    }
  }

  const totalChapters = chapters.length;
  const entries: Entry[] = [];

  let chapIdx = 0;
  for (let day = 1; day <= totalDays; day++) {
    // How many chapters for this day? Distribute evenly, giving remainder days an extra.
    const remaining = totalDays - day + 1;
    const remainingChapters = totalChapters - chapIdx;
    const countForDay = Math.ceil(remainingChapters / remaining);

    const dayChapters = chapters.slice(chapIdx, chapIdx + countForDay);
    chapIdx += countForDay;

    if (dayChapters.length === 0) break;

    // Group consecutive chapters within the same book into a single entry
    let i = 0;
    while (i < dayChapters.length) {
      const startBook = dayChapters[i].book;
      const startChapter = dayChapters[i].chapter;
      let j = i + 1;
      while (j < dayChapters.length && dayChapters[j].book === startBook) {
        j++;
      }
      const endChapter = dayChapters[j - 1].chapter;
      entries.push({
        day,
        book: startBook,
        chapterStart: startChapter,
        chapterEnd: endChapter === startChapter ? null : endChapter,
      });
      i = j;
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Plan generators
// ---------------------------------------------------------------------------

// Sermon on the Mount — 7 days in Matthew 5-7
function sermonOnTheMountEntries(): Entry[] {
  return [
    { day: 1, book: 'MAT', chapterStart: 5, chapterEnd: null },
    { day: 2, book: 'MAT', chapterStart: 6, chapterEnd: null },
    { day: 3, book: 'MAT', chapterStart: 7, chapterEnd: null },
    { day: 4, book: 'MAT', chapterStart: 5, chapterEnd: null },
    { day: 5, book: 'MAT', chapterStart: 6, chapterEnd: null },
    { day: 6, book: 'MAT', chapterStart: 7, chapterEnd: null },
    { day: 7, book: 'MAT', chapterStart: 5, chapterEnd: 7 },
  ];
}

// Proverbs 31 Days — one chapter per day
function proverbs31Entries(): Entry[] {
  return Array.from({ length: 31 }, (_, i) => ({
    day: i + 1,
    book: 'PRO',
    chapterStart: i + 1,
    chapterEnd: null,
  }));
}

// Psalms 30 Days — 5 psalms per day
function psalms30Entries(): Entry[] {
  return Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    book: 'PSA',
    chapterStart: i * 5 + 1,
    chapterEnd: i * 5 + 5,
  }));
}

// Epistles 30 Days — Romans through Jude (87 chapters) across 30 days
function epistles30Entries(): Entry[] {
  const epistle_books = [
    'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL',
    '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB',
    'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD',
  ];
  return distributeSequential(epistle_books, 30);
}

// Gospels 60 Days — Matthew, Mark, Luke, John (89 chapters)
function gospels60Entries(): Entry[] {
  return distributeSequential(['MAT', 'MRK', 'LUK', 'JHN'], 60);
}

// NT in 90 Days — all 27 NT books (260 chapters)
function nt90Entries(): Entry[] {
  const nt_books = [
    'MAT', 'MRK', 'LUK', 'JHN', 'ACT',
    'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL',
    '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB',
    'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
  ];
  return distributeSequential(nt_books, 90);
}

// Bible in 1 Year — all 66 books sequential (1189 chapters)
function bibleIn1YearEntries(): Entry[] {
  const all_books = [
    'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT',
    '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST',
    'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK',
    'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAH', 'HAB',
    'ZEP', 'HAG', 'ZEC', 'MAL',
    'MAT', 'MRK', 'LUK', 'JHN', 'ACT',
    'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL',
    '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB',
    'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
  ];
  return distributeSequential(all_books, 365);
}

// Chronological Bible — standard public-domain chronological reading order
// Events in historical sequence: Creation, Patriarchs, Exodus, Kings/Prophets interleaved, NT
// Based on widely-used Grant Horner simplified chronological order
function chronologicalEntries(): Entry[] {
  // Define the chronological sequence as [book, chapterCount] pairs
  // This follows the standard public-domain chronological Bible reading order
  const chronological_order: string[] = [
    // Creation and early history
    'GEN', // 50 chapters
    // Job is placed after Genesis (patriarchal era)
    'JOB', // 42 chapters
    // Exodus
    'EXO', // 40 chapters
    'LEV', // 27 chapters
    'NUM', // 36 chapters
    'DEU', // 34 chapters
    // Conquest
    'JOS', // 24 chapters
    'JDG', // 21 chapters
    'RUT', // 4 chapters
    // United Kingdom
    '1SA', // 31 chapters
    '2SA', // 24 chapters
    // Psalms interleaved with Samuel/Kings — insert here (150 chapters)
    'PSA', // 150 chapters
    'PRO', // 31 chapters
    'ECC', // 12 chapters
    'SNG', // 8 chapters
    '1KI', // 22 chapters
    '2KI', // 25 chapters
    '1CH', // 29 chapters
    '2CH', // 36 chapters
    // Prophets contemporaneous with Kings
    'ISA', // 66 chapters
    'JER', // 52 chapters
    'LAM', // 5 chapters
    'EZK', // 48 chapters
    'DAN', // 12 chapters
    'HOS', // 14 chapters
    'JOL', // 3 chapters
    'AMO', // 9 chapters
    'OBA', // 1 chapter
    'JON', // 4 chapters
    'MIC', // 7 chapters
    'NAH', // 3 chapters
    'HAB', // 3 chapters
    'ZEP', // 3 chapters
    // Post-exilic
    'HAG', // 2 chapters
    'ZEC', // 14 chapters
    'MAL', // 4 chapters
    'EZR', // 10 chapters
    'NEH', // 13 chapters
    'EST', // 10 chapters
    // New Testament
    'MAT', 'MRK', 'LUK', 'JHN', 'ACT',
    'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL',
    '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB',
    'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
  ];

  return distributeSequential(chronological_order, 365);
}

// ---------------------------------------------------------------------------
// Timed challenge plan generators (20 new plans)
// ---------------------------------------------------------------------------

const ALL_BOOKS = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT',
  '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST',
  'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK',
  'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAH', 'HAB',
  'ZEP', 'HAG', 'ZEC', 'MAL',
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT',
  'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL',
  '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB',
  'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
];

const OT_BOOKS = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT',
  '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST',
  'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK',
  'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAH', 'HAB',
  'ZEP', 'HAG', 'ZEC', 'MAL',
];

const NT_BOOKS = [
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT',
  'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL',
  '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB',
  'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
];

const GOSPELS = ['MAT', 'MRK', 'LUK', 'JHN'];

const PENTATEUCH = ['GEN', 'EXO', 'LEV', 'NUM', 'DEU'];

const WISDOM = ['JOB', 'PSA', 'PRO', 'ECC', 'SNG'];

const PROPHETS = [
  'ISA', 'JER', 'LAM', 'EZK', 'DAN',
  'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAH', 'HAB',
  'ZEP', 'HAG', 'ZEC', 'MAL',
];

const PAULS_LETTERS = [
  'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL',
  '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM',
];

const TIMED_PLANS: Array<{ slug: string; books: string[]; days: number }> = [
  { slug: 'bible-in-30-days',      books: ALL_BOOKS,      days: 30  },
  { slug: 'bible-in-90-days',      books: ALL_BOOKS,      days: 90  },
  { slug: 'bible-in-6-months',     books: ALL_BOOKS,      days: 180 },
  { slug: 'nt-in-7-days',          books: NT_BOOKS,       days: 7   },
  { slug: 'nt-in-14-days',         books: NT_BOOKS,       days: 14  },
  { slug: 'nt-in-30-days',         books: NT_BOOKS,       days: 30  },
  { slug: 'nt-in-6-months',        books: NT_BOOKS,       days: 180 },
  { slug: 'gospels-7-days',        books: GOSPELS,        days: 7   },
  { slug: 'gospels-14-days',       books: GOSPELS,        days: 14  },
  { slug: 'gospels-30-days',       books: GOSPELS,        days: 30  },
  { slug: 'psalms-7-days',         books: ['PSA'],        days: 7   },
  { slug: 'psalms-90-days',        books: ['PSA'],        days: 90  },
  { slug: 'ot-in-year',            books: OT_BOOKS,       days: 365 },
  { slug: 'ot-in-90-days',         books: OT_BOOKS,       days: 90  },
  { slug: 'pentateuch-30-days',    books: PENTATEUCH,     days: 30  },
  { slug: 'wisdom-30-days',        books: WISDOM,         days: 30  },
  { slug: 'prophets-90-days',      books: PROPHETS,       days: 90  },
  { slug: 'pauls-letters-30-days', books: PAULS_LETTERS,  days: 30  },
  { slug: 'acts-28-days',          books: ['ACT'],        days: 28  },
  { slug: 'revelation-22-days',    books: ['REV'],        days: 22  },
];

// ---------------------------------------------------------------------------
// SQL generation helpers
// ---------------------------------------------------------------------------

function entriesForPlan(slug: string, entries: Entry[]): string {
  const lines: string[] = [];
  for (const e of entries) {
    const chapterEnd = e.chapterEnd !== null ? e.chapterEnd.toString() : 'NULL::integer';
    lines.push(
      `  SELECT id, ${e.day}, '${e.book}', ${e.chapterStart}, ${chapterEnd} FROM reading_plans WHERE slug = '${slug}'`,
    );
  }
  return lines.join('\nUNION ALL\n') + ';';
}

function buildPlanBlock(slug: string, entries: Entry[]): string {
  return (
    `-- ${slug} (${entries.length} entries)\n` +
    `INSERT INTO reading_plan_entries (plan_id, day_number, book, chapter_start, chapter_end)\n` +
    entriesForPlan(slug, entries) +
    '\n'
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const plans: Array<{ slug: string; entries: Entry[] }> = [
  { slug: 'sermon-on-the-mount-7-days',           entries: sermonOnTheMountEntries() },
  { slug: 'proverbs-31-days',                     entries: proverbs31Entries() },
  { slug: 'psalms-30-days',                       entries: psalms30Entries() },
  { slug: 'epistles-30-days',                     entries: epistles30Entries() },
  { slug: 'gospels-60-days',                      entries: gospels60Entries() },
  { slug: 'new-testament-90-days',                entries: nt90Entries() },
  { slug: 'bible-in-1-year',                      entries: bibleIn1YearEntries() },
  { slug: 'genesis-to-revelation-chronological',  entries: chronologicalEntries() },
];

const totalEntries = plans.reduce((sum, p) => sum + p.entries.length, 0);

const header = `-- Phase 18: Seed reading plan entries for all 8 plans
-- Generated by scripts/generate-plan-entries.ts
-- Do NOT edit manually — re-run the generator script instead.
--
-- Total entries: ${totalEntries}

`;

const body = plans.map((p) => buildPlanBlock(p.slug, p.entries)).join('\n');

const outPath = path.resolve(
  __dirname,
  '../supabase/migrations/20260407000200_seed_reading_plan_entries.sql',
);

fs.writeFileSync(outPath, header + body, 'utf8');

console.log(`Written ${totalEntries} entries to ${outPath}`);
for (const p of plans) {
  console.log(`  ${p.slug}: ${p.entries.length} entries`);
}

// ---------------------------------------------------------------------------
// Generate timed challenge entries → separate migration file
// ---------------------------------------------------------------------------

const timedPlansData = TIMED_PLANS.map((p) => ({
  slug: p.slug,
  entries: distributeSequential(p.books, p.days),
}));

const timedTotal = timedPlansData.reduce((sum, p) => sum + p.entries.length, 0);

const timedHeader = `-- Phase 18.3: Seed reading plan entries for 20 timed challenge plans
-- Generated by scripts/generate-plan-entries.ts
-- Do NOT edit manually — re-run the generator script instead.
--
-- Total entries: ${timedTotal}

`;

const timedBody = timedPlansData.map((p) => buildPlanBlock(p.slug, p.entries)).join('\n');

const timedOutPath = path.resolve(
  __dirname,
  '../supabase/migrations/20260407000400_seed_timed_plan_entries.sql',
);

fs.writeFileSync(timedOutPath, timedHeader + timedBody, 'utf8');

console.log(`\nWritten ${timedTotal} timed entries to ${timedOutPath}`);
for (const p of timedPlansData) {
  console.log(`  ${p.slug}: ${p.entries.length} entries`);
}
