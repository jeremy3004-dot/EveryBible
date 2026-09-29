import type { ReadingPlanCoverKey } from '../services/plans/types';

/**
 * Seven-day plans for seasons of life (grief, fear, anger, …). Every reading is a
 * whole chapter: most translations carry no verse markers, so a verse range would
 * open the wrong text or nothing at all. Each chapter was chosen because the whole
 * of it speaks to the topic — a story about it, or a psalm or teaching on it — and
 * each day has at least two chapters, usually a story plus a psalm or teaching.
 */
export type LifeSituationChapter = readonly [book: string, chapter: number];

export interface LifeSituationPlan {
  /** Plan id and slug. */
  id: string;
  /** Key under `readingPlans.lifeSituations` for the title and description. */
  key: string;
  coverKey: ReadingPlanCoverKey;
  /** One list of chapters per day, in reading order. */
  days: readonly (readonly LifeSituationChapter[])[];
}

export const LIFE_SITUATION_PLANS: readonly LifeSituationPlan[] = [
  {
    id: 'life-loss-7-days',
    key: 'loss',
    coverKey: 'lifeLoss',
    days: [
      [
        ['JOB', 1],
        ['JOB', 2],
        ['PSA', 39],
      ],
      [
        ['2SA', 1],
        ['LAM', 1],
        ['PSA', 13],
      ],
      [
        ['RUT', 1],
        ['RUT', 2],
      ],
      [
        ['RUT', 3],
        ['RUT', 4],
      ],
      [
        ['JHN', 11],
        ['PSA', 116],
      ],
      [
        ['1CO', 15],
        ['ISA', 25],
      ],
      [
        ['ISA', 35],
        ['REV', 21],
      ],
    ],
  },
  {
    id: 'life-stress-7-days',
    key: 'stress',
    coverKey: 'lifeStress',
    days: [
      [
        ['NUM', 11],
        ['PSA', 55],
      ],
      [
        ['EXO', 18],
        ['ECC', 4],
      ],
      [
        ['EXO', 16],
        ['PSA', 127],
      ],
      [
        ['NEH', 4],
        ['NEH', 6],
      ],
      [
        ['ECC', 2],
        ['ECC', 3],
      ],
      [
        ['ISA', 40],
        ['2CO', 4],
      ],
      [
        ['HEB', 4],
        ['PSA', 62],
        ['PSA', 131],
      ],
    ],
  },
  {
    id: 'life-fear-7-days',
    key: 'fear',
    coverKey: 'lifeFear',
    days: [
      [
        ['JOS', 1],
        ['ISA', 41],
      ],
      [
        ['PSA', 27],
        ['PSA', 56],
        ['PSA', 91],
      ],
      [
        ['EXO', 14],
        ['2CH', 20],
        ['PSA', 46],
      ],
      [
        ['NUM', 13],
        ['NUM', 14],
      ],
      [
        ['1SA', 17],
        ['PSA', 3],
      ],
      [
        ['DAN', 3],
        ['DAN', 6],
      ],
      [
        ['ISA', 43],
        ['2TI', 1],
      ],
    ],
  },
  {
    id: 'life-peace-7-days',
    key: 'peace',
    coverKey: 'lifePeace',
    days: [
      [
        ['ISA', 26],
        ['PSA', 4],
      ],
      [
        ['JHN', 14],
        ['JHN', 16],
      ],
      [
        ['ROM', 5],
        ['EPH', 2],
      ],
      [
        ['GEN', 13],
        ['GEN', 26],
      ],
      [
        ['COL', 3],
        ['PSA', 85],
      ],
      [
        ['ISA', 11],
        ['MIC', 4],
      ],
      [
        ['ISA', 55],
        ['PSA', 23],
      ],
    ],
  },
  {
    id: 'life-depression-7-days',
    key: 'depression',
    coverKey: 'lifeDepression',
    days: [
      [
        ['PSA', 42],
        ['PSA', 43],
        ['PSA', 77],
      ],
      [
        ['JON', 2],
        ['PSA', 30],
        ['PSA', 143],
      ],
      [
        ['1KI', 18],
        ['1KI', 19],
      ],
      [
        ['LAM', 3],
        ['PSA', 88],
      ],
      [
        ['JOB', 3],
        ['JOB', 38],
        ['PSA', 142],
      ],
      [
        ['PSA', 22],
        ['PSA', 69],
      ],
      [
        ['ISA', 61],
        ['HAB', 3],
        ['PSA', 126],
      ],
    ],
  },
  {
    id: 'life-hope-7-days',
    key: 'hope',
    coverKey: 'lifeHope',
    days: [
      [
        ['1PE', 1],
        ['PSA', 71],
      ],
      [
        ['GEN', 15],
        ['ROM', 4],
      ],
      [
        ['GEN', 37],
        ['GEN', 40],
      ],
      [
        ['GEN', 41],
        ['GEN', 50],
      ],
      [
        ['JER', 29],
        ['JER', 31],
      ],
      [
        ['EZK', 37],
        ['PSA', 33],
      ],
      [
        ['ROM', 8],
        ['PSA', 146],
      ],
    ],
  },
  {
    id: 'life-healing-7-days',
    key: 'healing',
    coverKey: 'lifeHealing',
    days: [
      [
        ['PSA', 103],
        ['PSA', 41],
        ['PSA', 6],
      ],
      [
        ['MAT', 8],
        ['MAT', 9],
      ],
      [
        ['MRK', 5],
        ['JHN', 9],
      ],
      [
        ['2KI', 5],
        ['ISA', 38],
      ],
      [
        ['ISA', 53],
        ['PSA', 107],
      ],
      [
        ['ACT', 3],
        ['ACT', 4],
      ],
      [
        ['JER', 30],
        ['PSA', 147],
      ],
    ],
  },
  {
    id: 'life-anger-7-days',
    key: 'anger',
    coverKey: 'lifeAnger',
    days: [
      [
        ['GEN', 4],
        ['PSA', 37],
      ],
      [
        ['EXO', 32],
        ['EXO', 34],
      ],
      [
        ['1SA', 18],
        ['1SA', 19],
      ],
      [
        ['1SA', 24],
        ['1SA', 25],
      ],
      [
        ['JON', 3],
        ['JON', 4],
      ],
      [
        ['LUK', 15],
        ['MAT', 18],
      ],
      [
        ['EPH', 4],
        ['ROM', 12],
      ],
    ],
  },
  {
    id: 'life-anxiety-7-days',
    key: 'anxiety',
    coverKey: 'lifeAnxiety',
    days: [
      [
        ['MAT', 6],
        ['PHP', 4],
      ],
      [
        ['1SA', 1],
        ['PSA', 86],
      ],
      [
        ['GEN', 22],
        ['1KI', 17],
      ],
      [
        ['PRO', 3],
        ['PSA', 112],
      ],
      [
        ['PSA', 121],
        ['PSA', 139],
      ],
      [
        ['ACT', 12],
        ['ACT', 27],
      ],
      [
        ['ISA', 12],
        ['PSA', 16],
      ],
    ],
  },
  {
    id: 'life-love-7-days',
    key: 'love',
    coverKey: 'lifeLove',
    days: [
      [
        ['1JN', 3],
        ['1JN', 4],
      ],
      [
        ['DEU', 6],
        ['DEU', 10],
      ],
      [
        ['1CO', 13],
        ['JHN', 15],
      ],
      [
        ['HOS', 2],
        ['HOS', 3],
        ['HOS', 11],
      ],
      [
        ['LUK', 15],
        ['JHN', 21],
      ],
      [
        ['1SA', 20],
        ['PHM', 1],
      ],
      [
        ['EPH', 3],
        ['ISA', 54],
        ['PSA', 136],
      ],
    ],
  },
  {
    id: 'life-patience-7-days',
    key: 'patience',
    coverKey: 'lifePatience',
    days: [
      [
        ['PSA', 130],
        ['PSA', 25],
      ],
      [
        ['GEN', 16],
        ['GEN', 21],
      ],
      [
        ['GEN', 8],
        ['PSA', 40],
      ],
      [
        ['1SA', 26],
        ['PSA', 57],
      ],
      [
        ['HAB', 1],
        ['HAB', 2],
      ],
      [
        ['NEH', 9],
        ['2PE', 3],
      ],
      [
        ['HEB', 12],
        ['JAS', 5],
      ],
    ],
  },
  {
    id: 'life-doubt-7-days',
    key: 'doubt',
    coverKey: 'lifeDoubt',
    days: [
      [
        ['LUK', 24],
        ['JHN', 20],
      ],
      [
        ['PSA', 73],
        ['PSA', 10],
      ],
      [
        ['EXO', 3],
        ['EXO', 4],
        ['JDG', 6],
      ],
      [
        ['GEN', 18],
        ['LUK', 1],
      ],
      [
        ['PSA', 19],
        ['ACT', 17],
      ],
      [
        ['HEB', 11],
        ['2PE', 1],
      ],
      [
        ['JHN', 6],
        ['1JN', 5],
      ],
    ],
  },
  {
    id: 'life-pride-7-days',
    key: 'pride',
    coverKey: 'lifePride',
    days: [
      [
        ['OBA', 1],
        ['JAS', 4],
      ],
      [
        ['DAN', 4],
        ['DAN', 5],
      ],
      [
        ['1SA', 15],
        ['2CH', 26],
      ],
      [
        ['LUK', 14],
        ['MAT', 23],
      ],
      [
        ['JHN', 13],
        ['PHP', 2],
      ],
      [
        ['1CO', 1],
        ['1CO', 4],
      ],
      [
        ['MIC', 6],
        ['PSA', 138],
      ],
    ],
  },
  {
    id: 'life-temptation-7-days',
    key: 'temptation',
    coverKey: 'lifeTemptation',
    days: [
      [
        ['GEN', 3],
        ['JAS', 1],
      ],
      [
        ['DEU', 8],
        ['MAT', 4],
      ],
      [
        ['GEN', 39],
        ['PRO', 7],
      ],
      [
        ['JOS', 7],
        ['1TI', 6],
      ],
      [
        ['2SA', 11],
        ['2SA', 12],
        ['PSA', 51],
      ],
      [
        ['PRO', 1],
        ['1CO', 10],
      ],
      [
        ['ROM', 6],
        ['GAL', 5],
        ['PSA', 1],
      ],
    ],
  },
  {
    id: 'life-family-7-days',
    key: 'family',
    coverKey: 'lifeFamily',
    days: [
      [
        ['GEN', 2],
        ['PSA', 128],
      ],
      [
        ['JOS', 24],
        ['PSA', 78],
      ],
      [
        ['GEN', 24],
        ['EPH', 5],
      ],
      [
        ['PRO', 4],
        ['PRO', 31],
      ],
      [
        ['GEN', 27],
        ['GEN', 33],
      ],
      [
        ['GEN', 44],
        ['GEN', 45],
      ],
      [
        ['GAL', 4],
        ['PSA', 133],
      ],
    ],
  },
];
