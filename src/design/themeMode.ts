// One place that decides what a stored theme preference resolves to.
//
// The Every Language design system ships two scopes, so the reskin retired
// 'low-light', 'parchment' and 'midnight'. A retired value can still arrive from
// three places — AsyncStorage rehydration, the Supabase profiles row, and any
// preference object written before the update — so all three boundaries route
// through this resolver rather than each inventing its own fallback.

export type ThemeMode = 'dark' | 'light';

export const THEME_MODES: readonly ThemeMode[] = ['dark', 'light'];

/**
 * New installs, and anything unrecognisable, land on vellum. The EL redesign
 * makes warm paper the canonical scope — Field dark is the opt-in second scope,
 * not the front door.
 */
export const DEFAULT_THEME_MODE: ThemeMode = 'light';

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);
}

/**
 * Fold any stored theme preference onto a live scope. Parchment was a
 * light-paper mode, so it resolves to vellum explicitly rather than relying on
 * the default; every other unrecognised value lands on the default (vellum).
 */
export function resolveThemeMode(value: unknown): ThemeMode {
  if (isThemeMode(value)) {
    return value;
  }

  return value === 'parchment' ? 'light' : DEFAULT_THEME_MODE;
}
