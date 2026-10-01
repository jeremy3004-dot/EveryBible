import { useCallback, useEffect, useRef, useState } from 'react';
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
  // Keyed on the requested set, not on what is still missing: a count arriving must not
  // re-run the effect. Loads are never cancelled (a result is stored under its own
  // translation/book/chapter key, so a late one is harmless), and `requested` keeps a chapter
  // from being fetched twice.
  const requested = useRef(new Set<string>());
  const mounted = useRef(true);
  const requestedKey = [...new Set(chapters)].join(',');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (requestedKey === '') return;
    for (const chapter of requestedKey.split(',').map(Number)) {
      const key = `${translationId}:${bookId}:${chapter}`;
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      void loadVerseCount(translationId, bookId, chapter).then((count) => {
        if (!mounted.current) return;
        setCounts((current) => ({ ...current, [key]: count }));
      });
    }
  }, [bookId, translationId, requestedKey]);

  return useCallback(
    (chapter: number) => {
      const count = counts[keyOf(chapter)];
      return count === undefined || count === UNKNOWN ? null : count;
    },
    [counts, keyOf]
  );
}
