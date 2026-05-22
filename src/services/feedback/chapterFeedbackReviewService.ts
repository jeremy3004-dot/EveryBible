import {
  TRANSLATOR_REVIEW_PASSCODE,
  type TranslatorFeedbackChapterSummary,
} from './translatorFeedbackReviewModel';

export type ChapterFeedbackReviewSentiment = 'up' | 'down';

export interface ChapterFeedbackReviewAudio {
  createdAt: string | null;
  durationMs: number;
  mimeType: string;
  playbackUrl: string | null;
  sizeBytes: number | null;
}

export interface ChapterFeedbackReviewItem {
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
  userId: string | null;
  sourceScreen: string;
  audioResponse: ChapterFeedbackReviewAudio | null;
}

export interface ChapterFeedbackReviewInput {
  translationId: string;
  bookId: string;
  chapter: number;
}

export interface ChapterFeedbackReviewSummaryInput {
  translationId: string;
  bookId?: string;
}

export interface ChapterFeedbackReviewResponse {
  success: boolean;
  feedback: ChapterFeedbackReviewItem[];
  error?: string;
}

export interface ChapterFeedbackReviewSummaryResponse {
  success: boolean;
  chapters: TranslatorFeedbackChapterSummary[];
  error?: string;
}

interface ChapterFeedbackReviewFunctionClient {
  invoke: (
    functionName: string,
    options: {
      body: (ChapterFeedbackReviewInput | ChapterFeedbackReviewSummaryInput) & {
        passcode: string;
      };
    }
  ) => Promise<{
    data: ChapterFeedbackReviewResponse | ChapterFeedbackReviewSummaryResponse | null;
    error: { message?: string } | null;
  }>;
}

async function resolveDefaultClient(): Promise<ChapterFeedbackReviewFunctionClient | null> {
  const { isSupabaseConfigured, supabase } = await import('../supabase');

  if (!isSupabaseConfigured()) {
    return null;
  }

  return supabase.functions as ChapterFeedbackReviewFunctionClient;
}

export async function fetchChapterFeedbackForTranslatorReview(
  input: ChapterFeedbackReviewInput,
  client?: ChapterFeedbackReviewFunctionClient
): Promise<ChapterFeedbackReviewResponse> {
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
        passcode: TRANSLATOR_REVIEW_PASSCODE,
      },
    });

    if (error) {
      return {
        success: false,
        feedback: [],
        error: error.message ?? 'Unable to load translator feedback right now.',
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
        passcode: TRANSLATOR_REVIEW_PASSCODE,
      },
    });

    if (error) {
      return {
        success: false,
        chapters: [],
        error: error.message ?? 'Unable to load translator feedback right now.',
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
