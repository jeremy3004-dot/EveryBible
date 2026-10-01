import type { ReadingPlanCoverKey, ReadingPlanScheduleMode } from '../services/plans/types';
import { AUTUMN_SEASON_PLANS } from './autumnSeasonPlans';
import { EASTER_CYCLE_PLANS } from './easterCyclePlans';
import type { LifeSituationChapter } from './lifeSituationPlans';

/**
 * Plans dated to a season, read afresh each year: the church year, and a few
 * other dated weeks. Each is offered only around its own dates (see
 * churchCalendar.ts). The winter plans are here; the Easter cycle and the
 * autumn weeks have their own files.
 * Like the Seasons of life
 * plans every reading is a whole chapter (most translations carry no verse
 * markers), usually a prophecy or story with a psalm or letter beside it.
 *
 * Advent's day 1 is the first Sunday of Advent and it ends on Christmas Eve, so it
 * runs 22 to 28 days. Weeks one to three (hope, peace, joy) are always whole;
 * the fourth week (love) begins on the fourth Sunday, day 22, and is cut short by
 * Christmas Eve. Day 22 therefore carries the annunciations (Isaiah 7, Matthew 1,
 * Luke 1), and days 23 to 28 are only read in years with a longer fourth week.
 *
 * Christmas is the Twelve Days, from Christmas Day to the eve of Epiphany: the
 * birth and the Word made flesh, what the Incarnation means, and the Magi.
 * The week before Christmas also has a plan for those who find it hard, and the
 * new year opens with a week of beginnings, then Epiphany. These overlap, so no
 * chapter repeats across the five winter plans.
 */
/** One day's chapters, in reading order. */
export type ChurchYearDay = readonly LifeSituationChapter[];

export interface ChurchYearPlan {
  /** Plan id and slug. */
  id: string;
  /** Key under `readingPlans.churchYear` for the title and description. */
  key: string;
  coverKey: ReadingPlanCoverKey;
  scheduleMode: ReadingPlanScheduleMode;
  /** `church-year` for the seasons of the church calendar, `seasonal` for other dated weeks. */
  category: 'church-year' | 'seasonal';
  /** One list of chapters per day, in reading order. */
  days: readonly ChurchYearDay[];
}

