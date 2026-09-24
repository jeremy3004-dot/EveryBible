import { useRef, useEffect } from 'react';
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
  isLoading: boolean;
  navigation: NavigationProp;
  playChapter: (bookId: string, chapter: number, verse?: number | undefined) => Promise<void>;
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
  isLoading,
  navigation,
  playChapter,
  resolvePlanSessionRouteParams,
}: UseReaderAudioSyncInput) {
  const previousActiveAudioChapterRef = useRef<number | null>(null);
  const previousActiveAudioBookIdRef = useRef<string | null>(null);
  const autoplayKeyRef = useRef<string | null>(null);
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

    if (!shouldSync || activeAudioChapter == null) {
      return;
    }

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
    navigation,
    resolvePlanSessionRouteParams,
  ]);
}
