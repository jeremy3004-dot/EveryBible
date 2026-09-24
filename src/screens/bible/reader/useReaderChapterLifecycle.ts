import { useRef, useEffect } from 'react';
import type { AudioPlaybackSequenceEntry } from '../../../types/audio';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { type ChapterPresentationMode } from '../../../services/bible/presentation';
import type { Verse } from '../../../types';
import { getInitialChapterSessionMode } from '../bibleReaderModel';
import { invalidateReaderChapterLoad, type CancellableTask } from '../readerChapterLoader';

export interface UseReaderChapterLifecycleInput {
  activeAudioBookId: string | null;
  activeAudioChapter: number | null;
  activeAudioTranslationId: string | null;
  activePlanId: string | undefined;
  audioEnabled: boolean;
  autoplayAudio: boolean | undefined;
  bookId: string;
  chapter: number;
  chapterLoadRequestIdRef: RefObject<number>;
  chapterPrefetchTaskRef: RefObject<CancellableTask | null>;
  chapterPresentationMode: ChapterPresentationMode;
  currentTranslation: string;
  dismissSelectedVerseSelection: () => void;
  focusVerse: number | undefined;
  followAlongOffsetsRef: RefObject<Record<number, number>>;
  isLoading: boolean;
  loadChapter: () => Promise<void>;
  paragraphHeightsRef: RefObject<Record<string, number>>;
  pendingReaderAutoScrollVerseRef: RefObject<number | null>;
  planDayNumber: number | undefined;
  playbackSequenceEntriesForAudio: AudioPlaybackSequenceEntry[];
  preferredMode: 'listen' | 'read' | undefined;
  readerFocusScrollRef: RefObject<{
    readonly pendingVerse: number | null;
    request(verse: number | null): void;
    flush(getOffset: (verse: number) => number | null, scroll: (offset: number) => void): boolean;
  }>;
  readerListHeaderHeightRef: RefObject<number>;
  resetFollowAlongClamp: () => void;
  returnToPlanOnComplete: boolean;
  scrollReaderToOffset: (offsetY: number, animated: boolean) => void;
  setChapterSessionMode: Dispatch<SetStateAction<'listen' | 'read'>>;
  setCurrentBook: (bookId: string) => void;
  setCurrentChapter: (chapter: number) => void;
  setPlanDayResume: (planId: string, dayNumber: number, bookId: string, chapter: number) => void;
  setPlaybackSequence: (entries: AudioPlaybackSequenceEntry[]) => void;
  setSelectedVerses: Dispatch<SetStateAction<number[]>>;
  setShowFollowAlongText: Dispatch<SetStateAction<boolean>>;
  setShowFontSizeSheet: Dispatch<SetStateAction<boolean>>;
  verseOffsetsRef: RefObject<Record<number, number>>;
  verses: Verse[];
}

