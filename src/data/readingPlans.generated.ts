import { bibleBooks } from '../constants/books';
import type { ReadingPlan, ReadingPlanEntry } from '../services/plans/types';
import type { ReadingPlanCoverKey } from '../services/plans/types';

type ChapterRef = {
  book: string;
  chapter: number;
};

type BookPlanRecipe = {
  id: string;
  slug: string;
  title_key: string;
  description_key: string | null;
  duration_days: number;
  category: ReadingPlan['category'];
  sort_order: number;
  cover_key: ReadingPlanCoverKey;
  book_order: string[];
};

type VersePlanRecipe = {
  id: string;
  slug: string;
  title_key: string;
  description_key: string | null;
  duration_days: number;
  category: ReadingPlan['category'];
  sort_order: number;
  cover_key: ReadingPlanCoverKey;
  entries: Array<{
    day_number: number;
    book: string;
    chapter_start: number;
    chapter_end: number | null;
    verse_start?: number | null;
    verse_end?: number | null;
  }>;
};

const canonicalOrder = bibleBooks.map((book) => book.id);
const newTestamentOrder = bibleBooks.filter((book) => book.testament === 'NT').map((book) => book.id);
const epistlesOrder = [
  'ROM',
  '1CO',
  '2CO',
  'GAL',
  'EPH',
  'PHP',
  'COL',
  '1TH',
  '2TH',
  '1TI',
  '2TI',
  'TIT',
  'PHM',
  'HEB',
  'JAS',
  '1PE',
  '2PE',
  '1JN',
  '2JN',
  '3JN',
  'JUD',
];

const chronologicalOrder = [
  'GEN',
  'JOB',
  'EXO',
  'LEV',
  'NUM',
  'DEU',
  'JOS',
  'JDG',
  'RUT',
  '1SA',
  '2SA',
  '1KI',
  '1CH',
  '2KI',
  '2CH',
  'EZR',
  'NEH',
  'EST',
  'PSA',
  'PRO',
  'ECC',
  'SNG',
  'ISA',
  'JER',
  'LAM',
  'EZK',
  'DAN',
  'HOS',
  'JOL',
  'AMO',
  'OBA',
  'JON',
  'MIC',
  'NAM',
  'HAB',
  'ZEP',
  'HAG',
  'ZEC',
  'MAL',
  'MAT',
  'MRK',
  'LUK',
  'JHN',
  'ACT',
  'ROM',
  '1CO',
  '2CO',
  'GAL',
  'EPH',
  'PHP',
  'COL',
  '1TH',
  '2TH',
  '1TI',
  '2TI',
  'TIT',
  'PHM',
  'HEB',
  'JAS',
  '1PE',
  '2PE',
  '1JN',
  '2JN',
  '3JN',
  'JUD',
  'REV',
];

function getBookChapters(bookId: string): number {
  const book = bibleBooks.find((item) => item.id === bookId);
  if (!book) {
    throw new Error(`Unknown Bible book id: ${bookId}`);
  }
  return book.chapters;
}

function chunkIntegers(total: number, chunks: number): Array<[number, number]> {
  if (chunks <= 0) {
    throw new Error('chunks must be positive');
  }

  const result: Array<[number, number]> = [];
  const base = Math.floor(total / chunks);
  const remainder = total % chunks;
  let current = 1;

  for (let index = 0; index < chunks; index += 1) {
    const size = base + (index < remainder ? 1 : 0);
    const start = current;
    const end = current + Math.max(size - 1, 0);
    result.push([start, end]);
    current = end + 1;
  }

  return result;
}

