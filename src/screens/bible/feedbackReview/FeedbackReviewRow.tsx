import { memo } from 'react';
import type {
  ChapterFeedbackReviewItem,
  TranslatorFeedbackResolution,
} from '../../../services/feedback';
import { FeedbackResponseCard } from '../../../components/feedback';

interface FeedbackReviewRowProps {
  item: ChapterFeedbackReviewItem;
  language: string;
  isPlaying: boolean;
  busy: boolean;
  /** Stable handlers taking the item, so a row redraws only when what it shows changes. */
  onPlay: (item: ChapterFeedbackReviewItem) => void;
  onResolve: (item: ChapterFeedbackReviewItem, resolution: TranslatorFeedbackResolution) => void;
  onReopen: (item: ChapterFeedbackReviewItem) => void;
}

/**
 * One feedback card in the review list. Memoised: typing a reason in the resolve
 * sheet, or starting a voice note, re-renders the screen, and without this every
 * card in the list redrew on each keystroke.
 */
export const FeedbackReviewRow = memo(function FeedbackReviewRow({
  item,
  language,
  isPlaying,
  busy,
  onPlay,
  onResolve,
  onReopen,
}: FeedbackReviewRowProps) {
  return (
    <FeedbackResponseCard
      item={item}
      language={language}
      isPlaying={isPlaying}
      busy={busy}
      onPlay={() => onPlay(item)}
      onResolve={(resolution) => onResolve(item, resolution)}
      onReopen={() => onReopen(item)}
    />
  );
});
