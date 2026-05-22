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

export interface TranslatorFeedbackReviewStatus {
  isRead: boolean;
  isListened: boolean;
  needsReview: boolean;
}

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
