import { getBookById } from '../../constants/books';
import { getTranslationById } from '../../constants/translations';

export interface BibleNowPlayingInput {
  translationId: string;
  bookId: string;
  chapter: number;
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
  playbackRate: number;
}

export interface BibleNowPlayingPayload {
  title: string;
  artist: string;
  albumTitle: string;
  elapsedSeconds: number;
  durationSeconds: number;
  playbackRate: number;
  isPlaying: boolean;
  artworkUri: string;
  bookId: string;
  translationId: string;
  chapter: number;
  canSkipNext: boolean;
  canSkipPrevious: boolean;
}

function normalizePositiveNumber(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function buildArtworkUri(bookId: string): string {
  return `everybible://book-artwork/${bookId.toUpperCase()}`;
}

export function buildBibleNowPlayingPayload(
  input: BibleNowPlayingInput
): BibleNowPlayingPayload | null {
  const translation = getTranslationById(input.translationId);
  const book = getBookById(input.bookId);

  if (!translation || !book || input.chapter < 1) {
    return null;
  }

  const elapsedSeconds = normalizePositiveNumber(input.positionMs) / 1000;
  const durationSeconds = normalizePositiveNumber(input.durationMs) / 1000;
  const playbackRate = Number.isFinite(input.playbackRate) ? input.playbackRate : 1;
  const normalizedBookId = book.id.toUpperCase();

  return {
    title: `${book.name} ${input.chapter}`,
    artist: translation.name,
    albumTitle: 'Every Bible',
    elapsedSeconds,
    durationSeconds,
    playbackRate,
    isPlaying: input.isPlaying,
    artworkUri: buildArtworkUri(normalizedBookId),
    bookId: normalizedBookId,
    translationId: translation.id,
    chapter: input.chapter,
    canSkipNext: true,
    canSkipPrevious: true,
  };
}
