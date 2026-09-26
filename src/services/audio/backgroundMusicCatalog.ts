import type { BackgroundMusicChoice } from '../../types';

/**
 * Where a sound's file comes from. Bundled sounds ship in the app binary; remote ones are
 * fetched once from the media host (`path` is relative to its base URL) and kept on disk
 * by backgroundSoundCache, so they only need a connection the first time.
 */
export type BackgroundMusicSource = { kind: 'bundled' } | { kind: 'remote'; path: string };

export interface BackgroundMusicOption {
  id: BackgroundMusicChoice;
  label: string;
  description: string;
  /** The original work's title, for the credit on the About screen. */
  workTitle: string;
  license: string;
  credit: string;
  sourceUrl: string;
  defaultVolume: number;
  source: BackgroundMusicSource;
}

const BUNDLED: BackgroundMusicSource = { kind: 'bundled' };

/** Streamed sounds live on the media host under a versioned folder; a changed file gets a new version. */
const remote = (id: BackgroundMusicChoice): BackgroundMusicSource => ({
  kind: 'remote',
  path: `background-sounds/v1/${id}.m4a`,
});

// Volumes are matched to each file's measured loudness (piano, harp, soft guitar and ocean
// waves are levelled to -20 LUFS by scripts/audio/build_background_music.py; ambient -15.5,
// flute -19.9, sitar -14.5 as shipped), then adjusted by ear on device: the music sits about
// -31 LUFS under the narration, and ocean waves ~4 dB below that, since steady broadband noise
// sounds louder than music of the same measured loudness.
// The streamed sounds (scripts/audio/build_background_sounds.py) follow the same rule from
// their measured loudness: music at -20 LUFS sits near piano (chant a little lower, since voices
// compete with the narration), broadband beds at -20 LUFS match ocean waves, birds and other
// tonal ambiences sit between, and the few that could not reach -20 LUFS without flattening them
// (shore -24.6, fireplace -23.8, church bells -22.1, piano and cello -21.7) are raised to match.
// They have not been tuned by ear on device yet.
export const BACKGROUND_MUSIC_OPTIONS: BackgroundMusicOption[] = [
  {
    id: 'off',
    label: 'Off',
    description: 'Play scripture without a bundled background layer.',
    workTitle: '',
    license: 'Built-in',
    credit: 'No background music',
    sourceUrl: '',
    defaultVolume: 0,
    source: BUNDLED,
  },
  {
    id: 'ambient',
    label: 'Ambient',
    description: 'Looped underwater pads and bells underneath narration.',
    workTitle: 'Underwater Theme',
    license: 'CC0',
    credit: 'Cleyton Kauffman',
    sourceUrl: 'https://opengameart.org/content/underwater-theme',
    defaultVolume: 0.16,
    source: BUNDLED,
  },
  {
    id: 'piano',
    label: 'Piano',
    description: 'Gentle piano melody with light pads.',
    workTitle: 'Calm Piano 1 (Vaporware)',
    license: 'CC0',
    credit: 'cynicmusic / The Cynic Project',
    sourceUrl: 'https://opengameart.org/content/calm-piano-1-vaporware',
    defaultVolume: 0.28,
    source: BUNDLED,
  },
  {
    id: 'piano-cello',
    label: 'Piano and cello',
    description: 'A Chopin largo for cello and piano, unhurried and warm.',
    workTitle: 'Cello Sonata in G minor, Op. 65: III. Largo (Chopin)',
    license: 'Public domain',
    credit: 'Christopher Harding, Yeonjin Kim (Musopen)',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Chopin_-_Cello_Sonata_in_G_minor,_Op._65_-_III._Largo_(Christopher_Harding,_Yeonjin_Kim).flac',
    defaultVolume: 0.34,
    source: remote('piano-cello'),
  },
  {
    id: 'soft-guitar',
    label: 'Soft guitar',
    description: 'Looping nylon guitar bed that stays out of the way.',
    workTitle: 'Etirwer',
    license: 'CC0',
    credit: 'Kistol',
    sourceUrl: 'https://opengameart.org/content/etirwer',
    defaultVolume: 0.28,
    source: BUNDLED,
  },
  {
    id: 'harp',
    label: 'Harp',
    description: 'Light solo harp theme with a gentle devotional feel.',
    workTitle: 'A New Town',
    license: 'CC0',
    credit: 'cynicmusic / The Cynic Project',
    sourceUrl: 'https://opengameart.org/content/a-new-town-rpg-theme',
    defaultVolume: 0.28,
    source: BUNDLED,
  },
  {
    id: 'flute',
    label: 'Flute',
    description: 'Short flute-forward loop with soft fantasy ambience.',
    workTitle: 'Through Fire, Through Sea',
    license: 'CC0',
    credit: 'KiluaBoy',
    sourceUrl: 'https://opengameart.org/content/through-fire-through-sea-violin-flute-loop',
    defaultVolume: 0.28,
    source: BUNDLED,
  },
  {
    id: 'sitar',
    label: 'Sitar',
    description: 'Warm desert-style sitar texture for longer listening sessions.',
    workTitle: 'Simple Desert',
    license: 'CC-BY 3.0',
    credit: 'Spring Spring',
    sourceUrl: 'https://opengameart.org/content/simple-desert',
    defaultVolume: 0.15,
    source: BUNDLED,
  },
  {
    id: 'hymns',
    label: 'Hymns',
    description: 'Well-loved hymn tunes played on a pipe organ.',
    workTitle: 'Eventide; Toplady; When I Survey; There Is a Green Hill (organ)',
    license: 'CC-BY-SA 4.0',
    credit: 'The Uninvited Co., Inc.; RandomCanadian',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Eventide.ogg',
    defaultVolume: 0.24,
    source: remote('hymns'),
  },
  {
    id: 'gregorian-chant',
    label: 'Gregorian chant',
    description: 'Latin plainchant for Easter, sung by a choir.',
    workTitle: 'Victimae Paschali Laudes',
    license: 'CC-BY 3.0',
    credit: 'The Tudor Consort',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:The_Tudor_Consort_-_09_-_Sequence_-_Victimae_Paschali_Laudes.ogg',
    defaultVolume: 0.22,
    source: remote('gregorian-chant'),
  },
  {
    id: 'organ',
    label: 'Organ',
    description: 'A slow Bach adagio on a church pipe organ.',
    workTitle: 'Adagio from Toccata, Adagio and Fugue, BWV 564 (Bach)',
    license: 'CC-BY 3.0',
    credit: 'Kerstin Wolf',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:J.S.Bach_-_Adagio_(BWV_564).ogg',
    defaultVolume: 0.24,
    source: remote('organ'),
  },
  {
    id: 'ocean-waves',
    label: 'Ocean waves',
    description: 'Looped shoreline wash for a calmer sound bed.',
    workTitle: 'Beach Ocean Waves; Water Waves',
    license: 'CC0',
    credit: 'jasinski, transitking',
    sourceUrl: 'https://opengameart.org/content/beach-ocean-waves',
    defaultVolume: 0.14,
    source: BUNDLED,
  },
  {
    id: 'rain',
    label: 'Rain',
    description: 'Steady rain falling outdoors.',
    workTitle: 'Rain Slowly Passing (treated loop)',
    license: 'CC0',
    credit: 'speakwithanimals',
    sourceUrl: 'https://freesound.org/people/speakwithanimals/sounds/525046/',
    defaultVolume: 0.14,
    source: remote('rain'),
  },
  {
    id: 'gentle-breeze',
    label: 'Gentle breeze',
    description: 'A constant light wind in the trees.',
    workTitle: 'forest ambience constant breeze',
    license: 'CC0',
    credit: 'kyles',
    sourceUrl: 'https://freesound.org/people/kyles/sounds/637559/',
    defaultVolume: 0.14,
    source: remote('gentle-breeze'),
  },
  {
    id: 'summer-night',
    label: 'Summer night',
    description: 'Soft crickets on a quiet night.',
    workTitle: 'Quiet Night Atmosphere, Soft Crickets',
    license: 'CC0',
    credit: 'Goldenboy76',
    sourceUrl: 'https://freesound.org/people/Goldenboy76/sounds/857163/',
    defaultVolume: 0.14,
    source: remote('summer-night'),
  },
  {
    id: 'waterfall',
    label: 'Waterfall',
    description: 'A small forest waterfall.',
    workTitle: 'Hidden waterfall',
    license: 'CC0',
    credit: 'BassmanJourney',
    sourceUrl: 'https://freesound.org/people/BassmanJourney/sounds/632107/',
    defaultVolume: 0.14,
    source: remote('waterfall'),
  },
  {
    id: 'birdsong',
    label: 'Birdsong',
    description: 'A long dawn chorus in the bush.',
    workTitle: 'Birdsong in the bush',
    license: 'CC0',
    credit: 'dr19',
    sourceUrl: 'https://freesound.org/people/dr19/sounds/457652/',
    defaultVolume: 0.16,
    source: remote('birdsong'),
  },
  {
    id: 'shore',
    label: 'Shore',
    description: 'Small waves lapping a lake shore.',
    workTitle: 'Gentle waves on a lake',
    license: 'CC0',
    credit: 'TheFlyFishingFilmmaker',
    sourceUrl: 'https://freesound.org/people/TheFlyFishingFilmmaker/sounds/614299/',
    defaultVolume: 0.24,
    source: remote('shore'),
  },
  {
    id: 'fireplace',
    label: 'Fireplace',
    description: 'A wood fire crackling indoors.',
    workTitle: 'Burning Fireplace Crackling Fire Sounds',
    license: 'CC0',
    credit: 'visionear',
    sourceUrl: 'https://freesound.org/people/visionear/sounds/501417/',
    defaultVolume: 0.22,
    source: remote('fireplace'),
  },
  {
    id: 'church-bells',
    label: 'Church bells',
    description: 'Church bells ringing in the distance.',
    workTitle: 'Bells french distant',
    license: 'CC0',
    credit: 'lazymonk',
    sourceUrl: 'https://freesound.org/people/lazymonk/sounds/413157/',
    defaultVolume: 0.23,
    source: remote('church-bells'),
  },
  {
    id: 'village',
    label: 'Village',
    description: 'A quiet mountain village with distant birds.',
    workTitle: 'Perves Ambient Mountains Distant Small Village',
    license: 'CC0',
    credit: 'jordir',
    sourceUrl: 'https://freesound.org/people/jordir/sounds/587370/',
    defaultVolume: 0.16,
    source: remote('village'),
  },
  {
    id: 'garden',
    label: 'Garden',
    description: 'Birds and light wind in a summer garden.',
    workTitle: 'Ambience, garden, afternoon, summer',
    license: 'CC0',
    credit: 'Matmorfus',
    sourceUrl: 'https://freesound.org/people/Matmorfus/sounds/204711/',
    defaultVolume: 0.16,
    source: remote('garden'),
  },
  {
    id: 'wilderness',
    label: 'Wilderness',
    description: 'A still summer forest.',
    workTitle: 'Forest Ambience 1',
    license: 'CC0',
    credit: 'Fester993',
    sourceUrl: 'https://freesound.org/people/Fester993/sounds/564436/',
    defaultVolume: 0.16,
    source: remote('wilderness'),
  },
];

