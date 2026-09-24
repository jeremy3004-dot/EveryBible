import type { AppearancePaletteId } from '../constants/appearancePalettes';
import type { LanguageCode } from '../constants/languages';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: number;
  lastActive: number;
}

export interface UserPreferences {
  fontSize: 'small' | 'medium' | 'large';
  theme: 'dark' | 'light';
  appearancePalette: AppearancePaletteId;
  language: LanguageCode;
  countryCode: string | null;
  countryName: string | null;
  contentLanguageCode: string | null;
  contentLanguageName: string | null;
  contentLanguageNativeName: string | null;
  chapterFeedbackName: string | null;
  chapterFeedbackRole: string | null;
  onboardingCompleted: boolean;
  chapterFeedbackEnabled: boolean;
  hidePlayButtonFromReadingTab: boolean;
  notificationsEnabled: boolean;
  reminderTime: string | null; // HH:mm format, e.g., "09:00"
}

/**
 * When each preference was last chosen (ISO time), by any device. A preference
 * with no stamp has never been chosen and still holds a default.
 */
export type PreferenceFieldStamps = Partial<Record<keyof UserPreferences, string>>;

export interface UserProgress {
  chaptersRead: { [key: string]: number };
  currentBook: string;
  currentChapter: number;
  streakDays: number;
  lastReadDate: string;
}
