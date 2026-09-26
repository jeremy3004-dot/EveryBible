import type { ThemeColors } from '../../contexts/ThemeContext';
import type { AudioReturnTarget, AudioStatus } from '../../types/audio';
import type { BibleStackParamList } from '../types';
import { PLAYER_BAR_SECTION_HEIGHT } from '../readerTabBarMotion';

/** Whose colours the bar wears: the reading surface's on the reader, the app's elsewhere. */
export type PlayerBarScope = 'reader' | 'app';

export interface PlayerBarPalette {
  ink: string;
  muted: string;
  accent: string;
  onAccent: string;
  /** The soft tile behind the play glyph. */
  tile: string;
  hairline: string;
}

export function getPlayerBarPalette(colors: ThemeColors, scope: PlayerBarScope): PlayerBarPalette {
  return scope === 'reader'
    ? {
        ink: colors.biblePrimaryText,
        muted: colors.bibleSecondaryText,
        accent: colors.bibleAccent,
        onAccent: colors.onAccent,
        tile: colors.bibleElevatedSurface,
        hairline: colors.bibleDivider,
      }
    : {
        ink: colors.primaryText,
        muted: colors.secondaryText,
        accent: colors.accentPrimary,
        onAccent: colors.onAccent,
        tile: colors.background,
        hairline: colors.cardBorder,
      };
}

/**
 * A chapter is loaded and playing, loading or paused: what the rotated return tab
 * used to show for, and what lets the player row appear away from the reader.
 */
export function isAudioSessionActive(
  status: AudioStatus,
  bookId: string | null,
  chapter: number | null
): boolean {
  return (
    bookId != null &&
    chapter != null &&
    (status === 'playing' || status === 'loading' || status === 'paused')
  );
}

/** Room a notice takes above the capsule (the Selah chip, a playback failure). */
export const PLAYER_BAR_NOTICE_HEIGHT = 40;

export interface PlayerBarClearanceInput {
  /** Gap between the capsule and the screen bottom. */
  bottomPadding: number;
  /** The tab row's height, or 0 where the bar has none (a plan session's strip owns it). */
  tabRowHeight: number;
  showsPlayerRow: boolean;
  /** Anything floating on top of the capsule (the Selah chip, a playback failure). */
  noticeHeight?: number;
  /** Breathing room between the last line and the bar. */
  gap: number;
}

/**
 * Bottom padding a reading list needs so its last line clears the expanded bar.
 * Near the end of a chapter the bar is always expanded (the reader's scroll motion
 * reveals it as either end approaches), so this is the height that matters.
 */
export function getPlayerBarClearance({
  bottomPadding,
  tabRowHeight,
  showsPlayerRow,
  noticeHeight = 0,
  gap,
}: PlayerBarClearanceInput): number {
  return (
    bottomPadding +
    tabRowHeight +
    (showsPlayerRow ? PLAYER_BAR_SECTION_HEIGHT : 0) +
    (noticeHeight > 0 ? noticeHeight + gap : 0) +
    gap
  );
}

export interface ReturnToReaderInput {
  currentTranslationId: string | null;
  currentBookId: string | null;
  currentChapter: number | null;
  lastPlayedTranslationId: string | null;
  audioReturnTarget: AudioReturnTarget | null;
  currentTranslation: string;
}

export interface ReturnToReaderTarget {
  /** The translation the reader must show, when it is not already the current one. */
  translationId: string | null;
  params: BibleStackParamList['BibleReader'];
}

/**
 * Where "back to what is playing" goes: the loaded chapter (or, between chapters, the
 * return target), in the translation it plays in, with its plan or rhythm session.
 */
export function getReturnToReaderTarget({
  currentTranslationId,
  currentBookId,
  currentChapter,
  lastPlayedTranslationId,
  audioReturnTarget: target,
  currentTranslation,
}: ReturnToReaderInput): ReturnToReaderTarget | null {
  const bookId = currentBookId ?? target?.bookId ?? null;
  const chapter = currentChapter ?? target?.chapter ?? null;
  if (!bookId || chapter == null) return null;
  const translationId =
    currentTranslationId ?? target?.translationId ?? lastPlayedTranslationId ?? currentTranslation;

  return {
    translationId: translationId !== currentTranslation ? translationId : null,
    params: {
      bookId,
      chapter,
      preferredMode: target?.preferredMode ?? 'read',
      ...(target?.planId ? { planId: target.planId } : {}),
      ...(typeof target?.planDayNumber === 'number' ? { planDayNumber: target.planDayNumber } : {}),
      ...(target?.planSessionKey ? { planSessionKey: target.planSessionKey } : {}),
      ...(target?.returnToPlanOnComplete ? { returnToPlanOnComplete: true } : {}),
      ...(target?.sessionContext ? { sessionContext: target.sessionContext } : {}),
    },
  };
}
