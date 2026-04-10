import { bibleBooks } from '../constants/books';
import type { ReadingPlan, ReadingPlanEntry } from '../services/plans/types';
import type { ReadingPlanCoverKey } from '../services/plans/types';
import type { ReadingPlanScheduleMode } from '../services/plans/types';
import type { PlanSessionKey, ReadingPlanFormat } from '../services/plans/types';

type BookPlanRecipe = {
  id: string;
  slug: string;
  title_key: string;
  description_key: string | null;
  duration_days: number;
  category: ReadingPlan['category'];
  sort_order: number;
  cover_key: ReadingPlanCoverKey;
  schedule_mode?: ReadingPlanScheduleMode;
  repeats_monthly?: boolean;
  format?: ReadingPlanFormat;
  session_order?: PlanSessionKey[];
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
  schedule_mode?: ReadingPlanScheduleMode;
  repeats_monthly?: boolean;
  format?: ReadingPlanFormat;
  session_order?: PlanSessionKey[];
  entries: Array<{
    day_number: number;
    session_key?: PlanSessionKey;
    session_title?: string;
    session_order?: number;
    book: string;
    chapter_start: number;
    chapter_end: number | null;
    verse_start?: number | null;
    verse_end?: number | null;
  }>;
};

type TimedChallengeRecipe = {
  id: string;
  slug: string;
  title_key: string;
  description_key: string | null;
  duration_days: number;
  category: ReadingPlan['category'];
  sort_order: number;
  cover_key: ReadingPlanCoverKey;
  schedule_mode?: ReadingPlanScheduleMode;
  repeats_monthly?: boolean;
  format?: ReadingPlanFormat;
  session_order?: PlanSessionKey[];
  books: string[];
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
      cover_image_key: recipe.cover_key,
      scheduleMode: recipe.schedule_mode,
      repeatsMonthly: recipe.repeats_monthly,
      format: recipe.format,
      sessionOrder: recipe.session_order,
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
      cover_image_key: recipe.cover_key,
      scheduleMode: recipe.schedule_mode,
      repeatsMonthly: recipe.repeats_monthly,
      format: recipe.format,
      sessionOrder: recipe.session_order,
    },
    entries: recipe.entries.map((entry) => ({
      id: `${recipe.id}-day-${entry.day_number}`,
      plan_id: recipe.id,
      day_number: entry.day_number,
      session_key: entry.session_key,
      session_title: entry.session_title,
      session_order: entry.session_order,
      book: entry.book,
      chapter_start: entry.chapter_start,
      chapter_end: entry.chapter_end,
      verse_start: entry.verse_start ?? null,
      verse_end: entry.verse_end ?? null,
    })),
  };
}

function buildTimedChallengePlan(
  recipe: TimedChallengeRecipe
): { plan: ReadingPlan; entries: ReadingPlanEntry[] } {
  const chapters: Array<{ book: string; chapter: number }> = [];

  recipe.books.forEach((bookId) => {
    const chapterTotal = getBookChapters(bookId);
    for (let chapter = 1; chapter <= chapterTotal; chapter += 1) {
      chapters.push({ book: bookId, chapter });
    }
  });

  const entries: ReadingPlanEntry[] = [];
  let chapterIndex = 0;

  for (let dayNumber = 1; dayNumber <= recipe.duration_days; dayNumber += 1) {
    const remainingDays = recipe.duration_days - dayNumber + 1;
    const remainingChapters = chapters.length - chapterIndex;
    const countForDay = Math.ceil(remainingChapters / remainingDays);
    const dayChapters = chapters.slice(chapterIndex, chapterIndex + countForDay);
    chapterIndex += countForDay;

    if (dayChapters.length === 0) {
      break;
    }

    let partNumber = 1;
    let index = 0;
    while (index < dayChapters.length) {
      const startBook = dayChapters[index]!.book;
      const startChapter = dayChapters[index]!.chapter;
      let endIndex = index + 1;

      while (endIndex < dayChapters.length && dayChapters[endIndex]!.book === startBook) {
        endIndex += 1;
      }

      const endChapter = dayChapters[endIndex - 1]!.chapter;
      entries.push({
        id: `${recipe.id}-day-${dayNumber}-part-${partNumber}`,
        plan_id: recipe.id,
        day_number: dayNumber,
        book: startBook,
        chapter_start: startChapter,
        chapter_end: endChapter === startChapter ? null : endChapter,
      });

      partNumber += 1;
      index = endIndex;
    }
  }

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
      cover_image_key: recipe.cover_key,
      scheduleMode: recipe.schedule_mode,
      repeatsMonthly: recipe.repeats_monthly,
      format: recipe.format,
      sessionOrder: recipe.session_order,
    },
    entries,
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
    cover_key: 'lakeLandscape',
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
    schedule_mode: 'calendar-day-of-month',
    repeats_monthly: true,
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

