// EL blue is the sole accent palette — the Every Language brand accent, used once
// per region. Saved preferences of the retired ember/sapphire/teal/olive palettes
// fall back to it via the resolver in ThemeContext + the persisted-state sanitizer.
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
      // Field dark reads EL blue at hsl(202 80% 56%); vellum takes the deep
      // variant hsl(200 100% 28%), which is the only pairing the EL system
      // allows for blue text on pale-blue fills.
      primary: '#35A7E9',
      primaryDeep: '#005F8F',
      secondary: '#ADDCFF',
      secondaryDeep: '#00567F',
      tertiary: '#B0A99B',
    },
  },
] as const;
