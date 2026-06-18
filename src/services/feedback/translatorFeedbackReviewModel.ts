export interface TranslatorFeedbackReviewMarker {
  readAt: string | null;
  listenedAt: string | null;
  resolvedAs?: TranslatorFeedbackResolution | null;
  resolvedAt?: string | null;
}

export type TranslatorFeedbackReviewMarkers = Record<string, TranslatorFeedbackReviewMarker>;
export type TranslatorFeedbackResolution = 'fixed' | 'reviewed';

export interface TranslatorFeedbackReviewStateInput {
  id: string;
  hasAudio: boolean;
}

export interface TranslatorFeedbackChapterSummary {
  bookId: string;
  chapter: number;
  feedback: TranslatorFeedbackReviewStateInput[];
}

export interface TranslatorFeedbackReviewStatus {
  isRead: boolean;
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
  const isRead = Boolean(marker?.readAt);
  const isListened = !item.hasAudio || Boolean(marker?.listenedAt);
  const resolution = marker?.resolvedAs ?? null;

  return {
    isRead,
    isListened,
    resolution,
    needsReview: resolution === null,
  };
}

export function getTranslatorFeedbackChapterSummaryStatus(
  summary: TranslatorFeedbackChapterSummary,
  markers: TranslatorFeedbackReviewMarkers
): TranslatorFeedbackAggregateStatus | null {
  if (summary.feedback.length === 0) {
    return null;
  }

  const hasPendingFeedback = summary.feedback.some(
    (item) => getTranslatorFeedbackReviewStatus(item, markers).needsReview
  );

  return hasPendingFeedback ? 'pending' : 'addressed';
}

export function getTranslatorFeedbackBookSummaryStatus(
  bookId: string,
  summaries: TranslatorFeedbackChapterSummary[],
  markers: TranslatorFeedbackReviewMarkers
): TranslatorFeedbackAggregateStatus | null {
  const bookSummaries = summaries.filter((summary) => summary.bookId === bookId);
  if (bookSummaries.length === 0) {
    return null;
  }

  const hasPendingFeedback = bookSummaries.some(
    (summary) => getTranslatorFeedbackChapterSummaryStatus(summary, markers) === 'pending'
  );

  return hasPendingFeedback ? 'pending' : 'addressed';
}

export function markTranslatorFeedbackRead(
  markers: TranslatorFeedbackReviewMarkers,
  feedbackId: string,
  markedAt: string
): TranslatorFeedbackReviewMarkers {
  return {
    ...markers,
    [feedbackId]: {
      readAt: markedAt,
      listenedAt: markers[feedbackId]?.listenedAt ?? null,
      resolvedAs: markers[feedbackId]?.resolvedAs ?? null,
      resolvedAt: markers[feedbackId]?.resolvedAt ?? null,
    },
  };
}

export function markTranslatorFeedbackListened(
  markers: TranslatorFeedbackReviewMarkers,
  feedbackId: string,
  markedAt: string
): TranslatorFeedbackReviewMarkers {
  return {
    ...markers,
    [feedbackId]: {
      readAt: markers[feedbackId]?.readAt ?? null,
      listenedAt: markedAt,
      resolvedAs: markers[feedbackId]?.resolvedAs ?? null,
      resolvedAt: markers[feedbackId]?.resolvedAt ?? null,
    },
  };
}

export function resolveTranslatorFeedback(
  markers: TranslatorFeedbackReviewMarkers,
  feedbackId: string,
  resolution: TranslatorFeedbackResolution,
  resolvedAt: string
): TranslatorFeedbackReviewMarkers {
  return {
    ...markers,
    [feedbackId]: {
      readAt: markers[feedbackId]?.readAt ?? resolvedAt,
      listenedAt: markers[feedbackId]?.listenedAt ?? null,
      resolvedAs: resolution,
      resolvedAt,
    },
  };
}

export function reopenTranslatorFeedback(
  markers: TranslatorFeedbackReviewMarkers,
  feedbackId: string
): TranslatorFeedbackReviewMarkers {
  return {
    ...markers,
    [feedbackId]: {
      readAt: markers[feedbackId]?.readAt ?? null,
      listenedAt: markers[feedbackId]?.listenedAt ?? null,
      resolvedAs: null,
      resolvedAt: null,
    },
  };
}
