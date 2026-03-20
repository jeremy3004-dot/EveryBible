export type BibleCompanionModuleKind =
  | 'passages'
  | 'devotionals'
  | 'plans'
  | 'playlists'
  | 'figures';

export type BibleCompanionModuleState = 'ready' | 'coming-soon';
export type BibleBookArtworkVariant = 'ember' | 'meadow' | 'midnight' | 'river' | 'sunrise';

export interface BibleCompanionReference {
  bookId: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
}

export interface BibleCompanionBaseItem {
  id: string;
  title: string;
  summary: string;
  artworkVariant?: BibleBookArtworkVariant;
  actionLabel?: string;
  state?: BibleCompanionModuleState;
}

export interface PassageItem extends BibleCompanionBaseItem {
  kind: 'passages';
  reference: BibleCompanionReference;
  durationMinutes?: number;
}

export interface DevotionalItem extends BibleCompanionBaseItem {
  kind: 'devotionals';
  reference: BibleCompanionReference;
  speaker?: string;
  durationMinutes?: number;
}

export interface PlanItem extends BibleCompanionBaseItem {
  kind: 'plans';
  days: number;
  entries: BibleCompanionReference[];
}

export interface PlaylistItem extends BibleCompanionBaseItem {
  kind: 'playlists';
  itemCount: number;
  entries: BibleCompanionReference[];
}

export interface FigureItem extends BibleCompanionBaseItem {
  kind: 'figures';
  personName: string;
  role: string;
  references: BibleCompanionReference[];
}

export type BibleCompanionItem =
  | PassageItem
  | DevotionalItem
  | PlanItem
  | PlaylistItem
  | FigureItem;

export interface BibleCompanionModule {
  id: string;
  kind: BibleCompanionModuleKind;
  title: string;
  description?: string;
  items: BibleCompanionItem[];
}

export interface BibleBookExperienceContent {
  bookId: string;
  synopsis: string;
  introAudioLabel?: string;
  introAudioState?: BibleCompanionModuleState;
  artworkVariant?: BibleBookArtworkVariant;
  modules: BibleCompanionModule[];
}