function allocateDaysPerBook(bookOrder: string[], totalDays: number): number[] {
  if (bookOrder.length === 0) {
    return [];
  }

  if (totalDays < bookOrder.length) {
    throw new Error(`Cannot allocate ${totalDays} days across ${bookOrder.length} books`);
  }

  const chapterCounts = bookOrder.map((bookId) => getBookChapters(bookId));
  const baseDays = Array(bookOrder.length).fill(1);
  let remainingDays = totalDays - bookOrder.length;

  if (remainingDays === 0) {
    return baseDays;
  }

  const weights = chapterCounts.map((count) => Math.max(0, count - 1));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);

  if (weightTotal === 0) {
    baseDays[baseDays.length - 1] += remainingDays;
    return baseDays;
  }

  const fractional = weights.map((weight, index) => {
    const exact = (weight / weightTotal) * remainingDays;
    const bonus = Math.floor(exact);
    baseDays[index] += bonus;
    return {
      index,
      remainder: exact - bonus,
    };
  });

  const assigned = baseDays.reduce((sum, value) => sum + value, 0);
  const leftover = totalDays - assigned;

  fractional
    .sort((left, right) => {
      if (right.remainder !== left.remainder) {
        return right.remainder - left.remainder;
      }
      return left.index - right.index;
    })
    .slice(0, leftover)
    .forEach(({ index }) => {
      baseDays[index] += 1;
    });

  return baseDays;
}

function buildSequentialPlan(recipe: BookPlanRecipe): { plan: ReadingPlan; entries: ReadingPlanEntry[] } {
  const daysPerBook = allocateDaysPerBook(recipe.book_order, recipe.duration_days);
  const entries: ReadingPlanEntry[] = [];
  let dayNumber = 1;

  recipe.book_order.forEach((bookId, bookIndex) => {
    const dayCount = daysPerBook[bookIndex];
    const chapterRanges = chunkIntegers(getBookChapters(bookId), dayCount);

    chapterRanges.forEach(([chapterStart, chapterEnd]) => {
      entries.push({
        id: `${recipe.id}-day-${dayNumber}`,
        plan_id: recipe.id,
        day_number: dayNumber,
        book: bookId,
        chapter_start: chapterStart,
        chapter_end: chapterEnd === chapterStart ? null : chapterEnd,
      });
      dayNumber += 1;
    });
  });

  return {
    plan: {
      id: recipe.id,
      slug: recipe.slug,
      title_key: recipe.title_key,
      description_key: recipe.description_key,
      duration_days: recipe.duration_days,
      category: recipe.category,
      is_active: true,
      sort_order: recipe.sort_order,
      coverKey: recipe.cover_key,
      cover_key: recipe.cover_key,
    },
    entries,
  };
}

function buildVersePlan(recipe: VersePlanRecipe): { plan: ReadingPlan; entries: ReadingPlanEntry[] } {
  return {
    plan: {
      id: recipe.id,
      slug: recipe.slug,
      title_key: recipe.title_key,
      description_key: recipe.description_key,
      duration_days: recipe.duration_days,
      category: recipe.category,
      is_active: true,
      sort_order: recipe.sort_order,
      coverKey: recipe.cover_key,
      cover_key: recipe.cover_key,
    },
    entries: recipe.entries.map((entry) => ({
      id: `${recipe.id}-day-${entry.day_number}`,
      plan_id: recipe.id,
      day_number: entry.day_number,
      book: entry.book,
      chapter_start: entry.chapter_start,
      chapter_end: entry.chapter_end,
      verse_start: entry.verse_start ?? null,
      verse_end: entry.verse_end ?? null,
    })),
  };
}

