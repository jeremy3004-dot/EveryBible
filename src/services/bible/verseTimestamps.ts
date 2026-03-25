/**
 * Verse timestamp service — provides exact verse start times for audio follow-along.
 * Maps verse numbers to their start time (in seconds) within a chapter's audio.
 */

export type VerseTimestamps = Record<number, number>;

/**
 * Returns verse timestamps for a given chapter, or null if not available.
 * Falls back to word-weight estimation in bibleReaderModel when null.
 */
export async function getChapterTimestamps(
  _translationId: string,
  _bookId: number,
  _chapter: number
): Promise<VerseTimestamps | null> {
  return null;
}
