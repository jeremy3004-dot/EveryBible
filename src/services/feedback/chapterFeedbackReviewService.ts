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

// A team passcode opens only its own translations. The review endpoint answers a request for
// any other translation with 403 and this code (it is not a wrong guess and never locks out).
export const TRANSLATION_NOT_COVERED = 'translation_not_covered';

/**
 * Present on a failed read when the passcode does not cover the requested translation.
 * `coveredTranslationIds` lists the translations the code does open; it is absent when that
 * list could not be fetched (for example, offline).
 */
export interface TranslatorCoverageFailure {
  code?: typeof TRANSLATION_NOT_COVERED;
  coveredTranslationIds?: string[];
}

export interface ChapterFeedbackReviewResponse extends TranslatorCoverageFailure {
  nextCursor?: FeedbackPageCursor | null;
  summary?: TranslatorFeedbackChapterSummary | null;
  positiveCount?: number;
  success: boolean;
  feedback: ChapterFeedbackReviewItem[];
  error?: string;
}

export interface ChapterFeedbackReviewSummaryResponse extends TranslatorCoverageFailure {
  success: boolean;
  chapters: TranslatorFeedbackChapterSummary[];
  error?: string;
}

export interface TranslatorReviewPasscodeValidationResponse {
  success: boolean;
  error?: string;
  /** Translations the code opens (team passcodes, September 2026 servers onward). */
  translationIds?: string[];
  /** Whether the code opens the translation named in the request, when one was named. */
  coversTranslation?: boolean;
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

type EdgeFunctionError = { message?: string; context?: { json?: () => Promise<unknown> } };

async function readEdgeFunctionError(
  error: EdgeFunctionError,
  fallback: string
): Promise<{ message: string; code?: string }> {
  let code: string | undefined;
  try {
    const body = await error.context?.json?.();

    if (body && typeof body === 'object') {
      const bodyCode = (body as { code?: unknown }).code;
      if (typeof bodyCode === 'string' && bodyCode) code = bodyCode;
      const bodyError = (body as { error?: unknown }).error;
      if (typeof bodyError === 'string' && bodyError.trim()) {
        return { message: bodyError, code };
      }
    }
  } catch {
    // Fall back to the Supabase wrapper message below.
  }

  if (!error.message?.trim() || error.message === 'Edge Function returned a non-2xx status code') {
    return { message: fallback, code };
  }

  return { message: error.message, code };
}

async function readEdgeFunctionErrorMessage(
  error: EdgeFunctionError,
  fallback: string
): Promise<string> {
  return (await readEdgeFunctionError(error, fallback)).message;
}

function readTranslationIds(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : undefined;
}

// A read refused with translation_not_covered carries no scope, so ask the unlock check (which
// returns the code's translations and never counts as a wrong guess) what the code does open.
async function describeReadFailure(
  error: EdgeFunctionError,
  fallback: string,
  passcode: string,
  translationId: string,
  client: ChapterFeedbackReviewFunctionClient
): Promise<{ error: string } & TranslatorCoverageFailure> {
  const { message, code } = await readEdgeFunctionError(error, fallback);
  if (code !== TRANSLATION_NOT_COVERED) return { error: message };

  const scope = await validateTranslatorReviewPasscode(passcode, translationId, client);
  return {
    error: message,
    code: TRANSLATION_NOT_COVERED,
    ...(scope.success && scope.translationIds
      ? { coveredTranslationIds: scope.translationIds }
      : {}),
  };
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

    if (!data || !('success' in data)) {
      return { success: false, error: 'Unable to verify translator access.' };
    }
    const validation = data as TranslatorReviewPasscodeValidationResponse;
    const translationIds = readTranslationIds(validation.translationIds);
    return {
      success: validation.success,
      error: validation.error,
      ...(translationIds ? { translationIds } : {}),
      ...(typeof validation.coversTranslation === 'boolean'
        ? { coversTranslation: validation.coversTranslation }
        : {}),
    };
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
        ...(await describeReadFailure(
          error,
          'Unable to load translator feedback right now.',
          passcode,
          input.translationId,
          resolvedClient
        )),
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
        ...(await describeReadFailure(
          error,
          'Unable to load translator feedback right now.',
          passcode,
          input.translationId,
          resolvedClient
        )),
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
