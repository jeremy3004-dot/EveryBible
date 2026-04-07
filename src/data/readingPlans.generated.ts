import type { ReadingPlan, ReadingPlanEntry, ReadingPlanCategory } from '../services/plans/types';

type EntrySeed = {
  day: number;
  book: string;
  chapterStart: number;
  chapterEnd: number | null;
};

type PlanDefinition = {
  slug: string;
  titleKey: string;
  descriptionKey: string;
  durationDays: number;
  category: ReadingPlanCategory;
  sortOrder: number;
  coverKey: string;
  featured?: boolean;
  completionCount: number;
  entries: EntrySeed[];
};

const CREATED_AT = '2026-04-07T00:00:00.000Z';

const CHAPTER_COUNTS: Record<string, number> = {
  GEN: 50, EXO: 40, LEV: 27, NUM: 36, DEU: 34,
  JOS: 24, JDG: 21, RUT: 4, '1SA': 31, '2SA': 24,
  '1KI': 22, '2KI': 25, '1CH': 29, '2CH': 36, EZR: 10,
  NEH: 13, EST: 10, JOB: 42, PSA: 150, PRO: 31,
  ECC: 12, SNG: 8, ISA: 66, JER: 52, LAM: 5,
  EZK: 48, DAN: 12, HOS: 14, JOL: 3, AMO: 9,
  OBA: 1, JON: 4, MIC: 7, NAH: 3, HAB: 3,
  ZEP: 3, HAG: 2, ZEC: 14, MAL: 4,
  MAT: 28, MRK: 16, LUK: 24, JHN: 21, ACT: 28,
  ROM: 16, '1CO': 16, '2CO': 13, GAL: 6, EPH: 6,
  PHP: 4, COL: 4, '1TH': 5, '2TH': 3, '1TI': 6,
  '2TI': 4, TIT: 3, PHM: 1, HEB: 13, JAS: 5,
  '1PE': 5, '2PE': 3, '1JN': 5, '2JN': 1, '3JN': 1,
  JUD: 1, REV: 22,
};

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
] as const;

const OT_BOOKS = ALL_BOOKS.slice(0, 39);
const NT_BOOKS = ALL_BOOKS.slice(39);
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

function distributeSequential(books: string[], totalDays: number): EntrySeed[] {
  const chapters: Array<{ book: string; chapter: number }> = [];
  for (const book of books) {
    const count = CHAPTER_COUNTS[book];
    for (let chapter = 1; chapter <= count; chapter += 1) {
      chapters.push({ book, chapter });
    }
  }

  const entries: EntrySeed[] = [];
  let chapterIndex = 0;

  for (let day = 1; day <= totalDays; day += 1) {
    const remainingDays = totalDays - day + 1;
    const remainingChapters = chapters.length - chapterIndex;
    const countForDay = Math.ceil(remainingChapters / remainingDays);
    const dayChapters = chapters.slice(chapterIndex, chapterIndex + countForDay);
    chapterIndex += countForDay;

    let groupStart = 0;
    while (groupStart < dayChapters.length) {
      const start = dayChapters[groupStart];
      let groupEnd = groupStart + 1;
      while (groupEnd < dayChapters.length && dayChapters[groupEnd].book === start.book) {
        groupEnd += 1;
      }
      const end = dayChapters[groupEnd - 1];
      entries.push({
        day,
        book: start.book,
        chapterStart: start.chapter,
        chapterEnd: end.chapter === start.chapter ? null : end.chapter,
      });
      groupStart = groupEnd;
    }
  }

  return entries;
}

