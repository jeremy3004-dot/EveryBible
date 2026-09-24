import type { TFunction } from 'i18next';
// Direct module paths, not the barrel: the barrel pulls in the Supabase-backed services.
import {
  getFeedbackOutcomeKey,
  getFeedbackSourceKey,
} from '../../services/feedback/chapterFeedbackReviewModel';
import type { ChapterFeedbackReviewItem } from '../../services/feedback/chapterFeedbackReviewService';

/**
 * A feedback card as one screen-reader stop. An open card is a button, so its
 * label replaces everything inside it: saying only the comment dropped the
 * verdict ("Needs work"), who sent it, when, and that a voice note is attached.
 */
export function buildFeedbackResponseAccessibilityLabel(
  t: TFunction,
  item: ChapterFeedbackReviewItem,
  dateLabel: string
): string {
  return [
    t(
      item.sentiment === 'up' ? 'bible.chapterFeedbackThumbsUp' : 'bible.chapterFeedbackThumbsDown'
    ),
    t(getFeedbackSourceKey(item)),
    item.comment?.trim() || null,
    item.audioResponse ? t('myFeedback.audioLabel') : null,
    item.participantName || t('bible.translatorReviewUnknownUser'),
    dateLabel,
    item.resolution ? t(getFeedbackOutcomeKey(item)) : null,
  ]
    .filter(Boolean)
    .join(', ');
}

export type FeedbackCardAction = 'play' | 'markReviewed';

/**
 * The controls nested in an open (pressable) card, which VoiceOver cannot reach
 * inside it, offered again as custom actions. Reviewing a concern is the card's
 * own tap, so it needs no action of its own.
 */
export function getFeedbackCardActions(
  t: TFunction,
  item: ChapterFeedbackReviewItem,
  { isPlaying, busy }: { isPlaying: boolean; busy: boolean }
): Array<{ name: FeedbackCardAction; label: string }> {
  if (item.resolution) return [];
  const actions: Array<{ name: FeedbackCardAction; label: string }> = [];
  if (item.audioResponse) {
    actions.push({
      name: 'play',
      label: t(isPlaying ? 'bible.translatorReviewPause' : 'bible.translatorReviewListen'),
    });
  }
  if (item.sentiment === 'up' && !busy) {
    actions.push({ name: 'markReviewed', label: t('feedback.markReviewed') });
  }
  return actions;
}

/** Spoken once a decision lands in the list, where the card silently changes section. */
export function feedbackDecisionAnnouncement(
  t: TFunction,
  item: ChapterFeedbackReviewItem,
  resolution: ChapterFeedbackReviewItem['resolution']
): string {
  return t(getFeedbackOutcomeKey({ ...item, resolution }));
}
