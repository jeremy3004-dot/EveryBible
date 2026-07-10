// Council-member-facing view of their own submissions ("My feedback"). Reads directly
// via PostgREST — the chapter_feedback_select_own RLS policy scopes rows to the signed-in
// user, so no edge function is required. Closes the product loop by surfacing whether a
// translator has acted on each submission (F3).

export type ChapterFeedbackResolutionStatus = 'received' | 'fixed' | 'no_change_needed';

export interface MyChapterFeedbackItem {
  id: string;
  bookId: string;
  chapter: number;
  sentiment: 'up' | 'down';
  comment: string | null;
  hasAudio: boolean;
  createdAt: string;
  status: ChapterFeedbackResolutionStatus;
}

export interface MyChapterFeedbackRow {
  id: string;
  book_id: string;
  chapter: number;
  sentiment: 'up' | 'down';
  comment: string | null;
  audio_response_path: string | null;
  created_at: string;
  scripture_council_resolution: 'fixed' | 'no_change_needed' | null;
}

export interface MyChapterFeedbackResponse {
  success: boolean;
  feedback: MyChapterFeedbackItem[];
  error?: string;
}

export interface MyChapterFeedbackQueryClient {
  fetchOwnSubmissions: () => Promise<{
    data: MyChapterFeedbackRow[] | null;
    error: { message?: string } | null;
  }>;
}

const MY_FEEDBACK_ROW_LIMIT = 200;

export function mapMyChapterFeedbackRow(row: MyChapterFeedbackRow): MyChapterFeedbackItem {
  return {
    id: row.id,
    bookId: row.book_id,
    chapter: row.chapter,
    sentiment: row.sentiment,
    comment: row.comment,
    hasAudio: row.audio_response_path != null,
    createdAt: row.created_at,
    status: row.scripture_council_resolution ?? 'received',
  };
}

async function resolveDefaultClient(): Promise<MyChapterFeedbackQueryClient | null> {
  const { isSupabaseConfigured, supabase } = await import('../supabase');

  if (!isSupabaseConfigured()) {
    return null;
  }

  return {
    fetchOwnSubmissions: async () => {
      const { data, error } = await supabase
        .from('chapter_feedback_submissions')
        .select(
          'id, book_id, chapter, sentiment, comment, audio_response_path, created_at, scripture_council_resolution'
        )
        .order('created_at', { ascending: false })
        .limit(MY_FEEDBACK_ROW_LIMIT);

      return { data: (data as MyChapterFeedbackRow[] | null) ?? null, error };
    },
  };
}

export async function fetchMyChapterFeedback(
  client?: MyChapterFeedbackQueryClient
): Promise<MyChapterFeedbackResponse> {
  const resolvedClient = client ?? (await resolveDefaultClient());

  if (!resolvedClient) {
    return {
      success: false,
      feedback: [],
      error: 'EveryBible backend is not configured for this build yet.',
    };
  }

  try {
    const { data, error } = await resolvedClient.fetchOwnSubmissions();

    if (error) {
      return {
        success: false,
        feedback: [],
        error: error.message ?? 'Unable to load your feedback right now.',
      };
    }

    return {
      success: true,
      feedback: (data ?? []).map(mapMyChapterFeedbackRow),
    };
  } catch (error) {
    return {
      success: false,
      feedback: [],
      error: error instanceof Error ? error.message : 'Unable to load your feedback right now.',
    };
  }
}
