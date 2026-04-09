import type { ReadingPlanRhythmItem, RhythmSlot } from './types';

type RhythmPresetItem =
  | {
      type: 'passage';
      title: string;
      bookId: string;
      startChapter: number;
      endChapter?: number;
    }
  | {
      type: 'plan';
      planId: string;
    };

export interface RhythmPreset {
  id: string;
  title: string;
  tradition: string;
  historicRoots: string;
  description: string;
  slot: RhythmSlot | null;
  items: RhythmPresetItem[];
}

const passage = (
  title: string,
  bookId: string,
  startChapter: number,
  endChapter: number = startChapter
): RhythmPresetItem => ({
  type: 'passage',
  title,
  bookId,
  startChapter,
  endChapter,
});

export const RHYTHM_PRESET_LIBRARY: RhythmPreset[] = [
  {
    id: 'catholic-morning-prayer',
    title: 'Catholic Morning Prayer',
    tradition: 'Catholic',
    historicRoots: 'Liturgy of the Hours',
    description: 'A Lauds-shaped start with praise, canticle, and Gospel blessing.',
    slot: 'morning',
    items: [
      passage('Psalm 63', 'PSA', 63),
      passage('Daniel 3', 'DAN', 3),
      passage('Luke 1', 'LUK', 1),
    ],
  },
  {
    id: 'catholic-daytime-prayer',
    title: 'Catholic Daytime Prayer',
    tradition: 'Catholic',
    historicRoots: 'Liturgy of the Hours',
    description: 'A compact midday office built around short psalmody and a steady return to God.',
    slot: 'afternoon',
    items: [
      passage('Psalm 120', 'PSA', 120),
      passage('Psalm 121', 'PSA', 121),
      passage('Psalm 122', 'PSA', 122),
    ],
  },
  {
    id: 'catholic-evening-prayer',
    title: 'Catholic Evening Prayer',
    tradition: 'Catholic',
    historicRoots: 'Liturgy of the Hours',
    description: 'A Vespers-inspired close to the day with psalms, thanksgiving, and the Magnificat.',
    slot: 'evening',
    items: [
      passage('Psalm 141', 'PSA', 141),
      passage('Psalm 134', 'PSA', 134),
      passage('Luke 1', 'LUK', 1),
    ],
  },
  {
    id: 'catholic-night-prayer',
    title: 'Catholic Night Prayer',
    tradition: 'Catholic',
    historicRoots: 'Compline',
    description: 'A bedtime rhythm for trust, protection, and peaceful surrender.',
    slot: 'evening',
    items: [
      passage('Psalm 4', 'PSA', 4),
      passage('Psalm 91', 'PSA', 91),
      passage('Luke 2', 'LUK', 2),
    ],
  },
  {
    id: 'catholic-lectio-divina',
    title: 'Catholic Lectio Divina',
    tradition: 'Catholic',
    historicRoots: 'Lectio Divina',
    description: 'A slower reading rhythm meant for meditation, prayer, and lingering in the text.',
    slot: null,
    items: [
      passage('Psalm 1', 'PSA', 1),
      passage('John 15', 'JHN', 15),
      passage('James 1', 'JAS', 1),
    ],
  },
  {
    id: 'ignatian-daily-examen',
    title: 'Ignatian Daily Examen',
    tradition: 'Catholic',
    historicRoots: 'Ignatian spirituality',
    description: 'A reflective end-of-day sequence built around gratitude, review, and repentance.',
    slot: 'evening',
    items: [
      passage('Psalm 139', 'PSA', 139),
      passage('Psalm 51', 'PSA', 51),
      passage('Luke 24', 'LUK', 24),
    ],
  },
  {
    id: 'anglican-morning-prayer',
    title: 'Anglican Morning Prayer',
    tradition: 'Anglican',
    historicRoots: 'Book of Common Prayer',
    description: 'An office-shaped morning with psalmody and Gospel teaching for the day ahead.',
    slot: 'morning',
    items: [
      passage('Psalm 5', 'PSA', 5),
      passage('Psalm 63', 'PSA', 63),
      passage('Matthew 5', 'MAT', 5),
    ],
  },
  {
    id: 'anglican-noonday-prayer',
    title: 'Anglican Noonday Prayer',
    tradition: 'Anglican',
    historicRoots: 'Daily Prayer',
    description: 'A short prayer break for the middle of the day with psalms of help and bread-of-life hope.',
    slot: 'afternoon',
    items: [
      passage('Psalm 121', 'PSA', 121),
      passage('Psalm 126', 'PSA', 126),
      passage('John 6', 'JHN', 6),
    ],
  },
  {
    id: 'anglican-evening-prayer',
    title: 'Anglican Evening Prayer',
    tradition: 'Anglican',
    historicRoots: 'Book of Common Prayer',
    description: 'A classic Evensong-shaped flow with evening psalms and the song of Mary.',
    slot: 'evening',
    items: [
      passage('Psalm 141', 'PSA', 141),
      passage('Psalm 134', 'PSA', 134),
      passage('Luke 1', 'LUK', 1),
    ],
  },
  {
    id: 'anglican-compline',
    title: 'Anglican Compline',
    tradition: 'Anglican',
    historicRoots: 'Book of Common Prayer',
    description: 'A gentle night office for confession, trust, and rest.',
    slot: 'evening',
    items: [
      passage('Psalm 4', 'PSA', 4),
      passage('Psalm 31', 'PSA', 31),
      passage('John 14', 'JHN', 14),
    ],
  },
  {
    id: 'orthodox-morning-rule',
    title: 'Orthodox Morning Rule',
    tradition: 'Orthodox',
    historicRoots: 'Morning prayers',
    description: 'A dawn prayer rule shaped by repentance, mercy, and the prayer Jesus taught.',
    slot: 'morning',
    items: [
      passage('Psalm 51', 'PSA', 51),
      passage('Psalm 143', 'PSA', 143),
      passage('Matthew 6', 'MAT', 6),
    ],
  },
  {
    id: 'orthodox-sixth-hour',
    title: 'Orthodox Sixth Hour',
    tradition: 'Orthodox',
    historicRoots: 'Hours of prayer',
    description: 'A midday office-style pause that keeps the Passion and vigilance in view.',
    slot: 'afternoon',
    items: [
      passage('Psalm 54', 'PSA', 54),
      passage('Psalm 55', 'PSA', 55),
      passage('Psalm 91', 'PSA', 91),
    ],
  },
  {
    id: 'orthodox-vespers',
    title: 'Orthodox Vespers',
    tradition: 'Orthodox',
    historicRoots: 'Daily Vespers',
    description: 'An evening offering with creation praise, lamp-light psalmody, and the Word.',
    slot: 'evening',
    items: [
      passage('Psalm 103', 'PSA', 103),
      passage('Psalm 141', 'PSA', 141),
      passage('John 1', 'JHN', 1),
    ],
  },
  {
    id: 'orthodox-small-compline',
    title: 'Orthodox Small Compline',
    tradition: 'Orthodox',
    historicRoots: 'Compline',
    description: 'A quiet night office for mercy, refuge, and the final prayers before sleep.',
    slot: 'evening',
    items: [
      passage('Psalm 50', 'PSA', 50),
      passage('Psalm 69', 'PSA', 69),
      passage('Luke 2', 'LUK', 2),
    ],
  },
  {
    id: 'benedictine-sacred-reading',
    title: 'Benedictine Sacred Reading',
    tradition: 'Benedictine',
    historicRoots: 'Rule of Saint Benedict',
    description: 'A reading-forward rhythm inspired by fixed hours of lectio and calm attention.',
    slot: 'morning',
    items: [
      passage('Psalm 1', 'PSA', 1),
      passage('Proverbs 2', 'PRO', 2),
      passage('John 15', 'JHN', 15),
    ],
  },
  {
    id: 'benedictine-psalm-and-work',
    title: 'Benedictine Psalm and Work',
    tradition: 'Benedictine',
    historicRoots: 'Ora et labora',
    description: 'A practical sequence for prayer, work, and quiet obedience through the day.',
    slot: null,
    items: [
      passage('Psalm 90', 'PSA', 90),
      passage('Psalm 127', 'PSA', 127),
      passage('Colossians 3', 'COL', 3),
    ],
  },
  {
    id: 'taize-evening-prayer',
    title: 'Taize Evening Prayer',
    tradition: 'Taize',
    historicRoots: 'Common prayer at Taize',
    description: 'A song-and-silence evening built around psalm, reading, and stillness.',
    slot: 'evening',
    items: [
      passage('Psalm 104', 'PSA', 104),
      passage('1 John 1', '1JN', 1),
      passage('Matthew 28', 'MAT', 28),
    ],
  },
  {
    id: 'lutheran-morning-devotion',
    title: 'Lutheran Morning Devotion',
    tradition: 'Lutheran',
    historicRoots: 'Daily devotions for families',
    description: 'A rise-and-go rhythm for homes that want Scripture, memory, and steady prayer.',
    slot: 'morning',
    items: [
      passage('Deuteronomy 6', 'DEU', 6),
      passage('Psalm 143', 'PSA', 143),
      passage('Romans 8', 'ROM', 8),
    ],
  },
  {
    id: 'lutheran-close-of-day',
    title: 'Lutheran Close of Day',
    tradition: 'Lutheran',
    historicRoots: 'Daily devotions for families',
    description: 'A simple night devotion for confession, refuge, and the keeping of Christ.',
    slot: 'evening',
    items: [
      passage('Psalm 4', 'PSA', 4),
      passage('Psalm 91', 'PSA', 91),
      passage('1 Peter 5', '1PE', 5),
    ],
  },
  {
    id: 'puritan-family-worship',
    title: 'Puritan Family Worship',
    tradition: 'Puritan',
    historicRoots: 'Directory for Family Worship',
    description: 'A home-centered evening with prayer, praise, Scripture, and godly conversation.',
    slot: 'evening',
    items: [
      passage('Psalm 1', 'PSA', 1),
      passage('Deuteronomy 6', 'DEU', 6),
      passage('Ephesians 6', 'EPH', 6),
    ],
  },
];

export const RHYTHM_PRESET_TRADITIONS = Array.from(
  new Set(RHYTHM_PRESET_LIBRARY.map((preset) => preset.tradition))
);

export const buildPresetRhythmItems = (preset: RhythmPreset): ReadingPlanRhythmItem[] =>
  preset.items.map((item) => {
    if (item.type === 'plan') {
      return {
        id: '',
        type: 'plan',
        planId: item.planId,
      };
    }

    return {
      id: '',
      type: 'passage',
      title: item.title,
      bookId: item.bookId,
      startChapter: item.startChapter,
      endChapter: item.endChapter ?? item.startChapter,
    };
  });