const topicalRecipes: VersePlanRecipe[] = [
  {
    id: 'foundations-of-the-gospel',
    slug: 'foundations-of-the-gospel',
    title_key: 'readingPlans.foundationsOfTheGospel.title',
    description_key: 'readingPlans.foundationsOfTheGospel.description',
    duration_days: 14,
    category: 'topical',
    sort_order: 29,
    cover_key: 'gospelFoundations',
    entries: [
      { day_number: 1, book: 'GEN', chapter_start: 1, chapter_end: 3 },
      { day_number: 2, book: 'PSA', chapter_start: 8, chapter_end: null },
      { day_number: 2, book: 'PSA', chapter_start: 14, chapter_end: null },
      { day_number: 2, book: 'ROM', chapter_start: 1, chapter_end: null },
      { day_number: 3, book: 'ROM', chapter_start: 2, chapter_end: 4 },
      { day_number: 4, book: 'ISA', chapter_start: 52, chapter_end: 53 },
      { day_number: 4, book: 'PSA', chapter_start: 22, chapter_end: null },
      { day_number: 5, book: 'LUK', chapter_start: 1, chapter_end: 3 },
      { day_number: 6, book: 'JHN', chapter_start: 1, chapter_end: 3 },
      { day_number: 7, book: 'JHN', chapter_start: 4, chapter_end: 6 },
      { day_number: 8, book: 'MRK', chapter_start: 8, chapter_end: 10 },
      { day_number: 9, book: 'MAT', chapter_start: 26, chapter_end: 28 },
      { day_number: 10, book: 'LUK', chapter_start: 23, chapter_end: 24 },
      { day_number: 10, book: 'JHN', chapter_start: 20, chapter_end: null },
      { day_number: 11, book: 'ACT', chapter_start: 1, chapter_end: 4 },
      { day_number: 12, book: 'ROM', chapter_start: 5, chapter_end: 8 },
      { day_number: 13, book: 'EPH', chapter_start: 1, chapter_end: 4 },
      { day_number: 14, book: 'REV', chapter_start: 19, chapter_end: 22 },
    ],
  },
  {
    id: 'prayer-intimacy-with-god',
    slug: 'prayer-intimacy-with-god',
    title_key: 'readingPlans.prayerIntimacyWithGod.title',
    description_key: 'readingPlans.prayerIntimacyWithGod.description',
    duration_days: 7,
    category: 'devotional',
    sort_order: 30,
    cover_key: 'prayerIntimacy',
    entries: [
      { day_number: 1, book: 'PSA', chapter_start: 1, chapter_end: 4 },
      { day_number: 2, book: 'PSA', chapter_start: 5, chapter_end: 8 },
      { day_number: 3, book: 'PSA', chapter_start: 23, chapter_end: 27 },
      { day_number: 4, book: 'PSA', chapter_start: 32, chapter_end: null },
      { day_number: 4, book: 'PSA', chapter_start: 51, chapter_end: null },
      { day_number: 4, book: 'PSA', chapter_start: 63, chapter_end: null },
      { day_number: 5, book: 'MAT', chapter_start: 5, chapter_end: 7 },
      { day_number: 6, book: 'LUK', chapter_start: 11, chapter_end: null },
      { day_number: 6, book: 'LUK', chapter_start: 18, chapter_end: null },
      { day_number: 6, book: 'JHN', chapter_start: 15, chapter_end: null },
      { day_number: 7, book: 'JHN', chapter_start: 16, chapter_end: 17 },
      { day_number: 7, book: 'ROM', chapter_start: 8, chapter_end: null },
    ],
  },
  {
    id: 'identity-in-christ',
    slug: 'identity-in-christ',
    title_key: 'readingPlans.identityInChrist.title',
    description_key: 'readingPlans.identityInChrist.description',
    duration_days: 7,
    category: 'devotional',
    sort_order: 31,
    cover_key: 'identityInChrist',
    entries: [
      { day_number: 1, book: 'EPH', chapter_start: 1, chapter_end: 4 },
      { day_number: 2, book: 'EPH', chapter_start: 5, chapter_end: 6 },
      { day_number: 2, book: 'COL', chapter_start: 1, chapter_end: null },
      { day_number: 3, book: 'COL', chapter_start: 2, chapter_end: 4 },
      { day_number: 4, book: 'ROM', chapter_start: 5, chapter_end: 7 },
      { day_number: 5, book: 'ROM', chapter_start: 8, chapter_end: 10 },
      { day_number: 6, book: '2CO', chapter_start: 3, chapter_end: 6 },
      { day_number: 7, book: 'GAL', chapter_start: 2, chapter_end: 5 },
    ],
  },
  {
    id: 'the-kingdom-of-god',
    slug: 'the-kingdom-of-god',
    title_key: 'readingPlans.kingdomOfGod.title',
    description_key: 'readingPlans.kingdomOfGod.description',
    duration_days: 14,
    category: 'topical',
    sort_order: 32,
    cover_key: 'kingdomOfGod',
    entries: [
      { day_number: 1, book: 'MAT', chapter_start: 3, chapter_end: 5 },
      { day_number: 2, book: 'MAT', chapter_start: 6, chapter_end: 7 },
      { day_number: 3, book: 'MAT', chapter_start: 8, chapter_end: 10 },
      { day_number: 4, book: 'MAT', chapter_start: 11, chapter_end: 13 },
      { day_number: 5, book: 'MAT', chapter_start: 18, chapter_end: 20 },
      { day_number: 6, book: 'LUK', chapter_start: 4, chapter_end: 6 },
      { day_number: 7, book: 'LUK', chapter_start: 7, chapter_end: 9 },
      { day_number: 8, book: 'LUK', chapter_start: 10, chapter_end: 12 },
      { day_number: 9, book: 'LUK', chapter_start: 13, chapter_end: 15 },
      { day_number: 10, book: 'LUK', chapter_start: 16, chapter_end: 18 },
      { day_number: 11, book: 'JHN', chapter_start: 3, chapter_end: 5 },
      { day_number: 12, book: 'JHN', chapter_start: 6, chapter_end: 8 },
      { day_number: 13, book: 'ACT', chapter_start: 1, chapter_end: 4 },
      { day_number: 14, book: 'ROM', chapter_start: 14, chapter_end: 16 },
    ],
  },
  {
    id: 'spiritual-warfare',
    slug: 'spiritual-warfare',
    title_key: 'readingPlans.spiritualWarfare.title',
    description_key: 'readingPlans.spiritualWarfare.description',
    duration_days: 7,
    category: 'topical',
    sort_order: 33,
    cover_key: 'spiritualWarfare',
    entries: [
      { day_number: 1, book: 'GEN', chapter_start: 3, chapter_end: null },
      { day_number: 1, book: 'JOB', chapter_start: 1, chapter_end: 2 },
      { day_number: 2, book: 'MAT', chapter_start: 4, chapter_end: null },
      { day_number: 2, book: 'LUK', chapter_start: 4, chapter_end: null },
      { day_number: 2, book: 'MRK', chapter_start: 1, chapter_end: null },
      { day_number: 3, book: 'DAN', chapter_start: 10, chapter_end: 12 },
      { day_number: 4, book: '2CO', chapter_start: 10, chapter_end: 13 },
      { day_number: 5, book: 'EPH', chapter_start: 6, chapter_end: null },
      { day_number: 5, book: 'JAS', chapter_start: 4, chapter_end: null },
      { day_number: 5, book: '1PE', chapter_start: 5, chapter_end: null },
      { day_number: 6, book: 'ACT', chapter_start: 13, chapter_end: null },
      { day_number: 6, book: 'ACT', chapter_start: 16, chapter_end: null },
      { day_number: 6, book: 'ACT', chapter_start: 19, chapter_end: null },
      { day_number: 7, book: 'REV', chapter_start: 12, chapter_end: 14 },
    ],
  },
  {
    id: 'holiness-and-sanctification',
    slug: 'holiness-and-sanctification',
    title_key: 'readingPlans.holinessAndSanctification.title',
    description_key: 'readingPlans.holinessAndSanctification.description',
    duration_days: 14,
    category: 'devotional',
    sort_order: 34,
    cover_key: 'holinessSanctification',
    entries: [
      { day_number: 1, book: 'LEV', chapter_start: 19, chapter_end: 20 },
      { day_number: 1, book: 'PSA', chapter_start: 24, chapter_end: null },
      { day_number: 2, book: 'ISA', chapter_start: 1, chapter_end: 3 },
      { day_number: 3, book: 'ISA', chapter_start: 5, chapter_end: 6 },
      { day_number: 4, book: 'MAT', chapter_start: 5, chapter_end: 7 },
      { day_number: 5, book: 'JHN', chapter_start: 15, chapter_end: 17 },
      { day_number: 6, book: 'ROM', chapter_start: 6, chapter_end: 8 },
      { day_number: 7, book: 'ROM', chapter_start: 12, chapter_end: 14 },
      { day_number: 8, book: 'GAL', chapter_start: 5, chapter_end: 6 },
      { day_number: 8, book: 'EPH', chapter_start: 1, chapter_end: null },
      { day_number: 9, book: 'EPH', chapter_start: 2, chapter_end: 4 },
      { day_number: 10, book: 'EPH', chapter_start: 5, chapter_end: 6 },
      { day_number: 10, book: 'COL', chapter_start: 1, chapter_end: null },
      { day_number: 11, book: 'COL', chapter_start: 2, chapter_end: 4 },
      { day_number: 12, book: '1TH', chapter_start: 4, chapter_end: 5 },
      { day_number: 12, book: '2TH', chapter_start: 1, chapter_end: null },
      { day_number: 13, book: '1PE', chapter_start: 1, chapter_end: 4 },
      { day_number: 14, book: 'HEB', chapter_start: 10, chapter_end: 12 },
    ],
  },
  {
    id: 'great-commission-and-mission',
    slug: 'great-commission-and-mission',
    title_key: 'readingPlans.greatCommissionAndMission.title',
    description_key: 'readingPlans.greatCommissionAndMission.description',
    duration_days: 7,
    category: 'topical',
    sort_order: 35,
    cover_key: 'greatCommission',
    entries: [
      { day_number: 1, book: 'GEN', chapter_start: 12, chapter_end: 15 },
      { day_number: 2, book: 'PSA', chapter_start: 67, chapter_end: null },
      { day_number: 2, book: 'PSA', chapter_start: 96, chapter_end: 97 },
      { day_number: 3, book: 'ISA', chapter_start: 49, chapter_end: null },
      { day_number: 3, book: 'ISA', chapter_start: 60, chapter_end: 61 },
      { day_number: 4, book: 'MAT', chapter_start: 9, chapter_end: 11 },
      { day_number: 5, book: 'MAT', chapter_start: 24, chapter_end: 28 },
      { day_number: 6, book: 'LUK', chapter_start: 10, chapter_end: null },
      { day_number: 6, book: 'ACT', chapter_start: 1, chapter_end: 3 },
      { day_number: 7, book: 'ROM', chapter_start: 10, chapter_end: null },
      { day_number: 7, book: 'REV', chapter_start: 5, chapter_end: null },
      { day_number: 7, book: 'REV', chapter_start: 7, chapter_end: null },
    ],
  },
];

