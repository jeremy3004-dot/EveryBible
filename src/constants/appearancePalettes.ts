// Ember is the sole accent palette. The 5 theme MODES (dark/light/low-light/
// parchment/midnight) remain; only the accent-palette picker was removed. Saved
// preferences of the retired sapphire/teal/olive palettes fall back to ember via
// the resolver in ThemeContext + the persisted-state sanitizer.
export const APPEARANCE_PALETTE_IDS = ['ember'] as const;

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
] as const;