const WINTER_PLANS: readonly ChurchYearPlan[] = [
  {
    id: 'advent',
    key: 'advent',
    coverKey: 'advent',
    scheduleMode: 'calendar-advent',
    category: 'church-year',
    days: [
      // Week 1 · Hope: the promise from the garden to the house of David.
      [
        ['ISA', 40],
        ['PSA', 25],
      ],
      [
        ['GEN', 3],
        ['PSA', 130],
      ],
      [
        ['GEN', 12],
        ['ROM', 4],
      ],
      [
        ['2SA', 7],
        ['PSA', 89],
      ],
      [
        ['ISA', 11],
        ['PSA', 72],
      ],
      [
        ['JER', 33],
        ['ROM', 15],
      ],
      [
        ['LAM', 3],
        ['PSA', 80],
      ],
      // Week 2 · Peace: the Prince of Peace, and the voice preparing His way.
      [
        ['ISA', 9],
        ['PSA', 85],
      ],
      [
        ['ISA', 2],
        ['PSA', 122],
      ],
      [
        ['MIC', 4],
        ['MIC', 5],
      ],
      [
        ['MAL', 3],
        ['MAL', 4],
      ],
      [
        ['ISA', 52],
        ['MAT', 3],
      ],
      [
        ['ZEC', 9],
        ['EPH', 2],
      ],
      [
        ['ISA', 32],
        ['2PE', 3],
      ],
      // Week 3 · Joy: rejoice, the Lord is near.
      [
        ['ZEP', 3],
        ['PHP', 4],
      ],
      [
        ['ISA', 35],
        ['MAT', 11],
      ],
      [
        ['ISA', 61],
        ['LUK', 4],
      ],
      [
        ['ISA', 12],
        ['PSA', 126],
      ],
      [
        ['PSA', 16],
        ['1TH', 5],
      ],
      [
        ['ISA', 55],
        ['PSA', 98],
      ],
      [
        ['HAB', 3],
        ['PSA', 96],
      ],
      // Week 4 · Love: God so loved the world. Day 22 is the fourth Sunday, and
      // can be Christmas Eve itself.
      [
        ['ISA', 7],
        ['MAT', 1],
        ['LUK', 1],
      ],
      [
        ['JHN', 3],
        ['PSA', 145],
      ],
      [
        ['HOS', 11],
        ['PSA', 103],
      ],
      [
        ['1JN', 3],
        ['1JN', 4],
      ],
      [
        ['ROM', 5],
        ['PSA', 136],
      ],
      [
        ['ISA', 54],
        ['1CO', 13],
      ],
      [
        ['ISA', 62],
        ['PSA', 24],
      ],
    ],
  },
  {
    id: 'twelve-days-of-christmas',
    key: 'christmas',
    coverKey: 'christmas',
    scheduleMode: 'calendar-christmas',
    category: 'church-year',
    days: [
      // 25 December: the birth, and the Word made flesh.
      [
        ['LUK', 2],
        ['JHN', 1],
      ],
      [
        ['HEB', 1],
        ['PSA', 2],
      ],
      [
        ['TIT', 2],
        ['TIT', 3],
      ],
      [
        ['PSA', 8],
        ['HEB', 2],
      ],
      [
        ['COL', 1],
        ['1JN', 1],
      ],
      [
        ['JER', 31],
        ['PSA', 147],
      ],
      // 31 December: the turn of the year.
      [
        ['PSA', 90],
        ['ECC', 3],
      ],
      // 1 January: the name above every name (Luke 2:21).
      [
        ['NUM', 6],
        ['PHP', 2],
      ],
      [
        ['ISA', 42],
        ['PSA', 67],
      ],
      [
        ['ISA', 49],
        ['EPH', 3],
      ],
      [
        ['EPH', 1],
        ['GAL', 4],
      ],
      // 5 January, the eve of Epiphany: the Magi follow the star.
      [
        ['ISA', 60],
        ['MAT', 2],
      ],
    ],
  },
  {
    id: 'when-christmas-is-hard',
    key: 'hardChristmas',
    coverKey: 'hardChristmas',
    scheduleMode: 'calendar-hard-christmas',
    category: 'seasonal',
    days: [
      // 18 December. Naomi comes home empty, and the psalmist asks how long.
      [
        ['RUT', 1],
        ['PSA', 13],
      ],
      [
        ['2CO', 1],
        ['PSA', 34],
      ],
      [
        ['ISA', 41],
        ['PSA', 139],
      ],
      [
        ['1KI', 19],
        ['PSA', 61],
      ],
      // Jesus wept at the grave of His friend.
      [
        ['JHN', 11],
        ['PSA', 56],
      ],
      [
        ['ROM', 8],
        ['PSA', 46],
      ],
      // Christmas Eve: the light shines in the darkness.
      [
        ['ISA', 57],
        ['PSA', 27],
      ],
    ],
  },
  {
    id: 'new-year',
    key: 'newYear',
    coverKey: 'newYear',
    scheduleMode: 'calendar-new-year',
    category: 'seasonal',
    days: [
      // 1 January: in the beginning.
      [
        ['GEN', 1],
        ['PSA', 1],
      ],
      [
        ['JOS', 1],
        ['PSA', 121],
      ],
      [
        ['ISA', 43],
        ['PSA', 40],
      ],
      [
        ['2CO', 5],
        ['PSA', 65],
      ],
      [
        ['PHP', 3],
        ['PSA', 37],
      ],
      [
        ['MAT', 6],
        ['ROM', 12],
      ],
      // 7 January: behold, I am making all things new.
      [
        ['REV', 21],
        ['PSA', 23],
      ],
    ],
  },
  {
    id: 'epiphany',
    key: 'epiphany',
    coverKey: 'epiphany',
    scheduleMode: 'calendar-epiphany',
    category: 'church-year',
    days: [
      // 6 January, the feast of the Epiphany: the light of the world.
      [
        ['JHN', 8],
        ['PSA', 36],
      ],
      // The Baptism of the Lord.
      [
        ['MRK', 1],
        ['PSA', 29],
      ],
      // Cana: the first of His signs.
      [
        ['JHN', 2],
        ['PSA', 97],
      ],
      [
        ['JON', 3],
        ['JON', 4],
      ],
      [
        ['ACT', 10],
        ['PSA', 87],
      ],
      [
        ['ROM', 10],
        ['PSA', 117],
      ],
      [
        ['REV', 7],
        ['ISA', 25],
      ],
    ],
  },
];

/** Every dated plan, in the order of the year from Advent. */
export const CHURCH_YEAR_PLANS: readonly ChurchYearPlan[] = [
  ...WINTER_PLANS,
  ...EASTER_CYCLE_PLANS,
  ...AUTUMN_SEASON_PLANS,
];
