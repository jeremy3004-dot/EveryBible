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

// Insertion is the terminal step server-side (there is no separate async export), so a
// saved submission is a completed submission (B1).
export function getChapterFeedbackResultVariant(result: {
  success: boolean;
  saved: boolean;
}): 'submitted' | 'failed' {
  return result.success && result.saved ? 'submitted' : 'failed';
}
