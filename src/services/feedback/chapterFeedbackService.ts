import { config } from '../../constants/config';
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
  participantName: string | null;
  participantRole: string | null;
  audioResponse?: ChapterFeedbackAudioResponseInput | null;
  sourceScreen: ChapterFeedbackSourceScreen;
  appPlatform: string;
  appVersion: string;
}

export interface ChapterFeedbackAudioResponseInput {
  bucket: string;
  path: string | null;
  durationMs: number;
  mimeType: string;
  sizeBytes: number | null;
  createdAt: string;
  base64Data?: string;
}

export interface ChapterFeedbackFunctionResponse {
  success: boolean;
  saved: boolean;
  exported: boolean;
  feedbackId?: string;
  error?: string;
  // Set when the backend rejected the request for want of a signed-in user (401), so the
  // UI can show a localized sign-in prompt instead of the raw server message.
  requiresSignIn?: boolean;
}

interface ChapterFeedbackFunctionError {
  message?: string;
  context?:
    | Response
    | { status?: number; json?: () => Promise<unknown>; text?: () => Promise<string> };
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
  isCurrent?: () => boolean;
}

function buildNormalizedIdentity(
  input: Pick<ChapterFeedbackSubmissionInput, 'participantName' | 'participantRole'>
): ChapterFeedbackIdentity | null {
  // Both name and role are required or the identity is null — never emit a partial
  // identity (B6). The server is the authority on identity now, but keep the client
  // payload well-formed too.
  return normalizeChapterFeedbackIdentity({
    name: input.participantName ?? '',
    role: input.participantRole ?? '',
  });
}

async function resolveDefaultClient(): Promise<ChapterFeedbackFunctionClient | null> {
  const { isSupabaseConfigured, supabase } = await import('../supabase');

  if (!isSupabaseConfigured()) {
    return null;
  }

  return supabase.functions as ChapterFeedbackFunctionClient;
}

async function resolveDefaultAuthClient(
  expectedUserId: string | null,
  authGeneration: number
): Promise<ChapterFeedbackAuthClient | null> {
  const { isSupabaseConfigured, supabase } = await import('../supabase');

  if (!isSupabaseConfigured()) {
    return null;
  }

  const { useAuthStore } = await import('../../stores/authStore');
  // Keep this submission bound to its original account, including sign-out and
  // sign-in to the same account while an async request is pending.
  const isCurrent = () => {
    const current = useAuthStore.getState();
    return (
      (current.user?.uid ?? null) === expectedUserId && current.authGeneration === authGeneration
    );
  };
  const getStoredAccessToken = () => useAuthStore.getState().session?.access_token ?? null;

  return {
    isCurrent,
    getAccessToken: async () => {
      const storedAccessToken = getStoredAccessToken();
      if (storedAccessToken) {
        return storedAccessToken;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.access_token ?? null;
    },
    refreshAccessToken: async () => {
      if (!isCurrent()) {
        return null;
      }

      try {
        // The stored token was just rejected. Only a refreshed, same-account
        // session may authorize the single retry; never fall back to that token.
        const { data, error } = await supabase.auth.refreshSession();
        if (error || !isCurrent() || data.session?.user.id !== expectedUserId) {
          return null;
        }

        return data.session?.access_token ?? null;
      } catch {
        // Preserve the original 401 so callers still show the sign-in prompt.
        return null;
      }
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
    participantName: normalizedIdentity?.name ?? null,
    participantRole: normalizedIdentity?.role ?? null,
    audioResponse: input.audioResponse ?? null,
    appPlatform: input.appPlatform ?? process.env.EXPO_OS ?? 'unknown',
    appVersion: input.appVersion ?? config.version,
  };
}

function getFunctionErrorStatus(error: ChapterFeedbackFunctionError | null): number | null {
  if (!error) {
    return null;
  }

  const response = error.context;
  return response &&
    typeof response === 'object' &&
    'status' in response &&
    typeof response.status === 'number'
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
  let defaultAuthIdentity: { userId: string | null; generation: number } | null = null;
  if (!client && !authClient) {
    // Snapshot before the first await: lazy client loading must not rebind this
    // submission to a newly signed-in account. Keep the store out of startup imports.
    const { useAuthStore } =
      require('../../stores/authStore') as typeof import('../../stores/authStore');
    const state = useAuthStore.getState();
    defaultAuthIdentity = { userId: state.user?.uid ?? null, generation: state.authGeneration };
  }
  const resolvedClient = client ?? (await resolveDefaultClient());
  const resolvedAuthClient =
    authClient ??
    (defaultAuthIdentity
      ? await resolveDefaultAuthClient(defaultAuthIdentity.userId, defaultAuthIdentity.generation)
      : null);
  const payload = buildPayload(input);

  if (!resolvedClient) {
    return {
      success: false,
      saved: false,
      exported: false,
      error: 'EveryBible backend is not configured for this build yet.',
    };
  }

  try {
    const accessToken = await resolvedAuthClient?.getAccessToken();
    if (resolvedAuthClient?.isCurrent?.() === false) {
      return {
        success: false,
        saved: false,
        exported: false,
        error: 'Please sign in again before sending chapter feedback.',
        requiresSignIn: true,
      };
    }
    let { data, error } = await invokeChapterFeedbackFunction(
      resolvedClient,
      payload,
      accessToken ?? null
    );

    if (getFunctionErrorStatus(error) === 401) {
      const refreshedAccessToken = await resolvedAuthClient?.refreshAccessToken();

      if (refreshedAccessToken && resolvedAuthClient?.isCurrent?.() !== false) {
        ({ data, error } = await invokeChapterFeedbackFunction(
          resolvedClient,
          payload,
          refreshedAccessToken
        ));
      }
    }

    if (error) {
      const resolvedErrorMessage = await resolveFunctionErrorMessage(error);
      const requiresSignIn = getFunctionErrorStatus(error) === 401;
      return {
        success: false,
        saved: false,
        exported: false,
        error: resolvedErrorMessage,
        requiresSignIn,
      };
    }

    if (!data) {
      return {
        success: false,
        saved: false,
        exported: false,
        error: 'Unable to submit chapter feedback right now.',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      saved: false,
      exported: false,
      error:
        error instanceof Error ? error.message : 'Unable to submit chapter feedback right now.',
    };
  }
}
