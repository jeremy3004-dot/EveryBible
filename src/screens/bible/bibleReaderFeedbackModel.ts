export type ChapterFeedbackSentiment = 'up' | 'down';

export function isChapterFeedbackSentiment(value: unknown): value is ChapterFeedbackSentiment {
  return value === 'up' || value === 'down';
}

export function normalizeChapterFeedbackComment(comment: string | null): string | null {
  const trimmed = comment?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function shouldEnableChapterFeedbackSubmit({
  sentiment,
  isSubmitting,
}: {
  sentiment: ChapterFeedbackSentiment | null;
  isSubmitting: boolean;
}): boolean {
  return sentiment != null && !isSubmitting;
}

export function getChapterFeedbackResultVariant(result: {
  success: boolean;
  saved: boolean;
  exported: boolean;
}): 'submitted' | 'saved-not-exported' | 'failed' {
  if (result.success && result.saved && result.exported) {
    return 'submitted';
  }

  if (result.success && result.saved && !result.exported) {
    return 'saved-not-exported';
  }

  return 'failed';
}
