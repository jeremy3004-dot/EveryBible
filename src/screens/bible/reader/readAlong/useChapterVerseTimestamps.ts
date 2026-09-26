import { useEffect, useState } from 'react';

// Type-only, so the timing tables stay off the reader's open path until a verse is asked for.
type VerseTimestamps = import('../../../../services/bible/verseTimestamps').VerseTimestamps;

export interface ChapterTrack {
  translationId: string;
  bookId: string;
  chapter: number;
}

export interface ChapterVerseTimestamps {
  /** The recording's verse start times in seconds, or null when it has none. */
  timestamps: VerseTimestamps | null;
  /** False until the lookup for this chapter has answered, either way. */
  loaded: boolean;
}

const NOT_LOADED: ChapterVerseTimestamps = { timestamps: null, loaded: false };

/**
 * The verse timings of one chapter's recording, looked up while `enabled`. The lookup
 * is the reader's own (bundled tables, or the catalog's remote timing files, cached),
 * reached through a lazy import as the reader does.
 */
export function useChapterVerseTimestamps(
  track: ChapterTrack,
  enabled: boolean
): ChapterVerseTimestamps {
  const { translationId, bookId, chapter } = track;
  const key = `${translationId}:${bookId}:${chapter}`;
  const [answer, setAnswer] = useState<{ key: string; value: ChapterVerseTimestamps } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void import('../../../../services/bible/verseTimestamps')
      .then(({ getChapterTimestamps }) => getChapterTimestamps(translationId, bookId, chapter))
      .catch(() => null)
      .then((timestamps) => {
        if (!cancelled) setAnswer({ key, value: { timestamps: timestamps ?? null, loaded: true } });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, translationId, bookId, chapter]);

  return enabled && answer?.key === key ? answer.value : NOT_LOADED;
}
