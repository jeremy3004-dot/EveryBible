import { useCallback, useEffect, useState } from 'react';
import { getChapter } from '../../../../services/bible/bibleService';
import { chapterVerseCount, type VerseCountLookup } from './audioSheetModel';

// The bundled translation every install has; audio-only translations borrow its
// verse numbering so the passage picker can still offer verses.
const FALLBACK_TEXT_TRANSLATION_ID = 'bsb';

/** A count that could not be read: the picker falls back to its ceiling. */
const UNKNOWN = -1;

async function loadVerseCount(translationId: string, bookId: string, chapter: number) {
  try {
    const count = chapterVerseCount(await getChapter(translationId, bookId, chapter));
    if (count > 0 || translationId === FALLBACK_TEXT_TRANSLATION_ID) {
      return count > 0 ? count : UNKNOWN;
    }
    const fallback = chapterVerseCount(
      await getChapter(FALLBACK_TEXT_TRANSLATION_ID, bookId, chapter)
    );
    return fallback > 0 ? fallback : UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

/**
 * Verse counts for chapters of one book, read from the reader's own (cached, offline)
 * Bible text as the picker asks for them.
 */
export function useChapterVerseCounts(
  translationId: string,
  bookId: string,
  chapters: readonly number[]
): VerseCountLookup {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const keyOf = useCallback(
    (chapter: number) => `${translationId}:${bookId}:${chapter}`,
    [bookId, translationId]
  );
  const wanted = [...new Set(chapters)].filter((chapter) => counts[keyOf(chapter)] === undefined);
  const wantedKey = wanted.join(',');

  useEffect(() => {
    if (wantedKey === '') return;
    let cancelled = false;
    for (const chapter of wantedKey.split(',').map(Number)) {
      void loadVerseCount(translationId, bookId, chapter).then((count) => {
        if (cancelled) return;
        setCounts((current) => ({ ...current, [`${translationId}:${bookId}:${chapter}`]: count }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [bookId, translationId, wantedKey]);

  return useCallback(
    (chapter: number) => {
      const count = counts[keyOf(chapter)];
      return count === undefined || count === UNKNOWN ? null : count;
    },
    [counts, keyOf]
  );
}
