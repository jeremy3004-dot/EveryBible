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
    options: {
      body: ChapterFeedbackSubmissionInput;
      headers?: Record<string, string>;
    }
  ) => Promise<{
    data: ChapterFeedbackFunctionResponse | null;
    error: { message?: string; context?: Response } | null;
  }>;
}

interface SubmitChapterFeedbackDependencies {
  resolveAccessToken?: () => Promise<string | null>;
  refreshAccessToken?: () => Promise<string | null>;
}

async function resolveDefaultClient(): Promise<ChapterFeedbackFunctionClient | null> {
  const { isSupabaseConfigured, supabase } = await import('../supabase');

  if (!isSupabaseConfigured()) {
    return null;
  }

  return supabase.functions as ChapterFeedbackFunctionClient;
}

async function resolveDefaultAccessToken(): Promise<string | null> {
  const { isSupabaseConfigured, supabase } = await import('../supabase');

  if (!isSupabaseConfigured()) {
    return null;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}

async function refreshDefaultAccessToken(): Promise<string | null> {
  const { isSupabaseConfigured, supabase } = await import('../supabase');

  if (!isSupabaseConfigured()) {
    return null;
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.refreshSession();

  if (error) {
    return null;
  }

  return session?.access_token ?? null;
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

function isUnauthorizedFunctionError(error: { message?: string; context?: Response } | null): boolean {
  return error?.context?.status === 401;
}

async function resolveFunctionErrorMessage(
  error: { message?: string; context?: Response } | null
): Promise<string> {
  if (isUnauthorizedFunctionError(error)) {
    return 'Please sign in again before sending chapter feedback.';
  }

  if (error?.context) {
    try {
      const payload = (await error.context.clone().json()) as { error?: string };
      if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
        return payload.error.trim();
      }
    } catch {
      // Fall through to the generic message.
    }
  }

  return error?.message ?? 'Unable to submit chapter feedback right now.';
}

export async function submitChapterFeedback(
  input: Omit<ChapterFeedbackSubmissionInput, 'appPlatform' | 'appVersion'> & {
    appPlatform?: string;
    appVersion?: string;
  },
  client?: ChapterFeedbackFunctionClient,
  dependencies?: SubmitChapterFeedbackDependencies
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

  const shouldResolveAccessToken = !client || Boolean(dependencies?.resolveAccessToken);
  const accessToken = shouldResolveAccessToken
    ? await (dependencies?.resolveAccessToken ?? resolveDefaultAccessToken)()
    : null;

  if (shouldResolveAccessToken && !accessToken) {
    trackBibleExperienceEvent({
      name: 'chapter_feedback_failed',
      translationId: payload.translationId,
      bookId: payload.bookId,
      chapter: payload.chapter,
      sentiment: payload.sentiment,
      source: 'reader-feedback',
      detail: 'missing-auth-token',
    });
    return {
      success: false,
      saved: false,
      exported: false,
      error: 'Please sign in before sending chapter feedback.',
    };
  }

  try {
    const invokeWithAccessToken = async (token: string | null) =>
      resolvedClient.invoke('submit-chapter-feedback', {
        body: payload,
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : undefined,
      });

    let { data, error } = await invokeWithAccessToken(accessToken);

    if (isUnauthorizedFunctionError(error) && shouldResolveAccessToken) {
      const refreshedAccessToken = await (
        dependencies?.refreshAccessToken ?? refreshDefaultAccessToken
      )();

      if (refreshedAccessToken) {
        ({ data, error } = await invokeWithAccessToken(refreshedAccessToken));
      }
    }

    if (error) {
      const resolvedErrorMessage = await resolveFunctionErrorMessage(error);
      trackBibleExperienceEvent({
        name: 'chapter_feedback_failed',
        translationId: payload.translationId,
        bookId: payload.bookId,
        chapter: payload.chapter,
        sentiment: payload.sentiment,
        source: 'reader-feedback',
        detail: resolvedErrorMessage,
      });
      return {
        success: false,
        saved: false,
        exported: false,
        error: resolvedErrorMessage,
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
