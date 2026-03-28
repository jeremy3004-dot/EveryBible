import { config } from '../../constants/config';
import { trackBibleExperienceEvent } from '../analytics/bibleExperienceAnalytics';
import {
  normalizeChapterFeedbackIdentity,
  type ChapterFeedbackIdentity,
} from './chapterFeedbackIdentity';

export type ChapterFeedbackSentiment = 'up' | 'down';
export type ChapterFeedbackSourceScreen = 'reader' | 'listener';

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
  participantName: string;
  participantRole: string;
  participantIdNumber: string;
  sourceScreen: ChapterFeedbackSourceScreen;
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

function normalizeSubmissionText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function buildNormalizedIdentity(
  input: Pick<ChapterFeedbackSubmissionInput, 'participantName' | 'participantRole' | 'participantIdNumber'>
): ChapterFeedbackIdentity {
  const identity = normalizeChapterFeedbackIdentity({
    name: input.participantName,
    role: input.participantRole,
    idNumber: input.participantIdNumber,
  });

  return identity ?? {
    name: normalizeSubmissionText(input.participantName),
    role: normalizeSubmissionText(input.participantRole),
    idNumber: normalizeSubmissionText(input.participantIdNumber),
  };
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
  const normalizedIdentity = buildNormalizedIdentity(input);

  return {
    ...input,
    comment: normalizeComment(input.comment ?? null),
    participantName: normalizedIdentity.name,
    participantRole: normalizedIdentity.role,
    participantIdNumber: normalizedIdentity.idNumber,
    appPlatform: input.appPlatform ?? process.env.EXPO_OS ?? 'unknown',
    appVersion: input.appVersion ?? config.version,
  };
}

function getAnalyticsSource(sourceScreen: ChapterFeedbackSourceScreen): 'reader-feedback' | 'listener-feedback' {
  return sourceScreen === 'listener' ? 'listener-feedback' : 'reader-feedback';
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

const EDGE_RUNTIME_401_MESSAGES = new Set(['Invalid JWT', 'Missing authorization header']);
async function resolveFunctionErrorMessage(
  error: ChapterFeedbackFunctionError | null
): Promise<string> {
  if (!error) {
    return 'Unable to submit chapter feedback right now.';
  }

  const status = getFunctionErrorStatus(error);
  const response = error.context;

  if (response && typeof response === 'object') {
    let responseJson: unknown = null;

    try {
      if (typeof response.json === 'function') {
        responseJson = await response.json();

        if (
          status === 401 &&
          responseJson &&
          typeof responseJson === 'object' &&
          'message' in responseJson &&
          typeof responseJson.message === 'string' &&
          EDGE_RUNTIME_401_MESSAGES.has(responseJson.message)
        ) {
          return 'Chapter feedback is temporarily unavailable right now. Please try again soon.';
        }

        if (
          responseJson &&
          typeof responseJson === 'object' &&
          'error' in responseJson &&
          typeof responseJson.error === 'string' &&
          responseJson.error.trim().length > 0
        ) {
          if (status === 401) {
            return 'Please sign in again before sending chapter feedback.';
          }

          return responseJson.error.trim();
        }
      }
    } catch {
      // Fall through to other response parsing.
    }

    try {
      if (typeof response.text === 'function') {
        const text = await response.text();

        if (status === 401 && EDGE_RUNTIME_401_MESSAGES.has(text.trim())) {
          return 'Chapter feedback is temporarily unavailable right now. Please try again soon.';
        }

        if (typeof text === 'string' && text.trim().length > 0) {
          return text.trim();
        }
      }
    } catch {
      // Fall through to the generic error message.
    }
  }

  if (status === 401) {
    return 'Please sign in again before sending chapter feedback.';
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
        source: getAnalyticsSource(payload.sourceScreen),
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
        source: getAnalyticsSource(payload.sourceScreen),
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
        source: getAnalyticsSource(payload.sourceScreen),
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
      source: getAnalyticsSource(payload.sourceScreen),
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
      source: getAnalyticsSource(payload.sourceScreen),
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
