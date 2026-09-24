export interface BibleNowPlayingSignatureInput {
  translationId: string;
  bookId: string;
  bookName: string;
  chapter: number;
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
  playbackRate: number;
  canSkipNext: boolean;
  canSkipPrevious: boolean;
}

/**
 * What the lock-screen entry shows, at whole-second resolution. Native progress
 * arrives several times a second; an unchanged signature means publishing the
 * entry again would change nothing the listener can see.
 */
export function bibleNowPlayingSignature(input: BibleNowPlayingSignatureInput): string {
  return [
    input.translationId,
    input.bookId,
    input.chapter,
    Math.floor(input.positionMs / 1000),
    Math.floor(input.durationMs / 1000),
    input.isPlaying ? '1' : '0',
    input.playbackRate,
    input.canSkipNext ? '1' : '0',
    input.canSkipPrevious ? '1' : '0',
    input.bookName,
  ].join('|');
}