export const getBackgroundMusicOption = (
  choice: BackgroundMusicChoice
): BackgroundMusicOption | undefined =>
  BACKGROUND_MUSIC_OPTIONS.find((option) => option.id === choice);

/**
 * The loudness a sound plays at for the listener's Sound level (0–1). Half way is the
 * catalog level each file was matched to by ear, so the default mix is unchanged; the top
 * of the slider doubles it, capped at full volume.
 */
export const getBackgroundMusicVolume = (defaultVolume: number, level: number): number =>
  Math.min(1, Math.max(0, defaultVolume * level * 2));

/** The asset handle of a bundled sound; null for 'off' and for sounds fetched remotely. */
export const getBackgroundMusicSource = (choice: BackgroundMusicChoice): number | null => {
  switch (choice) {
    case 'ambient':
      return require('../../../assets/audio/background/ambient.m4a');
    case 'piano':
      return require('../../../assets/audio/background/piano.m4a');
    case 'soft-guitar':
      return require('../../../assets/audio/background/soft-guitar.m4a');
    case 'harp':
      return require('../../../assets/audio/background/harp.m4a');
    case 'flute':
      return require('../../../assets/audio/background/flute.m4a');
    case 'sitar':
      return require('../../../assets/audio/background/sitar.m4a');
    case 'ocean-waves':
      return require('../../../assets/audio/background/ocean-waves.m4a');
    case 'off':
    default:
      return null;
  }
};
