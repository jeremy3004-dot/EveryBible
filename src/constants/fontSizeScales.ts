import type { UserPreferences } from '../types/user';

export type FontSizeKey = UserPreferences['fontSize'];

// The in-app reading size preference (Settings > Font size). It multiplies
// scripture text on top of the OS text-size setting, which RN applies itself.
// Kept free of store/sync imports so startup screens can read it cheaply.
export const FONT_SIZE_SCALES: Record<FontSizeKey, number> = {
  small: 0.85,
  medium: 1,
  large: 1.2,
};