function sermonOnTheMountEntries(): EntrySeed[] {
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

function proverbs31Entries(): EntrySeed[] {
  return Array.from({ length: 31 }, (_, index) => ({
    day: index + 1,
    book: 'PRO',
    chapterStart: index + 1,
    chapterEnd: null,
  }));
}

function psalms30Entries(): EntrySeed[] {
  return Array.from({ length: 30 }, (_, index) => ({
    day: index + 1,
    book: 'PSA',
    chapterStart: index * 5 + 1,
    chapterEnd: index * 5 + 5,
  }));
}

function chronologicalEntries(): EntrySeed[] {
  const chronologicalOrder = [
    'GEN', 'JOB', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT',
    '1SA', '2SA', 'PSA', 'PRO', 'ECC', 'SNG',
    '1KI', '2KI', '1CH', '2CH',
    'ISA', 'JER', 'LAM', 'EZK', 'DAN',
    'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAH', 'HAB', 'ZEP',
    'HAG', 'ZEC', 'MAL', 'EZR', 'NEH', 'EST',
    ...NT_BOOKS,
  ];

  return distributeSequential(chronologicalOrder, 365);
}

function toReadingPlan(definition: PlanDefinition): ReadingPlan {
  return {
    id: definition.slug,
    slug: definition.slug,
    title_key: definition.titleKey,
    description_key: definition.descriptionKey,
    duration_days: definition.durationDays,
    category: definition.category,
    is_active: true,
    sort_order: definition.sortOrder,
    cover_image_url: null,
    cover_image_key: definition.coverKey,
    featured: Boolean(definition.featured),
    completion_count: definition.completionCount,
    created_at: CREATED_AT,
  };
}

function toReadingPlanEntries(planId: string, entries: EntrySeed[]): ReadingPlanEntry[] {
  return entries.map((entry, index) => ({
    id: `${planId}-${entry.day}-${index + 1}`,
    plan_id: planId,
    day_number: entry.day,
    book: entry.book,
    chapter_start: entry.chapterStart,
    chapter_end: entry.chapterEnd,
  }));
}

const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    slug: 'bible-in-1-year',
    titleKey: 'readingPlans.bibleIn1Year.title',
    descriptionKey: 'readingPlans.bibleIn1Year.description',
    durationDays: 365,
    category: 'chronological',
    sortOrder: 1,
    coverKey: 'mountains',
    featured: true,
    completionCount: 6240,
    entries: distributeSequential([...ALL_BOOKS], 365),
  },
  {
    slug: 'new-testament-90-days',
    titleKey: 'readingPlans.newTestament90.title',
    descriptionKey: 'readingPlans.newTestament90.description',
    durationDays: 90,
    category: 'book-study',
    sortOrder: 2,
    coverKey: 'stars',
    completionCount: 4510,
    entries: distributeSequential([...NT_BOOKS], 90),
  },
  {
    slug: 'psalms-30-days',
    titleKey: 'readingPlans.psalms30.title',
    descriptionKey: 'readingPlans.psalms30.description',
    durationDays: 30,
    category: 'devotional',
    sortOrder: 3,
    coverKey: 'canyon',
    completionCount: 3870,
    entries: psalms30Entries(),
  },
  {
    slug: 'gospels-60-days',
    titleKey: 'readingPlans.gospels60.title',
    descriptionKey: 'readingPlans.gospels60.description',
    durationDays: 60,
    category: 'book-study',
    sortOrder: 4,
    coverKey: 'sunrise',
    completionCount: 3290,
    entries: distributeSequential([...GOSPELS], 60),
  },
  {
    slug: 'proverbs-31-days',
    titleKey: 'readingPlans.proverbs31.title',
    descriptionKey: 'readingPlans.proverbs31.description',
    durationDays: 31,
    category: 'devotional',
    sortOrder: 5,
    coverKey: 'desert',
    completionCount: 2580,
    entries: proverbs31Entries(),
  },
  {
    slug: 'genesis-to-revelation-chronological',
    titleKey: 'readingPlans.chronological.title',
    descriptionKey: 'readingPlans.chronological.description',
    durationDays: 365,
    category: 'chronological',
    sortOrder: 6,
    coverKey: 'valley',
    completionCount: 2960,
    entries: chronologicalEntries(),
  },
  {
    slug: 'epistles-30-days',
    titleKey: 'readingPlans.epistles30.title',
    descriptionKey: 'readingPlans.epistles30.description',
    durationDays: 30,
    category: 'book-study',
    sortOrder: 7,
    coverKey: 'forest',
    completionCount: 3850,
    entries: distributeSequential([...PAULS_LETTERS, 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD'], 30),
  },
  {
    slug: 'sermon-on-the-mount-7-days',
    titleKey: 'readingPlans.sermonMount7.title',
    descriptionKey: 'readingPlans.sermonMount7.description',
    durationDays: 7,
    category: 'topical',
    sortOrder: 8,
    coverKey: 'shore',
    completionCount: 1720,
    entries: sermonOnTheMountEntries(),
  },
  {
    slug: 'bible-in-30-days',
    titleKey: 'readingPlans.bibleIn30Days.title',
    descriptionKey: 'readingPlans.bibleIn30Days.description',
    durationDays: 30,
    category: 'chronological',
    sortOrder: 10,
    coverKey: 'dunes',
    completionCount: 1240,
    entries: distributeSequential([...ALL_BOOKS], 30),
  },
  {
    slug: 'bible-in-90-days',
    titleKey: 'readingPlans.bibleIn90Days.title',
    descriptionKey: 'readingPlans.bibleIn90Days.description',
    durationDays: 90,
    category: 'chronological',
    sortOrder: 11,
    coverKey: 'mountains',
    completionCount: 3870,
    entries: distributeSequential([...ALL_BOOKS], 90),
  },
  {
    slug: 'bible-in-6-months',
    titleKey: 'readingPlans.bibleIn6Months.title',
    descriptionKey: 'readingPlans.bibleIn6Months.description',
    durationDays: 180,
    category: 'chronological',
    sortOrder: 12,
    coverKey: 'valley',
    completionCount: 6120,
    entries: distributeSequential([...ALL_BOOKS], 180),
  },
  {
    slug: 'nt-in-7-days',
    titleKey: 'readingPlans.ntIn7Days.title',
    descriptionKey: 'readingPlans.ntIn7Days.description',
    durationDays: 7,
    category: 'book-study',
    sortOrder: 13,
    coverKey: 'stars',
    completionCount: 890,
    entries: distributeSequential([...NT_BOOKS], 7),
  },
  {
    slug: 'nt-in-14-days',
    titleKey: 'readingPlans.ntIn14Days.title',
    descriptionKey: 'readingPlans.ntIn14Days.description',
    durationDays: 14,
    category: 'book-study',
    sortOrder: 14,
    coverKey: 'shore',
    completionCount: 2340,
    entries: distributeSequential([...NT_BOOKS], 14),
  },
  {
    slug: 'nt-in-30-days',
    titleKey: 'readingPlans.ntIn30Days.title',
    descriptionKey: 'readingPlans.ntIn30Days.description',
    durationDays: 30,
    category: 'book-study',
    sortOrder: 15,
    coverKey: 'sunrise',
    completionCount: 4510,
    entries: distributeSequential([...NT_BOOKS], 30),
  },
  {
    slug: 'nt-in-6-months',
    titleKey: 'readingPlans.ntIn6Months.title',
    descriptionKey: 'readingPlans.ntIn6Months.description',
    durationDays: 180,
    category: 'book-study',
    sortOrder: 16,
    coverKey: 'forest',
    completionCount: 7830,
    entries: distributeSequential([...NT_BOOKS], 180),
  },
  {
    slug: 'gospels-7-days',
    titleKey: 'readingPlans.gospels7Days.title',
    descriptionKey: 'readingPlans.gospels7Days.description',
    durationDays: 7,
    category: 'book-study',
    sortOrder: 17,
    coverKey: 'sunrise',
    completionCount: 1650,
    entries: distributeSequential([...GOSPELS], 7),
  },
  {
    slug: 'gospels-14-days',
    titleKey: 'readingPlans.gospels14Days.title',
    descriptionKey: 'readingPlans.gospels14Days.description',
    durationDays: 14,
    category: 'book-study',
    sortOrder: 18,
    coverKey: 'shore',
    completionCount: 3290,
    entries: distributeSequential([...GOSPELS], 14),
  },
  {
    slug: 'gospels-30-days',
    titleKey: 'readingPlans.gospels30Days.title',
    descriptionKey: 'readingPlans.gospels30Days.description',
    durationDays: 30,
    category: 'book-study',
    sortOrder: 19,
    coverKey: 'canyon',
    completionCount: 5740,
    entries: distributeSequential([...GOSPELS], 30),
  },
  {
    slug: 'psalms-7-days',
    titleKey: 'readingPlans.psalms7Days.title',
    descriptionKey: 'readingPlans.psalms7Days.description',
    durationDays: 7,
    category: 'devotional',
    sortOrder: 20,
    coverKey: 'stars',
    completionCount: 720,
    entries: distributeSequential(['PSA'], 7),
  },
  {
    slug: 'psalms-90-days',
    titleKey: 'readingPlans.psalms90Days.title',
    descriptionKey: 'readingPlans.psalms90Days.description',
    durationDays: 90,
    category: 'devotional',
    sortOrder: 21,
    coverKey: 'forest',
    completionCount: 4180,
    entries: distributeSequential(['PSA'], 90),
  },
  {
    slug: 'ot-in-year',
    titleKey: 'readingPlans.otInYear.title',
    descriptionKey: 'readingPlans.otInYear.description',
    durationDays: 365,
    category: 'chronological',
    sortOrder: 22,
    coverKey: 'desert',
    completionCount: 2960,
    entries: distributeSequential([...OT_BOOKS], 365),
  },
  {
    slug: 'ot-in-90-days',
    titleKey: 'readingPlans.otIn90Days.title',
    descriptionKey: 'readingPlans.otIn90Days.description',
    durationDays: 90,
    category: 'chronological',
    sortOrder: 23,
    coverKey: 'dunes',
    completionCount: 1870,
    entries: distributeSequential([...OT_BOOKS], 90),
  },
  {
    slug: 'pentateuch-30-days',
    titleKey: 'readingPlans.pentateuch30Days.title',
    descriptionKey: 'readingPlans.pentateuch30Days.description',
    durationDays: 30,
    category: 'book-study',
    sortOrder: 24,
    coverKey: 'desert',
    completionCount: 3140,
    entries: distributeSequential([...PENTATEUCH], 30),
  },
  {
    slug: 'wisdom-30-days',
    titleKey: 'readingPlans.wisdom30Days.title',
    descriptionKey: 'readingPlans.wisdom30Days.description',
    durationDays: 30,
    category: 'devotional',
    sortOrder: 25,
    coverKey: 'forest',
    completionCount: 2580,
    entries: distributeSequential([...WISDOM], 30),
  },
  {
    slug: 'prophets-90-days',
    titleKey: 'readingPlans.prophets90Days.title',
    descriptionKey: 'readingPlans.prophets90Days.description',
    durationDays: 90,
    category: 'book-study',
    sortOrder: 26,
    coverKey: 'valley',
    completionCount: 1420,
    entries: distributeSequential([...PROPHETS], 90),
  },
  {
    slug: 'pauls-letters-30-days',
    titleKey: 'readingPlans.paulsLetters30Days.title',
    descriptionKey: 'readingPlans.paulsLetters30Days.description',
    durationDays: 30,
    category: 'book-study',
    sortOrder: 27,
    coverKey: 'mountains',
    completionCount: 3850,
    entries: distributeSequential([...PAULS_LETTERS], 30),
  },
  {
    slug: 'acts-28-days',
    titleKey: 'readingPlans.acts28Days.title',
    descriptionKey: 'readingPlans.acts28Days.description',
    durationDays: 28,
    category: 'book-study',
    sortOrder: 28,
    coverKey: 'shore',
    completionCount: 6230,
    entries: distributeSequential(['ACT'], 28),
  },
  {
    slug: 'revelation-22-days',
    titleKey: 'readingPlans.revelation22Days.title',
    descriptionKey: 'readingPlans.revelation22Days.description',
    durationDays: 22,
    category: 'book-study',
    sortOrder: 29,
    coverKey: 'stars',
    completionCount: 4910,
    entries: distributeSequential(['REV'], 22),
  },
];

export const READING_PLANS: ReadingPlan[] = PLAN_DEFINITIONS.map(toReadingPlan);

export const READING_PLAN_BY_ID = new Map(READING_PLANS.map((plan) => [plan.id, plan]));

export const READING_PLAN_ENTRIES_BY_PLAN_ID = new Map<string, ReadingPlanEntry[]>(
  PLAN_DEFINITIONS.map((definition) => [
    definition.slug,
    toReadingPlanEntries(definition.slug, definition.entries),
  ])
);

export const TIMED_CHALLENGE_PLAN_IDS = new Set([
  'bible-in-30-days',
  'bible-in-90-days',
  'bible-in-6-months',
  'nt-in-7-days',
  'nt-in-14-days',
  'nt-in-30-days',
  'nt-in-6-months',
  'gospels-7-days',
  'gospels-14-days',
  'gospels-30-days',
  'psalms-7-days',
  'psalms-90-days',
  'ot-in-year',
  'ot-in-90-days',
  'pentateuch-30-days',
  'wisdom-30-days',
  'prophets-90-days',
  'pauls-letters-30-days',
  'acts-28-days',
  'revelation-22-days',
]);

