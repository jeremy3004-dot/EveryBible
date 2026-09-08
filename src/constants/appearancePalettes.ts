// Terracotta is the sole accent palette, matching the approved app logo.
// Keep the historical el-blue storage ID so existing preferences remain valid.
export const APPEARANCE_PALETTE_IDS = ['el-blue'] as const;

export type AppearancePaletteId = (typeof APPEARANCE_PALETTE_IDS)[number];

export interface AppearancePaletteSwatches {
  // Accent for dark-family modes (dark, low-light, midnight) — a light pastel
  // that reads as text/fills on near-black surfaces.
  primary: string;
  // Accent for light-family modes (light, parchment) — a deep variant that reads
  // on warm paper. Same hue as `primary`, lower lightness.
  primaryDeep: string;
  secondary: string;
  /** Secondary accent for light-family modes. `secondary` is a pale tint that is
   *  unreadable on vellum, and accentSecondary is used as foreground text. */
  secondaryDeep: string;
  tertiary: string;
}

export interface AppearancePalette {
  id: AppearancePaletteId;
  swatches: AppearancePaletteSwatches;
}

export const DEFAULT_APPEARANCE_PALETTE: AppearancePaletteId = 'el-blue';

export const APPEARANCE_PALETTES: AppearancePalette[] = [
  {
    id: 'el-blue',
    swatches: {
      // A lighter clay for dark surfaces; a deeper logo terracotta for warm paper.
      primary: '#D88D74',
      primaryDeep: '#9F503B',
      secondary: '#F0C8B8',
      secondaryDeep: '#934731',
      tertiary: '#B0A99B',
    },
  },
] as const;
