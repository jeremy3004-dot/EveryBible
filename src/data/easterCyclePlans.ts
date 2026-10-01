import type { ChurchYearDay, ChurchYearPlan } from './churchYearPlans';

/**
 * The seasons around Easter, dated from it each year (see churchCalendar.ts).
 * Lent runs from Ash Wednesday to the eve of Palm Sunday, so that Holy Week
 * takes over on Palm Sunday; Easter runs from Easter Monday to the eve of
 * Ascension Day, and Ascension to Pentecost carries on from there. Each reading
 * is a whole chapter, and no chapter is read twice across the cycle, so a reader
 * who follows it from Ash Wednesday to Pentecost never meets the same chapter
 * twice. Holy Week is read on both the Western and the Orthodox dates.
 */

/** Palm Sunday to Easter Day, day by day through the week's events. */
const HOLY_WEEK_DAYS: readonly ChurchYearDay[] = [
  // Palm Sunday: the King comes to Jerusalem on a donkey.
  [
    ['MAT', 21],
    ['PSA', 118],
  ],
  // Monday: the fig tree, and the temple cleared.
  [
    ['MRK', 11],
    ['JER', 7],
  ],
  // Tuesday: questions in the temple, and the end of the age.
  [
    ['MRK', 12],
    ['MRK', 13],
  ],
  // Wednesday: anointed for His burial, and the hour has come; the friend who
  // lifts his heel against Him (Psalm 41).
  [
    ['JHN', 12],
    ['PSA', 41],
  ],
  // Maundy Thursday: the Passover, the washing of feet, the Last Supper, Gethsemane.
  [
    ['EXO', 12],
    ['JHN', 13],
    ['LUK', 22],
  ],
  // Good Friday: the Servant pierced for our transgressions.
  [
    ['ISA', 53],
    ['PSA', 22],
    ['JHN', 19],
  ],
  // Holy Saturday: the tomb sealed and guarded.
  [
    ['MAT', 27],
    ['JOB', 14],
  ],
  // Easter Day: He is risen.
  [
    ['MAT', 28],
    ['JHN', 20],
  ],
];

