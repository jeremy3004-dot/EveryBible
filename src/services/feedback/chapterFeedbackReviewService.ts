import {
  normalizeTranslatorReviewPasscode,
  type TranslatorFeedbackChapterSummary,
  type TranslatorFeedbackResolution,
} from './translatorFeedbackReviewModel';

export type ChapterFeedbackReviewSentiment = 'up' | 'down';

export interface ChapterFeedbackReviewAudio {
  createdAt: string | null;
  durationMs: number;
  mimeType: string;
  playbackUrl: string | null;
  sizeBytes: number | null;
}

export type FeedbackContributorCategory = 'community' | 'scripture_council';
export type FeedbackCategoryFilter = FeedbackContributorCategory | 'all';
export type FeedbackStatusFilter = 'pending' | 'reviewed' | 'all';
export interface FeedbackPageCursor {
  snapshot: number;
  sequence: number;
  sentiment: string;
}

export interface ChapterFeedbackReviewItem {
  contributorCategory?: FeedbackContributorCategory | null;
  id: string;
  createdAt: string;
  translationId: string;
  translationLanguage: string;
  bookId: string;
  chapter: number;
  sentiment: ChapterFeedbackReviewSentiment;
  comment: string | null;
  participantName: string | null;
  participantRole: string | null;
  participantIdNumber: string | null;
  sourceScreen: string;
  resolution: TranslatorFeedbackResolution | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  audioResponse: ChapterFeedbackReviewAudio | null;
}

export interface ChapterFeedbackReviewInput {
  apiVersion?: 2;
  category?: FeedbackCategoryFilter;
  status?: FeedbackStatusFilter;
  cursor?: FeedbackPageCursor | null;
  positiveOnly?: boolean;
  translationId: string;
  bookId: string;
  chapter: number;
  passcode: string;
}

export interface TranslatorFeedbackResolveInput {
  apiVersion?: 2;
  passcode: string;
  translationId: string;
  feedbackId: string;
  resolution: TranslatorFeedbackResolution;
  note?: string;
}

export interface TranslatorFeedbackReopenInput {
  apiVersion?: 2;
  passcode: string;
  translationId: string;
  feedbackId: string;
}

export interface FeedbackAudioUrlResponse {
  success: boolean;
  playbackUrl?: string;
  error?: string;
}

export interface TranslatorFeedbackResolveResponse {
  feedbackIds?: string[];
  reviewedCount?: number;
  success: boolean;
  resolution?: TranslatorFeedbackResolution | null;
  error?: string;
}

export interface ChapterFeedbackReviewSummaryInput {
  apiVersion?: 2;
  translationId: string;
  bookId?: string;
  passcode: string;
}

export interface ChapterFeedbackReviewResponse {
  nextCursor?: FeedbackPageCursor | null;
  summary?: TranslatorFeedbackChapterSummary | null;
  positiveCount?: number;
  success: boolean;
  feedback: ChapterFeedbackReviewItem[];
  error?: string;
}

export interface ChapterFeedbackReviewSummaryResponse {
  success: boolean;
  chapters: TranslatorFeedbackChapterSummary[];
  error?: string;
}

export interface TranslatorReviewPasscodeValidationResponse {
  success: boolean;
  error?: string;
}

type ChapterFeedbackReviewResolveBody = {
  apiVersion?: 2;
  passcode: string;
  translationId: string;
  feedbackId: string;
  action: 'resolve' | 'reopen';
  resolution?: TranslatorFeedbackResolution;
  note?: string;
};

interface ChapterFeedbackReviewFunctionClient {
  invoke: (
    functionName: string,
    options: {
      body:
        | (ChapterFeedbackReviewInput & {
            action: 'positivePreview' | 'reviewPositiveIds';
            feedbackIds?: string[];
          })
        | (ChapterFeedbackReviewInput & { action: 'audioUrl'; feedbackId: string })
        | ChapterFeedbackReviewInput
        | ChapterFeedbackReviewSummaryInput
        | ChapterFeedbackReviewResolveBody
        | { passcode: string; validateOnly: true; accessRole?: 'scripture_council' };
    }
  ) => Promise<{
    data:
      | ChapterFeedbackReviewResponse
      | ChapterFeedbackReviewSummaryResponse
      | TranslatorReviewPasscodeValidationResponse
      | TranslatorFeedbackResolveResponse
      | FeedbackAudioUrlResponse
      | null;
    error: { message?: string; context?: { json?: () => Promise<unknown> } } | null;
  }>;
}