const sequentialRecipes: BookPlanRecipe[] = [
  {
    id: 'bible-in-1-year',
    slug: 'bible-in-1-year',
    title_key: 'readingPlans.bibleIn1Year.title',
    description_key: 'readingPlans.bibleIn1Year.description',
    duration_days: 365,
    category: 'chronological',
    sort_order: 1,
    cover_key: 'sunrise',
    book_order: canonicalOrder,
  },
  {
    id: 'new-testament-90-days',
    slug: 'new-testament-90-days',
    title_key: 'readingPlans.newTestament90.title',
    description_key: 'readingPlans.newTestament90.description',
    duration_days: 90,
    category: 'book-study',
    sort_order: 2,
    cover_key: 'stars',
    book_order: newTestamentOrder,
  },
  {
    id: 'psalms-30-days',
    slug: 'psalms-30-days',
    title_key: 'readingPlans.psalms30.title',
    description_key: 'readingPlans.psalms30.description',
    duration_days: 30,
    category: 'book-study',
    sort_order: 3,
    cover_key: 'river',
    book_order: ['PSA'],
  },
  {
    id: 'gospels-60-days',
    slug: 'gospels-60-days',
    title_key: 'readingPlans.gospels60.title',
    description_key: 'readingPlans.gospels60.description',
    duration_days: 60,
    category: 'book-study',
    sort_order: 4,
    cover_key: 'mountains',
    book_order: ['MAT', 'MRK', 'LUK', 'JHN'],
  },
  {
    id: 'proverbs-31-days',
    slug: 'proverbs-31-days',
    title_key: 'readingPlans.proverbs31.title',
    description_key: 'readingPlans.proverbs31.description',
    duration_days: 31,
    category: 'devotional',
    sort_order: 5,
    cover_key: 'desert',
    book_order: ['PRO'],
  },
  {
    id: 'genesis-to-revelation-chronological',
    slug: 'genesis-to-revelation-chronological',
    title_key: 'readingPlans.chronological.title',
    description_key: 'readingPlans.chronological.description',
    duration_days: 365,
    category: 'chronological',
    sort_order: 6,
    cover_key: 'forest',
    book_order: chronologicalOrder,
  },
  {
    id: 'epistles-30-days',
    slug: 'epistles-30-days',
    title_key: 'readingPlans.epistles30.title',
    description_key: 'readingPlans.epistles30.description',
    duration_days: 30,
    category: 'book-study',
    sort_order: 7,
    cover_key: 'valley',
    book_order: epistlesOrder,
  },
];

const verseRecipes: VersePlanRecipe[] = [
  {
    id: 'sermon-on-the-mount-7-days',
    slug: 'sermon-on-the-mount-7-days',
    title_key: 'readingPlans.sermonMount7.title',
    description_key: 'readingPlans.sermonMount7.description',
    duration_days: 7,
    category: 'topical',
    sort_order: 8,
    cover_key: 'dunes',
    entries: [
      { day_number: 1, book: 'MAT', chapter_start: 5, chapter_end: 5, verse_start: 1, verse_end: 12 },
      { day_number: 2, book: 'MAT', chapter_start: 5, chapter_end: 5, verse_start: 13, verse_end: 20 },
      { day_number: 3, book: 'MAT', chapter_start: 5, chapter_end: 5, verse_start: 21, verse_end: 32 },
      { day_number: 4, book: 'MAT', chapter_start: 5, chapter_end: 5, verse_start: 33, verse_end: 48 },
      { day_number: 5, book: 'MAT', chapter_start: 6, chapter_end: 6, verse_start: 1, verse_end: 18 },
      { day_number: 6, book: 'MAT', chapter_start: 6, chapter_end: 6, verse_start: 19, verse_end: 34 },
      { day_number: 7, book: 'MAT', chapter_start: 7, chapter_end: 7, verse_start: 1, verse_end: 29 },
    ],
  },
];

const sequentialPlans = sequentialRecipes.map(buildSequentialPlan);
const versePlans = verseRecipes.map(buildVersePlan);

export const readingPlans = [...sequentialPlans, ...versePlans]
  .map((item) => item.plan)
  .sort((left, right) => left.sort_order - right.sort_order);

export const readingPlanEntries = [...sequentialPlans, ...versePlans]
  .flatMap((item) => item.entries)
  .sort((left, right) => {
    if (left.plan_id !== right.plan_id) {
      return left.plan_id.localeCompare(right.plan_id);
    }
    return left.day_number - right.day_number;
  });

export const readingPlansById = new Map(readingPlans.map((plan) => [plan.id, plan] as const));
export const readingPlansBySlug = new Map(readingPlans.map((plan) => [plan.slug, plan] as const));

export const readingPlanEntriesByPlanId = readingPlanEntries.reduce<Record<string, ReadingPlanEntry[]>>(
  (accumulator, entry) => {
    if (!accumulator[entry.plan_id]) {
      accumulator[entry.plan_id] = [];
    }
    accumulator[entry.plan_id]!.push(entry);
    return accumulator;
  },
  {}
);
