import { useState } from 'react';
import { useAudioStore } from '../../../../stores/audioStore';
import type { ChapterTrack } from './useChapterVerseTimestamps';
import {
  READ_ALONG_BACKWARD_TOLERANCE_MS,
  getTimedVerse,
  resolveShownVerse,
} from './readAlongModel';

type VerseTimestamps = Record<number, number>;

interface AudioTrackState {
  currentTranslationId: string | null;
  currentBookId: string | null;
  currentChapter: number | null;
  currentPosition: number;
}

// The same match useAudioPosition makes, including its unknown-translation allowance.
const isTrackPlaying = (state: AudioTrackState, track: ChapterTrack) =>
  state.currentBookId === track.bookId &&
  state.currentChapter === track.chapter &&
  (state.currentTranslationId == null || state.currentTranslationId === track.translationId);

/**
 * The verse being spoken in `track`, from its verse timings, or null when it is not the
 * chapter playing or has no timings. The position ticks about four times a second, but
 * these selectors return verse numbers, so the caller re-renders only when the verse
 * (or the verse just ahead) changes.
 */
export function useTimedFollowAlongVerse({
  track,
  timestamps,
  enabled,
}: {
  track: ChapterTrack;
  timestamps: VerseTimestamps | null;
  enabled: boolean;
}): number | null {
  const verseAtPosition = useAudioStore((state) =>
    enabled && timestamps && isTrackPlaying(state, track)
      ? getTimedVerse(timestamps, state.currentPosition)
      : null
  );
  const verseAhead = useAudioStore((state) =>
    enabled && timestamps && isTrackPlaying(state, track)
      ? getTimedVerse(timestamps, state.currentPosition + READ_ALONG_BACKWARD_TOLERANCE_MS)
      : null
  );
  // The verse last shown, kept from render to render (React's "adjust state while
  // rendering" pattern), so a small step back in position does not flicker it.
  const [shownVerse, setShownVerse] = useState<number | null>(null);
  const nextVerse = resolveShownVerse({ verseAtPosition, verseAhead, previousVerse: shownVerse });
  if (nextVerse !== shownVerse) setShownVerse(nextVerse);
  return nextVerse;
}
