import { config } from '../../constants/config';
import { trackBibleExperienceEvent } from '../analytics/bibleExperienceAnalytics';

export type ChapterFeedbackSentiment = 'up' | 'down';

export interface ChapterFeedbackSubmissionInput {
  translationId: string;
  translationLanguage: string;
  bookId: string;
  chapter: number;
  sentiment: ChapterFeedbackSentiment;
  comment: string | null;
  interfaceLanguage: string;
  contentLanguageCode: string | null;
  contentLanguageName: string | null;
  sourceScreen: 'reader';
  appPlatform: string;
  appVersion: string;
}

export interface ChapterFeedbackFunctionResponse {
  success: boolean;
  saved: boolean;
  exported: boolean;
  feedbackId?: string;
  error?: string;
}

interface ChapterFeedbackFunctionClient {
  invoke: (
    functionName: string,
    options: { body: ChapterFeedbackSubmissionInput }
  ) => Promise<{
    data: ChapterFeedbackFunctionResponse | null;
    error: { message?: string } | null;
  }>;
}

async function resolveDefaultClient(): Promise<ChapterFeedbackFunctionClient | null> {
  const { isSupabaseConfigured, supabase } = await import('../supabase');

  if (!isSupabaseConfigured()) {
    return null;
  }

  return supabase.functions as ChapterFeedbackFunctionClient;
}

function normalizeComment(comment: string | null): string | null {
  const trimmed = comment?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function buildPayload(
  input: Omit<ChapterFeedbackSubmissionInput, 'appPlatform' | 'appVersion'> & {
    appPlatform?: string;
    appVersion?: string;
  }
): ChapterFeedbackSubmissionInput {
  return {
    ...input,
    comment: normalizeComment(input.comment ?? null),
    appPlatform: input.appPlatform ?? process.env.EXPO_OS ?? 'unknown',
    appVersion: input.appVersion ?? config.version,
  };
}

export async function submitChapterFeedback(
  input: Omit<ChapterFeedbackSubmissionInput, 'appPlatform' | 'appVersion'> & {
    appPlatform?: string;
    appVersion?: string;
  },
  client?: ChapterFeedbackFunctionClient
): Promise<ChapterFeedbackFunctionResponse> {
  const resolvedClient = client ?? (await resolveDefaultClient());
  const payload = buildPayload(input);

  if (!resolvedClient) {
    trackBibleExperienceEvent({
      name: 'chapter_feedback_failed',
      translationId: payload.translationId,
      bookId: payload.bookId,
      chapter: payload.chapter,
      sentiment: payload.sentiment,
      source: 'reader-feedback',
      detail: 'backend-unconfigured',
    });
    return {
      success: false,
      saved: false,
      exported: false,
      error: 'EveryBible backend is not configured for this build yet.',
    };
  }

  try {
    const { data, error } = await resolvedClient.invoke('submit-chapter-feedback', {
      body: payload,
    });

    if (error) {
      trackBibleExperienceEvent({
        name: 'chapter_feedback_failed',
        translationId: payload.translationId,
        bookId: payload.bookId,
        chapter: payload.chapter,
        sentiment: payload.sentiment,
        source: 'reader-feedback',
        detail: error.message ?? 'invoke-error',
      });
      return {
        success: false,
        saved: false,
        exported: false,
        error: error.message ?? 'Unable to submit chapter feedback right now.',
      };
    }

    if (!data) {
      trackBibleExperienceEvent({
        name: 'chapter_feedback_failed',
        translationId: payload.translationId,
        bookId: payload.bookId,
        chapter: payload.chapter,
        sentiment: payload.sentiment,
        source: 'reader-feedback',
        detail: 'empty-response',
      });
      return {
        success: false,
        saved: false,
        exported: false,
        error: 'Unable to submit chapter feedback right now.',
      };
    }

    trackBibleExperienceEvent({
      name: data.success ? 'chapter_feedback_submitted' : 'chapter_feedback_failed',
      translationId: payload.translationId,
      bookId: payload.bookId,
      chapter: payload.chapter,
      sentiment: payload.sentiment,
      source: 'reader-feedback',
      detail: data.success ? (data.exported ? 'exported' : 'saved-not-exported') : data.error,
    });
    return data;
  } catch (error) {
    trackBibleExperienceEvent({
      name: 'chapter_feedback_failed',
      translationId: payload.translationId,
      bookId: payload.bookId,
      chapter: payload.chapter,
      sentiment: payload.sentiment,
      source: 'reader-feedback',
      detail: error instanceof Error ? error.message : 'unexpected-error',
    });
    return {
      success: false,
      saved: false,
      exported: false,
      error:
        error instanceof Error ? error.message : 'Unable to submit chapter feedback right now.',
    };
  }
}