const devotionalRecipes: VersePlanRecipe[] = [
  {
    id: 'faith-and-obedience',
    slug: 'faith-and-obedience',
    title_key: 'readingPlans.faithAndObedience.title',
    description_key: 'readingPlans.faithAndObedience.description',
    duration_days: 7,
    category: 'devotional',
    sort_order: 36,
    cover_key: 'faithObedience',
    entries: [
      { day_number: 1, book: 'GEN', chapter_start: 12, chapter_end: 15 },
      { day_number: 2, book: 'JOS', chapter_start: 1, chapter_end: 4 },
      { day_number: 3, book: '1SA', chapter_start: 13, chapter_end: 15 },
      { day_number: 4, book: 'PSA', chapter_start: 37, chapter_end: 40 },
      { day_number: 5, book: 'HEB', chapter_start: 10, chapter_end: 11 },
      { day_number: 6, book: 'JAS', chapter_start: 1, chapter_end: 3 },
      { day_number: 7, book: 'LUK', chapter_start: 5, chapter_end: null },
      { day_number: 7, book: 'LUK', chapter_start: 9, chapter_end: null },
      { day_number: 7, book: 'LUK', chapter_start: 14, chapter_end: 15 },
    ],
  },
  {
    id: 'hearing-gods-voice',
    slug: 'hearing-gods-voice',
    title_key: 'readingPlans.hearingGodsVoice.title',
    description_key: 'readingPlans.hearingGodsVoice.description',
    duration_days: 7,
    category: 'devotional',
    sort_order: 37,
    cover_key: 'hearingGodVoice',
    entries: [
      { day_number: 1, book: '1SA', chapter_start: 3, chapter_end: null },
      { day_number: 1, book: 'PSA', chapter_start: 25, chapter_end: 26 },
      { day_number: 2, book: 'JER', chapter_start: 1, chapter_end: 3 },
      { day_number: 3, book: 'EZK', chapter_start: 1, chapter_end: 3 },
      { day_number: 4, book: 'JHN', chapter_start: 10, chapter_end: null },
      { day_number: 4, book: 'JHN', chapter_start: 14, chapter_end: 15 },
      { day_number: 5, book: 'ACT', chapter_start: 8, chapter_end: 10 },
      { day_number: 6, book: 'HEB', chapter_start: 3, chapter_end: 5 },
      { day_number: 7, book: 'GAL', chapter_start: 5, chapter_end: 6 },
      { day_number: 7, book: 'REV', chapter_start: 2, chapter_end: 3 },
    ],
  },
];

