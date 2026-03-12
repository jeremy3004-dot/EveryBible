export interface HarvestStudyEntry {
  bookId: string;
  chapter: number;
}

export interface HarvestStudyGroup {
  id: string;
  title: string;
  entries: HarvestStudyEntry[];
}

export interface HarvestStudySection {
  id: string;
  title: string;
  description: string;
  groups: HarvestStudyGroup[];
}

export const harvestStudySections: HarvestStudySection[] = [
  {
    id: 'christology',
    title: 'Christology',
    description:
      'Sustained chapter studies on who Jesus is, His mission, death, resurrection, and reign.',
    groups: [
      {
        id: 'eternal-christ',
        title: 'The Eternal Christ (Pre-existence)',
        entries: [
          { bookId: 'JHN', chapter: 1 },
          { bookId: 'COL', chapter: 1 },
          { bookId: 'HEB', chapter: 1 },
        ],
      },
      {
        id: 'birth-of-jesus',
        title: 'The Birth of Jesus (Incarnation)',
        entries: [
          { bookId: 'MAT', chapter: 1 },
          { bookId: 'MAT', chapter: 2 },
          { bookId: 'LUK', chapter: 1 },
          { bookId: 'LUK', chapter: 2 },
        ],
      },
      {
        id: 'mission-of-jesus',
        title: 'The Mission of Jesus',
        entries: [
          { bookId: 'MRK', chapter: 1 },
          { bookId: 'LUK', chapter: 4 },
          { bookId: 'JHN', chapter: 3 },
        ],
      },
      {
        id: 'death-of-jesus',
        title: 'The Death of Jesus (Atonement)',
        entries: [
          { bookId: 'MAT', chapter: 26 },
          { bookId: 'MAT', chapter: 27 },
          { bookId: 'JHN', chapter: 19 },
        ],
      },
      {
        id: 'resurrection-of-jesus',
        title: 'The Resurrection of Jesus',
        entries: [
          { bookId: 'MAT', chapter: 28 },
          { bookId: 'LUK', chapter: 24 },
          { bookId: '1CO', chapter: 15 },
        ],
      },
      {
        id: 'exalted-christ',
        title: 'The Exalted Christ',
        entries: [
          { bookId: 'ACT', chapter: 1 },
          { bookId: 'PHP', chapter: 2 },
          { bookId: 'REV', chapter: 1 },
        ],
      },
    ],
  },
  {
    id: 'gospel',
    title: 'The Gospel',
    description:
      'Chapter-based studies on sin, grace, justification, and salvation through Christ.',
    groups: [
      {
        id: 'gospel-salvation',
        title: 'The Gospel (Salvation)',
        entries: [
          { bookId: 'ROM', chapter: 3 },
          { bookId: 'ROM', chapter: 5 },
          { bookId: 'ROM', chapter: 8 },
          { bookId: 'EPH', chapter: 2 },
          { bookId: '1CO', chapter: 15 },
        ],
      },
    ],
  },
  {
    id: 'prayer',
    title: 'Prayer',
    description: 'Models and teachings that strengthen daily prayer life.',
    groups: [
      {
        id: 'prayer-core',
        title: 'Prayer',
        entries: [
          { bookId: 'MAT', chapter: 6 },
          { bookId: 'LUK', chapter: 11 },
          { bookId: 'JHN', chapter: 17 },
          { bookId: 'PSA', chapter: 51 },
        ],
      },
    ],
  },
  {
    id: 'love-and-christian-living',
    title: 'Love and Christian Living',
    description: 'Practical chapters for walking in love, holiness, and Spirit-led obedience.',
    groups: [
      {
        id: 'love-and-living-core',
        title: 'Love and Christian Living',
        entries: [
          { bookId: '1CO', chapter: 13 },
          { bookId: 'ROM', chapter: 12 },
          { bookId: 'GAL', chapter: 5 },
          { bookId: 'COL', chapter: 3 },
        ],
      },
    ],
  },
  {
    id: 'discipleship',
    title: 'Discipleship',
    description: 'Teachings on following Jesus with obedience, surrender, and kingdom priorities.',
    groups: [
      {
        id: 'discipleship-core',
        title: 'Discipleship',
        entries: [
          { bookId: 'MAT', chapter: 5 },
          { bookId: 'MAT', chapter: 6 },
          { bookId: 'MAT', chapter: 7 },
          { bookId: 'LUK', chapter: 14 },
        ],
      },
    ],
  },
  {
    id: 'church',
    title: 'The Church',
    description: 'The identity, unity, and mission of the church in action.',
    groups: [
      {
        id: 'church-core',
        title: 'The Church',
        entries: [
          { bookId: 'ACT', chapter: 2 },
          { bookId: 'ACT', chapter: 4 },
          { bookId: 'EPH', chapter: 4 },
        ],
      },
    ],
  },
  {
    id: 'mission-harvest',
    title: 'Mission / Harvest',
    description: 'Core chapters on evangelism, witness, and the Great Commission.',
    groups: [
      {
        id: 'mission-harvest-core',
        title: 'Mission / Harvest',
        entries: [
          { bookId: 'MAT', chapter: 9 },
          { bookId: 'MAT', chapter: 28 },
          { bookId: 'ACT', chapter: 1 },
        ],
      },
    ],
  },
];
