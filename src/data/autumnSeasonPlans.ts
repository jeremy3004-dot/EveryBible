import type { ChurchYearPlan } from './churchYearPlans';

/**
 * Dated weeks in the autumn: a week of prayer for Bible translation ending on
 * International Translation Day (30 September, St Jerome's day), All Saints from
 * 1 November, and a week for the persecuted church from the second Sunday of
 * November, when many churches pray for them. No chapter repeats across the three.
 */
export const AUTUMN_SEASON_PLANS: readonly ChurchYearPlan[] = [
  {
    id: 'word-in-every-language',
    key: 'translationWeek',
    coverKey: 'translationWeek',
    scheduleMode: 'calendar-translation-week',
    category: 'seasonal',
    days: [
      // The scroll burned and written again (Jeremiah 36).
      [
        ['JER', 36],
        ['PSA', 19],
      ],
      // The Law read aloud, and its meaning made clear (Nehemiah 8:8).
      [
        ['NEH', 8],
        ['PSA', 119],
      ],
      [
        ['ISA', 55],
        ['2TI', 3],
      ],
      // "Do you understand what you are reading?" (Acts 8:30)
      [
        ['ACT', 8],
        ['PSA', 68],
      ],
      [
        ['ACT', 2],
        ['PSA', 96],
      ],
      [
        ['ROM', 10],
        ['PSA', 67],
      ],
      // 30 September, International Translation Day: every tribe and language (Revelation 5:9).
      [
        ['REV', 5],
        ['PSA', 117],
      ],
    ],
  },
  {
    id: 'all-saints',
    key: 'allSaints',
    coverKey: 'allSaints',
    scheduleMode: 'calendar-all-saints',
    category: 'church-year',
    days: [
      // 1 November, All Saints' Day: so great a cloud of witnesses.
      [
        ['HEB', 11],
        ['HEB', 12],
      ],
      [
        ['REV', 7],
        ['PSA', 34],
      ],
      [
        ['MAT', 5],
        ['PSA', 112],
      ],
      [
        ['GEN', 15],
        ['PSA', 105],
      ],
      [
        ['1SA', 1],
        ['1SA', 2],
      ],
      [
        ['ACT', 9],
        ['ROM', 16],
      ],
      [
        ['2TI', 4],
        ['PSA', 116],
      ],
    ],
  },
  {
    id: 'persecuted-church',
    key: 'persecutedChurch',
    coverKey: 'persecutedChurch',
    scheduleMode: 'calendar-persecuted-church',
    category: 'seasonal',
    days: [
      // The second Sunday of November: grant your servants to speak your word with all boldness.
      [
        ['ACT', 4],
        ['PSA', 2],
      ],
      [
        ['ACT', 7],
        ['PSA', 31],
      ],
      [
        ['DAN', 3],
        ['DAN', 6],
      ],
      [
        ['ACT', 12],
        ['PSA', 142],
      ],
      [
        ['2CO', 11],
        ['2CO', 12],
      ],
      [
        ['MAT', 10],
        ['PSA', 44],
      ],
      [
        ['PHP', 1],
        ['PSA', 27],
      ],
    ],
  },
];
