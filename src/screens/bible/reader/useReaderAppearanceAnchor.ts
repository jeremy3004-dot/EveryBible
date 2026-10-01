import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  getReaderScrollAnchor,
  getReaderScrollAnchorOffset,
  type ReaderParagraph,
  type ReaderScrollAnchor,
} from '../bibleReaderModel';

/** How long after an appearance change the reader keeps re-pinning its verse as rows re-measure. */
const ANCHOR_SETTLE_MS = 400;

export interface UseReaderAppearanceAnchorInput {
  /** Changes whenever font size, theme or any other appearance input redraws every paragraph. */
  appearanceSignature: string;
  contentTopOffset: number;
  paragraphHeightsRef: RefObject<Record<string, number>>;
  paragraphs: readonly ReaderParagraph[];
  readerLastScrollOffsetYRef: RefObject<number>;
  scrollToOffset: (offset: number) => void;
}

/**
 * Keeps the verse at the top of the screen in place when the reading appearance changes.
 * A pixel scroll offset means a different verse once paragraph heights change, and the
 * list gives no anchoring of its own, so the reader would land somewhere else in the
 * chapter (the top, on device). The anchor is taken in the render that carries the new
 * appearance, before any row re-measures, then re-applied each time a row reports its new
 * height until the heights settle.
 *
 * Returns the function the rows call from `onLayout`.
 */
export function useReaderAppearanceAnchor({
  appearanceSignature,
  contentTopOffset,
  paragraphHeightsRef,
  paragraphs,
  readerLastScrollOffsetYRef,
  scrollToOffset,
}: UseReaderAppearanceAnchorInput) {
  const signatureRef = useRef(appearanceSignature);
  const anchorRef = useRef<ReaderScrollAnchor | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Render-time capture: the heights and scroll offset are still the old appearance's.
  if (signatureRef.current !== appearanceSignature) {
    signatureRef.current = appearanceSignature;
    anchorRef.current = getReaderScrollAnchor({
      paragraphs,
      paragraphHeights: paragraphHeightsRef.current,
      contentTopOffset,
      scrollOffset: readerLastScrollOffsetYRef.current,
    });
  }

  const restoreAnchor = useCallback(() => {
    const anchor = anchorRef.current;
    if (anchor == null) {
      return;
    }
    const offset = getReaderScrollAnchorOffset({
      paragraphs,
      paragraphHeights: paragraphHeightsRef.current,
      contentTopOffset,
      anchor,
    });
    if (offset != null) {
      scrollToOffset(offset);
    }
    if (settleTimerRef.current != null) {
      clearTimeout(settleTimerRef.current);
    }
    settleTimerRef.current = setTimeout(() => {
      anchorRef.current = null;
      settleTimerRef.current = null;
    }, ANCHOR_SETTLE_MS);
  }, [contentTopOffset, paragraphHeightsRef, paragraphs, scrollToOffset]);

  // Heights that do not change (a theme switch) fire no onLayout, so pin once on commit too.
  useEffect(() => {
    restoreAnchor();
    // Only an appearance change re-pins here; row layouts re-pin through the returned callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearanceSignature]);

  useEffect(
    () => () => {
      if (settleTimerRef.current != null) {
        clearTimeout(settleTimerRef.current);
      }
    },
    []
  );

  return restoreAnchor;
}
