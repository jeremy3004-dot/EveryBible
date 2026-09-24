import type {
  ChapterFeedbackReviewInput,
  ChapterFeedbackReviewItem,
  ChapterReviewHeadline,
  FeedbackCategoryFilter,
  FeedbackStatusFilter,
  TranslatorFeedbackChapterSummary,
} from '../../../services/feedback';

/** The fetch, bulk-review and audio-URL input for one chapter under the current filters. */
export type FeedbackReviewQuery = ChapterFeedbackReviewInput & {
  apiVersion: 2;
  category: FeedbackCategoryFilter;
  status: FeedbackStatusFilter;
  positiveOnly: boolean;
};

export const SOURCE_FILTERS: readonly { value: FeedbackCategoryFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'feedback.everyone' },
  { value: 'scripture_council', labelKey: 'feedback.council' },
  { value: 'community', labelKey: 'feedback.community' },
];

export function getSourceFilterLabelKey(category: FeedbackCategoryFilter): string {
  return (
    SOURCE_FILTERS.find((filter) => filter.value === category)?.labelKey ?? 'feedback.everyone'
  );
}

/**
 * A first page replaces the list; a later page appends only the feedback not already
 * listed, since new feedback arriving between requests can shift items across pages.
 */
export function mergeFeedbackPage(
  previous: ChapterFeedbackReviewItem[],
  incoming: ChapterFeedbackReviewItem[],
  isNextPage: boolean
): ChapterFeedbackReviewItem[] {
  if (!isNextPage) return incoming;
  const listed = new Set(previous.map((item) => item.id));
  return [...previous, ...incoming.filter((item) => !listed.has(item.id))];
}

/**
 * A caught-up chapter already says so in the headline, and the accurate-with-no-comment
 * row already lists what the comment list leaves out; an empty list only needs
 * explaining when a filter is hiding everything.
 */
export function shouldShowNoMatching({
  loading,
  failed,
  summary,
  positiveOnly,
  positiveCount,
  status,
  headline,
}: {
  loading: boolean;
  failed: boolean;
  summary: TranslatorFeedbackChapterSummary | null;
  positiveOnly: boolean;
  positiveCount: number;
  status: FeedbackStatusFilter;
  headline: ChapterReviewHeadline;
}): boolean {
  return (
    !loading &&
    !failed &&
    !!summary?.total &&
    (positiveOnly || positiveCount === 0) &&
    !(status === 'pending' && headline.kind !== 'open')
  );
}

/** A voice note counts as listened once it finishes or 60% of it has played. */
export function hasHeardEnough(playback: {
  didJustFinish?: boolean;
  positionMillis?: number;
  durationMillis?: number;
}): boolean {
  return (
    !!playback.didJustFinish ||
    (!!playback.durationMillis && (playback.positionMillis ?? 0) >= playback.durationMillis * 0.6)
  );
}
