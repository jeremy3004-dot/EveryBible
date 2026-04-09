export const APPEARANCE_PALETTE_IDS = ['ember', 'sapphire', 'teal', 'olive'] as const;

export type AppearancePaletteId = (typeof APPEARANCE_PALETTE_IDS)[number];

export interface AppearancePaletteSwatches {
  primary: string;
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
      primary: '#A23A2A',
      secondary: '#D26A5C',
      tertiary: '#8F5A46',
    },
  },
  {
    id: 'sapphire',
    swatches: {
      primary: '#2F5BEA',
      secondary: '#6E84F4',
      tertiary: '#4B6792',
    },
  },
  {
    id: 'teal',
    swatches: {
      primary: '#0F766E',
      secondary: '#4AA5A1',
      tertiary: '#2C6B8D',
    },
  },
  {
    id: 'olive',
    swatches: {
      primary: '#4C6B1F',
      secondary: '#7C9A3D',
      tertiary: '#66754E',
    },
  },
] as const;