async function readEdgeFunctionErrorMessage(
  error: { message?: string; context?: { json?: () => Promise<unknown> } },
  fallback: string
): Promise<string> {
  try {
    const body = await error.context?.json?.();

    if (body && typeof body === 'object' && 'error' in body) {
      const bodyError = (body as { error?: unknown }).error;
      if (typeof bodyError === 'string' && bodyError.trim()) {
        return bodyError;
      }
    }
  } catch {
    // Fall back to the Supabase wrapper message below.
  }

  if (!error.message?.trim() || error.message === 'Edge Function returned a non-2xx status code') {
    return fallback;
  }

  return error.message;
}

async function resolveDefaultClient(): Promise<ChapterFeedbackReviewFunctionClient | null> {
  const { isSupabaseConfigured, supabase } = await import('../supabase');

  if (!isSupabaseConfigured()) {
    return null;
  }

  return supabase.functions as ChapterFeedbackReviewFunctionClient;
}

export async function validateTranslatorReviewPasscode(
  passcode: string,
  translationId?: string,
  client?: ChapterFeedbackReviewFunctionClient,
  accessRole?: 'scripture_council'
): Promise<TranslatorReviewPasscodeValidationResponse> {
  const normalizedPasscode = normalizeTranslatorReviewPasscode(passcode);

  if (!normalizedPasscode) {
    return { success: false, error: 'Translator access denied' };
  }

  const resolvedClient = client ?? (await resolveDefaultClient());

  if (!resolvedClient) {
    return {
      success: false,
      error: 'EveryBible backend is not configured for this build yet.',
    };
  }

  try {
    const { data, error } = await resolvedClient.invoke('review-chapter-feedback', {
      body: {
        passcode: normalizedPasscode,
        translationId,
        validateOnly: true,
        ...(accessRole ? { accessRole } : {}),
      },
    });

    if (error) {
      return {
        success: false,
        error: await readEdgeFunctionErrorMessage(
          error,
          'Unable to verify translator access right now.'
        ),
      };
    }

    return data && 'success' in data
      ? { success: data.success, error: data.error }
      : { success: false, error: 'Unable to verify translator access.' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to verify translator access.',
    };
  }
}

export function validateScriptureCouncilPasscode(
  passcode: string,
  client?: ChapterFeedbackReviewFunctionClient
): Promise<TranslatorReviewPasscodeValidationResponse> {
  return validateTranslatorReviewPasscode(passcode, undefined, client, 'scripture_council');
}

export async function fetchChapterFeedbackForTranslatorReview(
  input: ChapterFeedbackReviewInput,
  client?: ChapterFeedbackReviewFunctionClient
): Promise<ChapterFeedbackReviewResponse> {
  const passcode = normalizeTranslatorReviewPasscode(input.passcode);

  if (!passcode) {
    return { success: false, feedback: [], error: 'Translator access denied' };
  }

  const resolvedClient = client ?? (await resolveDefaultClient());

  if (!resolvedClient) {
    return {
      success: false,
      feedback: [],
      error: 'EveryBible backend is not configured for this build yet.',
    };
  }

  try {
    const { data, error } = await resolvedClient.invoke('review-chapter-feedback', {
      body: {
        ...input,
        apiVersion: 2,
        passcode,
      },
    });

    if (error) {
      return {
        success: false,
        feedback: [],
        error: await readEdgeFunctionErrorMessage(
          error,
          'Unable to load translator feedback right now.'
        ),
      };
    }

    if (data && 'feedback' in data) {
      return data;
    }

    return { success: false, feedback: [], error: 'Unable to load translator feedback.' };
  } catch (error) {
    return {
      success: false,
      feedback: [],
      error: error instanceof Error ? error.message : 'Unable to load translator feedback.',
    };
  }
}

export async function fetchChapterFeedbackReviewSummaryForTranslation(
  input: ChapterFeedbackReviewSummaryInput,
  client?: ChapterFeedbackReviewFunctionClient
): Promise<ChapterFeedbackReviewSummaryResponse> {
  const passcode = normalizeTranslatorReviewPasscode(input.passcode);

  if (!passcode) {
    return { success: false, chapters: [], error: 'Translator access denied' };
  }

  const resolvedClient = client ?? (await resolveDefaultClient());

  if (!resolvedClient) {
    return {
      success: false,
      chapters: [],
      error: 'EveryBible backend is not configured for this build yet.',
    };
  }

  try {
    const { data, error } = await resolvedClient.invoke('review-chapter-feedback', {
      body: {
        ...input,
        apiVersion: 2,
        passcode,
      },
    });

    if (error) {
      return {
        success: false,
        chapters: [],
        error: await readEdgeFunctionErrorMessage(
          error,
          'Unable to load translator feedback right now.'
        ),
      };
    }

    if (data && 'chapters' in data) {
      return data;
    }

    return { success: false, chapters: [], error: 'Unable to load translator feedback.' };
  } catch (error) {
    return {
      success: false,
      chapters: [],
      error: error instanceof Error ? error.message : 'Unable to load translator feedback.',
    };
  }
}

