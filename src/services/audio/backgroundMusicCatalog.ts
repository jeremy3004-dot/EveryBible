import type { BackgroundMusicChoice } from '../../types';

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
}

// Volumes are matched to each file's measured loudness (piano, harp, soft guitar and ocean
// waves are levelled to -20 LUFS by scripts/audio/build_background_music.py; ambient -15.5,
// flute -19.9, sitar -14.5 as shipped), then adjusted by ear on device: the music sits about
// -31 LUFS under the narration, and ocean waves ~4 dB below that, since steady broadband noise
// sounds louder than music of the same measured loudness.
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
  },
];

export const getBackgroundMusicOption = (
  choice: BackgroundMusicChoice
): BackgroundMusicOption | undefined =>
  BACKGROUND_MUSIC_OPTIONS.find((option) => option.id === choice);

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
