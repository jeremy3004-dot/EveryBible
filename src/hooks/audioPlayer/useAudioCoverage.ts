import { useCallback, useRef } from 'react';
import { getAdjacentBibleChapter } from '../../constants';
import {
  peekAudioChapterMap,
  resolveAudioChapterMap,
} from '../../services/audio/audioChapterCoverage';
import {
  findAdjacentAvailableChapter,
  type AudioChapterMap,
} from '../../services/bible/contentAvailability';
import { useBibleStore } from '../../stores/bibleStore';
import { useTranslationContentSummary } from '../useTranslationContentSummary';

/** The chapter after (or before) this one, within a sparse set's exact coverage if known. */
export function getAdjacentAudioChapter(
  bookId: string,
  chapter: number,
  direction: -1 | 1,
  coverage: AudioChapterMap | undefined
) {
  return coverage
    ? findAdjacentAvailableChapter(bookId, chapter, direction, coverage)
    : getAdjacentBibleChapter(bookId, chapter, direction);
}

export function findLiveTranslation(translationId: string) {
  return useBibleStore.getState().translations.find((candidate) => candidate.id === translationId);
}

/**
 * Exact per-chapter audio coverage. Every Language sets describe their audio only
 * through a signed manifest, and it is sparse, so plain chapter adjacency walks into
 * chapters that can never play. Until coverage resolves every walk stays on the
 * canonical 1..N path.
 *
 * Chapter walks read coverage from the coverage service when they happen, for the
 * translation they walk: auto-advance and lock-screen commands run long after the
 * reader closed, for whichever translation is playing by then. What the reader
 * rendered (for `renderedTranslationId`) is only a fallback, and only for the
 * translation it was rendered for. Both returned functions are stable.
 */
export function useAudioCoverage(renderedTranslationId: string) {
  const activeAudioTranslation = useBibleStore((state) =>
    state.translations.find((candidate) => candidate.id === renderedTranslationId)
  );
  const audioChapterMap = useTranslationContentSummary(activeAudioTranslation)?.audioChapters;
  const renderedAudioChapterMapRef = useRef<
    { translationId: string; chapters: AudioChapterMap } | undefined
  >(undefined);
  // Written during render so a chapter walk reads the coverage this render saw.
  // eslint-disable-next-line react-hooks/refs -- intentional render-time handoff
  renderedAudioChapterMapRef.current = audioChapterMap
    ? { translationId: renderedTranslationId, chapters: audioChapterMap }
    : undefined;

  const renderedAudioChapterMap = useCallback((coverageTranslationId: string) => {
    const rendered = renderedAudioChapterMapRef.current;
    return rendered?.translationId === coverageTranslationId ? rendered.chapters : undefined;
  }, []);

  /** Coverage already known for a translation, for callers that cannot wait. */
  const peekAudioCoverage = useCallback(
    (coverageTranslationId: string) =>
      peekAudioChapterMap(findLiveTranslation(coverageTranslationId)) ??
      renderedAudioChapterMap(coverageTranslationId),
    [renderedAudioChapterMap]
  );

  /** Coverage for a translation as of now, resolving it if nothing has yet. */
  const resolveAudioCoverage = useCallback(
    async (coverageTranslationId: string) =>
      (await resolveAudioChapterMap(findLiveTranslation(coverageTranslationId))) ??
      renderedAudioChapterMap(coverageTranslationId),
    [renderedAudioChapterMap]
  );

  return { peekAudioCoverage, resolveAudioCoverage };
}