export const bibleBookExperienceContent: Partial<Record<string, BibleBookExperienceContent>> = {
  GEN: {
    bookId: 'GEN',
    synopsis:
      'Genesis begins the story of creation, rebellion, promise, and family, tracing how God forms a people through covenant and mercy.',
    introAudioLabel: 'Genesis overview coming soon',
    introAudioState: 'coming-soon',
    artworkVariant: 'sunrise',
    modules: [
      {
        id: 'gen-passages',
        kind: 'passages',
        title: 'Passages',
        description: 'Foundational chapters that frame the whole story of Scripture.',
        items: [
          {
            id: 'gen-creation',
            kind: 'passages',
            title: 'In the beginning',
            summary: 'Creation, image-bearing, and Sabbath rest.',
            reference: { bookId: 'GEN', chapter: 1, verseStart: 1, verseEnd: 31 },
            durationMinutes: 4,
            artworkVariant: 'sunrise',
            actionLabel: 'Open chapter',
          },
          {
            id: 'gen-abraham',
            kind: 'passages',
            title: 'The call of Abram',
            summary: 'God launches a covenant family through promise and trust.',
            reference: { bookId: 'GEN', chapter: 12, verseStart: 1, verseEnd: 9 },
            durationMinutes: 3,
            artworkVariant: 'meadow',
            actionLabel: 'Open chapter',
          },
        ],
      },
      {
        id: 'gen-figures',
        kind: 'figures',
        title: 'Biblical figures',
        description: 'Key people who shape the opening movements of Scripture.',
        items: [
          {
            id: 'gen-abraham-figure',
            kind: 'figures',
            title: 'Abraham',
            summary: 'A pilgrim of faith who learns to trust God’s promise.',
            personName: 'Abraham',
            role: 'Covenant bearer',
            references: [{ bookId: 'GEN', chapter: 12 }, { bookId: 'GEN', chapter: 15 }],
            artworkVariant: 'meadow',
            actionLabel: 'Read key chapter',
          },
          {
            id: 'gen-joseph-figure',
            kind: 'figures',
            title: 'Joseph',
            summary: 'A betrayed son whose faithfulness preserves many lives.',
            personName: 'Joseph',
            role: 'Preserver in exile',
            references: [{ bookId: 'GEN', chapter: 37 }, { bookId: 'GEN', chapter: 50 }],
            artworkVariant: 'river',
            actionLabel: 'Read key chapter',
          },
        ],
      },
    ],
  },
  MAT: {
    bookId: 'MAT',
    synopsis:
      'Matthew presents Jesus as the promised King, weaving teaching, fulfillment, and kingdom mission into a Gospel built for disciples.',
    introAudioLabel: 'Matthew overview coming soon',
    introAudioState: 'coming-soon',
    artworkVariant: 'river',
    modules: [
      {
        id: 'mat-passages',
        kind: 'passages',
        title: 'Passages',
        description: 'Signature sections for reading Matthew with the whole kingdom story in view.',
        items: [
          {
            id: 'mat-sermon-on-the-mount',
            kind: 'passages',
            title: 'The Sermon on the Mount',
            summary: 'Jesus names the character and practices of kingdom life.',
            reference: { bookId: 'MAT', chapter: 5 },
            durationMinutes: 8,
            artworkVariant: 'sunrise',
            actionLabel: 'Open chapter',
          },
          {
            id: 'mat-great-commission',
            kind: 'passages',
            title: 'The Great Commission',
            summary: 'The risen Christ sends His people to make disciples in every nation.',
            reference: { bookId: 'MAT', chapter: 28, verseStart: 16, verseEnd: 20 },
            durationMinutes: 3,
            artworkVariant: 'ember',
            actionLabel: 'Open chapter',
          },
        ],
      },
      {
        id: 'mat-devotionals',
        kind: 'devotionals',
        title: 'Devotionals',
        description: 'Short reflections that stay close to Jesus’ teaching.',
        items: [
          {
            id: 'mat-devotional-beatitudes',
            kind: 'devotionals',
            title: 'Blessed in the upside-down kingdom',
            summary: 'Sit with the Beatitudes and notice where Jesus reforms our desires.',
            reference: { bookId: 'MAT', chapter: 5, verseStart: 1, verseEnd: 12 },
            speaker: 'EveryBible Team',
            durationMinutes: 4,
            artworkVariant: 'sunrise',
            actionLabel: 'Read chapter',
          },
        ],
      },
      {
        id: 'mat-plans',
        kind: 'plans',
        title: 'Plans',
        description: 'Simple pathways for moving through Matthew on purpose.',
        items: [
          {
            id: 'mat-plan-kingdom-rhythm',
            kind: 'plans',
            title: 'Kingdom rhythm in Matthew',
            summary: 'Seven days through identity, prayer, mercy, mission, and resurrection hope.',
            days: 7,
            entries: [
              { bookId: 'MAT', chapter: 5 },
              { bookId: 'MAT', chapter: 6 },
              { bookId: 'MAT', chapter: 7 },
              { bookId: 'MAT', chapter: 9 },
              { bookId: 'MAT', chapter: 13 },
              { bookId: 'MAT', chapter: 24 },
              { bookId: 'MAT', chapter: 28 },
            ],
            artworkVariant: 'river',
            actionLabel: 'Open first chapter',
          },
        ],
      },
    ],
  },
  JHN: {
    bookId: 'JHN',
    synopsis:
      'John slows down to help readers behold Jesus, trust Him, and receive life through signs, conversations, and the language of abiding love.',
    introAudioLabel: 'John overview coming soon',
    introAudioState: 'coming-soon',
    artworkVariant: 'midnight',
    modules: [
      {
        id: 'jhn-passages',
        kind: 'passages',
        title: 'Passages',
        description: 'Chapters that clarify John’s central invitations to believe and abide.',
        items: [
          {
            id: 'jhn-prologue',
            kind: 'passages',
            title: 'The Word made flesh',
            summary: 'John opens with light, life, and the glory of Christ.',
            reference: { bookId: 'JHN', chapter: 1, verseStart: 1, verseEnd: 18 },
            durationMinutes: 4,
            artworkVariant: 'midnight',
            actionLabel: 'Open chapter',
          },
          {
            id: 'jhn-abide',
            kind: 'passages',
            title: 'Abide in me',
            summary: 'Jesus teaches His friends how fruitfulness grows from nearness.',
            reference: { bookId: 'JHN', chapter: 15, verseStart: 1, verseEnd: 17 },
            durationMinutes: 5,
            artworkVariant: 'river',
            actionLabel: 'Open chapter',
          },
        ],
      },
      {
        id: 'jhn-figures',
        kind: 'figures',
        title: 'Biblical figures',
        description: 'People whose encounters with Jesus reveal the heart of the Gospel.',
        items: [
          {
            id: 'jhn-nicodemus',
            kind: 'figures',
            title: 'Nicodemus',
            summary: 'A religious teacher invited into new birth from above.',
            personName: 'Nicodemus',
            role: 'Seeker',
            references: [{ bookId: 'JHN', chapter: 3 }, { bookId: 'JHN', chapter: 19 }],
            artworkVariant: 'midnight',
            actionLabel: 'Read key chapter',
          },
          {
            id: 'jhn-mary-magdalene',
            kind: 'figures',
            title: 'Mary Magdalene',
            summary: 'A witness of resurrection hope and personal restoration.',
            personName: 'Mary Magdalene',
            role: 'First resurrection witness',
            references: [{ bookId: 'JHN', chapter: 20 }],
            artworkVariant: 'sunrise',
            actionLabel: 'Read key chapter',
          },
        ],
      },
      {
        id: 'jhn-playlists',
        kind: 'playlists',
        title: 'Playlists',
        description: 'Curated listening routes through John’s major movements.',
        items: [
          {
            id: 'jhn-playlist-signs',
            kind: 'playlists',
            title: 'The signs of Jesus',
            summary: 'A guided path through the signs that reveal Christ’s identity.',
            itemCount: 5,
            entries: [
              { bookId: 'JHN', chapter: 2 },
              { bookId: 'JHN', chapter: 4 },
              { bookId: 'JHN', chapter: 6 },
              { bookId: 'JHN', chapter: 9 },
              { bookId: 'JHN', chapter: 11 },
            ],
            artworkVariant: 'river',
            actionLabel: 'Start playlist',
          },
        ],
      },
    ],
  },
  GAL: {
    bookId: 'GAL',
    synopsis:
      'Galatians is a swift, urgent letter about freedom in Christ, confronting false confidence and calling believers to live by the Spirit.',
    introAudioLabel: 'Galatians overview coming soon',
    introAudioState: 'coming-soon',
    artworkVariant: 'ember',
    modules: [
      {
        id: 'gal-passages',
        kind: 'passages',
        title: 'Passages',
        description: 'Sections that hold Galatians together from grace to Spirit-led life.',
        items: [
          {
            id: 'gal-justified-by-faith',
            kind: 'passages',
            title: 'Justified by faith',
            summary: 'Paul insists that life with God begins and continues by grace.',
            reference: { bookId: 'GAL', chapter: 2, verseStart: 15, verseEnd: 21 },
            durationMinutes: 3,
            artworkVariant: 'ember',
            actionLabel: 'Open chapter',
          },
          {
            id: 'gal-walk-by-the-spirit',
            kind: 'passages',
            title: 'Walk by the Spirit',
            summary: 'Freedom takes concrete shape in Spirit-formed character.',
            reference: { bookId: 'GAL', chapter: 5, verseStart: 16, verseEnd: 26 },
            durationMinutes: 4,
            artworkVariant: 'river',
            actionLabel: 'Open chapter',
          },
        ],
      },
      {
        id: 'gal-devotionals',
        kind: 'devotionals',
        title: 'Devotionals',
        description: 'Brief reflections for reading Galatians prayerfully.',
        items: [
          {
            id: 'gal-devotional-no-longer-slaves',
            kind: 'devotionals',
            title: 'No longer slaves',
            summary: 'Pause over adoption, inheritance, and the Father’s welcome.',
            reference: { bookId: 'GAL', chapter: 4, verseStart: 4, verseEnd: 7 },
            speaker: 'EveryBible Team',
            durationMinutes: 4,
            artworkVariant: 'sunrise',
            actionLabel: 'Read chapter',
          },
        ],
      },
      {
        id: 'gal-plans',
        kind: 'plans',
        title: 'Plans',
        description: 'Short structured routes through the letter.',
        items: [
          {
            id: 'gal-plan-six-days',
            kind: 'plans',
            title: 'A chapter a day: Galatians',
            summary: 'Read one chapter each day and trace Paul’s argument without rushing it.',
            days: 6,
            entries: [
              { bookId: 'GAL', chapter: 1 },
              { bookId: 'GAL', chapter: 2 },
              { bookId: 'GAL', chapter: 3 },
              { bookId: 'GAL', chapter: 4 },
              { bookId: 'GAL', chapter: 5 },
              { bookId: 'GAL', chapter: 6 },
            ],
            artworkVariant: 'ember',
            actionLabel: 'Open first chapter',
          },
        ],
      },
      {
        id: 'gal-figures',
        kind: 'figures',
        title: 'Biblical figures',
        description: 'People named or implied in Paul’s argument.',
        items: [
          {
            id: 'gal-paul',
            kind: 'figures',
            title: 'Paul',
            summary: 'An apostle defending grace with pastoral courage.',
            personName: 'Paul',
            role: 'Apostle',
            references: [{ bookId: 'GAL', chapter: 1 }, { bookId: 'GAL', chapter: 2 }],
            artworkVariant: 'midnight',
            actionLabel: 'Read key chapter',
          },
          {
            id: 'gal-abraham',
            kind: 'figures',
            title: 'Abraham',
            summary: 'Paul reaches back to Abraham to show that blessing comes through faith.',
            personName: 'Abraham',
            role: 'Model of faith',
            references: [{ bookId: 'GAL', chapter: 3 }],
            artworkVariant: 'meadow',
            actionLabel: 'Read key chapter',
          },
        ],
      },
    ],
  },
  PSA: {
    bookId: 'PSA',
    synopsis:
      'Psalms teaches the language of prayer, praise, lament, repentance, and hope, giving God’s people words for every season.',
    introAudioLabel: 'Psalms overview coming soon',
    introAudioState: 'coming-soon',
    artworkVariant: 'meadow',
    modules: [
      {
        id: 'psa-playlists',
        kind: 'playlists',
        title: 'Playlists',
        description: 'Prayerful pathways for different emotional seasons.',
        items: [
          {
            id: 'psa-playlist-morning',
            kind: 'playlists',
            title: 'Morning refuge',
            summary: 'A short path through Psalms of trust for the start of the day.',
            itemCount: 3,
            entries: [
              { bookId: 'PSA', chapter: 5 },
              { bookId: 'PSA', chapter: 23 },
              { bookId: 'PSA', chapter: 27 },
            ],
            artworkVariant: 'sunrise',
            actionLabel: 'Start playlist',
          },
          {
            id: 'psa-playlist-repentance',
            kind: 'playlists',
            title: 'Psalms of repentance',
            summary: 'Pray with honesty, confession, and restoration.',
            itemCount: 3,
            entries: [
              { bookId: 'PSA', chapter: 32 },
              { bookId: 'PSA', chapter: 51 },
              { bookId: 'PSA', chapter: 130 },
            ],
            artworkVariant: 'ember',
            actionLabel: 'Start playlist',
          },
        ],
      },
      {
        id: 'psa-devotionals',
        kind: 'devotionals',
        title: 'Devotionals',
        description: 'Quiet reflections for praying the Psalms slowly.',
        items: [
          {
            id: 'psa-devotional-shepherd',
            kind: 'devotionals',
            title: 'The Shepherd who restores',
            summary: 'Stay with Psalm 23 until it becomes a prayer instead of a slogan.',
            reference: { bookId: 'PSA', chapter: 23 },
            speaker: 'EveryBible Team',
            durationMinutes: 4,
            artworkVariant: 'meadow',
            actionLabel: 'Read psalm',
          },
        ],
      },
      {
        id: 'psa-figures',
        kind: 'figures',
        title: 'Biblical figures',
        description: 'Voices that shape the prayer book of Scripture.',
        items: [
          {
            id: 'psa-david',
            kind: 'figures',
            title: 'David',
            summary: 'A king who learned to bring joy, fear, failure, and worship before God.',
            personName: 'David',
            role: 'Psalmist king',
            references: [{ bookId: 'PSA', chapter: 23 }, { bookId: 'PSA', chapter: 51 }],
            artworkVariant: 'ember',
            actionLabel: 'Read psalm',
          },
        ],
      },
    ],
  },
};

export function getBibleBookExperienceContent(bookId: string): BibleBookExperienceContent | null {
  return bibleBookExperienceContent[bookId] ?? null;
}
