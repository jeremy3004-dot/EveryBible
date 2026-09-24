import type { TFunction } from 'i18next';
// Direct module paths, not the barrel: the barrel pulls in the Supabase-backed services.
import { getFeedbackOutcomeKey } from '../../services/feedback/chapterFeedbackReviewModel';
import type { ChapterFeedbackReviewItem } from '../../services/feedback/chapterFeedbackReviewService';

/** Spoken once a decision lands in the list, where the card silently changes section. */
export function feedbackDecisionAnnouncement(
  t: TFunction,
  item: ChapterFeedbackReviewItem,
  resolution: ChapterFeedbackReviewItem['resolution']
): string {
  return t(getFeedbackOutcomeKey({ ...item, resolution }));
}
