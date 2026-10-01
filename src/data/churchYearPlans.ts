import type { ReadingPlanCoverKey, ReadingPlanScheduleMode } from '../services/plans/types';
import type { LifeSituationChapter } from './lifeSituationPlans';

/**
 * Plans dated to the church year, read afresh each year. Like the Seasons of life
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
 */
export interface ChurchYearPlan {
  /** Plan id and slug. */
  id: string;
  /** Key under `readingPlans.churchYear` for the title and description. */
  key: string;
  coverKey: ReadingPlanCoverKey;
  scheduleMode: ReadingPlanScheduleMode;
  /** One list of chapters per day, in reading order. */
  days: readonly (readonly LifeSituationChapter[])[];
}

export const CHURCH_YEAR_PLANS: readonly ChurchYearPlan[] = [
  {
    id: 'advent',
    key: 'advent',
    coverKey: 'advent',
    scheduleMode: 'calendar-advent',
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
];