export async function resolveTranslatorFeedbackOnServer(
  input: TranslatorFeedbackResolveInput,
  client?: ChapterFeedbackReviewFunctionClient
): Promise<TranslatorFeedbackResolveResponse> {
  const passcode = normalizeTranslatorReviewPasscode(input.passcode);

  if (!passcode) {
    return { success: false, error: 'Translator access denied' };
  }

  const resolvedClient = client ?? (await resolveDefaultClient());

  if (!resolvedClient) {
    return {
      success: false,
      error: 'EveryBible backend is not configured for this build yet.',
    };
  }

  try {
    const { data, error } = await resolvedClient.invoke('review-chapter-feedback', {
      body: {
        passcode,
        translationId: input.translationId,
        feedbackId: input.feedbackId,
        action: 'resolve',
        apiVersion: 2,
        resolution: input.resolution,
        note: input.note,
      },
    });

    if (error) {
      return {
        success: false,
        error: await readEdgeFunctionErrorMessage(
          error,
          'Unable to update this feedback right now.'
        ),
      };
    }

    if (data && 'success' in data) {
      return {
        success: data.success,
        resolution: 'resolution' in data ? data.resolution : input.resolution,
        error: data.error,
      };
    }

    return { success: false, error: 'Unable to update this feedback.' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to update this feedback.',
    };
  }
}

export async function reopenTranslatorFeedbackOnServer(
  input: TranslatorFeedbackReopenInput,
  client?: ChapterFeedbackReviewFunctionClient
): Promise<TranslatorFeedbackResolveResponse> {
  const passcode = normalizeTranslatorReviewPasscode(input.passcode);

  if (!passcode) {
    return { success: false, error: 'Translator access denied' };
  }

  const resolvedClient = client ?? (await resolveDefaultClient());

  if (!resolvedClient) {
    return {
      success: false,
      error: 'EveryBible backend is not configured for this build yet.',
    };
  }

  try {
    const { data, error } = await resolvedClient.invoke('review-chapter-feedback', {
      body: {
        passcode,
        translationId: input.translationId,
        feedbackId: input.feedbackId,
        action: 'reopen',
        apiVersion: 2,
      },
    });

    if (error) {
      return {
        success: false,
        error: await readEdgeFunctionErrorMessage(
          error,
          'Unable to reopen this feedback right now.'
        ),
      };
    }

    if (data && 'success' in data) {
      return { success: data.success, resolution: null, error: data.error };
    }

    return { success: false, error: 'Unable to reopen this feedback.' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to reopen this feedback.',
    };
  }
}

export async function reviewPositiveFeedbackBatch(
  input: ChapterFeedbackReviewInput,
  feedbackIds?: string[],
  client?: ChapterFeedbackReviewFunctionClient
): Promise<TranslatorFeedbackResolveResponse> {
  const resolvedClient = client ?? (await resolveDefaultClient());
  if (!resolvedClient || !input.passcode.trim())
    return { success: false, error: 'Translator access denied' };
  try {
    const { data, error } = await resolvedClient.invoke('review-chapter-feedback', {
      body: {
        ...input,
        apiVersion: 2,
        action: feedbackIds ? 'reviewPositiveIds' : 'positivePreview',
        feedbackIds,
      },
    });
    if (error)
      return {
        success: false,
        error: await readEdgeFunctionErrorMessage(error, 'Unable to review feedback'),
      };
    return (data as TranslatorFeedbackResolveResponse) ?? { success: false };
  } catch {
    return { success: false, error: 'Unable to review feedback' };
  }
}

export async function refreshFeedbackAudioUrl(
  input: ChapterFeedbackReviewInput & { feedbackId: string },
  client?: ChapterFeedbackReviewFunctionClient
): Promise<FeedbackAudioUrlResponse> {
  const resolvedClient = client ?? (await resolveDefaultClient());
  if (!resolvedClient || !input.passcode.trim()) return { success: false };
  try {
    const { data, error } = await resolvedClient.invoke('review-chapter-feedback', {
      body: { ...input, apiVersion: 2, action: 'audioUrl' },
    });
    return error ? { success: false } : ((data as FeedbackAudioUrlResponse) ?? { success: false });
  } catch {
    return { success: false };
  }
}
