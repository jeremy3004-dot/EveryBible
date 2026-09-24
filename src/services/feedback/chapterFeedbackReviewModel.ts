import type { ChapterFeedbackReviewItem } from './chapterFeedbackReviewService';
import type {
  TranslatorFeedbackChapterSummary,
  TranslatorFeedbackResolution,
} from './translatorFeedbackReviewModel';

/** What the chapter headline says, most urgent first. */
export type ChapterReviewHeadline =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'caughtUp' }
  | { kind: 'open'; count: number };

export function getChapterReviewHeadline(
  summary: TranslatorFeedbackChapterSummary | null,
  loading: boolean
): ChapterReviewHeadline {
  if (!summary?.total) {
    return loading ? { kind: 'loading' } : { kind: 'empty' };
  }
  const count = summary.unresolvedDown + summary.unresolvedUp;
  return count > 0 ? { kind: 'open', count } : { kind: 'caughtUp' };
}

export type FeedbackSourceKey = 'feedback.council' | 'feedback.community' | 'feedback.legacy';

export function getFeedbackSourceKey(item: ChapterFeedbackReviewItem): FeedbackSourceKey {
  if (item.contributorCategory === 'scripture_council') return 'feedback.council';
  if (item.contributorCategory === 'community') return 'feedback.community';
  return 'feedback.legacy';
}

export type FeedbackOutcomeKey =
  | 'feedback.needsReview'
  | 'feedback.addressed'
  | 'feedback.reviewed'
  | 'feedback.noChange';

export function getFeedbackOutcomeKey(item: ChapterFeedbackReviewItem): FeedbackOutcomeKey {
  if (!item.resolution) return 'feedback.needsReview';
  if (item.resolution === 'fixed') return 'feedback.addressed';
  // Settling praise is "reviewed"; settling a concern without a change is a decision.
  return item.sentiment === 'up' ? 'feedback.reviewed' : 'feedback.noChange';
}

/** A concern is only settled with a written reason; praise can be marked reviewed as is. */
export function requiresResolutionNote(item: ChapterFeedbackReviewItem): boolean {
  return item.sentiment === 'down' && !item.resolution;
}

export function canSubmitResolution(item: ChapterFeedbackReviewItem, note: string): boolean {
  return !requiresResolutionNote(item) || note.trim().length > 0;
}

/** The resolutions offered for an open item, in button order. */
export function getResolutionChoices(
  item: ChapterFeedbackReviewItem
): TranslatorFeedbackResolution[] {
  if (item.resolution) return [];
  return item.sentiment === 'down' ? ['fixed', 'no_change_needed'] : ['no_change_needed'];
}

/** The button and sheet title for settling an item one way or the other. */
export function getResolutionLabelKey(
  item: ChapterFeedbackReviewItem,
  resolution: TranslatorFeedbackResolution
): 'feedback.markAddressed' | 'feedback.markReviewed' | 'feedback.noChange' {
  if (resolution === 'fixed') return 'feedback.markAddressed';
  return item.sentiment === 'up' ? 'feedback.markReviewed' : 'feedback.noChange';
}

export function formatVoiceNoteDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
