import {
  darkColors,
  lightColors,
  type ThemeColors,
  type ThemeMode,
} from '../contexts/ThemeContext';

export interface ReaderThemePreview {
  mode: ThemeMode;
  labelKey: string;
  /** Two-stop wash behind the mini page, from the mode's own reading surfaces. */
  background: readonly [string, string];
  /** Surface the mini page is drawn with. */
  paper: string;
  /** Ink used for the mock text lines. */
  line: string;
}

const previewFor = (
  mode: ThemeMode,
  labelKey: string,
  palette: ThemeColors
): ReaderThemePreview => ({
  mode,
  labelKey,
  background: [palette.bibleElevatedSurface, palette.bibleBackground],
  paper: palette.bibleSurface,
  line: palette.biblePrimaryText,
});

// Appearance-sheet theme tiles, pulled straight from each mode's base palette so
// the mini mock always matches what tapping it actually does. The EL system ships
// two scopes, so the rail is vellum then Field dark.
export const readerThemePreviews: ReaderThemePreview[] = [
  previewFor('light', 'settings.themeLight', lightColors),
  previewFor('dark', 'settings.themeDark', darkColors),
];
