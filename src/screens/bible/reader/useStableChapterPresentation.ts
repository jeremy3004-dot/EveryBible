import { useRef } from 'react';
import type { ChapterPresentationMode } from '../../../services/bible/presentation';

export interface StableChapterPresentationInput {
  isLoading: boolean;
  rawPresentationMode: ChapterPresentationMode;
  chapterSessionMode: 'listen' | 'read';
  /** How to present the very first load, before any chapter has settled. */
  initialPresentationMode: ChapterPresentationMode;
}

/**
 * While a chapter loads, keep presenting it the way the last settled chapter was
 * presented (text or audio-first, read or listen), so moving between chapters never
 * flashes the other layout.
 */
export function useStableChapterPresentation({
  isLoading,
  rawPresentationMode,
  chapterSessionMode,
  initialPresentationMode,
}: StableChapterPresentationInput) {
  const lastStablePresentationModeRef = useRef<ChapterPresentationMode>(initialPresentationMode);
  const lastStableSessionModeRef = useRef(chapterSessionMode);
  // Render-time memory of the last settled chapter, written and read in the same render.
  /* eslint-disable react-hooks/refs */
  if (!isLoading) {
    lastStablePresentationModeRef.current = rawPresentationMode;
    lastStableSessionModeRef.current = chapterSessionMode;
  }
  const chapterPresentationMode = isLoading
    ? lastStablePresentationModeRef.current
    : rawPresentationMode;
  const stableSessionMode = isLoading ? lastStableSessionModeRef.current : chapterSessionMode;

  return { chapterPresentationMode, stableSessionMode };
  /* eslint-enable react-hooks/refs */
}
