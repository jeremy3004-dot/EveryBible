import { useRef, useEffect, useState } from 'react';
import type { PlanSessionKey, RhythmSessionContext } from '../../../services/plans/types';
import { type ChapterPresentationMode } from '../../../services/bible/presentation';
import type { BibleTranslation } from '../../../types';
import {
  buildReaderChapterRouteParams,
  shouldAutoplayChapterAudio,
  shouldSyncReaderToActiveAudioChapter,
} from '../bibleReaderModel';
import type { NavigationProp } from './readerConstants';

export interface UseReaderAudioSyncInput {
  activeAudioBookId: string | null;
  activeAudioChapter: number | null;
  activeAudioTranslationId: string | null;
  audioEnabled: boolean;
  autoplayAudio: boolean | undefined;
  bookId: string;
  chapter: number;
  chapterPresentationMode: ChapterPresentationMode;
  chapterSessionMode: 'listen' | 'read';
  currentTranslation: string;
  currentTranslationInfo: BibleTranslation | undefined;
  focusVerse: number | undefined;
  /**
   * Verses are selected, so the verse sheet is open on this chapter (maybe with a note
   * being typed). Following playback would clear the selection and close the sheet, so
   * the reader waits and follows once the selection clears.
   */
  holdChapterFollow: boolean;
  isLoading: boolean;
  navigation: NavigationProp;
  playChapter: (bookId: string, chapter: number, verse?: number | undefined) => Promise<void>;
  /** The reader route's key: a remount with the same key is the same route coming back. */
  routeKey: string;
  resolvePlanSessionRouteParams: (
    nextBookId: string,
    nextChapter: number
  ) =>
    | {
        planId?: undefined;
        planDayNumber?: undefined;
        returnToPlanOnComplete?: undefined;
        sessionContext?: undefined;
      }
    | {
        planId: string | undefined;
        planDayNumber: number | undefined;
        returnToPlanOnComplete: boolean;
        sessionContext: RhythmSessionContext;
      }
    | {
        returnToPlanOnComplete: boolean;
        planSessionKey?: PlanSessionKey | undefined;
        planId: string;
        planDayNumber: number;
        sessionContext?: undefined;
      };
}

interface SeenActiveAudioChapter {
  bookId: string | null;
  chapter: number | null;
}

const MAX_REMEMBERED_READER_ROUTES = 8;

/**
 * The playing chapter each reader route last saw, by route key, in memory only.
 * Following depends on it: the reader moves with playback only off the chapter that
 * was playing. The discreet-mode lock unmounts the navigator and brings the same routes
 * back on unlock; a remounted reader that started from nothing could not tell it had
 * been showing the chapter playback has since left, so it stayed there behind a Play
 * button while the next chapters played.
 */
const seenActiveAudioByRouteKey = new Map<string, SeenActiveAudioChapter>();

function rememberSeenActiveAudio(routeKey: string, seen: SeenActiveAudioChapter): void {
  seenActiveAudioByRouteKey.delete(routeKey);
  seenActiveAudioByRouteKey.set(routeKey, seen);
  if (seenActiveAudioByRouteKey.size > MAX_REMEMBERED_READER_ROUTES) {
    const oldest = seenActiveAudioByRouteKey.keys().next().value;
    if (oldest !== undefined) seenActiveAudioByRouteKey.delete(oldest);
  }
}

/** Forgets every reader route's last seen playing chapter (between tests). */
export function forgetReaderAudioFollowMemory(): void {
  seenActiveAudioByRouteKey.clear();
}

