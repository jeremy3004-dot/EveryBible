export const APPEARANCE_PALETTE_IDS = ['ember', 'sapphire', 'teal', 'olive'] as const;

export type AppearancePaletteId = (typeof APPEARANCE_PALETTE_IDS)[number];

export interface AppearancePaletteSwatches {
  // Accent for dark-family modes (dark, low-light, midnight) — a light pastel
  // that reads as text/fills on near-black surfaces.
  primary: string;
  // Accent for light-family modes (light, parchment) — a deep variant that reads
  // on warm paper. Same hue as `primary`, lower lightness.
  primaryDeep: string;
  secondary: string;
  tertiary: string;
}

export interface AppearancePalette {
  id: AppearancePaletteId;
  swatches: AppearancePaletteSwatches;
}

export const DEFAULT_APPEARANCE_PALETTE: AppearancePaletteId = 'ember';

export const APPEARANCE_PALETTES: AppearancePalette[] = [
  {
    id: 'ember',
    swatches: {
      primary: '#D96C57',
      primaryDeep: '#AE4732',
      secondary: '#E08573',
      tertiary: '#A39B8F',
    },
  },
  {
    id: 'sapphire',
    swatches: {
      primary: '#7E96F2',
      primaryDeep: '#2F55C8',
      secondary: '#9DB0F6',
      tertiary: '#6C7FA6',
    },
  },
  {
    id: 'teal',
    swatches: {
      primary: '#4AA5A1',
      primaryDeep: '#0F766E',
      secondary: '#7BC4C0',
      tertiary: '#4E8AA0',
    },
  },
  {
    id: 'olive',
    swatches: {
      primary: '#8FAF52',
      primaryDeep: '#4C6B1F',
      secondary: '#A9C374',
      tertiary: '#7E8B65',
    },
  },
] as const;
