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

interface ChapterFeedbackFunctionError {
  message?: string;
  context?: Response | { status?: number; json?: () => Promise<unknown>; text?: () => Promise<string> };
}

interface ChapterFeedbackFunctionClient {
  invoke: (
    functionName: string,
    options: { body: ChapterFeedbackSubmissionInput; headers?: Record<string, string> }
  ) => Promise<{
    data: ChapterFeedbackFunctionResponse | null;
    error: ChapterFeedbackFunctionError | null;
  }>;
}

interface ChapterFeedbackAuthClient {
  getAccessToken: () => Promise<string | null>;
  refreshAccessToken: () => Promise<string | null>;
}

async function resolveDefaultClient(): Promise<ChapterFeedbackFunctionClient | null> {
  const { isSupabaseConfigured, supabase } = await import('../supabase');

  if (!isSupabaseConfigured()) {
    return null;
  }

  return supabase.functions as ChapterFeedbackFunctionClient;
}

async function resolveDefaultAuthClient(): Promise<ChapterFeedbackAuthClient | null> {
  const { isSupabaseConfigured, supabase } = await import('../supabase');

  if (!isSupabaseConfigured()) {
    return null;
  }

  return {
    getAccessToken: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.access_token ?? null;
    },
    refreshAccessToken: async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        return null;
      }

      return data.session?.access_token ?? null;
    },
  };
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

function getFunctionErrorStatus(error: ChapterFeedbackFunctionError | null): number | null {
  if (!error) {
    return null;
  }

  const response = error.context;
  return response && typeof response === 'object' && 'status' in response && typeof response.status === 'number'
    ? response.status
    : null;
}

async function resolveFunctionErrorMessage(
  error: ChapterFeedbackFunctionError | null
): Promise<string> {
  if (!error) {
    return 'Unable to submit chapter feedback right now.';
  }

  const status = getFunctionErrorStatus(error);
  const response = error.context;

  if (status === 401) {
    return 'Please sign in again before sending chapter feedback.';
  }

  if (response && typeof response === 'object') {
    try {
      if (typeof response.json === 'function') {
        const json = await response.json();
        if (
          json &&
          typeof json === 'object' &&
          'error' in json &&
          typeof json.error === 'string' &&
          json.error.trim().length > 0
        ) {
          return json.error.trim();
        }
      }
    } catch {
      // Fall through to other response parsing.
    }

    try {
      if (typeof response.text === 'function') {
        const text = await response.text();
        if (typeof text === 'string' && text.trim().length > 0) {
          return text.trim();
        }
      }
    } catch {
      // Fall through to the generic error message.
    }
  }

  return error.message ?? 'Unable to submit chapter feedback right now.';
}

async function invokeChapterFeedbackFunction(
  client: ChapterFeedbackFunctionClient,
  payload: ChapterFeedbackSubmissionInput,
  accessToken: string | null
) {
  return client.invoke('submit-chapter-feedback', {
    body: payload,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
}

export async function submitChapterFeedback(
  input: Omit<ChapterFeedbackSubmissionInput, 'appPlatform' | 'appVersion'> & {
    appPlatform?: string;
    appVersion?: string;
  },
  client?: ChapterFeedbackFunctionClient,
  authClient?: ChapterFeedbackAuthClient
): Promise<ChapterFeedbackFunctionResponse> {
  const resolvedClient = client ?? (await resolveDefaultClient());
  const resolvedAuthClient = authClient ?? (client ? null : await resolveDefaultAuthClient());
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
    const accessToken = await resolvedAuthClient?.getAccessToken();
    let { data, error } = await invokeChapterFeedbackFunction(
      resolvedClient,
      payload,
      accessToken ?? null
    );

    if (getFunctionErrorStatus(error) === 401) {
      const refreshedAccessToken = await resolvedAuthClient?.refreshAccessToken();

      if (refreshedAccessToken) {
        ({ data, error } = await invokeChapterFeedbackFunction(
          resolvedClient,
          payload,
          refreshedAccessToken
        ));
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
