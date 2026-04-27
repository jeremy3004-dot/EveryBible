import type { BackgroundMusicChoice } from '../../types';

export interface BackgroundMusicOption {
  id: BackgroundMusicChoice;
  label: string;
  description: string;
  license: string;
  credit: string;
  sourceUrl: string;
  defaultVolume: number;
}

export const BACKGROUND_MUSIC_OPTIONS: BackgroundMusicOption[] = [
  {
    id: 'off',
    label: 'Off',
    description: 'Play scripture without a bundled background layer.',
    license: 'Built-in',
    credit: 'No background music',
    sourceUrl: '',
    defaultVolume: 0,
  },
  {
    id: 'ambient',
    label: 'Ambient',
    description: 'Looped underwater pads and bells underneath narration.',
    license: 'CC0',
    credit: 'Cleyton Kauffman',
    sourceUrl: 'https://opengameart.org/content/underwater-theme',
    defaultVolume: 0.16,
  },
  {
    id: 'piano',
    label: 'Piano',
    description: 'Gentle piano melody with light pads.',
    license: 'CC0',
    credit: 'cynicmusic / The Cynic Project',
    sourceUrl: 'https://opengameart.org/content/calm-piano-1-vaporware',
    defaultVolume: 0.16,
  },
  {
    id: 'soft-guitar',
    label: 'Soft guitar',
    description: 'Looping nylon guitar bed that stays out of the way.',
    license: 'CC0',
    credit: 'Kistol',
    sourceUrl: 'https://opengameart.org/content/etirwer',
    defaultVolume: 0.18,
  },
  {
    id: 'sitar',
    label: 'Sitar',
    description: 'Warm desert-style sitar texture for longer listening sessions.',
    license: 'CC-BY 3.0',
    credit: 'Spring Spring',
    sourceUrl: 'https://opengameart.org/content/simple-desert',
    defaultVolume: 0.15,
  },
  {
    id: 'ocean-waves',
    label: 'Ocean waves',
    description: 'Looped shoreline wash for a calmer sound bed.',
    license: 'CC0',
    credit: 'jasinski (submitted to OpenGameArt by qubodup)',
    sourceUrl: 'https://opengameart.org/content/beach-ocean-waves',
    defaultVolume: 0.24,
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
    case 'sitar':
      return require('../../../assets/audio/background/sitar.m4a');
    case 'ocean-waves':
      return require('../../../assets/audio/background/ocean-waves.m4a');
    case 'off':
    default:
      return null;
  }
};