const timedChallengeRecipes: TimedChallengeRecipe[] = [
  {
    id: 'bible-in-30-days',
    slug: 'bible-in-30-days',
    title_key: 'readingPlans.bibleIn30Days.title',
    description_key: 'readingPlans.bibleIn30Days.description',
    duration_days: 30,
    category: 'chronological',
    sort_order: 10,
    cover_key: 'seashore',
    books: canonicalOrder,
  },
  {
    id: 'bible-in-90-days',
    slug: 'bible-in-90-days',
    title_key: 'readingPlans.bibleIn90Days.title',
    description_key: 'readingPlans.bibleIn90Days.description',
    duration_days: 90,
    category: 'chronological',
    sort_order: 11,
    cover_key: 'field',
    books: canonicalOrder,
  },
  {
    id: 'nt-in-30-days',
    slug: 'nt-in-30-days',
    title_key: 'readingPlans.ntIn30Days.title',
    description_key: 'readingPlans.ntIn30Days.description',
    duration_days: 30,
    category: 'book-study',
    sort_order: 15,
    cover_key: 'sandDune',
    books: newTestamentOrder,
  },
  {
    id: 'gospels-30-days',
    slug: 'gospels-30-days',
    title_key: 'readingPlans.gospels30Days.title',
    description_key: 'readingPlans.gospels30Days.description',
    duration_days: 30,
    category: 'book-study',
    sort_order: 19,
    cover_key: 'pineSky',
    books: ['MAT', 'MRK', 'LUK', 'JHN'],
  },
  {
    id: 'acts-28-days',
    slug: 'acts-28-days',
    title_key: 'readingPlans.acts28Days.title',
    description_key: 'readingPlans.acts28Days.description',
    duration_days: 28,
    category: 'book-study',
    sort_order: 28,
    cover_key: 'riverForest',
    books: ['ACT'],
  },
];

const sequentialPlans = sequentialRecipes.map(buildSequentialPlan);
const versePlans = verseRecipes.map(buildVersePlan);
const topicalPlans = topicalRecipes.map(buildVersePlan);
const devotionalPlans = devotionalRecipes.map(buildVersePlan);
const timedChallengePlans = timedChallengeRecipes.map(buildTimedChallengePlan);

export const readingPlans = [...sequentialPlans, ...versePlans, ...topicalPlans, ...devotionalPlans, ...timedChallengePlans]
  .map((item) => item.plan)
  .sort((left, right) => left.sort_order - right.sort_order);

export const readingPlanEntries = [...sequentialPlans, ...versePlans, ...topicalPlans, ...devotionalPlans, ...timedChallengePlans]
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

export const READING_PLANS = readingPlans;
export const READING_PLAN_BY_ID = readingPlansById;
export const READING_PLAN_ENTRIES_BY_PLAN_ID = new Map(
  Object.entries(readingPlanEntriesByPlanId)
);