/** What happens when the reader lands on a chapter: syncing the store and playback sequence, loading it, resetting measurements and selection, and choosing read or listen. */
export function useReaderChapterLifecycle({
  activeAudioBookId,
  activeAudioChapter,
  activeAudioTranslationId,
  activePlanId,
  audioEnabled,
  autoplayAudio,
  bookId,
  chapter,
  chapterLoadRequestIdRef,
  chapterPrefetchTaskRef,
  chapterPresentationMode,
  currentTranslation,
  dismissSelectedVerseSelection,
  focusVerse,
  followAlongOffsetsRef,
  isLoading,
  loadChapter,
  paragraphHeightsRef,
  pendingReaderAutoScrollVerseRef,
  planDayNumber,
  playbackSequenceEntriesForAudio,
  preferredMode,
  readerFocusScrollRef,
  readerListHeaderHeightRef,
  resetFollowAlongClamp,
  returnToPlanOnComplete,
  scrollReaderToOffset,
  setChapterSessionMode,
  setCurrentBook,
  setCurrentChapter,
  setPlanDayResume,
  setPlaybackSequence,
  setSelectedVerses,
  setShowFollowAlongText,
  setShowFontSizeSheet,
  verseOffsetsRef,
  verses,
}: UseReaderChapterLifecycleInput) {
  const sessionKeyRef = useRef<string | null>(null);
  const measuredChapterKeyRef = useRef<string | null>(null);
  useEffect(() => {
    setCurrentBook(bookId);
    setCurrentChapter(chapter);
  }, [bookId, chapter, setCurrentBook, setCurrentChapter]);

  useEffect(() => {
    if (playbackSequenceEntriesForAudio.length === 0) {
      return;
    }

    setPlaybackSequence(playbackSequenceEntriesForAudio);
  }, [playbackSequenceEntriesForAudio, setPlaybackSequence]);

  useEffect(() => {
    void loadChapter();
    return () => {
      invalidateReaderChapterLoad({
        requestIdRef: chapterLoadRequestIdRef,
        prefetchTaskRef: chapterPrefetchTaskRef,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapter, currentTranslation]);

  useEffect(() => {
    if (!activePlanId || typeof planDayNumber !== 'number' || !returnToPlanOnComplete) {
      return;
    }

    setPlanDayResume(activePlanId, planDayNumber, bookId, chapter);
  }, [activePlanId, bookId, chapter, planDayNumber, returnToPlanOnComplete, setPlanDayResume]);

  useEffect(() => {
    const chapterKey = `${currentTranslation}:${bookId}:${chapter}`;
    if (measuredChapterKeyRef.current !== chapterKey) {
      measuredChapterKeyRef.current = chapterKey;
      verseOffsetsRef.current = {};
      paragraphHeightsRef.current = {};
      readerListHeaderHeightRef.current = 0;
      followAlongOffsetsRef.current = {};
    }
    readerFocusScrollRef.current.request(focusVerse ?? null);
    pendingReaderAutoScrollVerseRef.current = null;
    // Keep an already-empty selection: a fresh [] re-rendered the screen and verse list.
    setSelectedVerses((current) => (current.length === 0 ? current : []));
    // Reset monotonic follow-along state on chapter change
    resetFollowAlongClamp();
    if (focusVerse == null) {
      scrollReaderToOffset(0, false);
    }
  }, [
    bookId,
    chapter,
    currentTranslation,
    focusVerse,
    resetFollowAlongClamp,
    scrollReaderToOffset,
    followAlongOffsetsRef,
    paragraphHeightsRef,
    pendingReaderAutoScrollVerseRef,
    readerFocusScrollRef,
    readerListHeaderHeightRef,
    setSelectedVerses,
    verseOffsetsRef,
  ]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const sessionKey = `${bookId}:${chapter}:${currentTranslation}`;
    if (sessionKeyRef.current === sessionKey) {
      return;
    }

    sessionKeyRef.current = sessionKey;
    const hasText = verses.length > 0;
    const nextSessionMode = hasText
      ? 'read'
      : getInitialChapterSessionMode({
          translationId: currentTranslation,
          audioEnabled,
          hasText,
          autoplayAudio: Boolean(autoplayAudio),
          preferredMode: preferredMode ?? null,
          bookId,
          chapter,
          activeAudioTranslationId,
          activeAudioBookId,
          activeAudioChapter,
        });

    setShowFollowAlongText((current) => {
      if (hasText || nextSessionMode === 'read') {
        return false;
      }

      return current;
    });
    setChapterSessionMode(nextSessionMode);
  }, [
    activeAudioTranslationId,
    activeAudioBookId,
    activeAudioChapter,
    audioEnabled,
    autoplayAudio,
    bookId,
    chapter,
    currentTranslation,
    isLoading,
    preferredMode,
    verses.length,
    setChapterSessionMode,
    setShowFollowAlongText,
  ]);

  useEffect(() => {
    if (chapterPresentationMode === 'audio-first') {
      setShowFontSizeSheet(false);
      dismissSelectedVerseSelection();
    }
  }, [chapterPresentationMode, dismissSelectedVerseSelection, setShowFontSizeSheet]);
}
