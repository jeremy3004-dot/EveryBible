// Terracotta is the default accent palette, matching the approved app logo.
// Keep the historical el-blue storage ID so existing preferences remain valid.
// `el-blue-brand` is the Every Language brand blue, added so the accent can be
// A/B'd against terracotta without a second theme.
export const APPEARANCE_PALETTE_IDS = ['el-blue', 'el-blue-brand'] as const;

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
  /**
   * The selected-surface pair, per scope. EL expresses "you are here" as a real
   * tinted fill (`--accent`) with its own foreground (`--accent-foreground`) —
   * the active tab pill, chips, and avatar wells — so both halves have to travel
   * together per palette. `onAccentSurface` must clear 4.5:1 on `accentSurface`.
   */
  lightAccentSurface: string;
  lightOnAccentSurface: string;
  darkAccentSurface: string;
  darkOnAccentSurface: string;
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
      lightAccentSurface: '#F4E1D8',
      lightOnAccentSurface: '#9F503B',
      darkAccentSurface: '#492B22',
      darkOnAccentSurface: '#F0C8B8',
    },
  },
  {
    id: 'el-blue-brand',
    swatches: {
      // Every Language brand blue. The brand tone (#0099E5) only clears 2.7:1 on
      // vellum, so the light scope runs the deep variant and keeps the bright
      // tone for the dark scope, mirroring how terracotta is split.
      primary: '#35A5E9',
      primaryDeep: '#005F8F',
      secondary: '#ADDCFF',
      secondaryDeep: '#005F8F',
      tertiary: '#B0A99B',
      lightAccentSurface: '#DCEFFC',
      lightOnAccentSurface: '#005F8F',
      darkAccentSurface: '#10394B',
      darkOnAccentSurface: '#ADDCFF',
    },
  },
] as const;