export const EASTER_CYCLE_PLANS: readonly ChurchYearPlan[] = [
  {
    id: 'lent',
    key: 'lent',
    coverKey: 'lent',
    scheduleMode: 'calendar-lent',
    category: 'church-year',
    days: [
      // Ash Wednesday to the first Sunday · Return: rend your hearts, not your garments.
      [
        ['ISA', 58],
        ['PSA', 51],
      ],
      [
        ['MAT', 6],
        ['PSA', 141],
      ],
      [
        ['LUK', 15],
        ['HOS', 14],
      ],
      [
        ['2CH', 7],
        ['PSA', 139],
      ],
      // Week 1 · The wilderness: tested, fed and given water on the way.
      [
        ['MAT', 4],
        ['DEU', 8],
      ],
      [
        ['EXO', 16],
        ['JHN', 6],
      ],
      [
        ['EXO', 17],
        ['JHN', 4],
      ],
      [
        ['NUM', 21],
        ['PSA', 95],
      ],
      [
        ['1KI', 19],
        ['PSA', 42],
      ],
      [
        ['HEB', 4],
        ['PSA', 91],
      ],
      [
        ['JAS', 1],
        ['PSA', 63],
      ],
      // Week 2 · Mercy: the God who forgives the one who turns back.
      [
        ['2SA', 12],
        ['PSA', 32],
      ],
      [
        ['LUK', 18],
        ['PSA', 6],
      ],
      [
        ['LUK', 7],
        ['PSA', 34],
      ],
      [
        ['ISA', 1],
        ['PSA', 38],
      ],
      [
        ['EZK', 18],
        ['PSA', 86],
      ],
      [
        ['ROM', 6],
        ['PSA', 19],
      ],
      [
        ['ROM', 7],
        ['PSA', 143],
      ],
      // Week 3 · Following: take up the cross, on the road to Jerusalem.
      [
        ['MRK', 8],
        ['PSA', 73],
      ],
      [
        ['MRK', 9],
        ['EXO', 34],
      ],
      [
        ['MRK', 10],
        ['PSA', 131],
      ],
      [
        ['LUK', 9],
        ['PSA', 84],
      ],
      [
        ['LUK', 14],
        ['PSA', 15],
      ],
      [
        ['JHN', 9],
        ['PSA', 146],
      ],
      [
        ['JHN', 10],
        ['EZK', 34],
      ],
      // Week 4 · The Lamb: the sacrifice the Law and the prophets pointed to.
      [
        ['GEN', 22],
        ['JAS', 2],
      ],
      [
        ['LEV', 16],
        ['HEB', 9],
      ],
      [
        ['ISA', 50],
        ['PSA', 69],
      ],
      [
        ['ZEC', 12],
        ['ZEC', 13],
      ],
      [
        ['1PE', 2],
        ['PSA', 31],
      ],
      [
        ['HEB', 5],
        ['PSA', 102],
      ],
      [
        ['2CO', 4],
        ['PSA', 43],
      ],
      // Week 5 · Toward Jerusalem. The last day is the eve of Palm Sunday,
      // when Lazarus is raised (John 11).
      [
        ['MAT', 16],
        ['PSA', 110],
      ],
      [
        ['MAT', 20],
        ['PSA', 123],
      ],
      [
        ['LUK', 13],
        ['PSA', 48],
      ],
      [
        ['HOS', 6],
        ['JHN', 15],
      ],
      [
        ['ROM', 3],
        ['PSA', 14],
      ],
      [
        ['JOB', 19],
        ['PSA', 88],
      ],
      [
        ['JHN', 11],
        ['PSA', 30],
      ],
    ],
  },
  {
    id: 'holy-week',
    key: 'holyWeek',
    coverKey: 'holyWeek',
    scheduleMode: 'calendar-holy-week',
    category: 'church-year',
    days: HOLY_WEEK_DAYS,
  },
  {
    id: 'orthodox-holy-week',
    key: 'orthodoxHolyWeek',
    coverKey: 'orthodoxHolyWeek',
    scheduleMode: 'calendar-orthodox-holy-week',
    category: 'church-year',
    // The same readings, on the Orthodox calendar's dates.
    days: HOLY_WEEK_DAYS,
  },
  {
    id: 'easter',
    key: 'easter',
    coverKey: 'easter',
    scheduleMode: 'calendar-easter',
    category: 'church-year',
    days: [
      // Easter week: the risen Lord appears.
      [
        ['LUK', 24],
        ['PSA', 66],
      ],
      [
        ['MRK', 16],
        ['1CO', 15],
      ],
      [
        ['JHN', 21],
        ['PSA', 100],
      ],
      [
        ['COL', 3],
        ['PSA', 111],
      ],
      [
        ['1TH', 4],
        ['PSA', 92],
      ],
      [
        ['REV', 1],
        ['PSA', 93],
      ],
      // A living hope: 1 Peter.
      [
        ['1PE', 1],
        ['PSA', 113],
      ],
      [
        ['1PE', 3],
        ['PSA', 115],
      ],
      [
        ['1PE', 4],
        ['PSA', 116],
      ],
      [
        ['1PE', 5],
        ['PSA', 23],
      ],
      // Walking in the light: 1 John.
      [
        ['1JN', 1],
        ['PSA', 36],
      ],
      [
        ['1JN', 2],
        ['PSA', 33],
      ],
      [
        ['1JN', 3],
        ['PSA', 133],
      ],
      [
        ['1JN', 4],
        ['PSA', 138],
      ],
      [
        ['1JN', 5],
        ['PSA', 21],
      ],
      // Our great High Priest, who lives forever: Hebrews.
      [
        ['HEB', 7],
        ['PSA', 99],
      ],
      [
        ['HEB', 8],
        ['PSA', 81],
      ],
      [
        ['HEB', 10],
        ['PSA', 40],
      ],
      [
        ['HEB', 13],
        ['PSA', 125],
      ],
      // The Lamb who was slain, alive for evermore: Revelation.
      [
        ['REV', 5],
        ['PSA', 148],
      ],
      [
        ['REV', 19],
        ['PSA', 149],
      ],
      [
        ['REV', 22],
        ['PSA', 150],
      ],
      // Raised with Christ: the letters.
      [
        ['COL', 1],
        ['PSA', 57],
      ],
      [
        ['COL', 2],
        ['PSA', 124],
      ],
      [
        ['EPH', 2],
        ['PSA', 65],
      ],
      [
        ['PHP', 3],
        ['PSA', 16],
      ],
      [
        ['2TI', 1],
        ['PSA', 46],
      ],
      [
        ['2TI', 2],
        ['PSA', 71],
      ],
      // The God who raises the dead, through the whole Bible. The last day,
      // the eve of Ascension, sees the Son of Man come to the Ancient of Days.
      [
        ['JHN', 5],
        ['PSA', 28],
      ],
      [
        ['ISA', 26],
        ['PSA', 62],
      ],
      [
        ['DAN', 12],
        ['PSA', 17],
      ],
      [
        ['1KI', 17],
        ['2KI', 4],
      ],
      [
        ['MRK', 5],
        ['PSA', 9],
      ],
      [
        ['JON', 2],
        ['MAT', 12],
      ],
      [
        ['HOS', 13],
        ['PSA', 56],
      ],
      [
        ['ISA', 65],
        ['PSA', 145],
      ],
      [
        ['LUK', 20],
        ['PSA', 49],
      ],
      [
        ['DAN', 7],
        ['PSA', 24],
      ],
    ],
  },
  {
    id: 'ascension-to-pentecost',
    key: 'pentecost',
    coverKey: 'pentecost',
    scheduleMode: 'calendar-pentecost',
    category: 'church-year',
    days: [
      // Ascension Day: He is taken up, and the disciples wait and pray.
      [
        ['ACT', 1],
        ['PSA', 47],
      ],
      // The promise of the Spirit, from the Upper Room.
      [
        ['JHN', 14],
        ['PSA', 68],
      ],
      [
        ['JHN', 16],
        ['PSA', 25],
      ],
      [
        ['JHN', 17],
        ['PSA', 67],
      ],
      // Babel scattered the languages; the Spirit gathers every tongue.
      [
        ['GEN', 11],
        ['ISA', 66],
      ],
      [
        ['NUM', 11],
        ['JOL', 2],
      ],
      [
        ['EZK', 36],
        ['EZK', 37],
      ],
      [
        ['ISA', 44],
        ['JHN', 7],
      ],
      [
        ['ROM', 8],
        ['GAL', 5],
      ],
      [
        ['1CO', 12],
        ['EPH', 4],
      ],
      // Pentecost: each one hears in their own language (Acts 2:6).
      [
        ['ACT', 2],
        ['PSA', 104],
      ],
    ],
  },
];
