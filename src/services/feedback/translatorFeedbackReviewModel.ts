// Server is the source of truth for whether a feedback item is resolved (D1). Local
// markers only track per-device UX state (has this device listened to an audio item).
export interface TranslatorFeedbackReviewMarker {
  listenedAt: string | null;
}

export type TranslatorFeedbackReviewMarkers = Record<string, TranslatorFeedbackReviewMarker>;

// Mirrors the DB `scripture_council_resolution` enum. "fixed" = translator changed the
// text; "no_change_needed" = reviewed and intentionally left as-is (covers both a
// confirmed-accurate thumbs-up and a no-action-needed thumbs-down).
export type TranslatorFeedbackResolution = 'fixed' | 'no_change_needed';

export interface TranslatorFeedbackReviewStateInput {
  id: string;
  hasAudio: boolean;
  resolution: TranslatorFeedbackResolution | null;
}

// Per-chapter counts computed server-side by the review summary endpoint.
export interface TranslatorFeedbackChapterSummary {
  bookId: string;
  chapter: number;
  total: number;
  unresolvedDown: number;
  unresolvedUp: number;
}

export interface TranslatorFeedbackReviewStatus {
  isListened: boolean;
  resolution: TranslatorFeedbackResolution | null;
  needsReview: boolean;
}

export type TranslatorFeedbackAggregateStatus = 'pending' | 'addressed';

export function normalizeTranslatorReviewPasscode(passcode: string): string | null {
  const trimmed = passcode.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveDevelopmentTranslatorReviewPasscode(
  env: Record<string, string | undefined>,
  isDev: boolean
): string | null {
  if (!isDev) {
    return null;
  }

  return normalizeTranslatorReviewPasscode(env.EXPO_PUBLIC_DEV_TRANSLATOR_REVIEW_PASSCODE ?? '');
}

export function getTranslatorFeedbackReviewStatus(
  item: TranslatorFeedbackReviewStateInput,
  markers: TranslatorFeedbackReviewMarkers
): TranslatorFeedbackReviewStatus {
  const marker = markers[item.id];
  const isListened = !item.hasAudio || Boolean(marker?.listenedAt);
  const resolution = item.resolution;

  return {
    isListened,
    resolution,
    needsReview: resolution === null,
  };
}

export function getTranslatorFeedbackUnresolvedCount(
  summary: TranslatorFeedbackChapterSummary
): number {
  return summary.unresolvedDown + summary.unresolvedUp;
}

export function getTranslatorFeedbackChapterSummaryStatus(
  summary: TranslatorFeedbackChapterSummary
): TranslatorFeedbackAggregateStatus | null {
  if (summary.total === 0) {
    return null;
  }

  return getTranslatorFeedbackUnresolvedCount(summary) > 0 ? 'pending' : 'addressed';
}

export function getTranslatorFeedbackBookSummaryStatus(
  bookId: string,
  summaries: TranslatorFeedbackChapterSummary[]
): TranslatorFeedbackAggregateStatus | null {
  const bookSummaries = summaries.filter((summary) => summary.bookId === bookId);
  if (bookSummaries.length === 0) {
    return null;
  }

  const hasPendingFeedback = bookSummaries.some(
    (summary) => getTranslatorFeedbackChapterSummaryStatus(summary) === 'pending'
  );

  return hasPendingFeedback ? 'pending' : 'addressed';
}

// Chapters sorted for the translator queue: most unresolved thumbs-down first (highest
// signal), then most total unresolved, then book/chapter order for stability.
export function sortTranslatorFeedbackQueue(
  summaries: TranslatorFeedbackChapterSummary[]
): TranslatorFeedbackChapterSummary[] {
  return [...summaries]
    .filter((summary) => getTranslatorFeedbackUnresolvedCount(summary) > 0)
    .sort((a, b) => {
      if (b.unresolvedDown !== a.unresolvedDown) {
        return b.unresolvedDown - a.unresolvedDown;
      }

      const aTotal = getTranslatorFeedbackUnresolvedCount(a);
      const bTotal = getTranslatorFeedbackUnresolvedCount(b);
      if (bTotal !== aTotal) {
        return bTotal - aTotal;
      }

      if (a.bookId !== b.bookId) {
        return a.bookId < b.bookId ? -1 : 1;
      }

      return a.chapter - b.chapter;
    });
}

export function markTranslatorFeedbackListened(
  markers: TranslatorFeedbackReviewMarkers,
  feedbackId: string,
  markedAt: string
): TranslatorFeedbackReviewMarkers {
  return {
    ...markers,
    [feedbackId]: {
      listenedAt: markedAt,
    },
  };
}
