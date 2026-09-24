/** Sanitizer for the persisted auth blob: user preferences and their sync stamps. */
import { SUPPORTED_LANGUAGES } from '../../constants/languages';
import {
  APPEARANCE_PALETTE_IDS,
  DEFAULT_APPEARANCE_PALETTE,
} from '../../constants/appearancePalettes';
import type { PreferenceFieldStamps, User, UserPreferences } from '../../types';
import { DEFAULT_THEME_MODE, resolveThemeMode } from '../../design/themeMode';
import { isRecord, sanitizeOptionalString, sanitizeRequiredString } from './guards';

const supportedLanguageCodes = new Set(SUPPORTED_LANGUAGES.map((language) => language.code));
const validFontSizes = new Set<UserPreferences['fontSize']>(['small', 'medium', 'large']);

const validAppearancePalettes = new Set<UserPreferences['appearancePalette']>(
  APPEARANCE_PALETTE_IDS
);

export const defaultAuthPreferences: UserPreferences = {
  fontSize: 'medium',
  // New installs open on vellum. This has to be the resolver's own default, not
  // a second copy of it — the two drifting apart is how a "default theme" change
  // silently fails to reach new users.
  theme: DEFAULT_THEME_MODE,
  appearancePalette: DEFAULT_APPEARANCE_PALETTE,
  language: 'en',
  countryCode: null,
  countryName: null,
  contentLanguageCode: null,
  contentLanguageName: null,
  contentLanguageNativeName: null,
  chapterFeedbackName: null,
  chapterFeedbackRole: null,
  onboardingCompleted: false,
  chapterFeedbackEnabled: false,
  hidePlayButtonFromReadingTab: false,
  notificationsEnabled: false,
  reminderTime: null,
};

export const sanitizeUserPreferences = (value: unknown): UserPreferences => {
  if (!isRecord(value)) {
    return defaultAuthPreferences;
  }

  const language =
    typeof value.language === 'string' &&
    supportedLanguageCodes.has(value.language as UserPreferences['language'])
      ? (value.language as UserPreferences['language'])
      : defaultAuthPreferences.language;

  const fontSize = validFontSizes.has(value.fontSize as UserPreferences['fontSize'])
    ? (value.fontSize as UserPreferences['fontSize'])
    : defaultAuthPreferences.fontSize;

  // Retired modes ('low-light', 'parchment', 'midnight') fold onto a live scope.
  const theme = resolveThemeMode(value.theme);

  const appearancePalette = validAppearancePalettes.has(
    value.appearancePalette as UserPreferences['appearancePalette']
  )
    ? (value.appearancePalette as UserPreferences['appearancePalette'])
    : defaultAuthPreferences.appearancePalette;

  const reminderTime =
    typeof value.reminderTime === 'string' && /^\d{2}:\d{2}$/.test(value.reminderTime)
      ? value.reminderTime
      : null;

  return {
    fontSize,
    theme,
    appearancePalette,
    language,
    countryCode:
      typeof value.countryCode === 'string' && /^[A-Za-z]{2}$/.test(value.countryCode)
        ? value.countryCode.toUpperCase()
        : null,
    countryName: sanitizeOptionalString(value.countryName),
    contentLanguageCode: sanitizeOptionalString(value.contentLanguageCode),
    contentLanguageName: sanitizeOptionalString(value.contentLanguageName),
    contentLanguageNativeName: sanitizeOptionalString(value.contentLanguageNativeName),
    chapterFeedbackName: sanitizeRequiredString(value.chapterFeedbackName),
    chapterFeedbackRole: sanitizeRequiredString(value.chapterFeedbackRole),
    onboardingCompleted: value.onboardingCompleted === true,
    chapterFeedbackEnabled: value.chapterFeedbackEnabled === true,
    hidePlayButtonFromReadingTab: value.hidePlayButtonFromReadingTab === true,
    notificationsEnabled: value.notificationsEnabled === true,
    reminderTime,
  };
};

export const sanitizePersistedAuthState = (
  value: unknown
): {
  user: User | null;
  isAuthenticated: boolean;
  preferences: UserPreferences;
  preferencesUpdatedAt: string | null;
  preferencesSyncBase: UserPreferences | null;
  preferenceFieldStamps: PreferenceFieldStamps;
} => {
  const persisted = isRecord(value) ? value : {};

  return {
    // A persisted auth flag is not proof of a valid Supabase session token.
    // The live session restored by Supabase SecureStore remains the only source
    // of truth for signed-in state.
    user: null,
    isAuthenticated: false,
    preferences: sanitizeUserPreferences(persisted.preferences),
    preferencesUpdatedAt:
      typeof persisted.preferencesUpdatedAt === 'string' &&
      persisted.preferencesUpdatedAt.length > 0
        ? persisted.preferencesUpdatedAt
        : null,
    preferencesSyncBase: isRecord(persisted.preferencesSyncBase)
      ? sanitizeUserPreferences(persisted.preferencesSyncBase)
      : null,
    preferenceFieldStamps: sanitizePreferenceFieldStamps(persisted.preferenceFieldStamps),
  };
};

/** Keeps only stamps for known preferences that parse as a time. */
export const sanitizePreferenceFieldStamps = (value: unknown): PreferenceFieldStamps => {
  if (!isRecord(value)) {
    return {};
  }
  const stamps: PreferenceFieldStamps = {};
  for (const field of Object.keys(defaultAuthPreferences) as (keyof UserPreferences)[]) {
    const stamp = value[field];
    if (typeof stamp === 'string' && Number.isFinite(Date.parse(stamp))) {
      stamps[field] = stamp;
    }
  }
  return stamps;
};
