import { getBookById } from '../../constants/books';
import { getTranslationById } from '../../constants/translations';

const DEFAULT_ALBUM_TITLE = 'Every Bible';
const DEFAULT_ARTWORK_URI = 'everybible://artwork/default';

export type BibleNowPlayingInput = {
  translationId: string;
  bookId: string;
  chapter: number;
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
  playbackRate: number;
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
  const translation = getTranslationById(input.translationId);

  if (!book || !translation) {
    return null;
  }

  return {
    title: `${book.name} ${input.chapter}`,
    artist: translation.name,
    albumTitle: DEFAULT_ALBUM_TITLE,
    elapsedSeconds: toSeconds(input.positionMs),
    durationSeconds: toSeconds(input.durationMs),
    playbackRate: input.playbackRate,
    isPlaying: input.isPlaying,
    artworkUri: DEFAULT_ARTWORK_URI,
  };
}
