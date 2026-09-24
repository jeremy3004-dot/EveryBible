import { useEffect, useState } from 'react';
import type { Verse } from '../../types';
import type { LessonAudioSource } from '../../services/gather/lessonAudioSource';
import { getChapter } from '../../services/bible/bibleService';
import { getChapterTimestamps, type VerseTimestamps } from '../../services/bible/verseTimestamps';
import { getEstimatedFollowAlongVerse } from '../bible/bibleReaderModel';

/** The verse the lesson's story audio is on. */
export interface LessonFollowAlongVerse {
  bookId: string;
  chapter: number;
  verse: number;
}

export interface LessonFollowAlongInput {
  /** The chapter recording the lesson plays, or null before it resolves. */
  source: LessonAudioSource | null;
  /**
   * The translation of the verses on screen. The recording is a whole chapter even when
   * the lesson shows only part of it, so without exact timings the position is spread over
   * the full chapter's text, read in this translation.
   */
  textTranslationId: string | null;
  positionMillis: number;
  durationMillis: number;
  /** Playing, or paused part-way. A stopped or finished story highlights nothing. */
  started: boolean;
}

interface ChapterTiming {
  key: string;
  verses: Verse[];
  timestamps: VerseTimestamps | null;
}

/**
 * Follows the lesson's story audio verse by verse, the way the Bible reader does: exact
 * verse timings where the translation has them, otherwise an estimate from the length of
 * each verse. Returns null until the chapter's text or timings have loaded.
 */
export function useLessonFollowAlongVerse({
  source,
  textTranslationId,
  positionMillis,
  durationMillis,
  started,
}: LessonFollowAlongInput): LessonFollowAlongVerse | null {
  const key =
    source && textTranslationId
      ? `${source.translationId}|${textTranslationId}|${source.bookId}|${source.chapter}`
      : null;
  const [timing, setTiming] = useState<ChapterTiming | null>(null);

  useEffect(() => {
    if (!source || !textTranslationId || !key) return;
    let cancelled = false;
    void Promise.all([
      getChapter(textTranslationId, source.bookId, source.chapter).catch((): Verse[] => []),
      getChapterTimestamps(source.translationId, source.bookId, source.chapter).catch(() => null),
    ]).then(([verses, timestamps]) => {
      if (!cancelled) setTiming({ key, verses, timestamps });
    });
    return () => {
      cancelled = true;
    };
  }, [key, source, textTranslationId]);

  if (!source || !started || durationMillis <= 0 || !timing || timing.key !== key) {
    return null;
  }
  const verse = getEstimatedFollowAlongVerse({
    verses: timing.verses,
    currentPosition: positionMillis,
    duration: durationMillis,
    timestamps: timing.timestamps,
  });
  return verse == null ? null : { bookId: source.bookId, chapter: source.chapter, verse };
}
