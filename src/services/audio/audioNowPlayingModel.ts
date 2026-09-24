import { getBookById } from '../../constants/books';
import { getTranslationById } from '../../constants/translations';

const DEFAULT_ALBUM_TITLE = 'Every Bible';
const DEFAULT_ARTWORK_URI = 'everybible://artwork/default';

/**
 * Interface-language strings for the Android media notification. iOS builds its
 * lock-screen entry natively and ignores these.
 */
export type BibleNowPlayingLocalizedStrings = {
  /** Book name in the interface language, e.g. "Génesis". */
  bookName: string;
  /** Name of the Android notification channel shown in system settings. */
  channelName: string;
  play: string;
  pause: string;
  previous: string;
  next: string;
  skipBackward: string;
  skipForward: string;
};

export type BibleNowPlayingInput = {
  translationId: string;
  /** Display name for the translation. Caller should supply this for runtime
   * translations that are not in the static translations constant. */
  translationName?: string;
  bookId: string;
  /** Book name in the interface language for the lock-screen title; falls back to English. */
  bookName?: string;
  chapter: number;
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
  playbackRate: number;
  /** Whether a next chapter/track is available for the skip-next lock screen button. */
  canSkipNext?: boolean;
  /** Whether a previous chapter/track is available for the skip-previous lock screen button. */
  canSkipPrevious?: boolean;
  /** Android notification strings; see BibleNowPlayingLocalizedStrings. */
  localized?: BibleNowPlayingLocalizedStrings;
  /**
   * Neutral title ("Now playing") that replaces the chapter on the iOS lock screen in
   * discreet mode. Android takes it from `localized.channelName`.
   */
  discreetTitle?: string;
};

export type BibleNowPlayingPayload = {
  title: string;
  artist: string;
  albumTitle: string;
  elapsedSeconds: number;
  durationSeconds: number;
  playbackRate: number;
  isPlaying: boolean;
  artworkUri: string;
  canSkipNext: boolean;
  canSkipPrevious: boolean;
  /** Discreet mode: the native side shows no artwork (not even the app icon) either. */
  discreet?: boolean;
};

function toSeconds(milliseconds: number): number {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return 0;
  }

  return milliseconds / 1000;
}

export function buildBibleNowPlayingPayload(
  input: BibleNowPlayingInput
): BibleNowPlayingPayload | null {
  const book = getBookById(input.bookId);
  if (!book) {
    return null;
  }

  // Prefer explicitly-supplied name (for runtime/catalog translations), then
  // fall back to the static translations list, then to the album title.
  const translation = getTranslationById(input.translationId);
  const artistName = input.translationName ?? translation?.name ?? DEFAULT_ALBUM_TITLE;

  return {
    title: `${input.bookName || book.name} ${input.chapter}`,
    artist: artistName,
    albumTitle: DEFAULT_ALBUM_TITLE,
    elapsedSeconds: toSeconds(input.positionMs),
    durationSeconds: toSeconds(input.durationMs),
    playbackRate: input.playbackRate,
    isPlaying: input.isPlaying,
    artworkUri: DEFAULT_ARTWORK_URI,
    canSkipNext: input.canSkipNext ?? true,
    canSkipPrevious: input.canSkipPrevious ?? true,
  };
}

/**
 * The lock-screen entry in discreet mode. The lock screen, Control Center and a car's
 * display show it to anyone, so it keeps the controls and progress but names neither the
 * chapter, the translation nor the app, and carries no artwork.
 */
export function toDiscreetNowPlayingPayload(
  payload: BibleNowPlayingPayload,
  title = ''
): BibleNowPlayingPayload {
  return { ...payload, title, artist: '', albumTitle: '', artworkUri: '', discreet: true };
}
