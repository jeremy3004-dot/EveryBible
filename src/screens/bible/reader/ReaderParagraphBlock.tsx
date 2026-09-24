import { memo } from 'react';
import type { RefObject, ReactElement } from 'react';
import type { ReaderParagraph } from '../bibleReaderModel';

export interface ReaderParagraphBlockProps {
  paragraph: ReaderParagraph;
  index: number;
  /**
   * A render signature that changes whenever anything affecting this paragraph's
   * visual output changes EXCEPT the raw audio position (theme/fontsize/selection
   * version, etc.), plus the active follow-along verse. This lets the cell skip
   * re-rendering on the ~250ms position ticks that do not move the highlight.
   */
  renderSignature: string;
  activeVerse: number | null;
  renderParagraphRef: RefObject<(paragraph: ReaderParagraph, index: number) => ReactElement>;
}

export function readerParagraphBlockPropsAreEqual(
  prev: ReaderParagraphBlockProps,
  next: ReaderParagraphBlockProps
): boolean {
  if (
    prev.paragraph !== next.paragraph ||
    prev.index !== next.index ||
    prev.renderSignature !== next.renderSignature
  ) {
    return false;
  }

  // Only paragraphs touched by the active verse transition must re-render.
  const prevHasActive =
    prev.activeVerse != null && prev.paragraph.verses.some((v) => v.verse === prev.activeVerse);
  const nextHasActive =
    next.activeVerse != null && next.paragraph.verses.some((v) => v.verse === next.activeVerse);
  if (!prevHasActive && !nextHasActive) {
    return true;
  }

  return prev.activeVerse === next.activeVerse;
}

/* eslint-disable react/prop-types */
export const ReaderParagraphBlock = memo(function ReaderParagraphBlock({
  paragraph,
  index,
  renderParagraphRef,
}: ReaderParagraphBlockProps) {
  // The render closure is read from a ref so prop identity stays stable across
  // position ticks; the comparator above gates actual re-renders.
  return renderParagraphRef.current(paragraph, index);
}, readerParagraphBlockPropsAreEqual);
/* eslint-enable react/prop-types */
