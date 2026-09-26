import { useEffect, useState } from 'react';
import type { BibleTranslation, Verse } from '../../../../types';
import type { ChapterTrack } from './useChapterVerseTimestamps';
import { getReadAlongTextCandidates } from './readAlongModel';

export interface ReadAlongText {
  verses: Verse[];
  /** The translation the verses are in, or null while none has been found. */
  textTranslationId: string | null;
  /** The verses are another translation's than the recording's. */
  isFallback: boolean;
  /** False until the text is known, either way. */
  loaded: boolean;
  /**
   * The verses are the last chapter's, kept on screen while this one's text loads
   * (moving between chapters never blanks the page); nothing in them is followed.
   */
  isStale: boolean;
}

const NO_VERSES: Verse[] = [];
const LOADING: ReadAlongText = {
  verses: NO_VERSES,
  textTranslationId: null,
  isFallback: false,
  loaded: false,
  isStale: false,
};

const isSameText = (a: ReadAlongText, b: ReadAlongText) =>
  a.verses === b.verses &&
  a.textTranslationId === b.textTranslationId &&
  a.isFallback === b.isFallback;

/**
 * Read Along's text for a chapter: the reader's own verses when it has them on screen,
 * otherwise the first chapter text found among getReadAlongTextCandidates (loaded while
 * `enabled`, through the reader's Bible service). While a new chapter's text loads, the
 * last chapter's stays (marked stale).
 */
export function useReadAlongText({
  track,
  readerVerses,
  translation,
  enabled,
}: {
  track: ChapterTrack;
  readerVerses: Verse[];
  translation: Pick<BibleTranslation, 'hasText'> | undefined;
  enabled: boolean;
}): ReadAlongText {
  const { translationId, bookId, chapter } = track;
  const hasReaderText = readerVerses.length > 0;
  const hasText = translation?.hasText;
  const key = `${translationId}:${bookId}:${chapter}:${String(hasText)}`;
  const [loaded, setLoaded] = useState<{ key: string; value: ReadAlongText } | null>(null);

  useEffect(() => {
    if (!enabled || hasReaderText) return;
    let cancelled = false;
    const candidates = getReadAlongTextCandidates({
      translationId,
      translation: hasText === undefined ? undefined : { hasText },
    });
    void (async () => {
      const { getChapter } = await import('../../../../services/bible/bibleService');
      for (const candidate of candidates) {
        const verses = await getChapter(candidate.translationId, bookId, chapter).catch(
          (): Verse[] => []
        );
        if (cancelled) return;
        if (verses.length > 0) {
          setLoaded({
            key,
            value: {
              verses,
              textTranslationId: candidate.translationId,
              isFallback: candidate.isFallback,
              loaded: true,
              isStale: false,
            },
          });
          return;
        }
      }
      setLoaded({ key, value: { ...LOADING, loaded: true } });
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, hasReaderText, key, translationId, bookId, chapter, hasText]);

  const current: ReadAlongText = hasReaderText
    ? {
        verses: readerVerses,
        textTranslationId: translationId,
        isFallback: false,
        loaded: true,
        isStale: false,
      }
    : enabled && loaded?.key === key
      ? loaded.value
      : LOADING;

  // The text last shown, kept across renders (React's "adjust state while rendering"
  // pattern) for the moment between one chapter and the next.
  const [lastShown, setLastShown] = useState<ReadAlongText | null>(null);
  if (!enabled) {
    if (lastShown) setLastShown(null);
  } else if (current.loaded && (lastShown == null || !isSameText(lastShown, current))) {
    setLastShown(current);
  }

  if (enabled && !current.loaded && lastShown && lastShown.verses.length > 0) {
    return { ...lastShown, loaded: false, isStale: true };
  }
  return current;
}