/** Plays the chapter when the reader was opened to listen, and follows the player onto the next chapter it moves to. */
export function useReaderAudioSync({
  activeAudioBookId,
  activeAudioChapter,
  activeAudioTranslationId,
  audioEnabled,
  autoplayAudio,
  bookId,
  chapter,
  chapterPresentationMode,
  chapterSessionMode,
  currentTranslation,
  currentTranslationInfo,
  focusVerse,
  holdChapterFollow,
  isLoading,
  navigation,
  playChapter,
  routeKey,
  resolvePlanSessionRouteParams,
}: UseReaderAudioSyncInput) {
  const [seenBeforeMount] = useState(() => seenActiveAudioByRouteKey.get(routeKey) ?? null);
  const previousActiveAudioChapterRef = useRef<number | null>(seenBeforeMount?.chapter ?? null);
  const previousActiveAudioBookIdRef = useRef<string | null>(seenBeforeMount?.bookId ?? null);
  const autoplayKeyRef = useRef<string | null>(null);
  /** The chapter the reader stayed on while a follow was held back (holdChapterFollow). */
  const heldFollowFromRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !shouldAutoplayChapterAudio({
        translationId: currentTranslation,
        autoplayAudio: Boolean(autoplayAudio),
        audioEnabled,
        isLoading,
        bookId,
        chapter,
        activeAudioTranslationId,
        activeAudioBookId,
        activeAudioChapter,
      })
    ) {
      return;
    }

    const autoplayKey = `${currentTranslation}:${bookId}:${chapter}:${focusVerse ?? 'chapter'}:${chapterPresentationMode}`;
    if (autoplayKeyRef.current === autoplayKey) {
      return;
    }

    autoplayKeyRef.current = autoplayKey;
    // The autoplay param is a one-shot request from the screen that opened the reader.
    // Left set, a later translation switch produced a new key and started audio again,
    // even after the listener had paused or stopped it.
    navigation.setParams({ autoplayAudio: false });

    void playChapter(
      bookId,
      chapter,
      currentTranslationInfo?.audioGranularity === 'verse' ? focusVerse : undefined
    );
  }, [
    activeAudioTranslationId,
    activeAudioBookId,
    activeAudioChapter,
    autoplayAudio,
    audioEnabled,
    bookId,
    chapter,
    chapterPresentationMode,
    currentTranslation,
    currentTranslationInfo,
    focusVerse,
    isLoading,
    navigation,
    playChapter,
  ]);

  useEffect(() => {
    const shouldSync = shouldSyncReaderToActiveAudioChapter({
      audioEnabled,
      bookId,
      chapter,
      activeAudioBookId,
      activeAudioChapter,
      previousActiveAudioBookId: previousActiveAudioBookIdRef.current,
      previousActiveAudioChapter: previousActiveAudioChapterRef.current,
    });

    previousActiveAudioBookIdRef.current = activeAudioBookId;
    previousActiveAudioChapterRef.current = activeAudioChapter;
    rememberSeenActiveAudio(routeKey, {
      bookId: activeAudioBookId,
      chapter: activeAudioChapter,
    });

    if (!shouldSync || activeAudioChapter == null) {
      return;
    }
    if (holdChapterFollow) {
      heldFollowFromRef.current = `${bookId}:${chapter}`;
      return;
    }

    heldFollowFromRef.current = null;
    navigation.setParams(
      buildReaderChapterRouteParams({
        bookId: activeAudioBookId ?? bookId,
        chapter: activeAudioChapter,
        preferredMode: chapterSessionMode,
        ...resolvePlanSessionRouteParams(activeAudioBookId ?? bookId, activeAudioChapter),
      })
    );
  }, [
    audioEnabled,
    activeAudioBookId,
    activeAudioChapter,
    bookId,
    chapter,
    chapterSessionMode,
    holdChapterFollow,
    navigation,
    resolvePlanSessionRouteParams,
    routeKey,
  ]);

  // The follow held back while verses were selected, once they are not. Dropped if the
  // reader was moved meanwhile or playback stopped or came back to this chapter.
  useEffect(() => {
    const heldFrom = heldFollowFromRef.current;
    if (holdChapterFollow || heldFrom == null) {
      return;
    }
    heldFollowFromRef.current = null;
    if (
      heldFrom !== `${bookId}:${chapter}` ||
      !audioEnabled ||
      activeAudioBookId == null ||
      activeAudioChapter == null ||
      (activeAudioBookId === bookId && activeAudioChapter === chapter)
    ) {
      return;
    }

    navigation.setParams(
      buildReaderChapterRouteParams({
        bookId: activeAudioBookId,
        chapter: activeAudioChapter,
        preferredMode: chapterSessionMode,
        ...resolvePlanSessionRouteParams(activeAudioBookId, activeAudioChapter),
      })
    );
  }, [
    audioEnabled,
    activeAudioBookId,
    activeAudioChapter,
    bookId,
    chapter,
    chapterSessionMode,
    holdChapterFollow,
    navigation,
    resolvePlanSessionRouteParams,
  ]);
}
