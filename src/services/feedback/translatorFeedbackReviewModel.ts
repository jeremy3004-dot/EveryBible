export const TRANSLATOR_REVIEW_PASSCODE = '342121';

export interface TranslatorFeedbackReviewMarker {
  readAt: string | null;
  listenedAt: string | null;
}

export type TranslatorFeedbackReviewMarkers = Record<string, TranslatorFeedbackReviewMarker>;

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
  needsReview: boolean;
}

export type TranslatorFeedbackAggregateStatus = 'pending' | 'addressed';

export function canEnableTranslatorReviewMode(passcode: string): boolean {
  return passcode.trim() === TRANSLATOR_REVIEW_PASSCODE;
}

export function getTranslatorFeedbackReviewStatus(
  item: TranslatorFeedbackReviewStateInput,
  markers: TranslatorFeedbackReviewMarkers
): TranslatorFeedbackReviewStatus {
  const marker = markers[item.id];
  const isRead = Boolean(marker?.readAt);
  const isListened = !item.hasAudio || Boolean(marker?.listenedAt);

  return {
    isRead,
    isListened,
    needsReview: !isRead || !isListened,
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
    },
  };
}
