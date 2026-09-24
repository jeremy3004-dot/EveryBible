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
  | { kind: 'waiting'; count: number };

export function getChapterReviewHeadline(
  summary: TranslatorFeedbackChapterSummary | null,
  loading: boolean
): ChapterReviewHeadline {
  if (!summary?.total) {
    return loading ? { kind: 'loading' } : { kind: 'empty' };
  }
  const count = summary.unresolvedDown + summary.unresolvedUp;
  return count > 0 ? { kind: 'waiting', count } : { kind: 'caughtUp' };
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

/**
 * The open items a focused review walks through: every unresolved item on screen, in
 * the server's order (concerns first), starting at the one the reviewer tapped.
 */
export function buildReviewQueue(items: ChapterFeedbackReviewItem[], startId?: string): string[] {
  const open = items.filter((item) => !item.resolution).map((item) => item.id);
  const start = startId ? open.indexOf(startId) : -1;
  return start > 0 ? [...open.slice(start), ...open.slice(0, start)] : open;
}

/**
 * The next item to show after `currentId`, skipping everything already decided or
 * skipped this session; null once nothing is left.
 */
export function getNextQueuedId(
  queue: string[],
  handled: ReadonlySet<string>,
  currentId: string | null
): string | null {
  const from = currentId ? queue.indexOf(currentId) : -1;
  for (let step = 1; step <= queue.length; step += 1) {
    const id = queue[(from + step + queue.length) % queue.length];
    if (id !== currentId && !handled.has(id)) return id;
  }
  return null;
}

/**
 * The session after `id` is decided or skipped: it joins the handled set and the next open
 * item comes up. A decision is saved before it advances, so it must advance whatever the
 * session is by then: a review closed meanwhile stays closed (null) rather than reopening.
 */
export function advanceReviewSession<
  T extends { queue: string[]; currentId: string | null; handled: ReadonlySet<string> },
>(session: T | null, id: string): T | null {
  if (!session) return null;
  const handled = new Set(session.handled).add(id);
  return { ...session, handled, currentId: getNextQueuedId(session.queue, handled, id) };
}

export function formatVoiceNoteDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
